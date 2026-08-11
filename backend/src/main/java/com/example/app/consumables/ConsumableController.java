package com.example.app.consumables;

import com.example.app.activitylog.ActivityAction;
import com.example.app.activitylog.ActivityDetails;
import com.example.app.activitylog.ActivityLogService;
import com.example.app.activitylog.ActivityModule;
import com.example.app.billing.OpenBillSyncService;
import com.example.app.billing.TaxRate;
import com.example.app.consumables.ConsumableEnums.PurchaseOrderStatus;
import com.example.app.consumables.ConsumableEnums.QuantityMode;
import com.example.app.consumables.ConsumableEnums.StockMovementType;
import com.example.app.consumables.ConsumableEnums.SupplierStatus;
import com.example.app.settings.GlobalConsumablesFeatureService;
import com.example.app.user.User;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.Instant;
import java.util.List;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/consumables")
public class ConsumableController {
    private final ConsumableService service;
    private final GlobalConsumablesFeatureService consumablesFeatureService;
    private final OpenBillSyncService openBillSyncService;
    private final ConsumableInventoryService inventoryService;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private ActivityLogService activityLogs;

    public ConsumableController(
            ConsumableService service,
            GlobalConsumablesFeatureService consumablesFeatureService,
            OpenBillSyncService openBillSyncService,
            ConsumableInventoryService inventoryService
    ) {
        this.service = service;
        this.consumablesFeatureService = consumablesFeatureService;
        this.openBillSyncService = openBillSyncService;
        this.inventoryService = inventoryService;
    }

    public record CategoryRequest(String name, String color, Boolean active) {}
    public record CategoryResponse(Long id, String name, String color, boolean active) {}

    public record ItemRequest(
            String name,
            String description,
            Long categoryId,
            String sku,
            String barcode,
            String unit,
            Long locationId,
            BigDecimal currentStock,
            BigDecimal minimumStock,
            BigDecimal costPrice,
            BigDecimal salePrice,
            Long vatRateId,
            TaxRate vatRate,
            Boolean trackStock,
            Boolean billable,
            Boolean active
    ) {}

    public record ItemResponse(
            Long id,
            String name,
            String description,
            CategoryResponse category,
            String sku,
            String barcode,
            String unit,
            Long locationId,
            String location,
            BigDecimal currentStock,
            BigDecimal minimumStock,
            BigDecimal costPrice,
            BigDecimal salePrice,
            Long vatRateId,
            TaxRate vatRate,
            boolean trackStock,
            boolean billable,
            boolean active,
            boolean lowStock
    ) {}

    public record StockAdjustmentRequest(Long locationId, BigDecimal quantityDelta, StockMovementType movementType, String note) {}

    public record MovementResponse(
            Long id,
            Long consumableId,
            String itemName,
            String categoryName,
            Long locationId,
            String locationName,
            StockMovementType movementType,
            String sourceType,
            Long sourceId,
            BigDecimal quantityDelta,
            BigDecimal stockBefore,
            BigDecimal stockAfter,
            BigDecimal valueDelta,
            String unit,
            String note,
            String userName,
            Instant createdAt
    ) {}

    public record LabelValue(String label, BigDecimal value) {}

    public record OverviewResponse(
            long totalItems,
            long lowStockItems,
            BigDecimal monthlyConsumptionQuantity,
            BigDecimal stockValue,
            List<ItemResponse> lowStock,
            List<MovementResponse> recentMovements,
            List<LabelValue> categoryUsage,
            List<LabelValue> mostUsed
    ) {}

    public record ServiceTypeConsumableRequest(
            Long consumableId,
            BigDecimal defaultQuantity,
            QuantityMode quantityMode,
            Boolean billableOverride,
            String notes
    ) {}

    public record ServiceTypeConsumableResponse(
            Long id,
            Long consumableId,
            String itemName,
            String unit,
            BigDecimal defaultQuantity,
            QuantityMode quantityMode,
            Boolean billableOverride,
            String notes
    ) {}

    public record SessionConsumableRequest(
            Long consumableId,
            BigDecimal quantity,
            String unit,
            QuantityMode quantityMode,
            Boolean billable,
            String notes
    ) {}

