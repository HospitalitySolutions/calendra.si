package com.example.app.consumables;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.app.company.Company;
import com.example.app.location.Location;
import com.example.app.location.LocationRepository;
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
class ConsumableTransferServiceTest {
    @Mock private ConsumableRepository consumables;
    @Mock private LocationRepository locations;
    @Mock private ConsumableLocationStockRepository locationStocks;
    @Mock private ConsumableStockMovementRepository movements;
    @Mock private ConsumableStockTransferRepository transfers;
    @Mock private ConsumableLowStockAlertService lowStockAlerts;

    private ConsumableTransferService service;
    private Company company;
    private User me;
    private Consumable item;
    private Location maribor;
    private Location ljubljana;
    private ConsumableLocationStock mariborStock;
    private ConsumableLocationStock ljubljanaStock;

    @BeforeEach
    void setUp() {
        service = new ConsumableTransferService(consumables, locations, locationStocks, movements, transfers, lowStockAlerts);
        company = new Company(); company.setId(1L);
        me = new User(); me.setId(10L); me.setCompany(company); me.setFirstName("Test"); me.setLastName("Admin");
        item = new Consumable(); item.setId(5L); item.setCompany(company); item.setName("Masažno olje"); item.setUnit("ml"); item.setTrackStock(true);
        maribor = location(2L, "Maribor");
        ljubljana = location(3L, "Ljubljana");
        mariborStock = stock(maribor, "10", "4.00");
        ljubljanaStock = stock(ljubljana, "5", "2.00");
    }

    @Test
    void transferMovesStockAtomicallyAndCarriesSourceCostToDestination() {
        stubTransferLookup("transfer-1");
        when(locationStocks.findByCompanyIdAndConsumableIdAndLocationId(1L, 5L, 2L)).thenReturn(Optional.of(mariborStock));
        when(locationStocks.findByCompanyIdAndConsumableIdAndLocationId(1L, 5L, 3L)).thenReturn(Optional.of(ljubljanaStock));
        when(locationStocks.findForUpdate(1L, 5L, 2L)).thenReturn(Optional.of(mariborStock));
        when(locationStocks.findForUpdate(1L, 5L, 3L)).thenReturn(Optional.of(ljubljanaStock));
        when(transfers.saveAndFlush(any())).thenAnswer(invocation -> { ConsumableStockTransfer transfer = invocation.getArgument(0); transfer.setId(40L); return transfer; });

        ConsumableStockTransfer transfer = service.transfer(me, new ConsumableController.StockTransferRequest(
                "transfer-1", 5L, 2L, 3L, new BigDecimal("4"), "Za izmeno"
        ));

        assertEquals(40L, transfer.getId());
        assertEquals(new BigDecimal("6.0000"), mariborStock.getCurrentStock());
        assertEquals(new BigDecimal("9.0000"), ljubljanaStock.getCurrentStock());
        // (5 * 2 + 4 * 4) / 9 = 2.8889
        assertEquals(new BigDecimal("2.8889"), ljubljanaStock.getCostPrice());
        assertEquals(new BigDecimal("4.0000"), transfer.getUnitCostSnapshot());
        assertEquals(new BigDecimal("16.0000"), transfer.getValueAmount());
        verify(movements, times(2)).save(any(ConsumableStockMovement.class));
    }

    @Test
    void repeatedIdempotencyKeyReturnsExistingTransferWithoutStockMutation() {
        ConsumableStockTransfer existing = new ConsumableStockTransfer(); existing.setId(40L); existing.setCompany(company); existing.setConsumable(item);
        existing.setFromLocation(maribor); existing.setToLocation(ljubljana); existing.setQuantity(BigDecimal.ONE);
        existing.setItemNameSnapshot(item.getName()); existing.setUnitSnapshot(item.getUnit());
        when(transfers.findByCompanyIdAndIdempotencyKey(1L, "same-key")).thenReturn(Optional.of(existing));

        ConsumableStockTransfer result = service.transfer(me, new ConsumableController.StockTransferRequest(
                "same-key", 5L, 2L, 3L, BigDecimal.ONE, null
        ));

        assertEquals(40L, result.getId());
        verify(locationStocks, never()).save(any(ConsumableLocationStock.class));
        verify(movements, never()).save(any(ConsumableStockMovement.class));
    }

    @Test
    void transferRejectsInsufficientSourceStock() {
        stubTransferLookup("transfer-2");
        when(locationStocks.findByCompanyIdAndConsumableIdAndLocationId(1L, 5L, 2L)).thenReturn(Optional.of(mariborStock));
        when(locationStocks.findByCompanyIdAndConsumableIdAndLocationId(1L, 5L, 3L)).thenReturn(Optional.of(ljubljanaStock));
        when(locationStocks.findForUpdate(1L, 5L, 2L)).thenReturn(Optional.of(mariborStock));
        when(locationStocks.findForUpdate(1L, 5L, 3L)).thenReturn(Optional.of(ljubljanaStock));

        ResponseStatusException error = assertThrows(ResponseStatusException.class, () -> service.transfer(me,
                new ConsumableController.StockTransferRequest("transfer-2", 5L, 2L, 3L, new BigDecimal("11"), null)));

        assertEquals(HttpStatus.CONFLICT, error.getStatusCode());
        assertEquals(new BigDecimal("10"), mariborStock.getCurrentStock());
        verify(transfers, never()).saveAndFlush(any(ConsumableStockTransfer.class));
        verify(movements, never()).save(any(ConsumableStockMovement.class));
    }

    @Test
    void transferRejectsLocationOutsideTenant() {
        when(transfers.findByCompanyIdAndIdempotencyKey(1L, "transfer-3")).thenReturn(Optional.empty());
        when(consumables.findByIdAndCompanyId(5L, 1L)).thenReturn(Optional.of(item));
        when(locations.findByIdAndCompanyId(2L, 1L)).thenReturn(Optional.of(maribor));
        when(locations.findByIdAndCompanyId(99L, 1L)).thenReturn(Optional.empty());

        ResponseStatusException error = assertThrows(ResponseStatusException.class, () -> service.transfer(me,
                new ConsumableController.StockTransferRequest("transfer-3", 5L, 2L, 99L, BigDecimal.ONE, null)));

        assertEquals(HttpStatus.BAD_REQUEST, error.getStatusCode());
        assertEquals("Location not found.", error.getReason());
    }

    private void stubTransferLookup(String key) {
        when(transfers.findByCompanyIdAndIdempotencyKey(1L, key)).thenReturn(Optional.empty());
        when(consumables.findByIdAndCompanyId(5L, 1L)).thenReturn(Optional.of(item));
        when(locations.findByIdAndCompanyId(2L, 1L)).thenReturn(Optional.of(maribor));
        when(locations.findByIdAndCompanyId(3L, 1L)).thenReturn(Optional.of(ljubljana));
    }

    private Location location(Long id, String name) {
        Location location = new Location(); location.setId(id); location.setCompany(company); location.setName(name); return location;
    }

    private ConsumableLocationStock stock(Location location, String quantity, String cost) {
        ConsumableLocationStock stock = new ConsumableLocationStock(); stock.setCompany(company); stock.setConsumable(item); stock.setLocation(location);
        stock.setCurrentStock(new BigDecimal(quantity)); stock.setMinimumStock(BigDecimal.ZERO); stock.setCostPrice(new BigDecimal(cost)); return stock;
    }
}
