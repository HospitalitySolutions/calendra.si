package com.example.app.consumables;

import com.example.app.common.TimeService;
import com.example.app.consumables.ConsumableEnums.InventorySessionStatus;
import com.example.app.consumables.ConsumableEnums.StockMovementSourceType;
import com.example.app.consumables.ConsumableEnums.StockMovementType;
import com.example.app.location.Location;
import com.example.app.location.LocationRepository;
import com.example.app.user.User;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ConsumableInventoryService {
    private final ConsumableInventorySessionRepository sessions;
    private final ConsumableInventoryLineRepository lines;
    private final LocationRepository locations;
    private final ConsumableStockMovementRepository movements;
    private final ConsumableService consumableService;
    private final TimeService timeService;

    public ConsumableInventoryService(
            ConsumableInventorySessionRepository sessions,
            ConsumableInventoryLineRepository lines,
            LocationRepository locations,
            ConsumableStockMovementRepository movements,
            ConsumableService consumableService,
            TimeService timeService
    ) {
        this.sessions = sessions;
        this.lines = lines;
        this.locations = locations;
        this.movements = movements;
        this.consumableService = consumableService;
        this.timeService = timeService;
    }

    @Transactional(readOnly = true)
    public List<ConsumableInventorySession> listSessions(Long companyId, Long locationId) {
        if (locationId != null) requireLocation(companyId, locationId);
        return sessions.findAllForCompany(companyId, locationId);
    }

    @Transactional(readOnly = true)
    public ConsumableInventorySession getSession(Long companyId, Long id) {
        return sessions.findDetail(id, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Inventory session not found."));
    }

    @Transactional(readOnly = true)
    public List<ConsumableInventoryLine> getLines(Long companyId, Long sessionId) {
        getSession(companyId, sessionId);
        return lines.findForSession(companyId, sessionId);
    }

    @Transactional(readOnly = true)
    public List<ConsumableInventoryLine> getLinesForSessions(Long companyId, java.util.Collection<Long> sessionIds) {
        if (sessionIds == null || sessionIds.isEmpty()) return List.of();
        return lines.findForSessions(companyId, sessionIds);
    }

    @Transactional(readOnly = true)
    public List<ConsumableStockMovement> getMovements(Long companyId, Long sessionId) {
        getSession(companyId, sessionId);
        return movements.findByCompanyIdAndSourceTypeAndSourceId(
                companyId, StockMovementSourceType.INVENTORY_COUNT, sessionId);
    }

    @Transactional
    public ConsumableInventorySession start(User actor, ConsumableController.InventoryStartRequest req) {
        if (actor == null || actor.getCompany() == null || actor.getCompany().getId() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        if (req == null || req.locationId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Inventory location is required.");
        }
        Long companyId = actor.getCompany().getId();
        Location location = requireLocation(companyId, req.locationId());
        if (sessions.existsByCompanyIdAndLocationIdAndStatus(companyId, location.getId(), InventorySessionStatus.IN_PROGRESS)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "An inventory session is already in progress for this location.");
        }

        List<ConsumableService.ItemStockView> stockViews = consumableService.listItems(companyId, location.getId()).stream()
                .filter(view -> view.item().isTrackStock())
                .filter(view -> view.item().isActive() || nz(view.currentStock()).compareTo(BigDecimal.ZERO) != 0)
                .toList();
        if (stockViews.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "There are no tracked consumables to count at this location.");
        }

        Instant now = timeService.instant(companyId);
        ConsumableInventorySession session = new ConsumableInventorySession();
        session.setCompany(actor.getCompany());
        session.setLocation(location);
        session.setStatus(InventorySessionStatus.IN_PROGRESS);
        session.setStartedAt(now);
        session.setStartedBy(actor);
        session.setNotes(blankToNull(req.notes()));
        try {
            session = sessions.saveAndFlush(session);
        } catch (DataIntegrityViolationException ex) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "An inventory session is already in progress for this location.", ex);
        }

        for (ConsumableService.ItemStockView view : stockViews) {
            Consumable item = view.item();
            ConsumableInventoryLine line = new ConsumableInventoryLine();
            line.setCompany(actor.getCompany());
            line.setInventorySession(session);
            line.setConsumable(item);
            line.setItemNameSnapshot(defaultString(item.getName(), "Porabni material"));
            line.setCategoryNameSnapshot(item.getCategory() == null ? null : blankToNull(item.getCategory().getName()));
            line.setUnitSnapshot(defaultString(item.getUnit(), "kos"));
            line.setSystemQuantity(scale4(view.currentStock()));
            line.setCostPriceSnapshot(scale4(view.costPrice()));
            lines.save(line);
        }
        return session;
    }

    @Transactional
    public ConsumableInventorySession saveCounts(User actor, Long sessionId, ConsumableController.InventoryCountRequest req) {
        Long companyId = requireCompanyId(actor);
        ConsumableInventorySession session = sessions.findForUpdate(sessionId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Inventory session not found."));
        if (session.getStatus() != InventorySessionStatus.IN_PROGRESS) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Completed inventory sessions cannot be edited.");
        }
        if (req == null || req.lines() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Inventory count lines are required.");
        }

        List<ConsumableInventoryLine> currentLines = lines.findForSessionForUpdate(companyId, sessionId);
        Map<Long, ConsumableInventoryLine> byId = new LinkedHashMap<>();
        currentLines.forEach(line -> byId.put(line.getId(), line));
        Instant now = timeService.instant(companyId);

        for (ConsumableController.InventoryCountLineRequest request : req.lines()) {
            if (request == null || request.lineId() == null) continue;
            ConsumableInventoryLine line = byId.get(request.lineId());
            if (line == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Inventory line does not belong to this session.");
            }
            if (request.countedQuantity() == null) {
                line.setCountedQuantity(null);
                line.setCountedAt(null);
                line.setCountedBy(null);
            } else {
                BigDecimal counted = scale4(request.countedQuantity());
                if (counted.compareTo(BigDecimal.ZERO) < 0) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Counted quantity cannot be negative.");
                }
                line.setCountedQuantity(counted);
                line.setCountedAt(now);
                line.setCountedBy(actor);
            }
            line.setNotes(blankToNull(request.notes()));
            lines.save(line);
        }
        return session;
    }

    @Transactional
    public ConsumableInventorySession finalizeInventory(User actor, Long sessionId) {
        Long companyId = requireCompanyId(actor);
        ConsumableInventorySession session = sessions.findForUpdate(sessionId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Inventory session not found."));
        if (session.getStatus() == InventorySessionStatus.COMPLETED) {
            return session;
        }

        List<ConsumableInventoryLine> inventoryLines = lines.findForSessionForUpdate(companyId, sessionId);
        if (inventoryLines.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Inventory session has no articles.");
        }
        long missing = inventoryLines.stream().filter(line -> line.getCountedQuantity() == null).count();
        if (missing > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Count all articles before finalizing the inventory.");
        }

        for (ConsumableInventoryLine line : inventoryLines) {
            BigDecimal discrepancy = discrepancy(line);
            if (discrepancy.compareTo(BigDecimal.ZERO) == 0) continue;
            String note = "Inventura #" + session.getId()
                    + " · sistemska " + scale4(line.getSystemQuantity()).stripTrailingZeros().toPlainString()
                    + " · prešteta " + scale4(line.getCountedQuantity()).stripTrailingZeros().toPlainString()
                    + (blankToNull(line.getNotes()) == null ? "" : " · " + line.getNotes().trim());
            consumableService.createMovement(
                    actor,
                    line.getConsumable(),
                    session.getLocation(),
                    StockMovementType.INVENTORY_COUNT,
                    StockMovementSourceType.INVENTORY_COUNT,
                    session.getId(),
                    discrepancy,
                    note
            );
        }

        session.setStatus(InventorySessionStatus.COMPLETED);
        session.setCompletedAt(timeService.instant(companyId));
        session.setCompletedBy(actor);
        return sessions.save(session);
    }

    public static BigDecimal discrepancy(ConsumableInventoryLine line) {
        if (line == null || line.getCountedQuantity() == null) return null;
        return scale4(line.getCountedQuantity()).subtract(scale4(line.getSystemQuantity())).setScale(4, RoundingMode.HALF_UP);
    }

    private Long requireCompanyId(User actor) {
        if (actor == null || actor.getCompany() == null || actor.getCompany().getId() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        return actor.getCompany().getId();
    }

    private Location requireLocation(Long companyId, Long locationId) {
        return locations.findByIdAndCompanyId(locationId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Inventory location not found."));
    }

    private static BigDecimal scale4(BigDecimal value) {
        return nz(value).setScale(4, RoundingMode.HALF_UP);
    }

    private static BigDecimal nz(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String defaultString(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }
}
