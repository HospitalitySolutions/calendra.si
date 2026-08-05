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

        InvoiceSeries chosen;
        CompanyLegalEntity assignment;
        if (requestedSeriesId != null) {
            lockInvoiceSeries(requestedSeriesId);
            InvoiceSeries candidate = seriesRepository.findForUpdateById(requestedSeriesId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invoice series not found."));
            assignment = requireAssignment(companyId, candidate.getLegalEntity().getId());
            if (requestedLegalEntityId != null && !Objects.equals(requestedLegalEntityId, candidate.getLegalEntity().getId())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invoice series does not belong to the selected issuer.");
            }
            validateSeries(candidate, companyId, location);
            chosen = candidate;
        } else {
            Long legalEntityId = requestedLegalEntityId;
            if (legalEntityId == null && location.getDefaultLegalEntity() != null) {
                Long locationIssuerId = location.getDefaultLegalEntity().getId();
                if (assignments.findByCompanyIdAndLegalEntityId(companyId, locationIssuerId)
                        .filter(CompanyLegalEntity::isActive).isPresent()) {
                    legalEntityId = locationIssuerId;
                }
            }
            assignment = legalEntityId == null
                    ? assignments.findFirstByCompanyIdAndActiveTrueOrderByDefaultIssuerDescIdAsc(companyId)
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "No invoice issuer is assigned to this operating unit."))
                    : requireAssignment(companyId, legalEntityId);
            chosen = resolveDefaultSeriesForUpdate(assignment, companyId, location);
        }

        int year = (issueDate == null ? LocalDate.now() : issueDate).getYear();
        if (chosen.getResetPolicy() == InvoiceSeriesResetPolicy.YEARLY
                && !Objects.equals(chosen.getLastResetYear(), year)) {
            chosen.setNextNumber(nonBlank(chosen.getInitialNumber(), "1"));
            chosen.setLastResetYear(year);
        }
        String number = nonBlank(chosen.getNextNumber(), "1");
        chosen.setNextNumber(incrementAlphaNumeric(number));
        chosen.setLastResetYear(year);
        seriesRepository.save(chosen);

        LegalEntity issuer = chosen.getLegalEntity();
        bill.setCompany(company);
        bill.setLegalEntity(issuer);
        bill.setInvoiceSeries(chosen);
        bill.setLocation(location);
        bill.setBillNumber(number);
        applySnapshots(bill, issuer, chosen);
        synchronizeLegacyCounterIfDefault(assignment, chosen, companyId);
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
                .filter(series -> location == null || series.getLocation() == null || Objects.equals(series.getLocation().getId(), location.getId()))
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

    public static void applySnapshots(Bill bill, LegalEntity issuer, InvoiceSeries series) {
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
        bill.setFiscalBusinessPremiseSnapshot(trim(series.getBusinessPremiseCode()));
        bill.setFiscalDeviceIdSnapshot(trim(series.getElectronicDeviceId()));
    }

    private void synchronizeLegacyCounterIfDefault(CompanyLegalEntity assignment, InvoiceSeries series, Long companyId) {
        if (assignment.getDefaultInvoiceSeries() == null
                || !Objects.equals(assignment.getDefaultInvoiceSeries().getId(), series.getId())) {
            return;
        }
        settings.findByCompanyIdAndKey(companyId, SettingKey.INVOICE_COUNTER).ifPresent(setting -> {
            setting.setValue(series.getNextNumber());
            settings.save(setting);
        });
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
