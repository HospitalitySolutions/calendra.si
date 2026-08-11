package com.example.app.consumables;

import com.example.app.consumables.ConsumableEnums.StockMovementSourceType;
import com.example.app.consumables.ConsumableEnums.StockMovementType;
import com.example.app.location.Location;
import com.example.app.location.LocationRepository;
import com.example.app.user.User;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Objects;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ConsumableTransferService {
    private final ConsumableRepository consumables;
    private final LocationRepository locations;
    private final ConsumableLocationStockRepository locationStocks;
    private final ConsumableStockMovementRepository movements;
    private final ConsumableStockTransferRepository transfers;
    private final ConsumableLowStockAlertService lowStockAlerts;

    public ConsumableTransferService(
            ConsumableRepository consumables,
            LocationRepository locations,
            ConsumableLocationStockRepository locationStocks,
            ConsumableStockMovementRepository movements,
            ConsumableStockTransferRepository transfers,
            ConsumableLowStockAlertService lowStockAlerts
    ) {
        this.consumables = consumables;
        this.locations = locations;
        this.locationStocks = locationStocks;
        this.movements = movements;
        this.transfers = transfers;
        this.lowStockAlerts = lowStockAlerts;
    }

    @Transactional(readOnly = true)
    public List<ConsumableStockTransfer> list(Long companyId, Long locationId) {
        if (locationId != null) requireLocation(companyId, locationId);
        return transfers.findAllForCompany(companyId, locationId);
    }

    @Transactional
    public ConsumableStockTransfer transfer(User actor, ConsumableController.StockTransferRequest req) {
        if (actor == null || actor.getCompany() == null || actor.getCompany().getId() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        if (req == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Request is required.");
        Long companyId = actor.getCompany().getId();
        String idempotencyKey = trim(req.idempotencyKey());
        if (idempotencyKey == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Idempotency key is required.");
        }
        var existing = transfers.findByCompanyIdAndIdempotencyKey(companyId, idempotencyKey);
        if (existing.isPresent()) {
            ConsumableStockTransfer previous = existing.get();
            BigDecimal requestedQuantity = positive(req.quantity());
            boolean sameRequest = previous.getConsumable() != null
                    && Objects.equals(previous.getConsumable().getId(), req.consumableId())
                    && previous.getFromLocation() != null
                    && Objects.equals(previous.getFromLocation().getId(), req.fromLocationId())
                    && previous.getToLocation() != null
                    && Objects.equals(previous.getToLocation().getId(), req.toLocationId())
                    && nz(previous.getQuantity()).compareTo(requestedQuantity) == 0;
            if (!sameRequest) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Idempotency key was already used for a different stock transfer.");
            }
            return previous;
        }

        Consumable item = consumables.findByIdAndCompanyId(req.consumableId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Consumable not found."));
        if (!item.isTrackStock()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Stock transfers are only available for tracked consumables.");
        }
        Location fromLocation = requireLocation(companyId, req.fromLocationId());
        Location toLocation = requireLocation(companyId, req.toLocationId());
        if (Objects.equals(fromLocation.getId(), toLocation.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Source and destination locations must be different.");
        }
        BigDecimal quantity = positive(req.quantity());

        ensureStockRow(item, fromLocation);
        ensureStockRow(item, toLocation);

        // Lock both branches in stable location-id order to avoid deadlocks when two users
        // transfer the same SKU in opposite directions at the same time.
        Long firstLocationId = Math.min(fromLocation.getId(), toLocation.getId());
        Long secondLocationId = Math.max(fromLocation.getId(), toLocation.getId());
        ConsumableLocationStock first = lockStock(item, firstLocationId);
        ConsumableLocationStock second = lockStock(item, secondLocationId);
        ConsumableLocationStock source = Objects.equals(first.getLocation().getId(), fromLocation.getId()) ? first : second;
        ConsumableLocationStock destination = source == first ? second : first;

        BigDecimal sourceBefore = nz(source.getCurrentStock());
        if (sourceBefore.compareTo(quantity) < 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Not enough stock for " + item.getName() + " at " + fromLocation.getName() + ".");
        }
        BigDecimal destinationBefore = nz(destination.getCurrentStock());
        BigDecimal sourceCost = nz(source.getCostPrice());
        BigDecimal destinationCost = nz(destination.getCostPrice());
        BigDecimal sourceAfter = sourceBefore.subtract(quantity).setScale(4, RoundingMode.HALF_UP);
        BigDecimal destinationAfter = destinationBefore.add(quantity).setScale(4, RoundingMode.HALF_UP);
        BigDecimal destinationWeightedCost = destinationAfter.compareTo(BigDecimal.ZERO) == 0
                ? sourceCost
                : destinationBefore.multiply(destinationCost)
                        .add(quantity.multiply(sourceCost))
                        .divide(destinationAfter, 4, RoundingMode.HALF_UP);

        source.setCurrentStock(sourceAfter);
        destination.setCurrentStock(destinationAfter);
        destination.setCostPrice(destinationWeightedCost);
        locationStocks.save(source);
        locationStocks.save(destination);

        ConsumableStockTransfer transfer = new ConsumableStockTransfer();
        transfer.setCompany(actor.getCompany());
        transfer.setConsumable(item);
        transfer.setFromLocation(fromLocation);
        transfer.setToLocation(toLocation);
        transfer.setItemNameSnapshot(item.getName());
        transfer.setUnitSnapshot(item.getUnit() == null || item.getUnit().isBlank() ? "kos" : item.getUnit());
        transfer.setQuantity(quantity);
        transfer.setUnitCostSnapshot(sourceCost);
        transfer.setValueAmount(quantity.multiply(sourceCost).setScale(4, RoundingMode.HALF_UP));
        transfer.setIdempotencyKey(idempotencyKey);
        transfer.setNote(trim(req.note()));
        transfer.setCreatedBy(actor);
        transfer = transfers.saveAndFlush(transfer);

        String movementNote = "Prenos #" + transfer.getId() + ": " + fromLocation.getName() + " → " + toLocation.getName();
        if (transfer.getNote() != null) movementNote += " · " + transfer.getNote();
        saveMovement(actor, transfer, fromLocation, StockMovementType.TRANSFER_OUT,
                quantity.negate(), sourceBefore, sourceAfter, sourceCost, movementNote);
        saveMovement(actor, transfer, toLocation, StockMovementType.TRANSFER_IN,
                quantity, destinationBefore, destinationAfter, sourceCost, movementNote);
        lowStockAlerts.sync(source);
        lowStockAlerts.sync(destination);
        return transfer;
    }

    private void saveMovement(
            User actor,
            ConsumableStockTransfer transfer,
            Location location,
            StockMovementType type,
            BigDecimal delta,
            BigDecimal before,
            BigDecimal after,
            BigDecimal unitCost,
            String note
    ) {
        ConsumableStockMovement movement = new ConsumableStockMovement();
        movement.setCompany(transfer.getCompany());
        movement.setConsumable(transfer.getConsumable());
        movement.setLocation(location);
        movement.setMovementType(type);
        movement.setSourceType(StockMovementSourceType.TRANSFER);
        movement.setSourceId(transfer.getId());
        movement.setQuantityDelta(delta.setScale(4, RoundingMode.HALF_UP));
        movement.setStockBefore(before);
        movement.setStockAfter(after);
        movement.setUnitCostSnapshot(unitCost);
        movement.setValueDelta(delta.multiply(unitCost).setScale(4, RoundingMode.HALF_UP));
        movement.setNote(note);
        movement.setCreatedBy(actor);
        movements.save(movement);
    }

    private ConsumableLocationStock lockStock(Consumable item, Long locationId) {
        return locationStocks.findForUpdate(item.getCompany().getId(), item.getId(), locationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "Could not lock location stock."));
    }

    private void ensureStockRow(Consumable item, Location location) {
        Long companyId = item.getCompany().getId();
        if (locationStocks.findByCompanyIdAndConsumableIdAndLocationId(companyId, item.getId(), location.getId()).isPresent()) return;
        ConsumableLocationStock stock = new ConsumableLocationStock();
        stock.setCompany(item.getCompany());
        stock.setConsumable(item);
        stock.setLocation(location);
        stock.setCurrentStock(BigDecimal.ZERO.setScale(4));
        stock.setMinimumStock(BigDecimal.ZERO.setScale(4));
        stock.setCostPrice(BigDecimal.ZERO.setScale(4));
        locationStocks.saveAndFlush(stock);
    }

    private Location requireLocation(Long companyId, Long locationId) {
        if (locationId == null || locationId <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Location is required.");
        }
        return locations.findByIdAndCompanyId(locationId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Location not found."));
    }

    private static BigDecimal positive(BigDecimal value) {
        if (value == null || value.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Quantity must be positive.");
        }
        return value.setScale(4, RoundingMode.HALF_UP);
    }

    private static BigDecimal nz(BigDecimal value) {
        return value == null ? BigDecimal.ZERO.setScale(4) : value.setScale(4, RoundingMode.HALF_UP);
    }

    private static String trim(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
