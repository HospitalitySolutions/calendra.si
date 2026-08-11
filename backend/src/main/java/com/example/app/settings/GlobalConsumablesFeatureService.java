package com.example.app.settings;

import com.example.app.user.User;
import java.util.Arrays;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class GlobalConsumablesFeatureService {
    private final AppSettingRepository settings;
    public GlobalConsumablesFeatureService(AppSettingRepository settings) {
        this.settings = settings;
    }

    public boolean isEnabledForCompany(Long companyId) {
        if (companyId == null || companyId <= 0) return false;
        if (!isPackageEntitled(companyId)) return false;
        return settings.findByCompanyIdAndKey(companyId, SettingKey.CONSUMABLES_ENABLED)
                .map(AppSetting::getValue)
                .map(v -> v == null ? "" : v.trim())
                .map(v -> "true".equalsIgnoreCase(v) || "1".equals(v))
                .orElse(false);
    }

    private boolean isPackageEntitled(Long companyId) {
        String packageName = settings.findByCompanyIdAndKey(companyId, SettingKey.SIGNUP_PACKAGE_NAME)
                .map(AppSetting::getValue)
                .map(value -> value == null ? "" : value.trim().toUpperCase(Locale.ROOT)
                        .replace('-', '_').replace(' ', '_'))
                .orElse("BASIC");
        if ("PREMIUM".equals(packageName) || "BUSINESS".equals(packageName)) return true;
        if (!"CUSTOM".equals(packageName)) return false;
        return settings.findByCompanyIdAndKey(companyId, SettingKey.BILLING_SUBSCRIPTION_CUSTOM_FEATURE_KEYS)
                .map(AppSetting::getValue)
                .map(value -> value == null ? "" : value)
                .stream()
                .flatMap(value -> Arrays.stream(value.split("[,;\\s]+")))
                .map(value -> value.trim().toUpperCase(Locale.ROOT))
                .anyMatch(SettingKey.CONSUMABLES_ENABLED.name()::equals);
    }

    public boolean isEnabledForUser(User user) {
        if (user == null || user.getCompany() == null) return false;
        return isEnabledForCompany(user.getCompany().getId());
    }

    public void assertEnabledForUser(User user) {
        if (!isEnabledForUser(user)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Consumables are disabled. Enable Porabni material in App settings (Premium).");
        }
    }
}
