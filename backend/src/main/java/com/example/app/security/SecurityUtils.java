package com.example.app.security;

import com.example.app.user.Role;
import com.example.app.user.User;

public final class SecurityUtils {
    public static final String PERMISSION_WALLET_ENTITLEMENT_SCAN = "WALLET_ENTITLEMENT_SCAN";

    private SecurityUtils() {}

    public static boolean isAdmin(User user) {
        return user != null && (user.getRole() == Role.ADMIN || user.getRole() == Role.SUPER_ADMIN);
    }

    public static boolean hasPermission(User user, String permission) {
        if (user == null || permission == null || permission.isBlank()) return false;
        if (isAdmin(user)) return true;
        String raw = user.getPermissionsJson();
        return raw != null && raw.contains("\"" + permission.trim() + "\"");
    }

    public static boolean canScanWalletEntitlements(User user) {
        return hasPermission(user, PERMISSION_WALLET_ENTITLEMENT_SCAN);
    }
}
