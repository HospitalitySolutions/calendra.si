package com.example.app.settings;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/**
 * Central tenant-level feature switch access. Missing values intentionally
 * default to enabled so existing tenants keep their current functionality.
 */
@Service
public class TenantFeatureAccessService {
    private final AppSettingRepository settings;

    public TenantFeatureAccessService(AppSettingRepository settings) {
        this.settings = settings;
    }

    public boolean isWaitlistEnabled(Long companyId) {
        return isEnabled(companyId, SettingKey.WAITLIST_ENABLED, true);
    }

    public boolean areServiceGroupsEnabled(Long companyId) {
        return isEnabled(companyId, SettingKey.SERVICE_GROUPS_ENABLED, true);
    }

    public void assertWaitlistEnabled(Long companyId) {
        if (!isWaitlistEnabled(companyId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Waitlist is disabled for this tenant.");
        }
    }

    public void assertServiceGroupsEnabled(Long companyId) {
        if (!areServiceGroupsEnabled(companyId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Service groups are disabled for this tenant.");
        }
    }

    private boolean isEnabled(Long companyId, SettingKey key, boolean defaultValue) {
        if (companyId == null) return defaultValue;
        return settings.findByCompanyIdAndKey(companyId, key)
                .map(AppSetting::getValue)
                .map(value -> "true".equalsIgnoreCase(String.valueOf(value).trim()))
                .orElse(defaultValue);
    }
}
