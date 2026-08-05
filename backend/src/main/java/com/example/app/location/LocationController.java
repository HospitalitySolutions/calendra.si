package com.example.app.location;

import com.example.app.billing.BillRepository;
import com.example.app.billingissuer.CompanyLegalEntity;
import com.example.app.billingissuer.CompanyLegalEntityRepository;
import com.example.app.billingissuer.InvoiceSeries;
import com.example.app.billingissuer.InvoiceSeriesRepository;
import com.example.app.billingissuer.InvoiceSeriesResetPolicy;
import com.example.app.billingissuer.LegalEntity;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.SpaceRepository;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.user.User;
import com.example.app.waitlist.WaitlistRequestRepository;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/locations")
public class LocationController {
    private final LocationRepository locations;
    private final SpaceRepository spaces;
    private final SessionBookingRepository bookings;
    private final WaitlistRequestRepository waitlists;
    private final BillRepository bills;
    private final CompanyLegalEntityRepository issuerAssignments;
    private final InvoiceSeriesRepository invoiceSeries;
    private final AppSettingRepository settings;

    public LocationController(
            LocationRepository locations,
            SpaceRepository spaces,
            SessionBookingRepository bookings,
            WaitlistRequestRepository waitlists,
            BillRepository bills,
            CompanyLegalEntityRepository issuerAssignments,
            InvoiceSeriesRepository invoiceSeries,
            AppSettingRepository settings
    ) {
        this.locations = locations;
        this.spaces = spaces;
        this.bookings = bookings;
        this.waitlists = waitlists;
        this.bills = bills;
        this.issuerAssignments = issuerAssignments;
        this.invoiceSeries = invoiceSeries;
        this.settings = settings;
    }

    public record LocationInput(
            String name,
            String address,
            String postalCode,
            String city,
            String country,
            String timezone,
            String phone,
            String email,
            String openingHoursJson,
            Boolean publicBookingEnabled,
            Boolean defaultLocation,
            Boolean active,
            String fiscalBusinessPremiseCode,
            Long defaultLegalEntityId,
            String invoiceNextNumber,
            String invoiceInitialNumber,
            String invoiceResetPolicy,
            String invoiceElectronicDeviceId
    ) {}

    public record LocationResponse(
            Long id,
            String name,
            String address,
            String postalCode,
            String city,
            String country,
            String timezone,
            String phone,
            String email,
            String openingHoursJson,
            boolean publicBookingEnabled,
            boolean defaultLocation,
            boolean active,
            String fiscalBusinessPremiseCode,
            Long defaultLegalEntityId,
            String defaultLegalEntityName,
            Long defaultInvoiceSeriesId,
            String invoiceNextNumber,
            String invoiceInitialNumber,
            String invoiceResetPolicy,
            String invoiceElectronicDeviceId
    ) {}