    public record SessionConsumableResponse(
            Long id,
            Long consumableId,
            String itemName,
            String unit,
            BigDecimal quantity,
            QuantityMode quantityMode,
            BigDecimal costPriceSnapshot,
            BigDecimal salePriceSnapshot,
            TaxRate vatRateSnapshot,
            boolean billable,
            String source,
            boolean manuallyChanged,
            String notes
    ) {}

    public record SupplierRequest(
            String name,
            String contactName,
            String phone,
            String email,
            String categories,
            Integer paymentTermsDays,
            Integer reliabilityPercent,
            BigDecimal outstandingAmount,
            SupplierStatus status
    ) {}

    public record SupplierResponse(
            Long id,
            String name,
            String contactName,
            String phone,
            String email,
            String categories,
            Integer paymentTermsDays,
            Integer reliabilityPercent,
            BigDecimal outstandingAmount,
            SupplierStatus status
    ) {}

    public record PurchaseOrderLineRequest(
            Long consumableId,
            BigDecimal orderedQuantity,
            BigDecimal unitPrice,
            TaxRate vatRate
    ) {}

    public record PurchaseOrderRequest(
            String orderNumber,
            Long supplierId,
            Long locationId,
            PurchaseOrderStatus status,
            LocalDate orderDate,
            LocalDate expectedDate,
            BigDecimal totalAmount,
            BigDecimal receivedAmount,
            String notes,
            List<PurchaseOrderLineRequest> lines
    ) {}

    public record PurchaseOrderLineResponse(
            Long id,
            Long consumableId,
            String itemName,
            String sku,
            String unit,
            BigDecimal orderedQuantity,
            BigDecimal receivedQuantity,
            BigDecimal remainingQuantity,
            BigDecimal unitPrice,
            TaxRate vatRate,
            BigDecimal netAmount,
            BigDecimal vatAmount,
            BigDecimal grossAmount
    ) {}

    public record PurchaseOrderReceiveLineRequest(Long lineId, BigDecimal quantity) {}
    public record PurchaseOrderReceiveRequest(String idempotencyKey, String note, List<PurchaseOrderReceiveLineRequest> lines) {}

    public record PurchaseOrderReceiptLineResponse(
            Long purchaseOrderLineId, Long consumableId, String itemName, String unit, BigDecimal quantity
    ) {}

    public record PurchaseOrderReceiptResponse(
            Long id, String idempotencyKey, Instant receivedAt, String note, String userName, List<PurchaseOrderReceiptLineResponse> lines
    ) {}

    public record PurchaseOrderResponse(
            Long id,
            String orderNumber,
            Long supplierId,
            String supplierName,
            Long locationId,
            String locationName,
            PurchaseOrderStatus status,
            LocalDate orderDate,
            LocalDate expectedDate,
            BigDecimal totalAmount,
            BigDecimal receivedAmount,
            String notes
    ) {}

    public record PurchaseOrderDetailResponse(
            PurchaseOrderResponse order,
            List<PurchaseOrderLineResponse> lines,
            List<PurchaseOrderReceiptResponse> receipts
    ) {}

    public record InventoryStartRequest(Long locationId, String notes) {}
    public record InventoryCountLineRequest(Long lineId, BigDecimal countedQuantity, String notes) {}
    public record InventoryCountRequest(List<InventoryCountLineRequest> lines) {}

    public record InventorySessionResponse(
            Long id,
            Long locationId,
            String locationName,
            String status,
            Instant startedAt,
            Instant completedAt,
            String startedBy,
            String completedBy,
            String notes,
            int totalItems,
            int countedItems,
            int discrepancyItems,
            int progressPercent
    ) {}

    public record InventoryLineResponse(
            Long id,
            Long consumableId,
            String itemName,
            String categoryName,
            String unit,
            BigDecimal systemQuantity,
            BigDecimal countedQuantity,
            BigDecimal discrepancyQuantity,
            BigDecimal costPriceSnapshot,
            BigDecimal discrepancyValue,
            String notes,
            Instant countedAt,
            String countedBy
    ) {}

    public record InventoryDetailResponse(InventorySessionResponse session, List<InventoryLineResponse> lines, List<MovementResponse> movements) {}

    private Long enabledCompanyId(User me) {
        consumablesFeatureService.assertEnabledForUser(me);
        return me.getCompany().getId();
    }

    private void assertConsumablesEnabled(User me) {
        consumablesFeatureService.assertEnabledForUser(me);
    }

