package com.example.app.consumables;

import com.example.app.common.TimeService;
import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.consumables.ConsumableEnums.PurchaseOrderStatus;
import com.example.app.consumables.ConsumableEnums.QuantityMode;
import com.example.app.consumables.ConsumableEnums.StockMovementSourceType;
import com.example.app.consumables.ConsumableEnums.StockMovementType;
import com.example.app.consumables.ConsumableEnums.SupplierStatus;
import com.example.app.location.Location;
import com.example.app.location.LocationRepository;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.SessionBookingStatus;
import com.example.app.session.SessionType;
import com.example.app.session.SessionTypeRepository;
import com.example.app.user.User;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ConsumableService {
    private final CompanyRepository companies;
    private final LocationRepository locations;
    private final ConsumableRepository consumables;
    private final ConsumableLocationStockRepository locationStocks;
    private final ConsumableCategoryRepository categories;
    private final ConsumableStockMovementRepository movements;
    private final ServiceTypeConsumableRepository serviceTypeConsumables;
    private final SessionConsumableRepository sessionConsumables;
    private final SessionTypeRepository sessionTypes;
    private final SessionBookingRepository bookings;
    private final ConsumableSupplierRepository suppliers;
    private final ConsumablePurchaseOrderRepository purchaseOrders;
    private final TimeService timeService;

    /** A shared SKU projected through the stock settings of one concrete branch. */
    public record ItemStockView(
            Consumable item,
            Location location,
            BigDecimal currentStock,
            BigDecimal minimumStock,
            BigDecimal costPrice
    ) {}

    public ConsumableService(
            CompanyRepository companies,
            LocationRepository locations,
            ConsumableRepository consumables,
            ConsumableLocationStockRepository locationStocks,
            ConsumableCategoryRepository categories,
            ConsumableStockMovementRepository movements,
            ServiceTypeConsumableRepository serviceTypeConsumables,
            SessionConsumableRepository sessionConsumables,
            SessionTypeRepository sessionTypes,
            SessionBookingRepository bookings,
            ConsumableSupplierRepository suppliers,
            ConsumablePurchaseOrderRepository purchaseOrders,
            TimeService timeService
    ) {
        this.companies = companies;
        this.locations = locations;
        this.consumables = consumables;
        this.locationStocks = locationStocks;
        this.categories = categories;
        this.movements = movements;
        this.serviceTypeConsumables = serviceTypeConsumables;
        this.sessionConsumables = sessionConsumables;
        this.sessionTypes = sessionTypes;
        this.bookings = bookings;
        this.suppliers = suppliers;
        this.purchaseOrders = purchaseOrders;
        this.timeService = timeService;
    }

    @Transactional(readOnly = true)
    public List<ItemStockView> listItems(Long companyId, Long locationId) {
        List<Consumable> items = consumables.findAllForCompany(companyId);
        List<Location> stockLocations;
        if (locationId != null) {
            stockLocations = List.of(requireLocation(companyId, locationId));
        } else {
            stockLocations = locations.findAllByCompanyIdAndActiveTrueOrderByDefaultLocationDescNameAscIdAsc(companyId);
        }
        if (items.isEmpty() || stockLocations.isEmpty()) return List.of();

        List<ConsumableLocationStock> stockRows = locationId != null
                ? locationStocks.findAllForCompanyAndLocation(companyId, locationId)
                : locationStocks.findAllByCompanyAndConsumableIds(
                        companyId,
                        items.stream().map(Consumable::getId).filter(Objects::nonNull).toList());
        Map<String, ConsumableLocationStock> stockByPair = new HashMap<>();
        for (ConsumableLocationStock stock : stockRows) {
            if (stock.getLocation() != null && stock.getConsumable() != null) {
                stockByPair.put(pairKey(stock.getConsumable().getId(), stock.getLocation().getId()), stock);
            }
        }

        List<ItemStockView> result = new ArrayList<>();
        for (Location location : stockLocations) {
            for (Consumable item : items) {
                ConsumableLocationStock stock = stockByPair.get(pairKey(item.getId(), location.getId()));
                result.add(toView(item, location, stock));
            }
        }
        result.sort(Comparator
                .comparing((ItemStockView view) -> view.item().getName(), String.CASE_INSENSITIVE_ORDER)
                .thenComparing(view -> view.location().getName(), String.CASE_INSENSITIVE_ORDER)
                .thenComparing(view -> view.location().getId()));
        return result;
    }

    @Transactional
    public ItemStockView createItem(User me, ConsumableController.ItemRequest req) {
        Long companyId = me.getCompany().getId();
        Location location = resolveInventoryWriteLocation(companyId, req == null ? null : req.locationId());
        var item = new Consumable();
        item.setCompany(requireCompany(companyId));
        applyCatalogRequest(item, req, companyId);
        item = consumables.saveAndFlush(item);
        ConsumableLocationStock stock = ensureStockRow(item, location);
        applyStockSettings(stock, req);
        stock = locationStocks.save(stock);
        applyRequestedStockLevel(me, item, location, stock, req.currentStock(), "Initial stock");
        return itemView(item, location);
    }

    @Transactional
    public ItemStockView updateItem(User me, Long id, ConsumableController.ItemRequest req) {
        Long companyId = me.getCompany().getId();
        var item = consumables.findByIdAndCompanyId(id, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        Location location = resolveInventoryWriteLocation(companyId, req == null ? null : req.locationId());
        applyCatalogRequest(item, req, companyId);
        item = consumables.save(item);
        ConsumableLocationStock stock = ensureStockRow(item, location);
        applyStockSettings(stock, req);
        stock = locationStocks.save(stock);
        applyRequestedStockLevel(me, item, location, stock, req.currentStock(), "Stock level updated from item editor");
        return itemView(item, location);
    }

    private void applyCatalogRequest(Consumable item, ConsumableController.ItemRequest req, Long companyId) {
        if (req == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Request is required.");
        String name = trim(req.name());
        if (name == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name is required.");
        item.setName(name);
        item.setDescription(trim(req.description()));
        item.setSku(blankToNull(req.sku()));
        item.setBarcode(blankToNull(req.barcode()));
        item.setUnit(defaultString(req.unit(), "kos"));
        item.setSalePrice(req.salePrice() != null ? nonNegative(req.salePrice()) : null);
        item.setVatRateId(req.vatRateId());
        item.setTrackStock(req.trackStock() == null || Boolean.TRUE.equals(req.trackStock()));
        item.setBillable(Boolean.TRUE.equals(req.billable()));
        item.setActive(req.active() == null || Boolean.TRUE.equals(req.active()));
        if (req.categoryId() == null || req.categoryId() <= 0) {
            item.setCategory(null);
        } else {
            item.setCategory(categories.findByIdAndCompanyId(req.categoryId(), companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Category not found.")));
        }
    }

    private void applyStockSettings(ConsumableLocationStock stock, ConsumableController.ItemRequest req) {
        stock.setMinimumStock(nonNegative(req.minimumStock()));
        stock.setCostPrice(nonNegative(req.costPrice()));
    }

    private void applyRequestedStockLevel(
            User actor,
            Consumable item,
            Location location,
            ConsumableLocationStock stock,
            BigDecimal requestedLevel,
            String note
    ) {
        if (requestedLevel == null) return;
        BigDecimal requested = nonNegative(requestedLevel);
        BigDecimal delta = requested.subtract(nz(stock.getCurrentStock())).setScale(4, RoundingMode.HALF_UP);
        if (delta.compareTo(BigDecimal.ZERO) != 0) {
            createMovement(actor, item, location, StockMovementType.CORRECTION, StockMovementSourceType.MANUAL, null, delta, note);
        }
    }

    @Transactional(readOnly = true)
    public List<ConsumableCategory> listCategories(Long companyId) {
        return categories.findByCompanyIdOrderByNameAsc(companyId);
    }

    @Transactional
    public ConsumableCategory saveCategory(User me, Long id, ConsumableController.CategoryRequest req) {
        var category = id == null
                ? new ConsumableCategory()
                : categories.findByIdAndCompanyId(id, me.getCompany().getId()).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (id == null) category.setCompany(requireCompany(me.getCompany().getId()));
        String name = trim(req != null ? req.name() : null);
        if (name == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name is required.");
        category.setName(name);
        category.setColor(defaultString(req.color(), "#2563eb"));
        category.setActive(req.active() == null || Boolean.TRUE.equals(req.active()));
        return categories.save(category);
    }

    @Transactional
    public ConsumableStockMovement adjustStock(User me, Long consumableId, ConsumableController.StockAdjustmentRequest req) {
        Long companyId = me.getCompany().getId();
        var item = consumables.findByIdAndCompanyId(consumableId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        Location location = resolveInventoryWriteLocation(companyId, req == null ? null : req.locationId());
        BigDecimal delta = req != null ? nz(req.quantityDelta()) : BigDecimal.ZERO;
        if (delta.compareTo(BigDecimal.ZERO) == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Quantity delta must not be zero.");
        }
        StockMovementType type = req != null && req.movementType() != null ? req.movementType() : StockMovementType.CORRECTION;
        return createMovement(me, item, location, type, StockMovementSourceType.MANUAL, null, delta, req != null ? req.note() : null);
    }

    @Transactional
    public ConsumableStockMovement createMovement(
            User actor,
            Consumable item,
            Location location,
            StockMovementType type,
            StockMovementSourceType sourceType,
            Long sourceId,
            BigDecimal delta,
            String note
    ) {
        if (item == null || item.getCompany() == null || item.getCompany().getId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Consumable is required.");
        }
        Long companyId = item.getCompany().getId();
        if (location == null || location.getId() == null || location.getCompany() == null
                || !Objects.equals(location.getCompany().getId(), companyId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A valid inventory location is required.");
        }
        if (delta == null || delta.compareTo(BigDecimal.ZERO) == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Quantity delta must not be zero.");
        }

        ConsumableLocationStock stock = lockStockRow(item, location);
        BigDecimal before = nz(stock.getCurrentStock());
        BigDecimal after = before.add(delta).setScale(4, RoundingMode.HALF_UP);
        if (item.isTrackStock() && after.compareTo(BigDecimal.ZERO) < 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Not enough stock for " + item.getName() + " at " + location.getName() + ".");
        }
        stock.setCurrentStock(after);
        locationStocks.save(stock);

        BigDecimal unitCost = nz(stock.getCostPrice());
        var movement = new ConsumableStockMovement();
        movement.setCompany(item.getCompany());
        movement.setConsumable(item);
        movement.setLocation(location);
        movement.setMovementType(type != null ? type : StockMovementType.CORRECTION);
        movement.setSourceType(sourceType != null ? sourceType : StockMovementSourceType.MANUAL);
        movement.setSourceId(sourceId);
        movement.setQuantityDelta(delta.setScale(4, RoundingMode.HALF_UP));
        movement.setStockBefore(before);
        movement.setStockAfter(after);
        movement.setUnitCostSnapshot(unitCost);
        movement.setValueDelta(delta.multiply(unitCost).setScale(4, RoundingMode.HALF_UP));
        movement.setNote(blankToNull(note));
        movement.setCreatedBy(actor);
        return movements.save(movement);
    }

    @Transactional(readOnly = true)
    public List<ConsumableStockMovement> listMovements(Long companyId, Long locationId) {
        if (locationId != null) requireLocation(companyId, locationId);
        return movements.findAllForCompany(companyId, locationId);
    }

    @Transactional(readOnly = true)
    public ConsumableController.OverviewResponse overview(Long companyId, Long locationId) {
        if (locationId != null) requireLocation(companyId, locationId);
        var views = listItems(companyId, locationId);
        var activeViews = views.stream().filter(view -> view.item().isActive()).toList();
        var low = activeViews.stream()
                .filter(view -> view.item().isTrackStock())
                .filter(view -> nz(view.currentStock()).compareTo(nz(view.minimumStock())) < 0)
                .toList();
        var thirtyDaysAgo = timeService.instant(companyId).minus(30, ChronoUnit.DAYS);
        var recent = movements.findAllForCompanySince(companyId, locationId, thirtyDaysAgo);
        BigDecimal totalValue = activeViews.stream()
                .map(view -> nz(view.currentStock()).multiply(nz(view.costPrice())))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal usedQty = recent.stream()
                .filter(m -> m.getQuantityDelta().compareTo(BigDecimal.ZERO) < 0)
                .map(m -> m.getQuantityDelta().abs())
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        var categoryUsage = recent.stream()
                .filter(m -> m.getQuantityDelta().compareTo(BigDecimal.ZERO) < 0)
                .collect(Collectors.groupingBy(
                        m -> m.getConsumable().getCategory() != null ? m.getConsumable().getCategory().getName() : "Ostalo",
                        LinkedHashMap::new,
                        Collectors.reducing(BigDecimal.ZERO, m -> m.getQuantityDelta().abs(), BigDecimal::add)
                ));
        var mostUsed = recent.stream()
                .filter(m -> m.getQuantityDelta().compareTo(BigDecimal.ZERO) < 0)
                .collect(Collectors.groupingBy(m -> m.getConsumable().getName(), Collectors.reducing(BigDecimal.ZERO, m -> m.getQuantityDelta().abs(), BigDecimal::add)))
                .entrySet().stream().sorted(Map.Entry.<String, BigDecimal>comparingByValue().reversed())
                .limit(8)
                .map(e -> new ConsumableController.LabelValue(e.getKey(), e.getValue()))
                .toList();
        long catalogItemCount = consumables.findAllForCompany(companyId).stream().filter(Consumable::isActive).count();
        return new ConsumableController.OverviewResponse(
                catalogItemCount,
                low.size(),
                usedQty,
                totalValue.setScale(2, RoundingMode.HALF_UP),
                low.stream().limit(8).map(ConsumableController::toItemResponse).toList(),
                recent.stream().limit(8).map(ConsumableController::toMovementResponse).toList(),
                categoryUsage.entrySet().stream().map(e -> new ConsumableController.LabelValue(e.getKey(), e.getValue())).toList(),
                mostUsed
        );
    }

    @Transactional(readOnly = true)
    public List<ServiceTypeConsumable> listServiceTypeDefaults(Long companyId, Long typeId) {
        requireType(typeId, companyId);
        return serviceTypeConsumables.findByCompanyIdAndSessionTypeId(companyId, typeId);
    }

    @Transactional
    public List<ServiceTypeConsumable> replaceServiceTypeDefaults(User me, Long typeId, List<ConsumableController.ServiceTypeConsumableRequest> rows) {
        Long companyId = me.getCompany().getId();
        SessionType type = requireType(typeId, companyId);
        serviceTypeConsumables.deleteByCompanyIdAndSessionTypeId(companyId, typeId);
        List<ServiceTypeConsumable> saved = new ArrayList<>();
        if (rows != null) {
            for (var req : rows) {
                if (req == null || req.consumableId() == null || req.consumableId() <= 0) continue;
                var item = consumables.findByIdAndCompanyId(req.consumableId(), companyId)
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Consumable not found."));
                var link = new ServiceTypeConsumable();
                link.setCompany(type.getCompany());
                link.setSessionType(type);
                link.setConsumable(item);
                link.setDefaultQuantity(positive(req.defaultQuantity(), BigDecimal.ONE));
                link.setQuantityMode(req.quantityMode() != null ? req.quantityMode() : QuantityMode.PER_SESSION);
                link.setBillableOverride(req.billableOverride());
                link.setNotes(blankToNull(req.notes()));
                saved.add(serviceTypeConsumables.save(link));
            }
        }
        return saved;
    }

    /**
     * Moves session-level consumable rows away from participant booking rows that are
     * about to be deleted. Manual consumable edits remain attached to the logical
     * group session, while automatic defaults can still be recalculated afterwards.
     */
    @Transactional
    public int reanchorSessionConsumablesBeforeBookingDeletion(
            Long companyId,
            Long anchorBookingId,
            Collection<Long> removedBookingIds
    ) {
        if (companyId == null || anchorBookingId == null
                || removedBookingIds == null || removedBookingIds.isEmpty()) {
            return 0;
        }
        List<Long> ids = removedBookingIds.stream()
                .filter(Objects::nonNull)
                .filter(id -> id > 0)
                .distinct()
                .toList();
        if (ids.isEmpty()) return 0;
        return sessionConsumables.reanchorBeforeBookingDeletion(companyId, anchorBookingId, ids);
    }

    @Transactional
    public List<SessionConsumable> ensureSessionDefaultsForBookings(List<SessionBooking> saved, Long companyId) {
        if (saved == null || saved.isEmpty()) return List.of();
        var representative = saved.stream().filter(Objects::nonNull).min(Comparator.comparing(SessionBooking::getId)).orElse(null);
        if (representative == null || representative.getType() == null) return List.of();
        String groupKey = groupKey(representative);
        if (groupKey == null || groupKey.isBlank()) return List.of();
        int participants = (int) saved.stream().filter(b -> b.getClient() != null).count();
        if (sessionConsumables.existsByCompanyIdAndBookingGroupKey(companyId, groupKey)) {
            var existing = sessionConsumables.findByCompanyIdAndBookingGroupKey(companyId, groupKey);
            boolean manuallyChanged = existing.stream().anyMatch(SessionConsumable::isManuallyChanged);
            if (manuallyChanged) return existing;
            sessionConsumables.deleteByCompanyIdAndBookingGroupKey(companyId, groupKey);
        }
        return copyDefaultsToSession(companyId, representative, Math.max(1, participants));
    }

    @Transactional
    public List<SessionConsumable> resetSessionDefaults(User actor, Long bookingId) {
        Long companyId = actor.getCompany().getId();
        var booking = bookings.findByIdAndCompanyId(bookingId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        String groupKey = groupKey(booking);
        var rows = bookings.findByBookingGroupKeyAndCompanyIdOrderByIdAsc(groupKey, companyId);
        if (rows == null || rows.isEmpty()) rows = List.of(booking);
        sessionConsumables.deleteByCompanyIdAndBookingGroupKey(companyId, groupKey);
        int participants = (int) rows.stream().filter(b -> b.getClient() != null).count();
        return copyDefaultsToSession(companyId, rows.get(0), Math.max(1, participants));
    }

    private List<SessionConsumable> copyDefaultsToSession(Long companyId, SessionBooking representative, int participants) {
        var defaults = serviceTypeConsumables.findByCompanyIdAndSessionTypeId(companyId, representative.getType().getId());
        Location location = requireBookingLocation(representative);
        List<SessionConsumable> saved = new ArrayList<>();
        for (var def : defaults) {
            var item = def.getConsumable();
            var row = new SessionConsumable();
            row.setCompany(representative.getCompany());
            row.setSessionBooking(representative);
            row.setBookingGroupKey(groupKey(representative));
            row.setServiceType(representative.getType());
            row.setConsumable(item);
            BigDecimal qty = positive(def.getDefaultQuantity(), BigDecimal.ONE);
            if (def.getQuantityMode() == QuantityMode.PER_PARTICIPANT) {
                qty = qty.multiply(BigDecimal.valueOf(Math.max(1, participants)));
            }
            row.setQuantity(qty.setScale(4, RoundingMode.HALF_UP));
            row.setUnit(defaultString(item.getUnit(), "kos"));
            row.setQuantityMode(def.getQuantityMode() != null ? def.getQuantityMode() : QuantityMode.PER_SESSION);
            row.setCostPriceSnapshot(costPriceAtLocation(companyId, item, location));
            row.setSalePriceSnapshot(item.getSalePrice());
            row.setBillable(def.getBillableOverride() != null ? def.getBillableOverride() : item.isBillable());
            row.setSource("SERVICE_TYPE_DEFAULT");
            row.setManuallyChanged(false);
            row.setNotes(def.getNotes());
            saved.add(sessionConsumables.save(row));
        }
        return saved;
    }

    @Transactional(readOnly = true)
    public List<SessionConsumable> listSessionConsumables(User me, Long bookingId) {
        Long companyId = me.getCompany().getId();
        var booking = bookings.findByIdAndCompanyId(bookingId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        return sessionConsumables.findByCompanyIdAndBookingGroupKey(companyId, groupKey(booking));
    }

    @Transactional
    public List<SessionConsumable> replaceSessionConsumables(User me, Long bookingId, List<ConsumableController.SessionConsumableRequest> rows) {
        Long companyId = me.getCompany().getId();
        var booking = bookings.findByIdAndCompanyId(bookingId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        Location location = requireBookingLocation(booking);
        String key = groupKey(booking);
        sessionConsumables.deleteByCompanyIdAndBookingGroupKey(companyId, key);
        List<SessionConsumable> saved = new ArrayList<>();
        if (rows != null) {
            for (var req : rows) {
                if (req == null || req.consumableId() == null || req.consumableId() <= 0) continue;
                var item = consumables.findByIdAndCompanyId(req.consumableId(), companyId)
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Consumable not found."));
                var row = new SessionConsumable();
                row.setCompany(booking.getCompany());
                row.setSessionBooking(booking);
                row.setBookingGroupKey(key);
                row.setServiceType(booking.getType());
                row.setConsumable(item);
                row.setQuantity(nonNegative(req.quantity()));
                row.setUnit(defaultString(req.unit(), item.getUnit()));
                row.setQuantityMode(req.quantityMode() != null ? req.quantityMode() : QuantityMode.PER_SESSION);
                row.setCostPriceSnapshot(costPriceAtLocation(companyId, item, location));
                row.setSalePriceSnapshot(item.getSalePrice());
                row.setBillable(req.billable() != null ? Boolean.TRUE.equals(req.billable()) : item.isBillable());
                row.setSource("MANUAL");
                row.setManuallyChanged(true);
                row.setNotes(blankToNull(req.notes()));
                saved.add(sessionConsumables.save(row));
            }
        }
        return saved;
    }

    @Transactional
    public void applySessionUsageIfCheckedOut(User actor, List<SessionBooking> rows, Map<Long, String> previousStatuses) {
        if (rows == null || rows.isEmpty()) return;
        var representative = rows.stream().filter(Objects::nonNull).min(Comparator.comparing(SessionBooking::getId)).orElse(null);
        if (representative == null) return;
        Long companyId = representative.getCompany().getId();
        Location location = requireBookingLocation(representative);
        String key = groupKey(representative);
        boolean checkedOut = rows.stream().anyMatch(row -> SessionBookingStatus.CHECKED_OUT.equals(SessionBookingStatus.normalizeStored(row.getBookingStatus())));
        boolean previouslyCheckedOut = previousStatuses != null && previousStatuses.values().stream()
                .anyMatch(s -> SessionBookingStatus.CHECKED_OUT.equals(SessionBookingStatus.normalizeStored(s)));
        if (checkedOut && !previouslyCheckedOut) {
            ensureSessionDefaultsForBookings(rows, companyId);
            var sessionRows = sessionConsumables.findByCompanyIdAndBookingGroupKey(companyId, key);
            for (var sc : sessionRows) {
                if (sc.getConsumable().isTrackStock() && nz(sc.getQuantity()).compareTo(BigDecimal.ZERO) > 0) {
                    if (!movements.existsByCompanyIdAndLocationIdAndMovementTypeAndSourceTypeAndSourceId(
                            companyId, location.getId(), StockMovementType.SESSION_USAGE, StockMovementSourceType.SESSION, sc.getId())) {
                        createMovement(actor, sc.getConsumable(), location, StockMovementType.SESSION_USAGE,
                                StockMovementSourceType.SESSION, sc.getId(), nz(sc.getQuantity()).negate(), "Session usage: " + key);
                    }
                }
            }
        } else if (!checkedOut && previouslyCheckedOut) {
            reverseSessionUsage(actor, companyId, key);
        }
    }

    @Transactional
    public void reverseSessionUsage(User actor, Long companyId, String groupKey) {
        var sessionRows = sessionConsumables.findByCompanyIdAndBookingGroupKey(companyId, groupKey);
        for (var sc : sessionRows) {
            // A session consumable can only have one usage movement per location. Read the immutable
            // movement location so reversal cannot be redirected by later booking/configuration edits.
            List<ConsumableStockMovement> usedMovements = movements
                    .findByCompanyIdAndMovementTypeAndSourceTypeAndSourceId(
                            companyId, StockMovementType.SESSION_USAGE, StockMovementSourceType.SESSION, sc.getId());
            for (var used : usedMovements) {
                BigDecimal reverse = nz(used.getQuantityDelta()).negate();
                if (reverse.compareTo(BigDecimal.ZERO) != 0) {
                    createMovement(actor, used.getConsumable(), used.getLocation(), StockMovementType.RETURN,
                            StockMovementSourceType.SESSION, sc.getId(), reverse, "Reverse session usage: " + groupKey);
                }
            }
        }
    }

    @Transactional(readOnly = true)
    public List<ConsumableSupplier> listSuppliers(Long companyId) {
        return suppliers.findByCompanyIdOrderByNameAsc(companyId);
    }

    @Transactional
    public ConsumableSupplier saveSupplier(User me, Long id, ConsumableController.SupplierRequest req) {
        if (req == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Request is required.");
        var s = id == null
                ? new ConsumableSupplier()
                : suppliers.findByIdAndCompanyId(id, me.getCompany().getId()).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (id == null) s.setCompany(requireCompany(me.getCompany().getId()));
        String name = trim(req.name());
        if (name == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name is required.");
        s.setName(name);
        s.setContactName(blankToNull(req.contactName()));
        s.setPhone(blankToNull(req.phone()));
        s.setEmail(blankToNull(req.email()));
        s.setCategories(blankToNull(req.categories()));
        s.setPaymentTermsDays(req.paymentTermsDays() != null ? Math.max(0, req.paymentTermsDays()) : 30);
        s.setReliabilityPercent(req.reliabilityPercent() != null ? Math.max(0, Math.min(100, req.reliabilityPercent())) : 100);
        s.setOutstandingAmount(nz(req.outstandingAmount()));
        s.setStatus(req.status() != null ? req.status() : SupplierStatus.ACTIVE);
        return suppliers.save(s);
    }

    @Transactional(readOnly = true)
    public List<ConsumablePurchaseOrder> listPurchaseOrders(Long companyId, Long locationId) {
        if (locationId != null) requireLocation(companyId, locationId);
        return purchaseOrders.findByCompanyId(companyId, locationId);
    }

    @Transactional
    public ConsumablePurchaseOrder savePurchaseOrder(User me, Long id, ConsumableController.PurchaseOrderRequest req) {
        if (req == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Request is required.");
        Long companyId = me.getCompany().getId();
        var po = id == null
                ? new ConsumablePurchaseOrder()
                : purchaseOrders.findByIdAndCompanyId(id, companyId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (id == null) po.setCompany(requireCompany(companyId));
        Long requestedLocationId = req.locationId() != null ? req.locationId() : (po.getLocation() == null ? null : po.getLocation().getId());
        po.setLocation(resolveInventoryWriteLocation(companyId, requestedLocationId));
        po.setOrderNumber(blankToNull(req.orderNumber()) != null ? req.orderNumber().trim() : generateOrderNumber());
        po.setStatus(req.status() != null ? req.status() : PurchaseOrderStatus.DRAFT);
        po.setOrderDate(req.orderDate() != null ? req.orderDate() : timeService.localDate());
        po.setExpectedDate(req.expectedDate());
        po.setTotalAmount(nz(req.totalAmount()));
        po.setReceivedAmount(nz(req.receivedAmount()));
        po.setNotes(blankToNull(req.notes()));
        if (req.supplierId() != null && req.supplierId() > 0) {
            po.setSupplier(suppliers.findByIdAndCompanyId(req.supplierId(), companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Supplier not found.")));
        } else {
            po.setSupplier(null);
        }
        return purchaseOrders.save(po);
    }

    @Transactional(readOnly = true)
    public ItemStockView itemView(Consumable item, Location location) {
        ConsumableLocationStock stock = locationStocks.findByCompanyIdAndConsumableIdAndLocationId(
                item.getCompany().getId(), item.getId(), location.getId()).orElse(null);
        return toView(item, location, stock);
    }

    private ItemStockView toView(Consumable item, Location location, ConsumableLocationStock stock) {
        return new ItemStockView(
                item,
                location,
                stock == null ? BigDecimal.ZERO.setScale(4) : nz(stock.getCurrentStock()),
                stock == null ? BigDecimal.ZERO.setScale(4) : nz(stock.getMinimumStock()),
                stock == null ? BigDecimal.ZERO.setScale(4) : nz(stock.getCostPrice())
        );
    }

    private BigDecimal costPriceAtLocation(Long companyId, Consumable item, Location location) {
        if (item == null || location == null) return BigDecimal.ZERO.setScale(4);
        return locationStocks.findByCompanyIdAndConsumableIdAndLocationId(companyId, item.getId(), location.getId())
                .map(stock -> nz(stock.getCostPrice()))
                .orElse(BigDecimal.ZERO.setScale(4));
    }

    private ConsumableLocationStock ensureStockRow(Consumable item, Location location) {
        Long companyId = item.getCompany().getId();
        return locationStocks.findByCompanyIdAndConsumableIdAndLocationId(companyId, item.getId(), location.getId())
                .orElseGet(() -> {
                    var stock = new ConsumableLocationStock();
                    stock.setCompany(item.getCompany());
                    stock.setConsumable(item);
                    stock.setLocation(location);
                    stock.setCurrentStock(BigDecimal.ZERO.setScale(4));
                    stock.setMinimumStock(BigDecimal.ZERO.setScale(4));
                    stock.setCostPrice(BigDecimal.ZERO.setScale(4));
                    return locationStocks.saveAndFlush(stock);
                });
    }

    private ConsumableLocationStock lockStockRow(Consumable item, Location location) {
        Long companyId = item.getCompany().getId();
        var existing = locationStocks.findForUpdate(companyId, item.getId(), location.getId());
        if (existing.isPresent()) return existing.get();
        ensureStockRow(item, location);
        return locationStocks.findForUpdate(companyId, item.getId(), location.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "Could not initialize location stock."));
    }

    private Location resolveInventoryWriteLocation(Long companyId, Long requestedLocationId) {
        if (requestedLocationId != null) return requireLocation(companyId, requestedLocationId);
        List<Location> active = locations.findAllByCompanyIdAndActiveTrueOrderByDefaultLocationDescNameAscIdAsc(companyId);
        if (active.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No active inventory location is available.");
        }
        if (active.size() == 1) return active.get(0);
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Select a location for this inventory operation.");
    }

    private Location requireLocation(Long companyId, Long locationId) {
        if (locationId == null || locationId <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Location is required.");
        }
        return locations.findByIdAndCompanyId(locationId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Location not found."));
    }

    private Location requireBookingLocation(SessionBooking booking) {
        if (booking == null || booking.getLocation() == null || booking.getLocation().getId() == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Session location is required for inventory usage.");
        }
        return booking.getLocation();
    }

    private String generateOrderNumber() {
        return "PO-" + LocalDate.now().getYear() + "-" + System.currentTimeMillis();
    }

    private Company requireCompany(Long companyId) {
        return companies.findById(companyId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Company not found."));
    }

    private SessionType requireType(Long typeId, Long companyId) {
        if (typeId == null || typeId <= 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Service type is required.");
        return sessionTypes.findByIdAndCompanyIdWithLinkedServices(typeId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Service type not found."));
    }

    public static String groupKey(SessionBooking booking) {
        if (booking == null) return null;
        if (booking.getBookingGroupKey() != null && !booking.getBookingGroupKey().isBlank()) return booking.getBookingGroupKey();
        return booking.getId() != null ? String.valueOf(booking.getId()) : null;
    }

    private static String pairKey(Long consumableId, Long locationId) {
        return String.valueOf(consumableId) + ":" + String.valueOf(locationId);
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO.setScale(4) : v.setScale(4, RoundingMode.HALF_UP);
    }

    private static BigDecimal nonNegative(BigDecimal v) {
        BigDecimal n = nz(v);
        if (n.compareTo(BigDecimal.ZERO) < 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Value must not be negative.");
        return n;
    }

    private static BigDecimal positive(BigDecimal v, BigDecimal fallback) {
        BigDecimal n = v == null ? fallback : v;
        if (n.compareTo(BigDecimal.ZERO) <= 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Quantity must be positive.");
        return n.setScale(4, RoundingMode.HALF_UP);
    }

    private static String trim(String v) {
        if (v == null) return null;
        String s = v.trim();
        return s.isEmpty() ? null : s;
    }

    private static String blankToNull(String v) { return trim(v); }
    private static String defaultString(String v, String fallback) { return trim(v) != null ? v.trim() : fallback; }
}