    @GetMapping
    @Transactional(readOnly = true)
    public List<LocationResponse> list(@AuthenticationPrincipal User me) {
        return locations.findAllByCompanyIdOrderByDefaultLocationDescNameAscIdAsc(me.getCompany().getId())
                .stream().map(LocationController::response).toList();
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    public LocationResponse create(@RequestBody LocationInput input, @AuthenticationPrincipal User me) {
        String name = requiredName(input == null ? null : input.name());
        if (locations.existsByCompanyIdAndNameIgnoreCase(me.getCompany().getId(), name)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A location with this name already exists.");
        }
        Location location = new Location();
        location.setCompany(me.getCompany());
        apply(location, input, me.getCompany().getId());
        if (location.getDefaultLegalEntity() == null) {
            location.setDefaultLegalEntity(defaultIssuer(me.getCompany().getId()));
        }
        if (locations.countByCompanyId(me.getCompany().getId()) == 0 || Boolean.TRUE.equals(input.defaultLocation())) {
            clearDefault(me.getCompany().getId(), null);
            location.setDefaultLocation(true);
        }
        location = locations.save(location);
        ensureLocationInvoiceSeries(location, input);
        location = locations.save(location);
        synchronizeDefaultPhysicalAddress(location);
        return response(location);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    public LocationResponse update(@PathVariable Long id, @RequestBody LocationInput input, @AuthenticationPrincipal User me) {
        Location location = locations.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        String name = requiredName(input == null ? null : input.name());
        boolean duplicate = locations.findAllByCompanyIdOrderByDefaultLocationDescNameAscIdAsc(me.getCompany().getId()).stream()
                .anyMatch(other -> !other.getId().equals(id) && other.getName().equalsIgnoreCase(name));
        if (duplicate) throw new ResponseStatusException(HttpStatus.CONFLICT, "A location with this name already exists.");
        boolean wasDefault = location.isDefaultLocation();
        if (wasDefault && Boolean.FALSE.equals(input.defaultLocation())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Choose another default location before changing this one.");
        }
        if (Boolean.TRUE.equals(input.defaultLocation()) && !wasDefault) clearDefault(me.getCompany().getId(), id);
        apply(location, input, me.getCompany().getId());
        if (wasDefault || Boolean.TRUE.equals(input.defaultLocation())) location.setDefaultLocation(true);
        if (location.isDefaultLocation()) location.setActive(true);
        if (!location.isDefaultLocation() && locations.countByCompanyId(me.getCompany().getId()) == 1) location.setDefaultLocation(true);
        ensureLocationInvoiceSeries(location, input);
        location = locations.save(location);
        synchronizeDefaultPhysicalAddress(location);
        return response(location);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    public void delete(@PathVariable Long id, @AuthenticationPrincipal User me) {
        Location location = locations.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (location.isDefaultLocation()) throw new ResponseStatusException(HttpStatus.CONFLICT, "The default location cannot be deleted.");
        if (spaces.countByLocationId(id) > 0 || bookings.countByLocationId(id) > 0 || waitlists.countByLocationId(id) > 0
                || bills.countByLocationId(id) > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Location is in use and cannot be deleted.");
        }
        location.setDefaultInvoiceSeries(null);
        locations.save(location);
        invoiceSeries.deleteAll(invoiceSeries.findAllByLocationId(id));
        locations.delete(location);
    }

    private void clearDefault(Long companyId, Long exceptId) {
        locations.findAllByCompanyIdOrderByDefaultLocationDescNameAscIdAsc(companyId).forEach(location -> {
            if (location.isDefaultLocation() && (exceptId == null || !location.getId().equals(exceptId))) {
                location.setDefaultLocation(false);
                locations.save(location);
            }
        });
    }

    private void apply(Location location, LocationInput input, Long companyId) {
        if (input == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Location is required.");
        location.setName(requiredName(input.name()));
        location.setAddress(trim(input.address()));
        location.setPostalCode(trim(input.postalCode()));
        location.setCity(trim(input.city()));
        location.setCountry(normalizeCountry(input.country()));
        location.setTimezone(normalizeTimezone(input.timezone()));
        location.setPhone(trim(input.phone()));
        location.setEmail(trim(input.email()));
        location.setOpeningHoursJson(trim(input.openingHoursJson()));
        if (input.publicBookingEnabled() != null) location.setPublicBookingEnabled(input.publicBookingEnabled());
        if (input.defaultLocation() != null) location.setDefaultLocation(input.defaultLocation());
        if (input.active() != null) location.setActive(input.active());
        location.setFiscalBusinessPremiseCode(trim(input.fiscalBusinessPremiseCode()));
        if (input.defaultLegalEntityId() != null) {
            location.setDefaultLegalEntity(requireAssignedIssuer(companyId, input.defaultLegalEntityId()));
        }
    }

    private void ensureLocationInvoiceSeries(Location location, LocationInput input) {
        LegalEntity issuer = location.getDefaultLegalEntity();
        if (issuer == null) {
            issuer = defaultIssuer(location.getCompany().getId());
            location.setDefaultLegalEntity(issuer);
        }

        InvoiceSeries value = location.getDefaultInvoiceSeries();
        if (value != null && (!Objects.equals(value.getLegalEntity().getId(), issuer.getId())
                || value.getLocation() == null
                || !Objects.equals(value.getLocation().getId(), location.getId()))) {
            value = null;
        }
        if (value == null) {
            value = invoiceSeries.findFirstByLocationIdAndLegalEntityIdOrderByActiveDescIdAsc(location.getId(), issuer.getId())
                    .orElseGet(InvoiceSeries::new);
        }
        if (value.getId() != null) {
            Long seriesId = value.getId();
            value = invoiceSeries.findForUpdateById(seriesId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT,
                            "The location invoice counter no longer exists."));
        }

        boolean created = value.getId() == null;
        if (created) {
            value.setWorkspace(location.getCompany().getWorkspace());
            value.setLegalEntity(issuer);
            value.setCompany(location.getCompany());
            value.setLocation(location);
            value.setName("Location-" + location.getId());
            value.setLastResetYear(LocalDate.now().getYear());
            value.setActive(true);
        }
        value.setNextNumber(nonBlank(input.invoiceNextNumber(), nonBlank(value.getNextNumber(), "1")));
        value.setInitialNumber(nonBlank(input.invoiceInitialNumber(), nonBlank(value.getInitialNumber(), value.getNextNumber())));
        value.setResetPolicy(parseResetPolicy(input.invoiceResetPolicy(), value.getResetPolicy()));
        value.setBusinessPremiseCode(trim(location.getFiscalBusinessPremiseCode()));
        value.setElectronicDeviceId(nonBlank(input.invoiceElectronicDeviceId(), nonBlank(value.getElectronicDeviceId(), "1")));
        value.setActive(true);
        value = invoiceSeries.save(value);
        location.setDefaultInvoiceSeries(value);
    }

    private void synchronizeDefaultPhysicalAddress(Location location) {
        if (!location.isDefaultLocation()) return;
        upsertSetting(location, SettingKey.COMPANY_PHYSICAL_ADDRESS, location.getAddress());
        upsertSetting(location, SettingKey.COMPANY_PHYSICAL_POSTAL_CODE, location.getPostalCode());
        upsertSetting(location, SettingKey.COMPANY_PHYSICAL_CITY, location.getCity());
        upsertSetting(location, SettingKey.COMPANY_PHYSICAL_COUNTRY, location.getCountry());
        upsertSetting(location, SettingKey.COMPANY_PHYSICAL_ADDRESS_SAME_AS_COMPANY, "false");
    }

    private void upsertSetting(Location location, SettingKey key, String rawValue) {
        AppSetting setting = settings.findByCompanyIdAndKey(location.getCompany().getId(), key)
                .orElseGet(() -> {
                    AppSetting created = new AppSetting();
                    created.setCompany(location.getCompany());
                    created.setKey(key.name());
                    return created;
                });
        setting.setValue(rawValue == null ? "" : rawValue);
        settings.save(setting);
    }

    private LegalEntity defaultIssuer(Long companyId) {
        return issuerAssignments.findFirstByCompanyIdAndActiveTrueOrderByDefaultIssuerDescIdAsc(companyId)
                .map(CompanyLegalEntity::getLegalEntity)
                .filter(LegalEntity::isActive)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT,
                        "Assign an active invoice issuer before creating a location."));
    }

    private LegalEntity requireAssignedIssuer(Long companyId, Long legalEntityId) {
        return issuerAssignments.findByCompanyIdAndLegalEntityId(companyId, legalEntityId)
                .filter(CompanyLegalEntity::isActive)
                .map(CompanyLegalEntity::getLegalEntity)
                .filter(LegalEntity::isActive)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "The selected invoice issuer is not assigned to this operating unit."));
    }

    private static InvoiceSeriesResetPolicy parseResetPolicy(String value, InvoiceSeriesResetPolicy fallback) {
        String normalized = trim(value);
        if (normalized == null) return fallback == null ? InvoiceSeriesResetPolicy.NONE : fallback;
        try {
            return InvoiceSeriesResetPolicy.valueOf(normalized.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported invoice counter reset policy.");
        }
    }

    private static String normalizeTimezone(String timezone) {
        String value = trim(timezone);
        if (value == null) return "Europe/Ljubljana";
        try {
            return ZoneId.of(value).getId();
        } catch (DateTimeException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported time zone.");
        }
    }

    private static String normalizeCountry(String country) {
        String value = trim(country);
        if (value == null || !value.matches("(?i)[a-z]{2}")) return "SI";
        return value.toUpperCase(Locale.ROOT);
    }

    private static String requiredName(String name) {
        String value = trim(name);
        if (value == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Location name is required.");
        return value;
    }

    private static String trim(String value) {
        return value == null || value.trim().isEmpty() ? null : value.trim();
    }

    private static String nonBlank(String value, String fallback) {
        String normalized = trim(value);
        return normalized == null ? fallback : normalized;
    }

    private static LocationResponse response(Location l) {
        InvoiceSeries series = l.getDefaultInvoiceSeries();
        return new LocationResponse(
                l.getId(),
                l.getName(),
                l.getAddress(),
                l.getPostalCode(),
                l.getCity(),
                l.getCountry(),
                l.getTimezone(),
                l.getPhone(),
                l.getEmail(),
                l.getOpeningHoursJson(),
                l.isPublicBookingEnabled(),
                l.isDefaultLocation(),
                l.isActive(),
                l.getFiscalBusinessPremiseCode(),
                l.getDefaultLegalEntity() == null ? null : l.getDefaultLegalEntity().getId(),
                l.getDefaultLegalEntity() == null ? null : l.getDefaultLegalEntity().getName(),
                series == null ? null : series.getId(),
                series == null ? "1" : series.getNextNumber(),
                series == null ? "1" : series.getInitialNumber(),
                series == null || series.getResetPolicy() == null ? InvoiceSeriesResetPolicy.NONE.name() : series.getResetPolicy().name(),
                series == null ? "1" : series.getElectronicDeviceId()
        );
    }
}
