package com.example.app.settings;

import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/**
 * Central tenant-level feature switch access.
 */
@Service
public class TenantFeatureAccessService {
    private final AppSettingRepository settings;

    public TenantFeatureAccessService(AppSettingRepository settings) {
        this.settings = settings;
    }

    public boolean isWaitlistEnabled(Long companyId) {
        return isPremiumOrSelectedCustomFeature(companyId, SettingKey.WAITLIST_ENABLED)
                && isEnabled(companyId, SettingKey.WAITLIST_ENABLED, false);
    }

    public boolean areCustomFieldsEnabled(Long companyId) {
        return isPremiumOrSelectedCustomFeature(companyId, SettingKey.CUSTOM_FIELDS_ENABLED)
                && isEnabled(companyId, SettingKey.CUSTOM_FIELDS_ENABLED, false);
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

    private boolean isPremiumOrSelectedCustomFeature(Long companyId, SettingKey featureKey) {
        if (companyId == null) return false;
        String packageName = settings.findByCompanyIdAndKey(companyId, SettingKey.SIGNUP_PACKAGE_NAME)
                .map(AppSetting::getValue)
                .map(TenantFeatureAccessService::normalizePackage)
                .orElse("BASIC");
        if ("PREMIUM".equals(packageName)) return true;
        if (!"CUSTOM".equals(packageName)) return false;
        Set<String> selected = settings
                .findByCompanyIdAndKey(companyId, SettingKey.BILLING_SUBSCRIPTION_CUSTOM_FEATURE_KEYS)
                .map(AppSetting::getValue)
                .map(TenantFeatureAccessService::parseFeatureKeys)
                .orElse(Set.of());
        return selected.contains(featureKey.name());
    }

    private static String normalizePackage(String value) {
        String normalized = value == null ? "" : value.trim().toUpperCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
        return switch (normalized) {
            case "PREMIUM" -> "PREMIUM";
            case "CUSTOM" -> "CUSTOM";
            case "PROFESSIONAL", "PRO", "TRIAL" -> "PROFESSIONAL";
            default -> "BASIC";
        };
    }

    private static Set<String> parseFeatureKeys(String value) {
        if (value == null || value.isBlank()) return Set.of();
        return Arrays.stream(value.split("[,;\\s]+"))
                .map(String::trim)
                .filter(item -> !item.isBlank())
                .map(item -> item.toUpperCase(Locale.ROOT))
                .collect(Collectors.toUnmodifiableSet());
    }
}
