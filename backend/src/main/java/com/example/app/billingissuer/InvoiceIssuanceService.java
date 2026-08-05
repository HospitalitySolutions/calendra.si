package com.example.app.billingissuer;

import com.example.app.billing.Bill;
import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.location.Location;
import com.example.app.location.LocationRepository;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class InvoiceIssuanceService {
    private static final long INVOICE_SERIES_LOCK_NAMESPACE = 0x21L << 56;
    private static final long LOCATION_SERIES_CREATION_LOCK_NAMESPACE = 0x22L << 56;
    private static final long ADVISORY_LOCK_ID_MASK = 0x00FFFFFFFFFFFFFFL;

    private final LegalEntityRepository legalEntities;
    private final CompanyLegalEntityRepository assignments;
    private final InvoiceSeriesRepository seriesRepository;
    private final CompanyRepository companies;
    private final LocationRepository locations;
    private final AppSettingRepository settings;
    private final JdbcTemplate jdbc;

    public InvoiceIssuanceService(
            LegalEntityRepository legalEntities,
            CompanyLegalEntityRepository assignments,
            InvoiceSeriesRepository seriesRepository,
            CompanyRepository companies,
            LocationRepository locations,
            AppSettingRepository settings,
            JdbcTemplate jdbc
    ) {
        this.legalEntities = legalEntities;
        this.assignments = assignments;
        this.seriesRepository = seriesRepository;
        this.companies = companies;
        this.locations = locations;
        this.settings = settings;
        this.jdbc = jdbc;
    }

    @Transactional
    public void assign(
            Bill bill,
            Long companyId,
            Long requestedLegalEntityId,
            Long requestedSeriesId,
            Long requestedLocationId,
            LocalDate issueDate
    ) {
        if (bill == null || companyId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invoice and operating unit are required.");
        }
        Company company = companies.findById(companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Operating unit not found."));
        Location location = resolveLocation(companyId, requestedLocationId);

        Long locationIssuerId = location.getDefaultLegalEntity() == null
                ? null
                : location.getDefaultLegalEntity().getId();

        InvoiceSeries chosen;
        CompanyLegalEntity assignment;
        Long redirectedLegacySeriesId = null;
        if (requestedSeriesId != null) {
            InvoiceSeries requested = seriesRepository.findById(requestedSeriesId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invoice series not found."));
            assignment = requireAssignment(companyId, requested.getLegalEntity().getId());
            if (requestedLegalEntityId != null && !Objects.equals(requestedLegalEntityId, requested.getLegalEntity().getId())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invoice series does not belong to the selected issuer.");
            }
            // Legacy clients may still submit the old unit-wide default series. Redirect those
            // requests to the location-owned series so every location keeps an independent counter.
            if (requested.getLocation() == null) {
                redirectedLegacySeriesId = requested.getId();
                chosen = resolveLocationSeriesForUpdate(assignment, company, location);
            } else {
                lockInvoiceSeries(requestedSeriesId);
                InvoiceSeries candidate = seriesRepository.findForUpdateById(requestedSeriesId)
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invoice series not found."));
                validateSeries(candidate, companyId, location);
                chosen = candidate;
            }
        } else {
            Long legalEntityId = requestedLegalEntityId == null ? locationIssuerId : requestedLegalEntityId;
            assignment = legalEntityId == null
                    ? assignments.findFirstByCompanyIdAndActiveTrueOrderByDefaultIssuerDescIdAsc(companyId)
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "No invoice issuer is assigned to this operating unit."))
                    : requireAssignment(companyId, legalEntityId);
            chosen = resolveLocationSeriesForUpdate(assignment, company, location);
        }

        int year = (issueDate == null ? LocalDate.now() : issueDate).getYear();
        CounterAllocation allocation = allocateNumberAtomically(chosen.getId(), year);
        String number = allocation.allocatedNumber();

        // Keep the old unit-wide series as a read-compatible alias for clients/tests that still
        // submit it. It is not used for allocation; it mirrors the location counter after the
        // atomic update so it cannot introduce a second source of invoice numbers.
        if (redirectedLegacySeriesId != null && !Objects.equals(redirectedLegacySeriesId, chosen.getId())) {
            synchronizeLegacySeriesCounter(redirectedLegacySeriesId, chosen.getId());
        }

        LegalEntity issuer = chosen.getLegalEntity();
        bill.setCompany(company);
        bill.setLegalEntity(issuer);
        bill.setInvoiceSeries(chosen);
        bill.setLocation(location);
        bill.setBillNumber(number);
        applySnapshots(bill, issuer, chosen, location);
        synchronizeLegacyCounterIfDefault(assignment, chosen, companyId, allocation.nextNumber());
    }

    @Transactional
    public void assignFromOriginal(Bill target, Bill original, LocalDate issueDate) {
        if (original == null || original.getCompany() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Original invoice is required.");
        }
        assign(
                target,
                original.getCompany().getId(),
                original.getLegalEntity() == null ? null : original.getLegalEntity().getId(),
                original.getInvoiceSeries() == null ? null : original.getInvoiceSeries().getId(),
                original.getLocation() == null ? null : original.getLocation().getId(),
                issueDate
        );
    }

    public List<InvoiceSeries> availableSeries(Long companyId, Long legalEntityId, Long locationId) {
        Company company = companies.findById(companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        Location location = locationId == null ? null : locations.findByIdAndCompanyId(locationId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Location does not belong to this operating unit."));
        return seriesRepository.findAllByWorkspaceIdOrderByLegalEntityNameAscNameAscIdAsc(company.getWorkspace().getId()).stream()
                .filter(InvoiceSeries::isActive)
                .filter(series -> series.getLegalEntity().isActive())
                .filter(series -> legalEntityId == null || Objects.equals(series.getLegalEntity().getId(), legalEntityId))
                .filter(series -> assignments.findByCompanyIdAndLegalEntityId(companyId, series.getLegalEntity().getId())
                        .filter(CompanyLegalEntity::isActive).isPresent())
                .filter(series -> series.getCompany() == null || Objects.equals(series.getCompany().getId(), companyId))
                .filter(series -> location == null
                        || (series.getLocation() != null && Objects.equals(series.getLocation().getId(), location.getId())))
                .sorted(Comparator.comparing((InvoiceSeries s) -> s.getLegalEntity().getName(), String.CASE_INSENSITIVE_ORDER)
                        .thenComparing(InvoiceSeries::getName, String.CASE_INSENSITIVE_ORDER)
                        .thenComparing(InvoiceSeries::getId))
                .toList();
    }

    private CompanyLegalEntity requireAssignment(Long companyId, Long legalEntityId) {
        CompanyLegalEntity assignment = assignments.findByCompanyIdAndLegalEntityId(companyId, legalEntityId)
                .filter(CompanyLegalEntity::isActive)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invoice issuer is not assigned to this operating unit."));
        if (!assignment.getLegalEntity().isActive()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Invoice issuer is inactive.");
        }
        return assignment;
    }

    private InvoiceSeries resolveLocationSeriesForUpdate(
            CompanyLegalEntity assignment,
            Company company,
            Location location
    ) {
        Long legalEntityId = assignment.getLegalEntity().getId();
        boolean isLocationDefaultIssuer = location.getDefaultLegalEntity() == null
                || Objects.equals(location.getDefaultLegalEntity().getId(), legalEntityId);
        InvoiceSeries configured = isLocationDefaultIssuer ? location.getDefaultInvoiceSeries() : null;
        if (configured != null
                && configured.isActive()
                && Objects.equals(configured.getLegalEntity().getId(), legalEntityId)
                && configured.getLocation() != null
                && Objects.equals(configured.getLocation().getId(), location.getId())) {
            lockInvoiceSeries(configured.getId());
            InvoiceSeries locked = seriesRepository.findForUpdateById(configured.getId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "Location invoice counter no longer exists."));
            validateSeries(locked, company.getId(), location);
            return locked;
        }

        InvoiceSeries existing = findLocationSeries(location.getId(), legalEntityId);
        if (existing != null) {
            return lockAndAttachLocationSeries(existing, location, company.getId(), isLocationDefaultIssuer);
        }

        // Two requests can observe that no location-owned series exists at the same time.
        // Serialize only this creation path, then re-read after acquiring the lock. The
        // second transaction will see and reuse the row committed by the first instead of
        // violating uq_invoice_series_legal_name with another "Location-{id}" insert.
        lockLocationSeriesCreation(location.getId(), legalEntityId);
        existing = findLocationSeries(location.getId(), legalEntityId);
        if (existing != null) {
            return lockAndAttachLocationSeries(existing, location, company.getId(), isLocationDefaultIssuer);
        }

        InvoiceSeries seed = assignment.getDefaultInvoiceSeries();
        InvoiceSeries created = new InvoiceSeries();
        created.setWorkspace(company.getWorkspace());
        created.setLegalEntity(assignment.getLegalEntity());
        created.setCompany(company);
        created.setLocation(location);
        created.setName("Location-" + location.getId());
        created.setNextNumber(seed == null ? "1" : nonBlank(seed.getNextNumber(), "1"));
        created.setInitialNumber(seed == null ? created.getNextNumber() : nonBlank(seed.getInitialNumber(), created.getNextNumber()));
        created.setResetPolicy(seed == null || seed.getResetPolicy() == null ? InvoiceSeriesResetPolicy.NONE : seed.getResetPolicy());
        created.setLastResetYear(LocalDate.now().getYear());
        created.setBusinessPremiseCode(trim(location.getFiscalBusinessPremiseCode()));
        created.setElectronicDeviceId(seed == null ? "1" : nonBlank(seed.getElectronicDeviceId(), "1"));
        created.setActive(true);
        // The counter is allocated through JDBC immediately after this method returns. Flush the
        // insert now so the atomic UPDATE ... RETURNING statement can see the row in this transaction.
        created = seriesRepository.saveAndFlush(created);
        if (isLocationDefaultIssuer) {
            location.setDefaultInvoiceSeries(created);
            locations.save(location);
        }
        return created;
    }

    private InvoiceSeries findLocationSeries(Long locationId, Long legalEntityId) {
        // Return an inactive row as well. The database uniqueness rule still reserves its
        // Location-{id} name, so treating it as absent would cause a duplicate-key insert.
        return seriesRepository
                .findFirstByLocationIdAndLegalEntityIdOrderByActiveDescIdAsc(locationId, legalEntityId)
                .orElse(null);
    }

    private InvoiceSeries lockAndAttachLocationSeries(
            InvoiceSeries existing,
            Location location,
            Long companyId,
            boolean isLocationDefaultIssuer
    ) {
        lockInvoiceSeries(existing.getId());
        InvoiceSeries locked = seriesRepository.findForUpdateById(existing.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT,
                        "Location invoice counter no longer exists."));
        if (isLocationDefaultIssuer
                && (location.getDefaultInvoiceSeries() == null
                || !Objects.equals(location.getDefaultInvoiceSeries().getId(), locked.getId()))) {
            location.setDefaultInvoiceSeries(locked);
            locations.save(location);
        }
        validateSeries(locked, companyId, location);
        return locked;
    }

    private void lockLocationSeriesCreation(Long locationId, Long legalEntityId) {
        if (locationId == null || locationId <= 0 || legalEntityId == null || legalEntityId <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Location and invoice issuer are required.");
        }
        long pairHash = Integer.toUnsignedLong(Objects.hash(locationId, legalEntityId));
        long key = LOCATION_SERIES_CREATION_LOCK_NAMESPACE | (pairHash & ADVISORY_LOCK_ID_MASK);
        jdbc.execute("select pg_advisory_xact_lock(" + key + ")");
    }

    private InvoiceSeries resolveDefaultSeriesForUpdate(CompanyLegalEntity assignment, Long companyId, Location location) {
        if (assignment.getDefaultInvoiceSeries() != null) {
            Long seriesId = assignment.getDefaultInvoiceSeries().getId();
            lockInvoiceSeries(seriesId);
            InvoiceSeries locked = seriesRepository.findForUpdateById(seriesId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "Default invoice series no longer exists."));
            if (locked.isActive()) {
                validateSeries(locked, companyId, location);
                return locked;
            }
        }
        InvoiceSeries candidate = seriesRepository.findAllByLegalEntityIdOrderByActiveDescNameAscIdAsc(assignment.getLegalEntity().getId()).stream()
                .filter(InvoiceSeries::isActive)
                .filter(series -> series.getCompany() == null || Objects.equals(series.getCompany().getId(), companyId))
                .filter(series -> series.getLocation() == null || Objects.equals(series.getLocation().getId(), location.getId()))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "No active invoice series is available for the selected issuer."));
        lockInvoiceSeries(candidate.getId());
        InvoiceSeries locked = seriesRepository.findForUpdateById(candidate.getId()).orElseThrow();
        validateSeries(locked, companyId, location);
        return locked;
    }

    private void lockInvoiceSeries(Long seriesId) {
        if (seriesId == null || seriesId <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invoice series is required.");
        }
        long key = INVOICE_SERIES_LOCK_NAMESPACE | (seriesId & ADVISORY_LOCK_ID_MASK);
        // PostgreSQL transaction-level advisory locking closes the read/increment/write race even
        // when Hibernate uses follow-on locking for the entity query and across multiple app nodes.
        jdbc.execute("select pg_advisory_xact_lock(" + key + ")");
    }

    private void validateSeries(InvoiceSeries series, Long companyId, Location location) {
        if (!series.isActive()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Invoice series is inactive.");
        }
        if (series.getCompany() != null && !Objects.equals(series.getCompany().getId(), companyId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invoice series belongs to another operating unit.");
        }
        if (series.getLocation() != null && !Objects.equals(series.getLocation().getId(), location.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invoice series is restricted to another location.");
        }
        requireAssignment(companyId, series.getLegalEntity().getId());
    }

    private Location resolveLocation(Long companyId, Long requestedLocationId) {
        if (requestedLocationId != null) {
            return locations.findByIdAndCompanyId(requestedLocationId, companyId)
                    .filter(Location::isActive)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invoice location is invalid or inactive."));
        }
        return locations.findFirstByCompanyIdAndDefaultLocationTrue(companyId)
                .orElseGet(() -> locations.findAllByCompanyIdAndActiveTrueOrderByDefaultLocationDescNameAscIdAsc(companyId).stream()
                        .findFirst()
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "No active location is configured.")));
    }

    public static void applySnapshots(Bill bill, LegalEntity issuer, InvoiceSeries series, Location location) {
        bill.setIssuerNameSnapshot(nonBlank(issuer.getName(), "Issuer"));
        bill.setIssuerAddressSnapshot(trim(issuer.getAddress()));
        bill.setIssuerPostalCodeSnapshot(trim(issuer.getPostalCode()));
        bill.setIssuerCitySnapshot(trim(issuer.getCity()));
        bill.setIssuerCountrySnapshot(nonBlank(issuer.getCountry(), "SI"));
        bill.setIssuerTaxNumberSnapshot(trim(issuer.getTaxNumber()));
        bill.setIssuerVatIdSnapshot(trim(issuer.getVatId()));
        bill.setIssuerIbanSnapshot(trim(issuer.getIban()));
        bill.setIssuerBicSnapshot(trim(issuer.getBic()));
        bill.setIssuerEmailSnapshot(trim(issuer.getEmail()));
        bill.setIssuerTelephoneSnapshot(trim(issuer.getTelephone()));
        bill.setInvoiceSeriesNameSnapshot(nonBlank(series.getName(), "Default"));
        // The visible/fiscal invoice prefix is location-specific. Keep a snapshot so
        // the issued document remains stable if the location is edited later.
        bill.setFiscalBusinessPremiseSnapshot(nonBlank(
                location == null ? null : location.getFiscalBusinessPremiseCode(),
                "1"
        ));
        bill.setFiscalDeviceIdSnapshot(nonBlank(series.getElectronicDeviceId(), "1"));
    }

    private CounterAllocation allocateNumberAtomically(Long seriesId, int year) {
        if (seriesId == null || seriesId <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invoice series is required.");
        }

        // Allocation is a single PostgreSQL statement. SELECT ... FOR UPDATE serializes callers,
        // while UPDATE ... RETURNING returns the number that belonged to this request. This avoids
        // the read/increment/save race even if JPA and JdbcTemplate obtain connections differently.
        List<CounterAllocation> allocations = jdbc.query("""
                WITH locked AS (
                    SELECT id,
                           CASE
                               WHEN reset_policy = 'YEARLY' AND last_reset_year IS DISTINCT FROM ?
                                   THEN COALESCE(NULLIF(BTRIM(initial_number), ''), '1')
                               ELSE COALESCE(NULLIF(BTRIM(next_number), ''), '1')
                           END AS allocated
                      FROM invoice_series
                     WHERE id = ?
                     FOR UPDATE
                ),
                parts AS (
                    SELECT id,
                           allocated,
                           substring(allocated FROM '([0-9]+)$') AS digits
                      FROM locked
                ),
                next_value AS (
                    SELECT id,
                           allocated,
                           CASE
                               WHEN digits IS NULL THEN allocated || '1'
                               ELSE regexp_replace(allocated, '[0-9]+$', '') ||
                                    lpad(
                                        ((digits::numeric + 1)::text),
                                        GREATEST(
                                            char_length(digits),
                                            char_length((digits::numeric + 1)::text)
                                        ),
                                        '0'
                                    )
                           END AS next_number
                      FROM parts
                ),
                updated AS (
                    UPDATE invoice_series series
                       SET next_number = next_value.next_number,
                           last_reset_year = ?,
                           updated_at = CURRENT_TIMESTAMP
                      FROM next_value
                     WHERE series.id = next_value.id
                    RETURNING next_value.allocated AS allocated_number,
                              next_value.next_number AS next_number,
                              series.last_reset_year AS last_reset_year
                )
                SELECT allocated_number, next_number, last_reset_year
                  FROM updated
                """, (rs, rowNum) -> new CounterAllocation(
                rs.getString("allocated_number"),
                rs.getString("next_number"),
                rs.getInt("last_reset_year")
        ), year, seriesId, year);

        if (allocations.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Invoice series no longer exists.");
        }
        return allocations.getFirst();
    }

    private void synchronizeLegacySeriesCounter(Long legacySeriesId, Long locationSeriesId) {
        jdbc.update("""
                UPDATE invoice_series legacy
                   SET next_number = current_series.next_number,
                       last_reset_year = current_series.last_reset_year,
                       updated_at = CURRENT_TIMESTAMP
                  FROM invoice_series current_series
                 WHERE legacy.id = ?
                   AND current_series.id = ?
                   AND legacy.id <> current_series.id
                """, legacySeriesId, locationSeriesId);
    }

    private void synchronizeLegacyCounterIfDefault(
            CompanyLegalEntity assignment,
            InvoiceSeries series,
            Long companyId,
            String nextNumber
    ) {
        if (assignment.getDefaultInvoiceSeries() == null
                || !Objects.equals(assignment.getDefaultInvoiceSeries().getId(), series.getId())) {
            return;
        }
        settings.findByCompanyIdAndKey(companyId, SettingKey.INVOICE_COUNTER).ifPresent(setting -> {
            setting.setValue(nextNumber);
            settings.save(setting);
        });
    }

    private record CounterAllocation(String allocatedNumber, String nextNumber, int lastResetYear) {
    }

    public static String incrementAlphaNumeric(String value) {
        if (value == null || value.isBlank()) return "1";
        String v = value.trim();
        var matcher = java.util.regex.Pattern.compile("^(.*?)(\\d+)$").matcher(v);
        if (matcher.matches()) {
            String prefix = matcher.group(1);
            String digits = matcher.group(2);
            long number;
            try {
                number = Long.parseLong(digits);
            } catch (NumberFormatException ex) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invoice series number is too large.");
            }
            String next = String.valueOf(number + 1);
            if (next.length() < digits.length()) {
                next = "0".repeat(digits.length() - next.length()) + next;
            }
            return prefix + next;
        }
        return v + "1";
    }

    private static String trim(String value) {
        return value == null || value.trim().isEmpty() ? null : value.trim();
    }

    private static String nonBlank(String value, String fallback) {
        String trimmed = trim(value);
        return trimmed == null ? fallback : trimmed;
    }
}
