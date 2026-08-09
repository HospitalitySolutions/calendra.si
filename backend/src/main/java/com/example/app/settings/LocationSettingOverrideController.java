package com.example.app.settings;

import com.example.app.session.SessionTypeBreakSettingsService;
import com.example.app.user.User;
import com.example.app.waitlist.WaitlistSettingsService;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/settings/location-overrides")
public class LocationSettingOverrideController {
    private final LocationSettingOverrideService overrides;
    private final WaitlistSettingsService waitlistSettings;

    public LocationSettingOverrideController(LocationSettingOverrideService overrides, WaitlistSettingsService waitlistSettings) {
        this.overrides = overrides;
        this.waitlistSettings = waitlistSettings;
    }

    public record OverridesResponse(Long locationId, Map<String, String> values) {}
    public record ValueRequest(String value) {}

    @GetMapping
    public OverridesResponse get(@AuthenticationPrincipal User me, @RequestParam Long locationId) {
        Long companyId = companyId(me);
        return new OverridesResponse(locationId, overrides.overrides(companyId, locationId));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/{key}")
    public OverridesResponse put(
            @AuthenticationPrincipal User me,
            @RequestParam Long locationId,
            @PathVariable String key,
            @RequestBody(required = false) ValueRequest request
    ) {
        Long companyId = companyId(me);
        SettingKey settingKey = parseKey(key);
        String normalized = normalize(settingKey, request == null ? null : request.value());
        overrides.save(companyId, locationId, settingKey, normalized);
        return new OverridesResponse(locationId, overrides.overrides(companyId, locationId));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/{key}")
    public OverridesResponse clear(
            @AuthenticationPrincipal User me,
            @RequestParam Long locationId,
            @PathVariable String key
    ) {
        Long companyId = companyId(me);
        overrides.clear(companyId, locationId, parseKey(key));
        return new OverridesResponse(locationId, overrides.overrides(companyId, locationId));
    }

    private String normalize(SettingKey key, String value) {
        if (key == SettingKey.TENANT_RESERVATION_RULES_JSON) {
            return TenantReservationRulesService.normalizeJson(value);
        }
        if (key == SettingKey.WAITLIST_SETTINGS_JSON) {
            return waitlistSettings.normalizeJson(value);
        }
        if (key == SettingKey.DEFAULT_SERVICE_BREAK_MINUTES) {
            return String.valueOf(SessionTypeBreakSettingsService.normalizeDefault(value));
        }
        return value == null ? "" : value;
    }

    private static SettingKey parseKey(String raw) {
        try {
            SettingKey key = SettingKey.valueOf(raw == null ? "" : raw.trim());
            if (!LocationSettingOverrideService.OVERRIDABLE_KEYS.contains(key)) throw new IllegalArgumentException();
            return key;
        } catch (IllegalArgumentException ignored) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This setting cannot be overridden per location.");
        }
    }

    private static Long companyId(User me) {
        if (me == null || me.getCompany() == null || me.getCompany().getId() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required.");
        }
        return me.getCompany().getId();
    }
}
