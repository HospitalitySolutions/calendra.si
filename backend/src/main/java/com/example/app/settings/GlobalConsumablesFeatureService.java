package com.example.app.settings;

import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.util.Arrays;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class GlobalConsumablesFeatureService {
    private final AppSettingRepository settings;
    private final UserRepository users;

    public GlobalConsumablesFeatureService(AppSettingRepository settings, UserRepository users) {
        this.settings = settings;
        this.users = users;
    }

    public boolean isGloballyEnabled() {
        return users.findAllByRoleOrderByIdAsc(Role.SUPER_ADMIN).stream()
                .findFirst()
                .flatMap(u -> settings.findByCompanyIdAndKey(u.getCompany().getId(), SettingKey.GLOBAL_CONSUMABLES_ENABLED))
                .map(AppSetting::getValue)
                .map(v -> v == null ? "" : v.trim())
                .filter(v -> !v.isBlank())
                .map(v -> "true".equalsIgnoreCase(v) || "1".equals(v))
                .orElse(false);
    }

    public boolean isEnabledForCompany(Long companyId) {
        if (companyId == null || companyId <= 0) return false;
        if (!isGloballyEnabled() || !isPackageEntitled(companyId)) return false;
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
                    "Consumables are disabled. Enable Porabni material in App settings (Premium) and ensure the platform feature is enabled.");
        }
    }
}
