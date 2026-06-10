package com.example.app.security;

import com.example.app.user.Role;
import com.example.app.user.User;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

public final class SecurityUtils {
    public static final String PERMISSIONS_VERSION_MARKER = "__EMPLOYEE_PERMISSIONS_V2";
    public static final String PERMISSION_WALLET_ENTITLEMENT_SCAN = "WALLET_ENTITLEMENT_SCAN";
    public static final String PERMISSION_BILLING_ADVANCE_INVOICE_ISSUE = "BILLING_ADVANCE_INVOICE_ISSUE";
    public static final String PERMISSION_BILLING_OPEN_INVOICE_ISSUE = "BILLING_OPEN_INVOICE_ISSUE";
    public static final String PERMISSION_BILLING_REFUND_ISSUE = "BILLING_REFUND_ISSUE";

    public static final Set<String> ALLOWED_EMPLOYEE_PERMISSIONS = Set.of(
            PERMISSION_WALLET_ENTITLEMENT_SCAN,
            PERMISSION_BILLING_ADVANCE_INVOICE_ISSUE,
            PERMISSION_BILLING_OPEN_INVOICE_ISSUE,
            PERMISSION_BILLING_REFUND_ISSUE
    );

    public static final Set<String> DEFAULT_ENABLED_EMPLOYEE_PERMISSIONS = Set.of(
            PERMISSION_BILLING_ADVANCE_INVOICE_ISSUE,
            PERMISSION_BILLING_OPEN_INVOICE_ISSUE,
            PERMISSION_BILLING_REFUND_ISSUE
    );

    private static final ObjectMapper JSON = new ObjectMapper();

    private SecurityUtils() {}

    public static boolean isAdmin(User user) {
        return user != null && (user.getRole() == Role.ADMIN || user.getRole() == Role.SUPER_ADMIN);
    }

    public static boolean hasPermission(User user, String permission) {
        if (user == null || permission == null || permission.isBlank()) return false;
        if (isAdmin(user)) return true;
        return activePermissionSet(user.getPermissionsJson()).contains(permission.trim());
    }

    public static boolean canScanWalletEntitlements(User user) {
        return hasPermission(user, PERMISSION_WALLET_ENTITLEMENT_SCAN);
    }

    public static boolean canIssueAdvanceInvoices(User user) {
        return hasPermission(user, PERMISSION_BILLING_ADVANCE_INVOICE_ISSUE);
    }

    public static boolean canIssueOpenInvoices(User user) {
        return hasPermission(user, PERMISSION_BILLING_OPEN_INVOICE_ISSUE);
    }

    public static boolean canIssueRefundInvoices(User user) {
        return hasPermission(user, PERMISSION_BILLING_REFUND_ISSUE);
    }

    /**
     * Permissions sent to the frontend. The marker lets the frontend distinguish
     * legacy rows (invoice permissions default ON) from newly saved rows where
     * an admin intentionally turned invoice permissions OFF.
     */
    public static List<String> permissionsForClientResponse(String permissionsJson) {
        var active = new ArrayList<String>();
        active.add(PERMISSIONS_VERSION_MARKER);
        active.addAll(activePermissionSet(permissionsJson));
        return active.stream().distinct().toList();
    }

    public static List<String> defaultEmployeePermissions() {
        return new ArrayList<>(DEFAULT_ENABLED_EMPLOYEE_PERMISSIONS);
    }

    public static LinkedHashSet<String> normalizePermissionsForStorage(List<String> permissions) {
        var normalized = new LinkedHashSet<String>();
        normalized.add(PERMISSIONS_VERSION_MARKER);
        if (permissions != null) {
            permissions.stream()
                    .filter(ALLOWED_EMPLOYEE_PERMISSIONS::contains)
                    .forEach(normalized::add);
        } else {
            normalized.addAll(DEFAULT_ENABLED_EMPLOYEE_PERMISSIONS);
        }
        return normalized;
    }

    private static LinkedHashSet<String> activePermissionSet(String permissionsJson) {
        var stored = parseStoredPermissions(permissionsJson);
        boolean hasMarker = stored.contains(PERMISSIONS_VERSION_MARKER);
        var active = new LinkedHashSet<String>();
        stored.stream()
                .filter(ALLOWED_EMPLOYEE_PERMISSIONS::contains)
                .forEach(active::add);
        if (!hasMarker) {
            active.addAll(DEFAULT_ENABLED_EMPLOYEE_PERMISSIONS);
        }
        return active;
    }

    private static List<String> parseStoredPermissions(String permissionsJson) {
        if (permissionsJson == null || permissionsJson.isBlank()) return List.of();
        try {
            List<?> parsed = JSON.readValue(permissionsJson, List.class);
            return parsed.stream()
                    .filter(String.class::isInstance)
                    .map(String.class::cast)
                    .distinct()
                    .toList();
        } catch (Exception ex) {
            return List.of();
        }
    }
}
