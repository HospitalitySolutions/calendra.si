package com.example.app.entitlement;

import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.util.Locale;
import java.util.Map;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PackageAccessService {
    private static final ObjectMapper JSON = new ObjectMapper();

    private final AppSettingRepository settings;
    private final UserRepository users;

    public PackageAccessService(AppSettingRepository settings, UserRepository users) {
        this.settings = settings;
        this.users = users;
    }

    public String packageType(Long companyId) {
        return settings.findByCompanyIdAndKey(companyId, SettingKey.SIGNUP_PACKAGE_NAME)
                .map(AppSetting::getValue)
                .map(PackageAccessService::normalizePackageType)
                .orElse("CUSTOM");
    }

    public boolean hasBillingAccess(User user) {
        if (isPlatformAdmin(user)) {
            return true;
        }
        return modulePackageAndConfigAllowed(user.getCompany().getId(), SettingKey.BILLING_ENABLED, "PROFESSIONAL");
    }

    public boolean hasInboxAccess(User user) {
        if (isPlatformAdmin(user)) {
            return true;
        }
        return modulePackageAndConfigAllowed(user.getCompany().getId(), SettingKey.INBOX_ENABLED, "PREMIUM");
    }

    public void requireBillingAccess(User user) {
        if (!hasBillingAccess(user)) {
            throw new ResponseStatusException(HttpStatus.PAYMENT_REQUIRED, "Your package does not include billing.");
        }
    }

    public void requireInboxAccess(User user) {
        if (!hasInboxAccess(user)) {
            throw new ResponseStatusException(HttpStatus.PAYMENT_REQUIRED, "Your package does not include inbox messaging.");
        }
    }

    public int userQuota(Long companyId) {
        int paidBase = parseIntSetting(companyId, SettingKey.SIGNUP_USER_COUNT, 1);
        int currentCycleAdditions = parseIntSetting(companyId, SettingKey.BILLING_SUBSCRIPTION_CURRENT_USER_ADD_COUNT, 0);
        int explicit = paidBase == Integer.MAX_VALUE ? Integer.MAX_VALUE : paidBase + Math.max(0, currentCycleAdditions);
        String pkg = packageType(companyId);
        int packageMinimum = switch (pkg) {
            case "CUSTOM" -> Integer.MAX_VALUE;
            default -> 1;
        };
        if ("CUSTOM".equals(pkg) && explicit <= 0) {
            return Integer.MAX_VALUE;
        }
        return Math.max(packageMinimum, explicit);
    }

    public void requireCanCreateUser(User actor) {
        if (isPlatformAdmin(actor)) {
            return;
        }
        Long companyId = actor.getCompany().getId();
        int quota = userQuota(companyId);
        if (quota == Integer.MAX_VALUE) {
            return;
        }
        long current = users.countByCompanyIdAndActiveTrue(companyId);
        if (current >= quota) {
            throw new ResponseStatusException(
                    HttpStatus.PAYMENT_REQUIRED,
                    "Your package allows " + quota + " active user" + (quota == 1 ? "" : "s") + ". Upgrade or increase your user count to add more."
            );
        }
    }

    private boolean modulePackageAndConfigAllowed(Long companyId, SettingKey moduleKey, String fallbackMinPackage) {
        String tenantPackage = packageType(companyId);
        String tenantConfigType = normalizeConfigType(settings.findByCompanyIdAndKey(companyId, SettingKey.MODULE_CONFIG_TYPE)
                .map(AppSetting::getValue)
                .orElse("salon"));
        String minPackage = normalizeModuleVisibilityPackage(fallbackMinPackage);
        String configType = "";
        String rawRules = latestGlobalModuleVisibilityRules();
        if (rawRules != null && !rawRules.isBlank()) {
            try {
                Map<String, Map<String, Object>> rules = JSON.readValue(rawRules, new TypeReference<>() {});
                Map<String, Object> rule = rules.get(moduleKey.name());
                if (rule != null) {
                    minPackage = normalizeModuleVisibilityPackage(rule.get("minPackage"));
                    configType = normalizeOptionalConfigType(rule.get("configType"));
                }
            } catch (Exception ignored) {
                // Keep package defaults if platform visibility JSON is malformed.
            }
        }
        if (packageRank(tenantPackage) < packageRank(minPackage)) {
            return false;
        }
        return configType.isBlank() || configType.equals(tenantConfigType);
    }

    private String latestGlobalModuleVisibilityRules() {
        return settings.findAllByKey(SettingKey.PLATFORM_MODULE_VISIBILITY_RULES_JSON).stream()
                .max((a, b) -> {
                    var au = a.getUpdatedAt();
                    var bu = b.getUpdatedAt();
                    if (au == null && bu == null) return 0;
                    if (au == null) return -1;
                    if (bu == null) return 1;
                    return au.compareTo(bu);
                })
                .map(AppSetting::getValue)
                .orElse("");
    }

    private static int packageRank(String value) {
        return switch (normalizePackageType(value)) {
            case "PREMIUM", "CUSTOM" -> 3;
            case "PROFESSIONAL", "TRIAL" -> 2;
            default -> 1;
        };
    }

    private static String normalizeModuleVisibilityPackage(Object raw) {
        String normalized = raw == null ? "" : String.valueOf(raw).trim().toUpperCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
        return switch (normalized) {
            case "PREMIUM" -> "PREMIUM";
            case "PROFESSIONAL", "PRO" -> "PROFESSIONAL";
            default -> "BASIC";
        };
    }

    private static String normalizeOptionalConfigType(Object raw) {
        String normalized = raw == null ? "" : String.valueOf(raw).trim().toLowerCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
        if (normalized.equals("all") || normalized.equals("any") || normalized.equals("*") || normalized.equals("none")) {
            return "";
        }
        return switch (normalized) {
            case "salon", "gym", "therapy", "spa", "personal_training" -> normalized;
            default -> "";
        };
    }

    private static String normalizeConfigType(String raw) {
        String normalized = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
        return switch (normalized) {
            case "salon", "gym", "therapy", "spa", "personal_training" -> normalized;
            default -> "salon";
        };
    }

    private int parseIntSetting(Long companyId, SettingKey key, int defaultValue) {
        try {
            return settings.findByCompanyIdAndKey(companyId, key)
                    .map(AppSetting::getValue)
                    .map(String::trim)
                    .filter(v -> !v.isBlank())
                    .map(Integer::parseInt)
                    .orElse(defaultValue);
        } catch (Exception ex) {
            return defaultValue;
        }
    }

    private static boolean isPlatformAdmin(User user) {
        return user != null && user.getRole() == Role.SUPER_ADMIN;
    }

    public static String normalizePackageType(String value) {
        String normalized = value == null ? "" : value.trim().toUpperCase(Locale.ROOT).replace("-", "_").replace(" ", "_");
        return switch (normalized) {
            case "TRIAL", "BASIC", "PROFESSIONAL", "PREMIUM", "CUSTOM" -> normalized;
            case "PRO" -> "PROFESSIONAL";
            default -> "CUSTOM";
        };
    }
}