    @GetMapping("/overview")
    public OverviewResponse overview(
            @RequestParam(required = false) Long locationId,
            @AuthenticationPrincipal User me
    ) {
        return service.overview(enabledCompanyId(me), locationId);
    }

    @GetMapping("/items")
    public List<ItemResponse> items(
            @RequestParam(required = false) Long locationId,
            @AuthenticationPrincipal User me
    ) {
        return service.listItems(enabledCompanyId(me), locationId).stream().map(ConsumableController::toItemResponse).toList();
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/items")
    public ItemResponse createItem(@RequestBody ItemRequest req, @AuthenticationPrincipal User me) {
        assertConsumablesEnabled(me);
        ItemResponse result = toItemResponse(service.createItem(me, req));
        recordItem(me, ActivityAction.CONSUMABLE_CREATED, result, "Created consumable");
        return result;
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/items/{id}")
    public ItemResponse updateItem(@PathVariable Long id, @RequestBody ItemRequest req, @AuthenticationPrincipal User me) {
        assertConsumablesEnabled(me);
        ItemResponse result = toItemResponse(service.updateItem(me, id, req));
        recordItem(me, ActivityAction.CONSUMABLE_UPDATED, result, "Updated consumable");
        return result;
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/items/{id}/adjust")
    public MovementResponse adjustStock(@PathVariable Long id, @RequestBody StockAdjustmentRequest req, @AuthenticationPrincipal User me) {
        assertConsumablesEnabled(me);
        MovementResponse result = toMovementResponse(service.adjustStock(me, id, req));
        if (activityLogs != null) {
            activityLogs.recordUser(me, ActivityModule.CONSUMABLES, ActivityAction.CONSUMABLE_STOCK_ADJUSTED,
                    "CONSUMABLE", result.consumableId(), result.itemName(), "Adjusted consumable stock", result.locationId(), null,
                    ActivityDetails.of("quantityDelta", result.quantityDelta(), "stockBefore", result.stockBefore(),
                            "stockAfter", result.stockAfter(), "movementType", result.movementType() == null ? null : result.movementType().name(),
                            "targetPath", "/consumables"));
        }
        return result;
    }

    @GetMapping("/categories")
    public List<CategoryResponse> categories(@AuthenticationPrincipal User me) {
        return service.listCategories(enabledCompanyId(me)).stream().map(ConsumableController::toCategoryResponse).toList();
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/categories")
    public CategoryResponse createCategory(@RequestBody CategoryRequest req, @AuthenticationPrincipal User me) {
        assertConsumablesEnabled(me);
        CategoryResponse result = toCategoryResponse(service.saveCategory(me, null, req));
        recordCategory(me, ActivityAction.CONSUMABLE_CATEGORY_CREATED, result, "Created consumable category");
        return result;
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/categories/{id}")
    public CategoryResponse updateCategory(@PathVariable Long id, @RequestBody CategoryRequest req, @AuthenticationPrincipal User me) {
        assertConsumablesEnabled(me);
        CategoryResponse result = toCategoryResponse(service.saveCategory(me, id, req));
        recordCategory(me, ActivityAction.CONSUMABLE_CATEGORY_UPDATED, result, "Updated consumable category");
        return result;
    }

    @GetMapping("/movements")
    public List<MovementResponse> movements(
            @RequestParam(required = false) Long locationId,
            @AuthenticationPrincipal User me
    ) {
        return service.listMovements(enabledCompanyId(me), locationId).stream().map(ConsumableController::toMovementResponse).toList();
    }

    @GetMapping("/service-types/{typeId}/defaults")
    public List<ServiceTypeConsumableResponse> serviceTypeDefaults(@PathVariable Long typeId, @AuthenticationPrincipal User me) {
        return service.listServiceTypeDefaults(enabledCompanyId(me), typeId).stream().map(ConsumableController::toServiceTypeResponse).toList();
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/service-types/{typeId}/defaults")
    public List<ServiceTypeConsumableResponse> replaceServiceTypeDefaults(
            @PathVariable Long typeId,
            @RequestBody List<ServiceTypeConsumableRequest> req,
            @AuthenticationPrincipal User me
    ) {
        assertConsumablesEnabled(me);
        List<ServiceTypeConsumableResponse> result = service.replaceServiceTypeDefaults(me, typeId, req).stream().map(ConsumableController::toServiceTypeResponse).toList();
        if (activityLogs != null) {
            activityLogs.recordUser(me, ActivityModule.CONSUMABLES, ActivityAction.SERVICE_CONSUMABLE_DEFAULTS_UPDATED,
                    "SERVICE", typeId, "Service #" + typeId, "Updated service consumable defaults", null, null,
                    ActivityDetails.of("consumableCount", result.size(), "targetPath", "/consumables"));
        }
        return result;
    }

    @GetMapping("/bookings/{bookingId}/session-consumables")
    public List<SessionConsumableResponse> sessionConsumables(@PathVariable Long bookingId, @AuthenticationPrincipal User me) {
        assertConsumablesEnabled(me);
        return service.listSessionConsumables(me, bookingId).stream().map(ConsumableController::toSessionConsumableResponse).toList();
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/bookings/{bookingId}/session-consumables")
    public List<SessionConsumableResponse> replaceSessionConsumables(
            @PathVariable Long bookingId,
            @RequestBody List<SessionConsumableRequest> req,
            @AuthenticationPrincipal User me
    ) {
        assertConsumablesEnabled(me);
        List<SessionConsumableResponse> result = service.replaceSessionConsumables(me, bookingId, req).stream().map(ConsumableController::toSessionConsumableResponse).toList();
        openBillSyncService.syncSessionGroup(me.getCompany().getId(), service.bookingGroupKey(me, bookingId));
        recordSessionConsumables(me, bookingId, result, "Updated session consumables");
        return result;
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/bookings/{bookingId}/session-consumables/reset-defaults")
    public List<SessionConsumableResponse> resetSessionConsumables(@PathVariable Long bookingId, @AuthenticationPrincipal User me) {
        assertConsumablesEnabled(me);
        List<SessionConsumableResponse> result = service.resetSessionDefaults(me, bookingId).stream().map(ConsumableController::toSessionConsumableResponse).toList();
        openBillSyncService.syncSessionGroup(me.getCompany().getId(), service.bookingGroupKey(me, bookingId));
        recordSessionConsumables(me, bookingId, result, "Reset session consumables to defaults");
        return result;
    }

    @GetMapping("/suppliers")
    public List<SupplierResponse> suppliers(@AuthenticationPrincipal User me) {
        return service.listSuppliers(enabledCompanyId(me)).stream().map(ConsumableController::toSupplierResponse).toList();
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/suppliers")
    public SupplierResponse createSupplier(@RequestBody SupplierRequest req, @AuthenticationPrincipal User me) {
        assertConsumablesEnabled(me);
        SupplierResponse result = toSupplierResponse(service.saveSupplier(me, null, req));
        recordSupplier(me, ActivityAction.CONSUMABLE_SUPPLIER_CREATED, result, "Created consumable supplier");
        return result;
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/suppliers/{id}")
    public SupplierResponse updateSupplier(@PathVariable Long id, @RequestBody SupplierRequest req, @AuthenticationPrincipal User me) {
        assertConsumablesEnabled(me);
        SupplierResponse result = toSupplierResponse(service.saveSupplier(me, id, req));
        recordSupplier(me, ActivityAction.CONSUMABLE_SUPPLIER_UPDATED, result, "Updated consumable supplier");
        return result;
    }

    @GetMapping("/purchase-orders")
    public List<PurchaseOrderResponse> purchaseOrders(
            @RequestParam(required = false) Long locationId,
            @AuthenticationPrincipal User me
    ) {
        return service.listPurchaseOrders(enabledCompanyId(me), locationId).stream().map(ConsumableController::toPurchaseOrderResponse).toList();
    }

    @GetMapping("/purchase-orders/{id}")
    public PurchaseOrderDetailResponse purchaseOrder(@PathVariable Long id, @AuthenticationPrincipal User me) {
        Long companyId = enabledCompanyId(me);
        return toPurchaseOrderDetailResponse(
                service.getPurchaseOrder(companyId, id),
                service.listPurchaseOrderLines(companyId, id),
                service.listPurchaseOrderReceipts(companyId, id)
        );
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/purchase-orders")
    public PurchaseOrderResponse createPurchaseOrder(@RequestBody PurchaseOrderRequest req, @AuthenticationPrincipal User me) {
        assertConsumablesEnabled(me);
        PurchaseOrderResponse result = toPurchaseOrderResponse(service.savePurchaseOrder(me, null, req));
        recordPurchaseOrder(me, ActivityAction.PURCHASE_ORDER_CREATED, result, "Created purchase order");
        return result;
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/purchase-orders/{id}")
    public PurchaseOrderResponse updatePurchaseOrder(@PathVariable Long id, @RequestBody PurchaseOrderRequest req, @AuthenticationPrincipal User me) {
        assertConsumablesEnabled(me);
        PurchaseOrderResponse result = toPurchaseOrderResponse(service.savePurchaseOrder(me, id, req));
        recordPurchaseOrder(me, ActivityAction.PURCHASE_ORDER_UPDATED, result, "Updated purchase order");
        return result;
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/purchase-orders/{id}/receive")
    public PurchaseOrderDetailResponse receivePurchaseOrder(
            @PathVariable Long id,
            @RequestBody PurchaseOrderReceiveRequest req,
            @AuthenticationPrincipal User me
    ) {
        assertConsumablesEnabled(me);
        ConsumablePurchaseOrder order = service.receivePurchaseOrder(me, id, req);
        PurchaseOrderResponse summary = toPurchaseOrderResponse(order);
        recordPurchaseOrder(me, ActivityAction.PURCHASE_ORDER_UPDATED, summary, "Received purchase order goods");
        Long companyId = me.getCompany().getId();
        return toPurchaseOrderDetailResponse(
                service.getPurchaseOrder(companyId, id),
                service.listPurchaseOrderLines(companyId, id),
                service.listPurchaseOrderReceipts(companyId, id)
        );
    }

    @GetMapping("/inventory-sessions")
    public List<InventorySessionResponse> inventorySessions(
            @RequestParam(required = false) Long locationId,
            @AuthenticationPrincipal User me
    ) {
        Long companyId = enabledCompanyId(me);
        List<ConsumableInventorySession> sessions = inventoryService.listSessions(companyId, locationId);
        List<ConsumableInventoryLine> allLines = inventoryService.getLinesForSessions(
                companyId, sessions.stream().map(ConsumableInventorySession::getId).toList());
        java.util.Map<Long, List<ConsumableInventoryLine>> linesBySession = allLines.stream()
                .collect(java.util.stream.Collectors.groupingBy(line -> line.getInventorySession().getId()));
        return sessions.stream()
                .map(session -> toInventorySessionResponse(session, linesBySession.getOrDefault(session.getId(), List.of())))
                .toList();
    }

    @GetMapping("/inventory-sessions/{id}")
    public InventoryDetailResponse inventorySession(@PathVariable Long id, @AuthenticationPrincipal User me) {
        Long companyId = enabledCompanyId(me);
        return toInventoryDetailResponse(companyId, inventoryService.getSession(companyId, id));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/inventory-sessions")
    public InventoryDetailResponse startInventory(@RequestBody InventoryStartRequest req, @AuthenticationPrincipal User me) {
        assertConsumablesEnabled(me);
        ConsumableInventorySession session = inventoryService.start(me, req);
        InventoryDetailResponse result = toInventoryDetailResponse(me.getCompany().getId(), session);
        recordInventory(me, ActivityAction.INVENTORY_SESSION_CREATED, result.session(), "Started inventory session");
        return result;
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/inventory-sessions/{id}/counts")
    public InventoryDetailResponse saveInventoryCounts(
            @PathVariable Long id,
            @RequestBody InventoryCountRequest req,
            @AuthenticationPrincipal User me
    ) {
        assertConsumablesEnabled(me);
        ConsumableInventorySession session = inventoryService.saveCounts(me, id, req);
        InventoryDetailResponse result = toInventoryDetailResponse(me.getCompany().getId(), session);
        recordInventory(me, ActivityAction.INVENTORY_SESSION_UPDATED, result.session(), "Saved inventory counts");
        return result;
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/inventory-sessions/{id}/finalize")
    public InventoryDetailResponse finalizeInventory(@PathVariable Long id, @AuthenticationPrincipal User me) {
        assertConsumablesEnabled(me);
        ConsumableInventorySession session = inventoryService.finalizeInventory(me, id);
        InventoryDetailResponse result = toInventoryDetailResponse(me.getCompany().getId(), session);
        recordInventory(me, ActivityAction.INVENTORY_SESSION_COMPLETED, result.session(), "Completed inventory session");
        return result;
    }

    private InventoryDetailResponse toInventoryDetailResponse(Long companyId, ConsumableInventorySession session) {
        List<ConsumableInventoryLine> inventoryLines = inventoryService.getLines(companyId, session.getId());
        return new InventoryDetailResponse(
                toInventorySessionResponse(session, inventoryLines),
                inventoryLines.stream().map(ConsumableController::toInventoryLineResponse).toList(),
                inventoryService.getMovements(companyId, session.getId()).stream()
                        .map(ConsumableController::toMovementResponse).toList()
        );
    }

    private static InventorySessionResponse toInventorySessionResponse(
            ConsumableInventorySession session,
            List<ConsumableInventoryLine> inventoryLines
    ) {
        List<ConsumableInventoryLine> safeLines = inventoryLines == null ? List.of() : inventoryLines;
        int total = safeLines.size();
        int counted = (int) safeLines.stream().filter(line -> line.getCountedQuantity() != null).count();
        int discrepancies = (int) safeLines.stream()
                .map(ConsumableInventoryService::discrepancy)
                .filter(java.util.Objects::nonNull)
                .filter(delta -> delta.compareTo(BigDecimal.ZERO) != 0)
                .count();
        int progress = total == 0 ? 0 : Math.min(100, (int) Math.round((counted * 100.0) / total));
        return new InventorySessionResponse(
                session.getId(),
                session.getLocation().getId(),
                session.getLocation().getName(),
                session.getStatus().name(),
                session.getStartedAt(),
                session.getCompletedAt(),
                userName(session.getStartedBy()),
                userName(session.getCompletedBy()),
                session.getNotes(),
                total, counted, discrepancies, progress
        );
    }

    private static InventoryLineResponse toInventoryLineResponse(ConsumableInventoryLine line) {
        BigDecimal discrepancy = ConsumableInventoryService.discrepancy(line);
        BigDecimal discrepancyValue = discrepancy == null
                ? null
                : discrepancy.multiply(line.getCostPriceSnapshot() == null ? BigDecimal.ZERO : line.getCostPriceSnapshot())
                        .setScale(4, java.math.RoundingMode.HALF_UP);
        return new InventoryLineResponse(
                line.getId(), line.getConsumable().getId(), line.getItemNameSnapshot(), line.getCategoryNameSnapshot(),
                line.getUnitSnapshot(), line.getSystemQuantity(), line.getCountedQuantity(), discrepancy, line.getCostPriceSnapshot(), discrepancyValue,
                line.getNotes(), line.getCountedAt(), userName(line.getCountedBy())
        );
    }

    private void recordInventory(User me, ActivityAction action, InventorySessionResponse row, String summary) {
        if (activityLogs == null || row == null) return;
        activityLogs.recordUser(me, ActivityModule.CONSUMABLES, action,
                "CONSUMABLE_INVENTORY", row.id(), "Inventura #" + row.id(), summary, row.locationId(), null,
                ActivityDetails.of("status", row.status(), "countedItems", row.countedItems(),
                        "totalItems", row.totalItems(), "discrepancyItems", row.discrepancyItems(), "targetPath", "/consumables"));
    }

    private static String userName(User user) {
        if (user == null) return null;
        String first = user.getFirstName() == null ? "" : user.getFirstName().trim();
        String last = user.getLastName() == null ? "" : user.getLastName().trim();
        String name = (first + " " + last).trim();
        return name.isBlank() ? null : name;
    }

    private void recordItem(User me, ActivityAction action, ItemResponse row, String summary) {
        if (activityLogs == null || row == null) return;
        activityLogs.recordUser(me, ActivityModule.CONSUMABLES, action,
                "CONSUMABLE", row.id(), row.name(), summary, row.locationId(), null,
                ActivityDetails.of("sku", row.sku(), "currentStock", row.currentStock(), "minimumStock", row.minimumStock(),
                        "trackStock", row.trackStock(), "billable", row.billable(), "active", row.active(), "targetPath", "/consumables"));
    }

    private void recordCategory(User me, ActivityAction action, CategoryResponse row, String summary) {
        if (activityLogs == null || row == null) return;
        activityLogs.recordUser(me, ActivityModule.CONSUMABLES, action,
                "CONSUMABLE_CATEGORY", row.id(), row.name(), summary, null, null,
                ActivityDetails.of("active", row.active(), "targetPath", "/consumables"));
    }

    private void recordSupplier(User me, ActivityAction action, SupplierResponse row, String summary) {
        if (activityLogs == null || row == null) return;
        activityLogs.recordUser(me, ActivityModule.CONSUMABLES, action,
                "CONSUMABLE_SUPPLIER", row.id(), row.name(), summary, null, null,
                ActivityDetails.of("status", row.status() == null ? null : row.status().name(), "targetPath", "/consumables"));
    }

    private void recordPurchaseOrder(User me, ActivityAction action, PurchaseOrderResponse row, String summary) {
        if (activityLogs == null || row == null) return;
        activityLogs.recordUser(me, ActivityModule.CONSUMABLES, action,
                "PURCHASE_ORDER", row.id(), row.orderNumber(), summary, row.locationId(), null,
                ActivityDetails.of("supplier", row.supplierName(), "status", row.status() == null ? null : row.status().name(),
                        "totalAmount", row.totalAmount(), "receivedAmount", row.receivedAmount(), "targetPath", "/consumables"));
    }

    private void recordSessionConsumables(User me, Long bookingId, List<SessionConsumableResponse> rows, String summary) {
        if (activityLogs == null) return;
        activityLogs.recordUser(me, ActivityModule.CONSUMABLES, ActivityAction.SESSION_CONSUMABLES_UPDATED,
                "SESSION_BOOKING", bookingId, "Booking #" + bookingId, summary, null, null,
                ActivityDetails.of("consumableCount", rows == null ? 0 : rows.size(), "targetPath", "/calendar"));
    }

    public static CategoryResponse toCategoryResponse(ConsumableCategory c) {
        if (c == null) return null;
        return new CategoryResponse(c.getId(), c.getName(), c.getColor(), c.isActive());
    }

    public static ItemResponse toItemResponse(ConsumableService.ItemStockView view) {
        if (view == null || view.item() == null || view.location() == null) return null;
        Consumable c = view.item();
        boolean low = c.isTrackStock() && view.currentStock() != null && view.minimumStock() != null
                && view.currentStock().compareTo(view.minimumStock()) < 0;
        return new ItemResponse(
                c.getId(), c.getName(), c.getDescription(), toCategoryResponse(c.getCategory()), c.getSku(), c.getBarcode(), c.getUnit(),
                view.location().getId(), view.location().getName(), view.currentStock(), view.minimumStock(), view.costPrice(),
                c.getSalePrice(), c.getVatRateId(), c.getVatRate(), c.isTrackStock(), c.isBillable(), c.isActive(), low
        );
    }

    public static MovementResponse toMovementResponse(ConsumableStockMovement m) {
        if (m == null) return null;
        String userName = m.getCreatedBy() != null ? (String.valueOf(m.getCreatedBy().getFirstName()) + " " + String.valueOf(m.getCreatedBy().getLastName())).trim() : null;
        return new MovementResponse(
                m.getId(),
                m.getConsumable().getId(),
                m.getConsumable().getName(),
                m.getConsumable().getCategory() != null ? m.getConsumable().getCategory().getName() : null,
                m.getLocation() != null ? m.getLocation().getId() : null,
                m.getLocation() != null ? m.getLocation().getName() : null,
                m.getMovementType(),
                m.getSourceType() != null ? m.getSourceType().name() : null,
                m.getSourceId(),
                m.getQuantityDelta(),
                m.getStockBefore(),
                m.getStockAfter(),
                m.getValueDelta(),
                m.getConsumable().getUnit(),
                m.getNote(),
                userName == null || userName.isBlank() ? null : userName,
                m.getCreatedAt()
        );
    }

    public static ServiceTypeConsumableResponse toServiceTypeResponse(ServiceTypeConsumable link) {
        return new ServiceTypeConsumableResponse(
                link.getId(),
                link.getConsumable().getId(),
                link.getConsumable().getName(),
                link.getConsumable().getUnit(),
                link.getDefaultQuantity(),
                link.getQuantityMode(),
                link.getBillableOverride(),
                link.getNotes()
        );
    }

    public static SessionConsumableResponse toSessionConsumableResponse(SessionConsumable sc) {
        return new SessionConsumableResponse(
                sc.getId(), sc.getConsumable().getId(), sc.getItemNameSnapshot(), sc.getUnit(), sc.getQuantity(), sc.getQuantityMode(),
                sc.getCostPriceSnapshot(), sc.getSalePriceSnapshot(), sc.getVatRateSnapshot(), sc.isBillable(), sc.getSource(), sc.isManuallyChanged(), sc.getNotes()
        );
    }

    public static SupplierResponse toSupplierResponse(ConsumableSupplier s) {
        return new SupplierResponse(
                s.getId(), s.getName(), s.getContactName(), s.getPhone(), s.getEmail(), s.getCategories(), s.getPaymentTermsDays(),
                s.getReliabilityPercent(), s.getOutstandingAmount(), s.getStatus()
        );
    }

    public static PurchaseOrderLineResponse toPurchaseOrderLineResponse(ConsumablePurchaseOrderLine line) {
        BigDecimal ordered = line.getOrderedQuantity() == null ? BigDecimal.ZERO : line.getOrderedQuantity();
        BigDecimal received = line.getReceivedQuantity() == null ? BigDecimal.ZERO : line.getReceivedQuantity();
        BigDecimal unitPrice = line.getUnitPrice() == null ? BigDecimal.ZERO : line.getUnitPrice();
        TaxRate vatRate = line.getVatRate() == null ? TaxRate.NO_VAT : line.getVatRate();
        BigDecimal net = ordered.multiply(unitPrice).setScale(4, java.math.RoundingMode.HALF_UP);
        BigDecimal vat = net.multiply(vatRate.multiplier).setScale(4, java.math.RoundingMode.HALF_UP);
        return new PurchaseOrderLineResponse(
                line.getId(), line.getConsumable().getId(), line.getItemNameSnapshot(), line.getConsumable().getSku(),
                line.getUnitSnapshot(), ordered, received, ordered.subtract(received).max(BigDecimal.ZERO), unitPrice, vatRate,
                net, vat, net.add(vat).setScale(4, java.math.RoundingMode.HALF_UP)
        );
    }

    private PurchaseOrderDetailResponse toPurchaseOrderDetailResponse(
            ConsumablePurchaseOrder po,
            List<ConsumablePurchaseOrderLine> lines,
            List<ConsumablePurchaseOrderReceipt> receipts
    ) {
        Long companyId = po.getCompany().getId();
        List<PurchaseOrderReceiptResponse> receiptResponses = receipts.stream().map(receipt -> new PurchaseOrderReceiptResponse(
                receipt.getId(), receipt.getIdempotencyKey(), receipt.getReceivedAt(), receipt.getNote(),
                receipt.getCreatedBy() != null ? (receipt.getCreatedBy().getFirstName() + " " + receipt.getCreatedBy().getLastName()).trim() : null,
                service.listPurchaseOrderReceiptLines(companyId, receipt.getId()).stream().map(receiptLine -> new PurchaseOrderReceiptLineResponse(
                        receiptLine.getPurchaseOrderLine().getId(),
                        receiptLine.getPurchaseOrderLine().getConsumable().getId(),
                        receiptLine.getPurchaseOrderLine().getItemNameSnapshot(),
                        receiptLine.getPurchaseOrderLine().getUnitSnapshot(),
                        receiptLine.getQuantity()
                )).toList()
        )).toList();
        return new PurchaseOrderDetailResponse(
                toPurchaseOrderResponse(po),
                lines.stream().map(ConsumableController::toPurchaseOrderLineResponse).toList(),
                receiptResponses
        );
    }

    public static PurchaseOrderResponse toPurchaseOrderResponse(ConsumablePurchaseOrder po) {
        return new PurchaseOrderResponse(
                po.getId(), po.getOrderNumber(), po.getSupplier() != null ? po.getSupplier().getId() : null,
                po.getSupplier() != null ? po.getSupplier().getName() : null,
                po.getLocation() != null ? po.getLocation().getId() : null,
                po.getLocation() != null ? po.getLocation().getName() : null,
                po.getStatus(), po.getOrderDate(), po.getExpectedDate(), po.getTotalAmount(), po.getReceivedAmount(), po.getNotes()
        );
    }
}
