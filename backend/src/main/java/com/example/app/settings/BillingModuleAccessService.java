package com.example.app.settings;

import com.example.app.user.User;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class BillingModuleAccessService {
    private final AppSettingRepository settings;

    public BillingModuleAccessService(AppSettingRepository settings) {
        this.settings = settings;
    }

    public boolean isBillingEnabled(User user) {
        if (user == null || user.getCompany() == null || user.getCompany().getId() == null) {
            return true;
        }
        return isEnabled(user.getCompany().getId(), SettingKey.BILLING_ENABLED, true);
    }

    public boolean isAdvanceEnabled(Long companyId) {
        if (companyId == null) {
            return true;
        }
        return isEnabled(companyId, SettingKey.BILLING_ENABLED, true)
                && isEnabled(companyId, SettingKey.BILLING_ADVANCE_ENABLED, true);
    }

    public void assertAdvanceEnabled(Long companyId) {
        if (!isAdvanceEnabled(companyId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Advance billing is disabled for this tenant.");
        }
    }

    private boolean isEnabled(Long companyId, SettingKey key, boolean defaultValue) {
        return settings.findByCompanyIdAndKey(companyId, key)
                .map(AppSetting::getValue)
                .map(value -> {
                    String normalized = String.valueOf(value == null ? "" : value).trim();
                    if ("true".equalsIgnoreCase(normalized)) return true;
                    if ("false".equalsIgnoreCase(normalized)) return false;
                    return defaultValue;
                })
                .orElse(defaultValue);
    }

    public void assertBillingEnabled(User user) {
        if (!isBillingEnabled(user)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Billing module is disabled for this tenant.");
        }
    }
}
