package com.example.app.consumables;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.app.common.TimeService;
import com.example.app.company.Company;
import com.example.app.consumables.ConsumableEnums.InventorySessionStatus;
import com.example.app.consumables.ConsumableEnums.StockMovementSourceType;
import com.example.app.consumables.ConsumableEnums.StockMovementType;
import com.example.app.location.Location;
import com.example.app.location.LocationRepository;
import com.example.app.user.User;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ConsumableInventoryServiceTest {
    @Mock private ConsumableInventorySessionRepository sessions;
    @Mock private ConsumableInventoryLineRepository lines;
    @Mock private LocationRepository locations;
    @Mock private ConsumableStockMovementRepository movements;
    @Mock private ConsumableService consumableService;
    @Mock private TimeService timeService;

    private ConsumableInventoryService service;
    private User actor;
    private Company company;
    private Location location;

    @BeforeEach
    void setUp() {
        service = new ConsumableInventoryService(sessions, lines, locations, movements, consumableService, timeService);
        company = new Company();
        company.setId(1L);
        actor = new User();
        actor.setId(7L);
        actor.setCompany(company);
        location = new Location();
        location.setId(5L);
        location.setCompany(company);
        location.setName("Maribor");
    }

    @Test
    void startSnapshotsTrackedStockWithoutChangingLiveQuantity() {
        Consumable item = item(11L, "Olje");
        ConsumableService.ItemStockView view = new ConsumableService.ItemStockView(
                item, location, new BigDecimal("12.5000"), new BigDecimal("3.0000"), new BigDecimal("4.2500"));
        when(locations.findByIdAndCompanyId(5L, 1L)).thenReturn(Optional.of(location));
        when(consumableService.listItems(1L, 5L)).thenReturn(List.of(view));
        when(timeService.instant(1L)).thenReturn(Instant.parse("2026-08-11T08:00:00Z"));
        when(sessions.saveAndFlush(any())).thenAnswer(invocation -> {
            ConsumableInventorySession session = invocation.getArgument(0);
            session.setId(31L);
            return session;
        });

        ConsumableInventorySession created = service.start(actor, new ConsumableController.InventoryStartRequest(5L, "Mesečna"));

        assertEquals(31L, created.getId());
        assertEquals(InventorySessionStatus.IN_PROGRESS, created.getStatus());
        verify(lines).save(org.mockito.ArgumentMatchers.argThat(line ->
                line.getConsumable() == item
                        && new BigDecimal("12.5000").compareTo(line.getSystemQuantity()) == 0
                        && new BigDecimal("4.2500").compareTo(line.getCostPriceSnapshot()) == 0
                        && line.getCountedQuantity() == null));
        verify(consumableService, never()).createMovement(any(), any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void finalizePostsOnlySnapshotDiscrepanciesAndSecondCallIsIdempotent() {
        ConsumableInventorySession session = new ConsumableInventorySession();
        session.setId(31L);
        session.setCompany(company);
        session.setLocation(location);
        session.setStatus(InventorySessionStatus.IN_PROGRESS);

        ConsumableInventoryLine shortage = line(session, item(11L, "Olje"), 41L, "10", "8");
        ConsumableInventoryLine match = line(session, item(12L, "Brisača"), 42L, "5", "5");
        when(sessions.findForUpdate(31L, 1L)).thenReturn(Optional.of(session));
        when(lines.findForSessionForUpdate(1L, 31L)).thenReturn(List.of(shortage, match));
        when(timeService.instant(1L)).thenReturn(Instant.parse("2026-08-11T09:00:00Z"));
        when(sessions.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        ConsumableInventorySession completed = service.finalizeInventory(actor, 31L);
        assertEquals(InventorySessionStatus.COMPLETED, completed.getStatus());
        verify(consumableService, times(1)).createMovement(
                eq(actor), eq(shortage.getConsumable()), eq(location), eq(StockMovementType.INVENTORY_COUNT),
                eq(StockMovementSourceType.INVENTORY_COUNT), eq(31L), eq(new BigDecimal("-2.0000")), any());

        ConsumableInventorySession second = service.finalizeInventory(actor, 31L);
        assertSame(completed, second);
        verify(consumableService, times(1)).createMovement(any(), any(), any(), any(), any(), any(), any(), any());
    }

    private Consumable item(Long id, String name) {
        Consumable item = new Consumable();
        item.setId(id);
        item.setCompany(company);
        item.setName(name);
        item.setUnit("kos");
        item.setTrackStock(true);
        item.setActive(true);
        return item;
    }

    private ConsumableInventoryLine line(ConsumableInventorySession session, Consumable item, Long id, String system, String counted) {
        ConsumableInventoryLine line = new ConsumableInventoryLine();
        line.setId(id);
        line.setCompany(company);
        line.setInventorySession(session);
        line.setConsumable(item);
        line.setItemNameSnapshot(item.getName());
        line.setUnitSnapshot(item.getUnit());
        line.setSystemQuantity(new BigDecimal(system));
        line.setCountedQuantity(new BigDecimal(counted));
        line.setCostPriceSnapshot(BigDecimal.ONE);
        return line;
    }
}
