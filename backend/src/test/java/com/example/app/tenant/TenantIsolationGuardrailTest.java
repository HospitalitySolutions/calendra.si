package com.example.app.tenant;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class TenantIsolationGuardrailTest {
    @Test
    void publicWidgetResolvesTenantByIndexedTenantCodeInsteadOfScanningAllCompanies() throws IOException {
        String widgetService = Files.readString(Path.of("src/main/java/com/example/app/widget/PublicBookingWidgetService.java"));
        String orderService = Files.readString(Path.of("src/main/java/com/example/app/widget/PublicWidgetOrderService.java"));

        assertTrue(widgetService.contains("companies.findByTenantCodeIgnoreCase"),
                "PublicBookingWidgetService should use the indexed tenant-code lookup.");
        assertTrue(orderService.contains("companies.findByTenantCodeIgnoreCase"),
                "PublicWidgetOrderService should use the indexed tenant-code lookup.");
        assertFalse(widgetService.contains("companies.findAll().stream()"),
                "Public widget tenant lookup must not scan every company.");
        assertFalse(orderService.contains("companies.findAll().stream()"),
                "Public widget order tenant lookup must not scan every company.");
    }
}
