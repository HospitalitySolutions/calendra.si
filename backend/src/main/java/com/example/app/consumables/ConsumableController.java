package com.example.app.consumables;

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
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/consumables")
public class ConsumableController {
    private final ConsumableService service;
    private final GlobalConsumablesFeatureService consumablesFeatureService;

    public ConsumableController(ConsumableService service, GlobalConsumablesFeatureService consumablesFeatureService) {
        this.service = service;
        this.consumablesFeatureService = consumablesFeatureService;
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
            String location,
            BigDecimal currentStock,
            BigDecimal minimumStock,
            BigDecimal costPrice,
            BigDecimal salePrice,
            Long vatRateId,
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
            String location,
            BigDecimal currentStock,
            BigDecimal minimumStock,
            BigDecimal costPrice,
            BigDecimal salePrice,
            Long vatRateId,
            boolean trackStock,
            boolean billable,
            boolean active,
            boolean lowStock
    ) {}

    public record StockAdjustmentRequest(BigDecimal quantityDelta, StockMovementType movementType, String note) {}

    public record MovementResponse(
            Long id,
            Long consumableId,
            String itemName,
            String categoryName,
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

    public record PurchaseOrderRequest(
            String orderNumber,
            Long supplierId,
            PurchaseOrderStatus status,
            LocalDate orderDate,
            LocalDate expectedDate,
            BigDecimal totalAmount,
            BigDecimal receivedAmount,
            String notes
    ) {}

    public record PurchaseOrderResponse(
            Long id,
            String orderNumber,
            Long supplierId,
            String supplierName,
            PurchaseOrderStatus status,
            LocalDate orderDate,
            LocalDate expectedDate,
            BigDecimal totalAmount,
            BigDecimal receivedAmount,
            String notes
    ) {}

    private Long enabledCompanyId(User me) {
        consumablesFeatureService.assertEnabledForUser(me);
        return me.getCompany().getId();
    }

    private void assertConsumablesEnabled(User me) {
        consumablesFeatureService.assertEnabledForUser(me);
    }

    @GetMapping("/overview")
    public OverviewResponse overview(@AuthenticationPrincipal User me) {
        return service.overview(enabledCompanyId(me));
    }

    @GetMapping("/items")
    public List<ItemResponse> items(@AuthenticationPrincipal User me) {
        return service.listItems(enabledCompanyId(me)).stream().map(ConsumableController::toItemResponse).toList();
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/items")
    public ItemResponse createItem(@RequestBody ItemRequest req, @AuthenticationPrincipal User me) {
        assertConsumablesEnabled(me);
        return toItemResponse(service.createItem(me, req));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/items/{id}")
    public ItemResponse updateItem(@PathVariable Long id, @RequestBody ItemRequest req, @AuthenticationPrincipal User me) {
        assertConsumablesEnabled(me);
        return toItemResponse(service.updateItem(me, id, req));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/items/{id}/adjust")
    public MovementResponse adjustStock(@PathVariable Long id, @RequestBody StockAdjustmentRequest req, @AuthenticationPrincipal User me) {
        assertConsumablesEnabled(me);
        return toMovementResponse(service.adjustStock(me, id, req));
    }

    @GetMapping("/categories")
    public List<CategoryResponse> categories(@AuthenticationPrincipal User me) {
        return service.listCategories(enabledCompanyId(me)).stream().map(ConsumableController::toCategoryResponse).toList();
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/categories")
    public CategoryResponse createCategory(@RequestBody CategoryRequest req, @AuthenticationPrincipal User me) {
        assertConsumablesEnabled(me);
        return toCategoryResponse(service.saveCategory(me, null, req));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/categories/{id}")
    public CategoryResponse updateCategory(@PathVariable Long id, @RequestBody CategoryRequest req, @AuthenticationPrincipal User me) {
        assertConsumablesEnabled(me);
        return toCategoryResponse(service.saveCategory(me, id, req));
    }

    @GetMapping("/movements")
    public List<MovementResponse> movements(@AuthenticationPrincipal User me) {
        return service.listMovements(enabledCompanyId(me)).stream().map(ConsumableController::toMovementResponse).toList();
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
        return service.replaceServiceTypeDefaults(me, typeId, req).stream().map(ConsumableController::toServiceTypeResponse).toList();
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
        return service.replaceSessionConsumables(me, bookingId, req).stream().map(ConsumableController::toSessionConsumableResponse).toList();
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/bookings/{bookingId}/session-consumables/reset-defaults")
    public List<SessionConsumableResponse> resetSessionConsumables(@PathVariable Long bookingId, @AuthenticationPrincipal User me) {
        assertConsumablesEnabled(me);
        return service.resetSessionDefaults(me, bookingId).stream().map(ConsumableController::toSessionConsumableResponse).toList();
    }

    @GetMapping("/suppliers")
    public List<SupplierResponse> suppliers(@AuthenticationPrincipal User me) {
        return service.listSuppliers(enabledCompanyId(me)).stream().map(ConsumableController::toSupplierResponse).toList();
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/suppliers")
    public SupplierResponse createSupplier(@RequestBody SupplierRequest req, @AuthenticationPrincipal User me) {
        assertConsumablesEnabled(me);
        return toSupplierResponse(service.saveSupplier(me, null, req));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/suppliers/{id}")
    public SupplierResponse updateSupplier(@PathVariable Long id, @RequestBody SupplierRequest req, @AuthenticationPrincipal User me) {
        assertConsumablesEnabled(me);
        return toSupplierResponse(service.saveSupplier(me, id, req));
    }

    @GetMapping("/purchase-orders")
    public List<PurchaseOrderResponse> purchaseOrders(@AuthenticationPrincipal User me) {
        return service.listPurchaseOrders(enabledCompanyId(me)).stream().map(ConsumableController::toPurchaseOrderResponse).toList();
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/purchase-orders")
    public PurchaseOrderResponse createPurchaseOrder(@RequestBody PurchaseOrderRequest req, @AuthenticationPrincipal User me) {
        assertConsumablesEnabled(me);
        return toPurchaseOrderResponse(service.savePurchaseOrder(me, null, req));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/purchase-orders/{id}")
    public PurchaseOrderResponse updatePurchaseOrder(@PathVariable Long id, @RequestBody PurchaseOrderRequest req, @AuthenticationPrincipal User me) {
        assertConsumablesEnabled(me);
        return toPurchaseOrderResponse(service.savePurchaseOrder(me, id, req));
    }

    public static CategoryResponse toCategoryResponse(ConsumableCategory c) {
        if (c == null) return null;
        return new CategoryResponse(c.getId(), c.getName(), c.getColor(), c.isActive());
    }

    public static ItemResponse toItemResponse(Consumable c) {
        if (c == null) return null;
        boolean low = c.isTrackStock() && c.getCurrentStock() != null && c.getMinimumStock() != null && c.getCurrentStock().compareTo(c.getMinimumStock()) < 0;
        return new ItemResponse(
                c.getId(), c.getName(), c.getDescription(), toCategoryResponse(c.getCategory()), c.getSku(), c.getBarcode(), c.getUnit(), c.getLocation(),
                c.getCurrentStock(), c.getMinimumStock(), c.getCostPrice(), c.getSalePrice(), c.getVatRateId(), c.isTrackStock(), c.isBillable(), c.isActive(), low
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
                sc.getId(), sc.getConsumable().getId(), sc.getConsumable().getName(), sc.getUnit(), sc.getQuantity(), sc.getQuantityMode(),
                sc.getCostPriceSnapshot(), sc.getSalePriceSnapshot(), sc.isBillable(), sc.getSource(), sc.isManuallyChanged(), sc.getNotes()
        );
    }

    public static SupplierResponse toSupplierResponse(ConsumableSupplier s) {
        return new SupplierResponse(
                s.getId(), s.getName(), s.getContactName(), s.getPhone(), s.getEmail(), s.getCategories(), s.getPaymentTermsDays(),
                s.getReliabilityPercent(), s.getOutstandingAmount(), s.getStatus()
        );
    }

    public static PurchaseOrderResponse toPurchaseOrderResponse(ConsumablePurchaseOrder po) {
        return new PurchaseOrderResponse(
                po.getId(), po.getOrderNumber(), po.getSupplier() != null ? po.getSupplier().getId() : null,
                po.getSupplier() != null ? po.getSupplier().getName() : null,
                po.getStatus(), po.getOrderDate(), po.getExpectedDate(), po.getTotalAmount(), po.getReceivedAmount(), po.getNotes()
        );
    }
}
