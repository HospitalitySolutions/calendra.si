package com.example.app.consumables;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.app.billing.TaxRate;
import com.example.app.common.TimeService;
import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.consumables.ConsumableEnums.PurchaseOrderStatus;
import com.example.app.location.Location;
import com.example.app.location.LocationRepository;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.SessionTypeRepository;
import com.example.app.settings.GlobalConsumablesFeatureService;
import com.example.app.user.User;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ConsumablePurchaseOrderReceivingTest {
    @Mock private CompanyRepository companies;
    @Mock private LocationRepository locations;
    @Mock private ConsumableRepository consumables;
    @Mock private ConsumableLocationStockRepository locationStocks;
    @Mock private ConsumableCategoryRepository categories;
    @Mock private ConsumableStockMovementRepository movements;
    @Mock private ServiceTypeConsumableRepository serviceTypeConsumables;
    @Mock private SessionConsumableRepository sessionConsumables;
    @Mock private SessionTypeRepository sessionTypes;
    @Mock private SessionBookingRepository bookings;
    @Mock private ConsumableSupplierRepository suppliers;
    @Mock private ConsumablePurchaseOrderRepository purchaseOrders;
    @Mock private ConsumablePurchaseOrderLineRepository purchaseOrderLines;
    @Mock private ConsumablePurchaseOrderReceiptRepository purchaseOrderReceipts;
    @Mock private ConsumablePurchaseOrderReceiptLineRepository purchaseOrderReceiptLines;
    @Mock private TimeService timeService;
    @Mock private GlobalConsumablesFeatureService consumablesFeatureService;
    @Mock private ConsumableLowStockAlertService lowStockAlerts;

    private ConsumableService service;
    private Company company;
    private User me;
    private Location location;
    private ConsumablePurchaseOrder order;
    private ConsumablePurchaseOrderLine line;
    private ConsumableLocationStock stock;

    @BeforeEach
    void setUp() {
        service = new ConsumableService(
                companies, locations, consumables, locationStocks, categories, movements,
                serviceTypeConsumables, sessionConsumables, sessionTypes, bookings, suppliers,
                purchaseOrders, purchaseOrderLines, purchaseOrderReceipts, purchaseOrderReceiptLines,
                timeService, consumablesFeatureService, lowStockAlerts
        );
        company = new Company(); company.setId(1L);
        me = new User(); me.setId(9L); me.setCompany(company);
        location = new Location(); location.setId(3L); location.setCompany(company); location.setName("Maribor");
        Consumable item = new Consumable(); item.setId(5L); item.setCompany(company); item.setName("Olje"); item.setUnit("l"); item.setTrackStock(true);
        order = new ConsumablePurchaseOrder(); order.setId(11L); order.setCompany(company); order.setLocation(location); order.setOrderNumber("PO-11"); order.setStatus(PurchaseOrderStatus.ORDERED);
        line = new ConsumablePurchaseOrderLine(); line.setId(21L); line.setCompany(company); line.setPurchaseOrder(order); line.setConsumable(item); line.setItemNameSnapshot("Olje"); line.setUnitSnapshot("l"); line.setOrderedQuantity(new BigDecimal("10")); line.setReceivedQuantity(BigDecimal.ZERO); line.setUnitPrice(new BigDecimal("4.00")); line.setVatRate(TaxRate.VAT_22);
        stock = new ConsumableLocationStock(); stock.setCompany(company); stock.setConsumable(item); stock.setLocation(location); stock.setCurrentStock(new BigDecimal("10")); stock.setCostPrice(new BigDecimal("2.00")); stock.setMinimumStock(BigDecimal.ZERO);
    }

    @Test
    void partialReceiptUpdatesStockCostAndOrderStatus() {
        when(purchaseOrders.findForUpdate(11L, 1L)).thenReturn(Optional.of(order));
        when(purchaseOrderReceipts.findByCompanyIdAndPurchaseOrderIdAndIdempotencyKey(1L, 11L, "receipt-1")).thenReturn(Optional.empty());
        when(purchaseOrderLines.findForUpdate(1L, 11L)).thenReturn(List.of(line));
        when(purchaseOrderReceipts.saveAndFlush(any())).thenAnswer(invocation -> { ConsumablePurchaseOrderReceipt r = invocation.getArgument(0); r.setId(31L); return r; });
        when(locationStocks.findForUpdate(1L, 5L, 3L)).thenReturn(Optional.of(stock));
        when(purchaseOrderLines.findByCompanyIdAndPurchaseOrderId(1L, 11L)).thenReturn(List.of(line));
        when(purchaseOrders.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        service.receivePurchaseOrder(me, 11L, new ConsumableController.PurchaseOrderReceiveRequest(
                "receipt-1", "Dobavnica 1", List.of(new ConsumableController.PurchaseOrderReceiveLineRequest(21L, new BigDecimal("4")))
        ));

        assertEquals(new BigDecimal("4.0000"), line.getReceivedQuantity());
        assertEquals(new BigDecimal("14.0000"), stock.getCurrentStock());
        assertEquals(new BigDecimal("2.5714"), stock.getCostPrice());
        assertEquals(PurchaseOrderStatus.PARTIALLY_RECEIVED, order.getStatus());
        verify(movements).save(any(ConsumableStockMovement.class));
    }

    @Test
    void repeatedIdempotencyKeyDoesNotCreateAnotherMovement() {
        ConsumablePurchaseOrderReceipt existing = new ConsumablePurchaseOrderReceipt(); existing.setId(31L);
        when(purchaseOrders.findForUpdate(11L, 1L)).thenReturn(Optional.of(order));
        when(purchaseOrderReceipts.findByCompanyIdAndPurchaseOrderIdAndIdempotencyKey(1L, 11L, "same-key")).thenReturn(Optional.of(existing));

        service.receivePurchaseOrder(me, 11L, new ConsumableController.PurchaseOrderReceiveRequest(
                "same-key", null, List.of(new ConsumableController.PurchaseOrderReceiveLineRequest(21L, BigDecimal.ONE))
        ));

        verify(movements, never()).save(any(ConsumableStockMovement.class));
        verify(purchaseOrderReceiptLines, never()).save(any(ConsumablePurchaseOrderReceiptLine.class));
    }
}
