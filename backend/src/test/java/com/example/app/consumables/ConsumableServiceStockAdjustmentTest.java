package com.example.app.consumables;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

import com.example.app.common.TimeService;
import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.consumables.ConsumableEnums.StockMovementType;
import com.example.app.location.Location;
import com.example.app.location.LocationRepository;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.SessionTypeRepository;
import com.example.app.settings.GlobalConsumablesFeatureService;
import com.example.app.user.User;
import java.math.BigDecimal;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class ConsumableServiceStockAdjustmentTest {

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
    private User me;
    private Company company;
    private Consumable item;
    private Location location;

    @BeforeEach
    void setUp() {
        service = new ConsumableService(
                companies,
                locations,
                consumables,
                locationStocks,
                categories,
                movements,
                serviceTypeConsumables,
                sessionConsumables,
                sessionTypes,
                bookings,
                suppliers,
                purchaseOrders,
                purchaseOrderLines,
                purchaseOrderReceipts,
                purchaseOrderReceiptLines,
                timeService,
                consumablesFeatureService,
                lowStockAlerts
        );

        company = new Company();
        company.setId(1L);
        me = new User();
        me.setCompany(company);

        item = new Consumable();
        item.setId(5L);
        item.setCompany(company);
        item.setName("Brisača");
        item.setUnit("kos");
        item.setTrackStock(true);

        location = new Location();
        location.setId(7L);
        location.setCompany(company);
        location.setName("Maribor");

        when(consumables.findByIdAndCompanyId(5L, 1L)).thenReturn(Optional.of(item));
    }

    @Test
    void adjustmentRejectsLocationFromAnotherTenant() {
        when(locations.findByIdAndCompanyId(7L, 1L)).thenReturn(Optional.empty());

        ResponseStatusException error = assertThrows(ResponseStatusException.class, () -> service.adjustStock(
                me,
                5L,
                new ConsumableController.StockAdjustmentRequest(7L, BigDecimal.ONE, StockMovementType.CORRECTION, "test")
        ));

        assertEquals(HttpStatus.BAD_REQUEST, error.getStatusCode());
        assertEquals("Location not found.", error.getReason());
    }

    @Test
    void receiptCannotDecreaseStock() {
        when(locations.findByIdAndCompanyId(7L, 1L)).thenReturn(Optional.of(location));

        ResponseStatusException error = assertThrows(ResponseStatusException.class, () -> service.adjustStock(
                me,
                5L,
                new ConsumableController.StockAdjustmentRequest(7L, new BigDecimal("-2"), StockMovementType.PURCHASE, "wrong direction")
        ));

        assertEquals(HttpStatus.BAD_REQUEST, error.getStatusCode());
        assertEquals("Receipts and returns must increase stock.", error.getReason());
    }

    @Test
    void wasteCannotIncreaseStock() {
        when(locations.findByIdAndCompanyId(7L, 1L)).thenReturn(Optional.of(location));

        ResponseStatusException error = assertThrows(ResponseStatusException.class, () -> service.adjustStock(
                me,
                5L,
                new ConsumableController.StockAdjustmentRequest(7L, new BigDecimal("2"), StockMovementType.WASTE, "wrong direction")
        ));

        assertEquals(HttpStatus.BAD_REQUEST, error.getStatusCode());
        assertEquals("Waste must decrease stock.", error.getReason());
    }

    @Test
    void sessionUsageCannotBeCreatedThroughManualAdjustmentEndpoint() {
        when(locations.findByIdAndCompanyId(7L, 1L)).thenReturn(Optional.of(location));

        ResponseStatusException error = assertThrows(ResponseStatusException.class, () -> service.adjustStock(
                me,
                5L,
                new ConsumableController.StockAdjustmentRequest(7L, new BigDecimal("-1"), StockMovementType.SESSION_USAGE, "manual misuse")
        ));

        assertEquals(HttpStatus.BAD_REQUEST, error.getStatusCode());
        assertEquals("This movement type cannot be created manually.", error.getReason());
    }
    @Test
    void transferMovementCannotBeCreatedThroughManualAdjustmentEndpoint() {
        when(locations.findByIdAndCompanyId(7L, 1L)).thenReturn(Optional.of(location));

        ResponseStatusException error = assertThrows(ResponseStatusException.class, () -> service.adjustStock(
                me,
                5L,
                new ConsumableController.StockAdjustmentRequest(7L, new BigDecimal("-1"), StockMovementType.TRANSFER_OUT, "manual misuse")
        ));

        assertEquals(HttpStatus.BAD_REQUEST, error.getStatusCode());
        assertEquals("This movement type cannot be created manually.", error.getReason());
    }

}
