package com.example.app.entitlement;

import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PackageAccessService {
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
        String pkg = packageType(user.getCompany().getId());
        return "PROFESSIONAL".equals(pkg) || "PREMIUM".equals(pkg) || "CUSTOM".equals(pkg);
    }

    public boolean hasInboxAccess(User user) {
        if (isPlatformAdmin(user)) {
            return true;
        }
        String pkg = packageType(user.getCompany().getId());
        return "PREMIUM".equals(pkg) || "CUSTOM".equals(pkg);
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
        int explicit = parseIntSetting(companyId, SettingKey.SIGNUP_USER_COUNT, 1);
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
