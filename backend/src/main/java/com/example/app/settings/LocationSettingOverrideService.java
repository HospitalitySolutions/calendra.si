package com.example.app.settings;

import com.example.app.company.CompanyRepository;
import com.example.app.location.Location;
import com.example.app.location.LocationRepository;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class LocationSettingOverrideService {
    public static final Set<SettingKey> OVERRIDABLE_KEYS = EnumSet.of(
            SettingKey.TENANT_RESERVATION_RULES_JSON,
            SettingKey.WAITLIST_SETTINGS_JSON,
            SettingKey.DEFAULT_SERVICE_BREAK_MINUTES
    );

    private final LocationSettingOverrideRepository overrides;
    private final AppSettingRepository defaults;
    private final LocationRepository locations;
    private final CompanyRepository companies;

    public LocationSettingOverrideService(
            LocationSettingOverrideRepository overrides,
            AppSettingRepository defaults,
            LocationRepository locations,
            CompanyRepository companies
    ) {
        this.overrides = overrides;
        this.defaults = defaults;
        this.locations = locations;
        this.companies = companies;
    }

    public Optional<String> overrideValue(Long companyId, Long locationId, SettingKey key) {
        if (companyId == null || locationId == null || key == null || !OVERRIDABLE_KEYS.contains(key)) return Optional.empty();
        return overrides.findByCompanyIdAndLocationIdAndSettingKey(companyId, locationId, key.name())
                .map(LocationSettingOverride::getValue);
    }

    public String effectiveValue(Long companyId, Long locationId, SettingKey key, String fallback) {
        Optional<String> override = overrideValue(companyId, locationId, key);
        if (override.isPresent()) return override.get();
        if (companyId == null || key == null) return fallback;
        return defaults.findByCompanyIdAndKey(companyId, key).map(AppSetting::getValue).orElse(fallback);
    }

    public Map<String, String> overrides(Long companyId, Long locationId) {
        requireLocation(companyId, locationId);
        Map<String, String> out = new LinkedHashMap<>();
        for (LocationSettingOverride row : overrides.findAllByCompanyIdAndLocationId(companyId, locationId)) {
            if (row != null && row.getSettingKey() != null && isOverridable(row.getSettingKey())) {
                out.put(row.getSettingKey(), row.getValue());
            }
        }
        return out;
    }

    @Transactional
    public void save(Long companyId, Long locationId, SettingKey key, String value) {
        requireKey(key);
        Location location = requireLocation(companyId, locationId);
        LocationSettingOverride row = overrides.findByCompanyIdAndLocationIdAndSettingKey(companyId, locationId, key.name())
                .orElseGet(() -> {
                    LocationSettingOverride created = new LocationSettingOverride();
                    created.setCompany(companies.getReferenceById(companyId));
                    created.setLocation(location);
                    created.setSettingKey(key.name());
                    return created;
                });
        row.setValue(value == null ? "" : value);
        overrides.save(row);
    }

    @Transactional
    public void clear(Long companyId, Long locationId, SettingKey key) {
        requireKey(key);
        requireLocation(companyId, locationId);
        overrides.deleteByCompanyIdAndLocationIdAndSettingKey(companyId, locationId, key.name());
    }

    public Location requireLocation(Long companyId, Long locationId) {
        if (companyId == null || locationId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A concrete location is required.");
        }
        return locations.findByIdAndCompanyId(locationId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid location."));
    }

    public static boolean isOverridable(String raw) {
        if (raw == null || raw.isBlank()) return false;
        try {
            return OVERRIDABLE_KEYS.contains(SettingKey.valueOf(raw.trim()));
        } catch (IllegalArgumentException ignored) {
            return false;
        }
    }

    private static void requireKey(SettingKey key) {
        if (key == null || !OVERRIDABLE_KEYS.contains(key)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This setting cannot be overridden per location.");
        }
    }
}
