package com.example.app.security;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

class SecurityUtilsConsumablesPermissionsTest {

    @Test
    void consumablesActionsAreRemovedWhenViewPermissionIsMissing() {
        var normalized = SecurityUtils.normalizePermissionsForStorage(List.of(
                SecurityUtils.PERMISSION_CONSUMABLES_EDIT,
                SecurityUtils.PERMISSION_CONSUMABLES_STOCK_ADJUST,
                SecurityUtils.PERMISSION_CONSUMABLES_PROCUREMENT,
                SecurityUtils.PERMISSION_CONSUMABLES_INVENTORY,
                SecurityUtils.PERMISSION_CONSUMABLES_REPORTS
        ));

        assertFalse(normalized.contains(SecurityUtils.PERMISSION_CONSUMABLES_EDIT));
        assertFalse(normalized.contains(SecurityUtils.PERMISSION_CONSUMABLES_STOCK_ADJUST));
        assertFalse(normalized.contains(SecurityUtils.PERMISSION_CONSUMABLES_PROCUREMENT));
        assertFalse(normalized.contains(SecurityUtils.PERMISSION_CONSUMABLES_INVENTORY));
        assertFalse(normalized.contains(SecurityUtils.PERMISSION_CONSUMABLES_REPORTS));
    }

    @Test
    void consumablesActionsArePreservedWhenViewPermissionIsPresent() {
        var normalized = SecurityUtils.normalizePermissionsForStorage(List.of(
                SecurityUtils.PERMISSION_CONSUMABLES_VIEW,
                SecurityUtils.PERMISSION_CONSUMABLES_EDIT,
                SecurityUtils.PERMISSION_CONSUMABLES_STOCK_ADJUST,
                SecurityUtils.PERMISSION_CONSUMABLES_PROCUREMENT,
                SecurityUtils.PERMISSION_CONSUMABLES_INVENTORY,
                SecurityUtils.PERMISSION_CONSUMABLES_REPORTS
        ));

        assertTrue(normalized.containsAll(SecurityUtils.CONSUMABLE_PERMISSION_KEYS));
    }
}
