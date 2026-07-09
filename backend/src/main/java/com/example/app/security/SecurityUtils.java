package com.example.app.security;

import com.example.app.user.Role;
import com.example.app.user.User;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

public final class SecurityUtils {
    public static final String PERMISSIONS_VERSION_MARKER = "__EMPLOYEE_PERMISSIONS_V2";
    public static final String PERMISSION_WALLET_ENTITLEMENT_SCAN = "WALLET_ENTITLEMENT_SCAN";
    public static final String PERMISSION_CALENDAR_BOOKINGS_VIEW = "CALENDAR_BOOKINGS_VIEW";
    public static final String PERMISSION_BILLING_ADVANCE_INVOICE_ISSUE = "BILLING_ADVANCE_INVOICE_ISSUE";
    public static final String PERMISSION_BILLING_OPEN_INVOICE_ISSUE = "BILLING_OPEN_INVOICE_ISSUE";
    public static final String PERMISSION_BILLING_REFUND_ISSUE = "BILLING_REFUND_ISSUE";

    public static final List<String> PERMISSION_GROUP_KEYS = List.of(
            "CALENDAR_BOOKINGS",
            "CLIENTS",
            "EMPLOYEES",
            "ROLES_PERMISSIONS",
            "SERVICES",
            "SPACES",
            "COURSES",
            "BILLING_INVOICES",
            "ORDERS",
            "WALLET_BENEFITS",
            "INBOX_MESSAGES",
            "NOTIFICATIONS",
            "DELIVERY_LOGS",
            "REPORTS_ANALYTICS",
            "SETTINGS",
            "INTEGRATIONS",
            "WEBSITE_WIDGET",
            "GUEST_MOBILE_APP",
            "PAYMENTS",
            "SCANNER"
    );

    private static final List<String> LEGACY_PERMISSION_GROUP_KEYS = List.of(
            "BILLING",
            "WALLET",
            "REPORTS",
            "PLATFORM_FEATURES"
    );

    public static final List<String> PERMISSION_ACTION_KEYS = List.of("VIEW", "CREATE", "EDIT", "DELETE");

    public static final Set<String> ALLOWED_EMPLOYEE_PERMISSIONS = buildAllowedEmployeePermissions();

    public static final Set<String> DEFAULT_ENABLED_EMPLOYEE_PERMISSIONS = Set.of(
            PERMISSION_CALENDAR_BOOKINGS_VIEW,
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
        return hasPermission(user, PERMISSION_WALLET_ENTITLEMENT_SCAN)
                || hasPermission(user, "SCANNER_VIEW")
                || hasPermission(user, "SCANNER_CREATE")
                || hasPermission(user, "SCANNER_EDIT");
    }

    public static boolean canIssueAdvanceInvoices(User user) {
        return hasPermission(user, PERMISSION_BILLING_ADVANCE_INVOICE_ISSUE)
                || hasPermission(user, "BILLING_INVOICES_CREATE")
                || hasPermission(user, "BILLING_INVOICES_EDIT");
    }

    public static boolean canIssueOpenInvoices(User user) {
        return hasPermission(user, PERMISSION_BILLING_OPEN_INVOICE_ISSUE)
                || hasPermission(user, "BILLING_INVOICES_CREATE")
                || hasPermission(user, "BILLING_INVOICES_EDIT");
    }

    public static boolean canIssueRefundInvoices(User user) {
        return hasPermission(user, PERMISSION_BILLING_REFUND_ISSUE)
                || hasPermission(user, "BILLING_INVOICES_DELETE")
                || hasPermission(user, "PAYMENTS_EDIT")
                || hasPermission(user, "PAYMENTS_DELETE");
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
            enforceViewDependencies(normalized);
            addCompatibilityPermissions(normalized);
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
        enforceViewDependencies(active);
        addCompatibilityPermissions(active);
        return active;
    }

    private static void enforceViewDependencies(LinkedHashSet<String> permissions) {
        for (String group : PERMISSION_GROUP_KEYS) {
            removeActionsWithoutView(permissions, group);
        }
        for (String group : LEGACY_PERMISSION_GROUP_KEYS) {
            removeActionsWithoutView(permissions, group);
        }
    }

    private static void removeActionsWithoutView(LinkedHashSet<String> permissions, String group) {
        if (permissions.contains(group + "_VIEW")) return;
        permissions.remove(group + "_CREATE");
        permissions.remove(group + "_EDIT");
        permissions.remove(group + "_DELETE");
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

    private static Set<String> buildAllowedEmployeePermissions() {
        var allowed = new LinkedHashSet<String>();
        allowed.add(PERMISSION_WALLET_ENTITLEMENT_SCAN);
        allowed.add(PERMISSION_BILLING_ADVANCE_INVOICE_ISSUE);
        allowed.add(PERMISSION_BILLING_OPEN_INVOICE_ISSUE);
        allowed.add(PERMISSION_BILLING_REFUND_ISSUE);
        for (String group : PERMISSION_GROUP_KEYS) {
            for (String action : PERMISSION_ACTION_KEYS) {
                allowed.add(group + "_" + action);
            }
        }
        for (String group : LEGACY_PERMISSION_GROUP_KEYS) {
            for (String action : PERMISSION_ACTION_KEYS) {
                allowed.add(group + "_" + action);
            }
        }
        return Collections.unmodifiableSet(allowed);
    }

    private static void addCompatibilityPermissions(LinkedHashSet<String> normalized) {
        if (normalized.contains("BILLING_CREATE")
                || normalized.contains("BILLING_EDIT")
                || normalized.contains("BILLING_INVOICES_CREATE")
                || normalized.contains("BILLING_INVOICES_EDIT")) {
            normalized.add(PERMISSION_BILLING_ADVANCE_INVOICE_ISSUE);
            normalized.add(PERMISSION_BILLING_OPEN_INVOICE_ISSUE);
        }
        if (normalized.contains("BILLING_DELETE")
                || normalized.contains("BILLING_EDIT")
                || normalized.contains("BILLING_INVOICES_DELETE")
                || normalized.contains("PAYMENTS_EDIT")
                || normalized.contains("PAYMENTS_DELETE")) {
            normalized.add(PERMISSION_BILLING_REFUND_ISSUE);
        }
        if (normalized.contains("WALLET_VIEW")
                || normalized.contains("WALLET_CREATE")
                || normalized.contains("WALLET_EDIT")
                || normalized.contains("SCANNER_VIEW")
                || normalized.contains("SCANNER_CREATE")
                || normalized.contains("SCANNER_EDIT")) {
            normalized.add(PERMISSION_WALLET_ENTITLEMENT_SCAN);
        }
    }
}
