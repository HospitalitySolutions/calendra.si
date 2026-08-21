package com.example.app.location;

import com.example.app.activitylog.ActivityAction;
import com.example.app.activitylog.ActivityDetails;
import com.example.app.activitylog.ActivityLogService;
import com.example.app.activitylog.ActivityModule;
import com.example.app.billing.BillRepository;
import com.example.app.billingissuer.CompanyLegalEntity;
import com.example.app.billingissuer.CompanyLegalEntityRepository;
import com.example.app.billingissuer.InvoiceSeries;
import com.example.app.billingissuer.InvoiceSeriesRepository;
import com.example.app.billingissuer.InvoiceSeriesResetPolicy;
import com.example.app.billingissuer.LegalEntity;
import com.example.app.files.TenantFileS3Service;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.SpaceRepository;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.settings.TenantConfigTypeCatalog;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.waitlist.WaitlistRequestRepository;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
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

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private ActivityLogService activityLogs;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private TenantFileS3Service fileStorage;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private LocationGeocodingService locationGeocoding;

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
            String publicName,
            String publicAddress,
            String publicDescription,
            String publicBusinessType,
            Boolean publicDirectoryEnabled,
            Boolean guestAppDiscoverable,
            Boolean websitePresentationEnabled,
            String googlePlaceId,
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
            String locationCode,
            String name,
            String address,
            String postalCode,
            String city,
            String country,
            String timezone,
            String phone,
            String email,
            String openingHoursJson,
            String publicName,
            String publicAddress,
            String publicDescription,
            String publicBusinessType,
            String publicLogoS3Key,
            String publicLogoUrl,
            boolean publicDirectoryEnabled,
            boolean guestAppDiscoverable,
            boolean websitePresentationEnabled,
            String googlePlaceId,
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
        if (locations.countByCompanyId(me.getCompany().getId()) > 0 && !additionalLocationsEnabled(me)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Additional locations are not enabled for this package.");
        }
        String name = requiredName(input == null ? null : input.name());
        if (locations.existsByCompanyIdAndNameIgnoreCase(me.getCompany().getId(), name)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A location with this name already exists.");
        }
        Location location = new Location();
        location.setCompany(me.getCompany());
        apply(location, input, me.getCompany().getId());
        ensurePublicBusinessType(location, me.getCompany().getId());
        refreshLocationCoordinates(location);
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
        LocationResponse result = response(location);
        recordLocation(me, ActivityAction.LOCATION_CREATED, result, "Created location", null);
        return result;
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    public LocationResponse update(@PathVariable Long id, @RequestBody LocationInput input, @AuthenticationPrincipal User me) {
        Location location = locations.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        LocationResponse beforeAudit = response(location);
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
        ensurePublicBusinessType(location, me.getCompany().getId());
        refreshLocationCoordinates(location);
        if (wasDefault || Boolean.TRUE.equals(input.defaultLocation())) location.setDefaultLocation(true);
        if (location.isDefaultLocation()) location.setActive(true);
        if (!location.isDefaultLocation() && locations.countByCompanyId(me.getCompany().getId()) == 1) location.setDefaultLocation(true);
        ensureLocationInvoiceSeries(location, input);
        location = locations.save(location);
        synchronizeDefaultPhysicalAddress(location);
        LocationResponse result = response(location);
        recordLocation(me, ActivityAction.LOCATION_UPDATED, result, "Updated location", beforeAudit);
        return result;
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
        Long deletedId = location.getId();
        String deletedName = location.getName();
        String deletedPublicLogoKey = location.getPublicLogoS3Key();
        locations.delete(location);
        deletePublicLogoAfterCommit(deletedPublicLogoKey);
        if (activityLogs != null) {
            activityLogs.recordUser(me, ActivityModule.CONFIGURATION, ActivityAction.LOCATION_DELETED,
                    "LOCATION", deletedId, deletedName, "Deleted location", deletedId, null,
                    ActivityDetails.of("targetPath", "/configuration?tab=company&subtab=operatingUnits"));
        }
    }

    private void deletePublicLogoAfterCommit(String objectKey) {
        if (fileStorage == null || objectKey == null || objectKey.isBlank()) return;
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            fileStorage.deleteQuietly(objectKey);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                fileStorage.deleteQuietly(objectKey);
            }
        });
    }

    private void recordLocation(User me, ActivityAction action, LocationResponse row, String summary, LocationResponse before) {
        if (activityLogs == null || row == null) return;
        var details = ActivityDetails.of(
                "city", row.city(), "country", row.country(), "timezone", row.timezone(),
                "active", row.active(), "defaultLocation", row.defaultLocation(),
                "publicName", row.publicName(), "publicBusinessType", row.publicBusinessType(), "publicDirectoryEnabled", row.publicDirectoryEnabled(),
                "guestAppDiscoverable", row.guestAppDiscoverable(), "websitePresentationEnabled", row.websitePresentationEnabled(),
                "invoiceResetPolicy", row.invoiceResetPolicy(), "targetPath", "/configuration?tab=company&subtab=operatingUnits"
        );
        if (before != null) {
            details.put("before", ActivityDetails.of(
                    "name", before.name(), "city", before.city(), "country", before.country(), "timezone", before.timezone(),
                    "active", before.active(), "defaultLocation", before.defaultLocation(),
                    "publicName", before.publicName(), "publicBusinessType", before.publicBusinessType(), "publicDirectoryEnabled", before.publicDirectoryEnabled(),
                    "guestAppDiscoverable", before.guestAppDiscoverable(), "websitePresentationEnabled", before.websitePresentationEnabled(),
                    "invoiceResetPolicy", before.invoiceResetPolicy(), "invoiceElectronicDeviceId", before.invoiceElectronicDeviceId()));
            details.put("after", ActivityDetails.of(
                    "name", row.name(), "city", row.city(), "country", row.country(), "timezone", row.timezone(),
                    "active", row.active(), "defaultLocation", row.defaultLocation(),
                    "publicName", row.publicName(), "publicBusinessType", row.publicBusinessType(), "publicDirectoryEnabled", row.publicDirectoryEnabled(),
                    "guestAppDiscoverable", row.guestAppDiscoverable(), "websitePresentationEnabled", row.websitePresentationEnabled(),
                    "invoiceResetPolicy", row.invoiceResetPolicy(), "invoiceElectronicDeviceId", row.invoiceElectronicDeviceId()));
        }
        activityLogs.recordUser(me, ActivityModule.CONFIGURATION, action,
                "LOCATION", row.id(), row.name(), summary, row.id(), null, details);
    }

    private void ensurePublicBusinessType(Location location, Long companyId) {
        if (location == null || location.getPublicBusinessType() != null) return;
        String configured = settings.findByCompanyIdAndKey(companyId, SettingKey.MODULE_CONFIG_TYPE)
                .map(AppSetting::getValue)
                .orElse(null);
        location.setPublicBusinessType(TenantConfigTypeCatalog.normalizeOrDefault(configured));
    }

    private void clearDefault(Long companyId, Long exceptId) {
        locations.findAllByCompanyIdOrderByDefaultLocationDescNameAscIdAsc(companyId).forEach(location -> {
            if (location.isDefaultLocation() && (exceptId == null || !location.getId().equals(exceptId))) {
                location.setDefaultLocation(false);
                locations.save(location);
            }
        });
    }

    private boolean additionalLocationsEnabled(User me) {
        if (me == null || me.getCompany() == null || me.getCompany().getId() == null) return false;
        Long companyId = me.getCompany().getId();
        boolean explicitlyEnabled = settings.findByCompanyIdAndKey(companyId, SettingKey.LOCATIONS_ENABLED)
                .map(AppSetting::getValue)
                .map(value -> "true".equalsIgnoreCase(value == null ? "" : value.trim()))
                .orElse(false);
        if (me.getRole() == Role.SUPER_ADMIN) return explicitlyEnabled;

        String packageName = settings.findByCompanyIdAndKey(companyId, SettingKey.SIGNUP_PACKAGE_NAME)
                .map(AppSetting::getValue)
                .map(value -> value == null ? "" : value.trim().toUpperCase(Locale.ROOT)
                        .replace('-', '_').replace(' ', '_'))
                .orElse("BASIC");
        if ("CUSTOM".equals(packageName)) {
            return customFeatureEnabled(companyId, SettingKey.LOCATIONS_ENABLED.name()) && explicitlyEnabled;
        }
        if (!"PREMIUM".equals(packageName) && !"BUSINESS".equals(packageName)) return false;
        // Existing Premium tenants created before LOCATIONS_ENABLED was introduced
        // keep the feature on until they explicitly switch it off.
        return settings.findByCompanyIdAndKey(companyId, SettingKey.LOCATIONS_ENABLED)
                .map(AppSetting::getValue)
                .map(value -> !"false".equalsIgnoreCase(value == null ? "" : value.trim()))
                .orElse(true);
    }

    private boolean customFeatureEnabled(Long companyId, String featureKey) {
        return settings.findByCompanyIdAndKey(companyId, SettingKey.BILLING_SUBSCRIPTION_CUSTOM_FEATURE_KEYS)
                .map(AppSetting::getValue)
                .map(value -> value == null ? "" : value)
                .stream()
                .flatMap(value -> Arrays.stream(value.split("[,;\\s]+")))
                .map(value -> value.trim().toUpperCase(Locale.ROOT))
                .anyMatch(featureKey.toUpperCase(Locale.ROOT)::equals);
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
        // Null means "field not supplied" so older clients can update a location
        // without erasing the newly-migrated public presentation. An explicit blank
        // string clears an override.
        if (input.publicName() != null) location.setPublicName(trimMax(input.publicName(), 255, "Public name"));
        if (input.publicAddress() != null) location.setPublicAddress(trimMax(input.publicAddress(), 512, "Public address"));
        if (input.publicDescription() != null) location.setPublicDescription(trimMax(input.publicDescription(), 500, "Public description"));
        if (input.publicBusinessType() != null) {
            String rawBusinessType = trim(input.publicBusinessType());
            if (rawBusinessType == null) {
                location.setPublicBusinessType(null);
            } else {
                String publicBusinessType = TenantConfigTypeCatalog.normalizeOrNull(rawBusinessType);
                if (publicBusinessType == null) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown public business type.");
                }
                location.setPublicBusinessType(publicBusinessType);
            }
        }
        if (input.googlePlaceId() != null) location.setGooglePlaceId(trimMax(input.googlePlaceId(), 255, "Google Place ID"));
        if (input.publicDirectoryEnabled() != null) location.setPublicDirectoryEnabled(input.publicDirectoryEnabled());
        if (input.guestAppDiscoverable() != null) location.setGuestAppDiscoverable(input.guestAppDiscoverable());
        if (input.websitePresentationEnabled() != null) location.setWebsitePresentationEnabled(input.websitePresentationEnabled());
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


    private void refreshLocationCoordinates(Location location) {
        if (locationGeocoding == null) return;
        locationGeocoding.refreshAfterAddressWrite(location);
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

    private static String trimMax(String value, int maxLength, String label) {
        String normalized = trim(value);
        if (normalized != null && normalized.length() > maxLength) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, label + " is too long.");
        }
        return normalized;
    }

    private static String nonBlank(String value, String fallback) {
        String normalized = trim(value);
        return normalized == null ? fallback : normalized;
    }

    private static String locationCode(Location location) {
        if (location == null || location.getId() == null || location.getCompany() == null) return null;
        String tenantCode = location.getCompany().getTenantCode();
        if (tenantCode == null || tenantCode.isBlank()) return null;
        return tenantCode.trim() + "-" + location.getId();
    }

    private static LocationResponse response(Location l) {
        InvoiceSeries series = l.getDefaultInvoiceSeries();
        return new LocationResponse(
                l.getId(),
                locationCode(l),
                l.getName(),
                l.getAddress(),
                l.getPostalCode(),
                l.getCity(),
                l.getCountry(),
                l.getTimezone(),
                l.getPhone(),
                l.getEmail(),
                l.getOpeningHoursJson(),
                l.getPublicName(),
                l.getPublicAddress(),
                l.getPublicDescription(),
                l.getPublicBusinessType(),
                l.getPublicLogoS3Key(),
                LocationPublicPresentationService.publicLogoPath(l.getPublicLogoS3Key()),
                l.isPublicDirectoryEnabled(),
                l.isGuestAppDiscoverable(),
                l.isWebsitePresentationEnabled(),
                l.getGooglePlaceId(),
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
