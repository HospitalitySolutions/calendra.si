package com.example.app.settings;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/**
 * Master runtime gate for tenant wallet benefits / entitlements (Ugodnosti).
 *
 * Missing settings intentionally default to enabled so existing tenants keep
 * their current behaviour until they explicitly switch the module off.
 */
@Service
public class EntitlementsModuleAccessService {
    private final AppSettingRepository settings;

    public EntitlementsModuleAccessService(AppSettingRepository settings) {
        this.settings = settings;
    }

    public boolean isEnabled(Long companyId) {
        if (companyId == null) return true;
        return settings.findByCompanyIdAndKey(companyId, SettingKey.ENTITLEMENTS_ENABLED)
                .map(AppSetting::getValue)
                .map(value -> !"false".equalsIgnoreCase(String.valueOf(value).trim()))
                .orElse(true);
    }

    public void assertEnabled(Long companyId) {
        if (!isEnabled(companyId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Entitlements are disabled for this tenant.");
        }
    }
}
