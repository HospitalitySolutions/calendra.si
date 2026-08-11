package com.example.app.consumables;

import com.example.app.billing.TaxRate;
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
import com.example.app.settings.GlobalConsumablesFeatureService;
import com.example.app.user.User;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
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
    private final ConsumablePurchaseOrderLineRepository purchaseOrderLines;
    private final ConsumablePurchaseOrderReceiptRepository purchaseOrderReceipts;
    private final ConsumablePurchaseOrderReceiptLineRepository purchaseOrderReceiptLines;
    private final TimeService timeService;
    private final GlobalConsumablesFeatureService consumablesFeatureService;

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
            ConsumablePurchaseOrderLineRepository purchaseOrderLines,
            ConsumablePurchaseOrderReceiptRepository purchaseOrderReceipts,
            ConsumablePurchaseOrderReceiptLineRepository purchaseOrderReceiptLines,
            TimeService timeService,
            GlobalConsumablesFeatureService consumablesFeatureService
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
        this.purchaseOrderLines = purchaseOrderLines;
        this.purchaseOrderReceipts = purchaseOrderReceipts;
        this.purchaseOrderReceiptLines = purchaseOrderReceiptLines;
        this.timeService = timeService;
        this.consumablesFeatureService = consumablesFeatureService;
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
        String sku = blankToNull(req.sku());
        if (sku != null) {
            boolean duplicateSku = item.getId() == null
                    ? consumables.existsByCompanyIdAndSkuIgnoreCase(companyId, sku)
                    : consumables.existsByCompanyIdAndSkuIgnoreCaseAndIdNot(companyId, sku, item.getId());
            if (duplicateSku) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "An article with this SKU already exists.");
            }
        }
        item.setSku(sku);
        item.setBarcode(blankToNull(req.barcode()));
        item.setUnit(defaultString(req.unit(), "kos"));
        item.setSalePrice(req.salePrice() != null ? nonNegative(req.salePrice()) : null);
        item.setVatRateId(req.vatRateId());
        item.setVatRate(req.vatRate() != null ? req.vatRate() : (item.getVatRate() != null ? item.getVatRate() : TaxRate.NO_VAT));
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
        boolean duplicateName = id == null
                ? categories.existsByCompanyIdAndNameIgnoreCase(me.getCompany().getId(), name)
                : categories.existsByCompanyIdAndNameIgnoreCaseAndIdNot(me.getCompany().getId(), name, id);
        if (duplicateName) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A category with this name already exists.");
        }
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
        validateManualMovement(type, delta);
        return createMovement(me, item, location, type, StockMovementSourceType.MANUAL, null, delta, req != null ? req.note() : null);
    }


    private static void validateManualMovement(StockMovementType type, BigDecimal delta) {
        if (type == StockMovementType.SESSION_USAGE || type == StockMovementType.INVENTORY_COUNT) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "This movement type cannot be created manually.");
        }
        if ((type == StockMovementType.PURCHASE || type == StockMovementType.RETURN)
                && delta.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Receipts and returns must increase stock.");
        }
        if (type == StockMovementType.WASTE && delta.compareTo(BigDecimal.ZERO) >= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Waste must decrease stock.");
        }
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
        return ensureSessionDefaultsForBookings(null, saved, companyId);
    }

    /**
     * Keeps automatic appointment consumables in sync with the selected service while preserving
     * SessionConsumable ids. Preserving ids is important because stock movements use the
     * session-consumable id as their immutable reconciliation source id.
     */
    @Transactional
    public List<SessionConsumable> ensureSessionDefaultsForBookings(User actor, List<SessionBooking> saved, Long companyId) {
        if (!consumablesFeatureService.isEnabledForCompany(companyId)) return List.of();
        if (saved == null || saved.isEmpty()) return List.of();
        var representative = saved.stream().filter(Objects::nonNull).min(Comparator.comparing(SessionBooking::getId)).orElse(null);
        if (representative == null || representative.getType() == null) return List.of();
        String key = groupKey(representative);
        if (key == null || key.isBlank()) return List.of();

        List<SessionConsumable> existing = sessionConsumables.findByCompanyIdAndBookingGroupKey(companyId, key);
        if (saved.stream().filter(Objects::nonNull).anyMatch(SessionBooking::isSessionConsumablesOverridden)
                || existing.stream().anyMatch(SessionConsumable::isManuallyChanged)) {
            return existing;
        }
        return syncDefaultsToSession(actor, companyId, representative, existing);
    }

    @Transactional
    public List<SessionConsumable> resetSessionDefaults(User actor, Long bookingId) {
        consumablesFeatureService.assertEnabledForUser(actor);
        Long companyId = actor.getCompany().getId();
        var booking = bookings.findByIdAndCompanyId(bookingId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        String key = groupKey(booking);
        var rows = bookings.findByBookingGroupKeyAndCompanyIdOrderByIdAsc(key, companyId);
        if (rows == null || rows.isEmpty()) rows = List.of(booking);
        rows.forEach(row -> row.setSessionConsumablesOverridden(false));
        bookings.saveAll(rows);
        List<SessionConsumable> existing = sessionConsumables.findByCompanyIdAndBookingGroupKey(companyId, key);
        List<SessionConsumable> result = syncDefaultsToSession(actor, companyId, rows.get(0), existing);
        if (isCheckedOut(rows)) reconcileCheckedOutUsage(actor, companyId, rows.get(0), rows, result);
        return result;
    }

    private List<SessionConsumable> syncDefaultsToSession(
            User actor,
            Long companyId,
            SessionBooking representative,
            List<SessionConsumable> existing
    ) {
        var defaults = serviceTypeConsumables.findByCompanyIdAndSessionTypeId(companyId, representative.getType().getId());
        Location location = requireBookingLocation(representative);
        String key = groupKey(representative);
        Map<Long, SessionConsumable> byConsumable = (existing == null ? List.<SessionConsumable>of() : existing).stream()
                .filter(row -> row.getConsumable() != null && row.getConsumable().getId() != null)
                .collect(Collectors.toMap(row -> row.getConsumable().getId(), row -> row, (a, b) -> a, LinkedHashMap::new));
        java.util.Set<Long> retainedConsumableIds = new java.util.HashSet<>();
        List<SessionConsumable> result = new ArrayList<>();

        for (var def : defaults) {
            var item = def.getConsumable();
            retainedConsumableIds.add(item.getId());
            var row = byConsumable.get(item.getId());
            boolean newSnapshot = row == null;
            if (newSnapshot) {
                row = new SessionConsumable();
                row.setCompany(representative.getCompany());
                row.setBookingGroupKey(key);
                row.setConsumable(item);
                captureBillingSnapshot(row, item);
            }
            row.setSessionBooking(representative);
            row.setServiceType(representative.getType());
            BigDecimal qty = positive(def.getDefaultQuantity(), BigDecimal.ONE);
            row.setQuantity(qty.setScale(4, RoundingMode.HALF_UP));
            if (newSnapshot) row.setUnit(defaultString(item.getUnit(), "kos"));
            row.setQuantityMode(def.getQuantityMode() != null ? def.getQuantityMode() : QuantityMode.PER_SESSION);
            row.setCostPriceSnapshot(costPriceAtLocation(companyId, item, location));
            row.setBillable(def.getBillableOverride() != null ? def.getBillableOverride() : item.isBillable());
            row.setSource("SERVICE_TYPE_DEFAULT");
            row.setManuallyChanged(false);
            row.setNotes(def.getNotes());
            result.add(sessionConsumables.save(row));
        }

        for (SessionConsumable old : (existing == null ? List.<SessionConsumable>of() : existing)) {
            if (old.getConsumable() == null || retainedConsumableIds.contains(old.getConsumable().getId())) continue;
            reconcileUsageForRow(actor, companyId, old, null, BigDecimal.ZERO, "Service consumable removed: " + key);
            sessionConsumables.delete(old);
        }
        sessionConsumables.flush();
        return result;
    }

    @Transactional(readOnly = true)
    public List<SessionConsumable> listSessionConsumables(User me, Long bookingId) {
        Long companyId = me.getCompany().getId();
        var booking = bookings.findByIdAndCompanyId(bookingId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        return sessionConsumables.findByCompanyIdAndBookingGroupKey(companyId, groupKey(booking));
    }

    @Transactional(readOnly = true)
    public String bookingGroupKey(User me, Long bookingId) {
        Long companyId = me.getCompany().getId();
        var booking = bookings.findByIdAndCompanyId(bookingId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        return groupKey(booking);
    }

    @Transactional
    public List<SessionConsumable> replaceSessionConsumables(User me, Long bookingId, List<ConsumableController.SessionConsumableRequest> rows) {
        consumablesFeatureService.assertEnabledForUser(me);
        Long companyId = me.getCompany().getId();
        var booking = bookings.findByIdAndCompanyId(bookingId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        Location location = requireBookingLocation(booking);
        String key = groupKey(booking);
        List<SessionBooking> bookingRows = bookings.findByBookingGroupKeyAndCompanyIdOrderByIdAsc(key, companyId);
        if (bookingRows == null || bookingRows.isEmpty()) bookingRows = List.of(booking);
        bookingRows.forEach(row -> row.setSessionConsumablesOverridden(true));
        bookings.saveAll(bookingRows);
        List<SessionConsumable> groupBookingsConsumables = sessionConsumables.findByCompanyIdAndBookingGroupKey(companyId, key);
        Map<Long, SessionConsumable> existing = groupBookingsConsumables.stream()
                .filter(row -> row.getConsumable() != null && row.getConsumable().getId() != null)
                .collect(Collectors.toMap(row -> row.getConsumable().getId(), row -> row, (a, b) -> a, LinkedHashMap::new));
        java.util.Set<Long> requested = new java.util.HashSet<>();
        List<SessionConsumable> saved = new ArrayList<>();

        if (rows != null) {
            for (var req : rows) {
                if (req == null || req.consumableId() == null || req.consumableId() <= 0) continue;
                if (!requested.add(req.consumableId())) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The same consumable can only be added once per appointment.");
                }
                var item = consumables.findByIdAndCompanyId(req.consumableId(), companyId)
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Consumable not found."));
                var row = existing.get(item.getId());
                if (row == null) {
                    row = new SessionConsumable();
                    row.setCompany(booking.getCompany());
                    row.setBookingGroupKey(key);
                    row.setConsumable(item);
                    captureBillingSnapshot(row, item);
                }
                row.setSessionBooking(booking);
                row.setServiceType(booking.getType());
                row.setQuantity(nonNegative(req.quantity()));
                row.setUnit(defaultString(req.unit(), item.getUnit()));
                row.setQuantityMode(req.quantityMode() != null ? req.quantityMode() : QuantityMode.PER_SESSION);
                row.setCostPriceSnapshot(costPriceAtLocation(companyId, item, location));
                row.setBillable(req.billable() != null ? Boolean.TRUE.equals(req.billable()) : item.isBillable());
                row.setSource("MANUAL");
                row.setManuallyChanged(true);
                row.setNotes(blankToNull(req.notes()));
                saved.add(sessionConsumables.save(row));
            }
        }

        for (SessionConsumable old : groupBookingsConsumables) {
            if (old.getConsumable() != null && requested.contains(old.getConsumable().getId())) continue;
            reconcileUsageForRow(me, companyId, old, null, BigDecimal.ZERO, "Session consumable removed: " + key);
            sessionConsumables.delete(old);
        }
        sessionConsumables.flush();

        if (isCheckedOut(bookingRows)) reconcileCheckedOutUsage(me, companyId, booking, bookingRows, saved);
        return saved;
    }

    /**
     * Reconciles posted inventory to the desired state every time a checked-out session is saved.
     * This makes checkout idempotent and correctly handles later quantity, participant and
     * location changes instead of only reacting to the first CHECKED_OUT transition.
     */
    @Transactional
    public void applySessionUsageIfCheckedOut(User actor, List<SessionBooking> rows, Map<Long, String> previousStatuses) {
        if (rows == null || rows.isEmpty()) return;
        var representative = rows.stream().filter(Objects::nonNull).min(Comparator.comparing(SessionBooking::getId)).orElse(null);
        if (representative == null) return;
        Long companyId = representative.getCompany().getId();
        String key = groupKey(representative);
        boolean checkedOut = isCheckedOut(rows);
        boolean previouslyCheckedOut = previousStatuses != null && previousStatuses.values().stream()
                .anyMatch(s -> SessionBookingStatus.CHECKED_OUT.equals(SessionBookingStatus.normalizeStored(s)));

        // Turning the module off stops new consumption, but must never strand historical stock usage.
        // If a previously checked-out appointment is reopened/cancelled, always reverse what was posted.
        if (!consumablesFeatureService.isEnabledForCompany(companyId)) {
            if (!checkedOut && previouslyCheckedOut) {
                reverseSessionUsage(actor, companyId, key);
            }
            return;
        }

        if (checkedOut) {
            List<SessionConsumable> sessionRows = sessionConsumables.findByCompanyIdAndBookingGroupKey(companyId, key);
            reconcileCheckedOutUsage(actor, companyId, representative, rows, sessionRows);
        } else if (previouslyCheckedOut) {
            reverseSessionUsage(actor, companyId, key);
        }
    }

    @Transactional
    public void reverseSessionUsage(User actor, Long companyId, String groupKey) {
        var sessionRows = sessionConsumables.findByCompanyIdAndBookingGroupKey(companyId, groupKey);
        for (var sc : sessionRows) {
            reconcileUsageForRow(actor, companyId, sc, null, BigDecimal.ZERO, "Reverse session usage: " + groupKey);
        }
    }

    private void reconcileCheckedOutUsage(
            User actor,
            Long companyId,
            SessionBooking representative,
            List<SessionBooking> bookingRows,
            List<SessionConsumable> rows
    ) {
        Location desiredLocation = requireBookingLocation(representative);
        String key = groupKey(representative);
        int participants = activeParticipantCount(bookingRows);
        for (var sc : rows) {
            BigDecimal desired = nonNegative(sc.getQuantity());
            if (sc.getQuantityMode() == QuantityMode.PER_PARTICIPANT) {
                desired = desired.multiply(BigDecimal.valueOf(Math.max(0, participants)));
            }
            if (!sc.getConsumable().isTrackStock()) desired = BigDecimal.ZERO;
            reconcileUsageForRow(actor, companyId, sc, desiredLocation, desired, "Session usage reconciliation: " + key);
        }
    }

    private void reconcileUsageForRow(
            User actor,
            Long companyId,
            SessionConsumable sc,
            Location desiredLocation,
            BigDecimal desiredConsumedQuantity,
            String note
    ) {
        if (sc == null || sc.getId() == null || sc.getConsumable() == null) return;
        BigDecimal desired = sc.getConsumable().isTrackStock() ? nonNegative(desiredConsumedQuantity) : BigDecimal.ZERO;
        Map<Long, BigDecimal> postedByLocation = new LinkedHashMap<>();
        Map<Long, Location> locationsById = new LinkedHashMap<>();
        for (var movement : movements.findByCompanyIdAndSourceTypeAndSourceId(companyId, StockMovementSourceType.SESSION, sc.getId())) {
            if (movement.getMovementType() != StockMovementType.SESSION_USAGE && movement.getMovementType() != StockMovementType.RETURN) continue;
            if (movement.getLocation() == null || movement.getLocation().getId() == null) continue;
            Long locationId = movement.getLocation().getId();
            locationsById.put(locationId, movement.getLocation());
            postedByLocation.merge(locationId, nz(movement.getQuantityDelta()), BigDecimal::add);
        }
        if (desiredLocation != null && desiredLocation.getId() != null) {
            locationsById.put(desiredLocation.getId(), desiredLocation);
            postedByLocation.putIfAbsent(desiredLocation.getId(), BigDecimal.ZERO);
        }

        for (var entry : locationsById.entrySet()) {
            Long locationId = entry.getKey();
            Location location = entry.getValue();
            BigDecimal targetNet = desiredLocation != null && Objects.equals(desiredLocation.getId(), locationId)
                    ? desired.negate()
                    : BigDecimal.ZERO;
            BigDecimal currentNet = postedByLocation.getOrDefault(locationId, BigDecimal.ZERO).setScale(4, RoundingMode.HALF_UP);
            BigDecimal needed = targetNet.subtract(currentNet).setScale(4, RoundingMode.HALF_UP);
            if (needed.compareTo(BigDecimal.ZERO) == 0) continue;
            StockMovementType movementType = needed.compareTo(BigDecimal.ZERO) < 0
                    ? StockMovementType.SESSION_USAGE
                    : StockMovementType.RETURN;
            createMovement(actor, sc.getConsumable(), location, movementType, StockMovementSourceType.SESSION, sc.getId(), needed, note);
        }
    }

    private static void captureBillingSnapshot(SessionConsumable row, Consumable item) {
        row.setItemNameSnapshot(defaultString(item == null ? null : item.getName(), "Porabni material"));
        row.setSalePriceSnapshot(item == null ? null : item.getSalePrice());
        row.setVatRateSnapshot(item != null && item.getVatRate() != null ? item.getVatRate() : TaxRate.NO_VAT);
    }

    private static int activeParticipantCount(List<SessionBooking> rows) {
        if (rows == null) return 0;
        return (int) rows.stream()
                .filter(Objects::nonNull)
                .filter(row -> row.getClient() != null)
                .filter(row -> !SessionBookingStatus.CANCELLED.equals(
                        SessionBookingStatus.normalizeStored(row.getBookingStatus())))
                .count();
    }

    private static boolean isCheckedOut(List<SessionBooking> rows) {
        return rows != null && rows.stream().anyMatch(row -> row != null
                && SessionBookingStatus.CHECKED_OUT.equals(SessionBookingStatus.normalizeStored(row.getBookingStatus())));
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
        boolean duplicateName = id == null
                ? suppliers.existsByCompanyIdAndNameIgnoreCase(me.getCompany().getId(), name)
                : suppliers.existsByCompanyIdAndNameIgnoreCaseAndIdNot(me.getCompany().getId(), name, id);
        if (duplicateName) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A supplier with this name already exists.");
        }
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

    @Transactional(readOnly = true)
    public ConsumablePurchaseOrder getPurchaseOrder(Long companyId, Long id) {
        return purchaseOrders.findByIdAndCompanyId(id, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Purchase order not found."));
    }

    @Transactional(readOnly = true)
    public List<ConsumablePurchaseOrderLine> listPurchaseOrderLines(Long companyId, Long purchaseOrderId) {
        getPurchaseOrder(companyId, purchaseOrderId);
        return purchaseOrderLines.findByCompanyIdAndPurchaseOrderId(companyId, purchaseOrderId);
    }

    @Transactional(readOnly = true)
    public List<ConsumablePurchaseOrderReceipt> listPurchaseOrderReceipts(Long companyId, Long purchaseOrderId) {
        getPurchaseOrder(companyId, purchaseOrderId);
        return purchaseOrderReceipts.findByCompanyAndPurchaseOrder(companyId, purchaseOrderId);
    }

    @Transactional(readOnly = true)
    public List<ConsumablePurchaseOrderReceiptLine> listPurchaseOrderReceiptLines(Long companyId, Long receiptId) {
        return purchaseOrderReceiptLines.findByCompanyAndReceipt(companyId, receiptId);
    }

    @Transactional
    public ConsumablePurchaseOrder savePurchaseOrder(User me, Long id, ConsumableController.PurchaseOrderRequest req) {
        if (req == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Request is required.");
        Long companyId = me.getCompany().getId();
        var po = id == null
                ? new ConsumablePurchaseOrder()
                : purchaseOrders.findForUpdate(id, companyId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Purchase order not found."));
        boolean creating = id == null;
        if (creating) {
            po.setCompany(requireCompany(companyId));
        } else if (po.getStatus() == PurchaseOrderStatus.COMPLETED || po.getStatus() == PurchaseOrderStatus.CANCELLED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Completed or cancelled purchase orders cannot be edited.");
        }

        List<ConsumablePurchaseOrderLine> existingLines = creating ? List.of() : purchaseOrderLines.findForUpdate(companyId, id);
        boolean hasReceipts = existingLines.stream().anyMatch(line -> nz(line.getReceivedQuantity()).compareTo(BigDecimal.ZERO) > 0);

        Long requestedLocationId = req.locationId() != null ? req.locationId() : (po.getLocation() == null ? null : po.getLocation().getId());
        if (hasReceipts && po.getLocation() != null && !Objects.equals(po.getLocation().getId(), requestedLocationId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Receiving location cannot be changed after goods have been received.");
        }
        po.setLocation(resolveInventoryWriteLocation(companyId, requestedLocationId));
        po.setOrderNumber(blankToNull(req.orderNumber()) != null ? req.orderNumber().trim() : (creating ? generateOrderNumber() : po.getOrderNumber()));
        po.setOrderDate(req.orderDate() != null ? req.orderDate() : (po.getOrderDate() != null ? po.getOrderDate() : timeService.localDate()));
        po.setExpectedDate(req.expectedDate());
        po.setNotes(blankToNull(req.notes()));
        if (req.supplierId() != null && req.supplierId() > 0) {
            po.setSupplier(suppliers.findByIdAndCompanyId(req.supplierId(), companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Supplier not found.")));
        } else {
            po.setSupplier(null);
        }

        PurchaseOrderStatus requestedStatus = req.status() != null ? req.status() : (creating ? PurchaseOrderStatus.DRAFT : po.getStatus());
        if (req.status() != null && (requestedStatus == PurchaseOrderStatus.PARTIALLY_RECEIVED || requestedStatus == PurchaseOrderStatus.COMPLETED)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Receiving statuses are managed automatically.");
        }
        if (requestedStatus == PurchaseOrderStatus.CANCELLED && hasReceipts) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A purchase order with received goods cannot be cancelled.");
        }
        po.setStatus(requestedStatus);
        po = purchaseOrders.saveAndFlush(po);

        if (req.lines() != null) {
            if (hasReceipts) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Purchase-order lines cannot be changed after receiving has started.");
            }
            replacePurchaseOrderLines(me, po, req.lines());
        }
        recalculatePurchaseOrderTotals(po);
        List<ConsumablePurchaseOrderLine> effectiveLines = purchaseOrderLines.findByCompanyIdAndPurchaseOrderId(companyId, po.getId());
        if (po.getStatus() == PurchaseOrderStatus.ORDERED && effectiveLines.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Add at least one article before marking the purchase order as ordered.");
        }
        if (po.getStatus() == PurchaseOrderStatus.ORDERED && po.getSupplier() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Select a supplier before marking the purchase order as ordered.");
        }
        return purchaseOrders.save(po);
    }

    private void replacePurchaseOrderLines(User me, ConsumablePurchaseOrder po, List<ConsumableController.PurchaseOrderLineRequest> requests) {
        Long companyId = me.getCompany().getId();
        Map<Long, ConsumableController.PurchaseOrderLineRequest> unique = new LinkedHashMap<>();
        for (ConsumableController.PurchaseOrderLineRequest request : requests) {
            if (request == null || request.consumableId() == null) continue;
            if (unique.put(request.consumableId(), request) != null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The same article can only appear once on a purchase order.");
            }
        }
        purchaseOrderLines.deleteByCompanyIdAndPurchaseOrderId(companyId, po.getId());
        purchaseOrderLines.flush();
        for (ConsumableController.PurchaseOrderLineRequest request : unique.values()) {
            Consumable item = consumables.findByIdAndCompanyId(request.consumableId(), companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Consumable not found."));
            BigDecimal quantity = scale4(request.orderedQuantity());
            BigDecimal unitPrice = scale4(request.unitPrice());
            if (quantity.compareTo(BigDecimal.ZERO) <= 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ordered quantity must be greater than zero.");
            if (unitPrice.compareTo(BigDecimal.ZERO) < 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Purchase price cannot be negative.");
            ConsumablePurchaseOrderLine line = new ConsumablePurchaseOrderLine();
            line.setCompany(me.getCompany());
            line.setPurchaseOrder(po);
            line.setConsumable(item);
            line.setItemNameSnapshot(defaultString(item.getName(), "Porabni material"));
            line.setUnitSnapshot(defaultString(item.getUnit(), "kos"));
            line.setOrderedQuantity(quantity);
            line.setReceivedQuantity(BigDecimal.ZERO.setScale(4));
            line.setUnitPrice(unitPrice);
            line.setVatRate(request.vatRate() != null ? request.vatRate() : TaxRate.NO_VAT);
            purchaseOrderLines.save(line);
        }
    }

    @Transactional
    public ConsumablePurchaseOrder receivePurchaseOrder(User me, Long purchaseOrderId, ConsumableController.PurchaseOrderReceiveRequest req) {
        if (req == null || blankToNull(req.idempotencyKey()) == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Idempotency key is required.");
        }
        Long companyId = me.getCompany().getId();
        ConsumablePurchaseOrder po = purchaseOrders.findForUpdate(purchaseOrderId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Purchase order not found."));

        String key = req.idempotencyKey().trim();
        if (purchaseOrderReceipts.findByCompanyIdAndPurchaseOrderIdAndIdempotencyKey(companyId, purchaseOrderId, key).isPresent()) {
            return po;
        }
        if (po.getStatus() == PurchaseOrderStatus.DRAFT) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Mark the purchase order as ordered before receiving goods.");
        }
        if (po.getStatus() == PurchaseOrderStatus.COMPLETED || po.getStatus() == PurchaseOrderStatus.CANCELLED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This purchase order cannot receive more goods.");
        }
        List<ConsumablePurchaseOrderLine> lines = purchaseOrderLines.findForUpdate(companyId, purchaseOrderId);
        if (lines.isEmpty()) throw new ResponseStatusException(HttpStatus.CONFLICT, "Purchase order has no lines to receive.");
        Map<Long, ConsumablePurchaseOrderLine> byId = lines.stream().collect(Collectors.toMap(ConsumablePurchaseOrderLine::getId, line -> line));
        if (req.lines() == null || req.lines().isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "At least one received quantity is required.");

        Map<Long, BigDecimal> quantities = new LinkedHashMap<>();
        for (ConsumableController.PurchaseOrderReceiveLineRequest request : req.lines()) {
            if (request == null || request.lineId() == null) continue;
            BigDecimal quantity = scale4(request.quantity());
            if (quantity.compareTo(BigDecimal.ZERO) <= 0) continue;
            quantities.merge(request.lineId(), quantity, BigDecimal::add);
        }
        if (quantities.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "At least one received quantity must be greater than zero.");
        for (Map.Entry<Long, BigDecimal> entry : quantities.entrySet()) {
            ConsumablePurchaseOrderLine line = byId.get(entry.getKey());
            if (line == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Purchase-order line not found.");
            BigDecimal remaining = nz(line.getOrderedQuantity()).subtract(nz(line.getReceivedQuantity()));
            if (entry.getValue().compareTo(remaining) > 0) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Received quantity exceeds the remaining ordered quantity for " + line.getItemNameSnapshot() + ".");
            }
        }

        ConsumablePurchaseOrderReceipt receipt = new ConsumablePurchaseOrderReceipt();
        receipt.setCompany(me.getCompany());
        receipt.setPurchaseOrder(po);
        receipt.setIdempotencyKey(key);
        receipt.setReceivedAt(Instant.now());
        receipt.setNote(blankToNull(req.note()));
        receipt.setCreatedBy(me);
        receipt = purchaseOrderReceipts.saveAndFlush(receipt);

        for (Map.Entry<Long, BigDecimal> entry : quantities.entrySet()) {
            ConsumablePurchaseOrderLine line = byId.get(entry.getKey());
            BigDecimal quantity = entry.getValue().setScale(4, RoundingMode.HALF_UP);
            ConsumablePurchaseOrderReceiptLine receiptLine = new ConsumablePurchaseOrderReceiptLine();
            receiptLine.setCompany(me.getCompany());
            receiptLine.setReceipt(receipt);
            receiptLine.setPurchaseOrderLine(line);
            receiptLine.setQuantity(quantity);
            purchaseOrderReceiptLines.save(receiptLine);

            createPurchaseReceiptMovement(me, line.getConsumable(), po.getLocation(), receipt.getId(), quantity, nz(line.getUnitPrice()), po.getOrderNumber());
            line.setReceivedQuantity(nz(line.getReceivedQuantity()).add(quantity).setScale(4, RoundingMode.HALF_UP));
            purchaseOrderLines.save(line);
        }

        recalculatePurchaseOrderTotals(po);
        boolean allReceived = lines.stream().allMatch(line -> nz(line.getReceivedQuantity()).compareTo(nz(line.getOrderedQuantity())) >= 0);
        po.setStatus(allReceived ? PurchaseOrderStatus.COMPLETED : PurchaseOrderStatus.PARTIALLY_RECEIVED);
        return purchaseOrders.save(po);
    }

    private ConsumableStockMovement createPurchaseReceiptMovement(User actor, Consumable item, Location location, Long receiptId, BigDecimal quantity, BigDecimal unitPrice, String orderNumber) {
        ConsumableLocationStock stock = lockStockRow(item, location);
        BigDecimal before = nz(stock.getCurrentStock());
        BigDecimal oldCost = nz(stock.getCostPrice());
        BigDecimal after = before.add(quantity).setScale(4, RoundingMode.HALF_UP);
        BigDecimal weightedCost = after.compareTo(BigDecimal.ZERO) > 0
                ? before.multiply(oldCost).add(quantity.multiply(unitPrice)).divide(after, 4, RoundingMode.HALF_UP)
                : unitPrice.setScale(4, RoundingMode.HALF_UP);
        stock.setCurrentStock(after);
        stock.setCostPrice(weightedCost);
        locationStocks.save(stock);

        ConsumableStockMovement movement = new ConsumableStockMovement();
        movement.setCompany(item.getCompany());
        movement.setConsumable(item);
        movement.setLocation(location);
        movement.setMovementType(StockMovementType.PURCHASE);
        movement.setSourceType(StockMovementSourceType.PURCHASE_ORDER);
        movement.setSourceId(receiptId);
        movement.setQuantityDelta(quantity.setScale(4, RoundingMode.HALF_UP));
        movement.setStockBefore(before);
        movement.setStockAfter(after);
        movement.setUnitCostSnapshot(unitPrice.setScale(4, RoundingMode.HALF_UP));
        movement.setValueDelta(quantity.multiply(unitPrice).setScale(4, RoundingMode.HALF_UP));
        movement.setNote("Prejem naročilnice " + defaultString(orderNumber, ""));
        movement.setCreatedBy(actor);
        return movements.save(movement);
    }

    private void recalculatePurchaseOrderTotals(ConsumablePurchaseOrder po) {
        if (po == null || po.getId() == null) return;
        List<ConsumablePurchaseOrderLine> lines = purchaseOrderLines.findByCompanyIdAndPurchaseOrderId(po.getCompany().getId(), po.getId());
        BigDecimal total = BigDecimal.ZERO;
        BigDecimal received = BigDecimal.ZERO;
        for (ConsumablePurchaseOrderLine line : lines) {
            BigDecimal factor = BigDecimal.ONE.add((line.getVatRate() == null ? TaxRate.NO_VAT : line.getVatRate()).multiplier);
            total = total.add(nz(line.getOrderedQuantity()).multiply(nz(line.getUnitPrice())).multiply(factor));
            received = received.add(nz(line.getReceivedQuantity()).multiply(nz(line.getUnitPrice())).multiply(factor));
        }
        po.setTotalAmount(total.setScale(4, RoundingMode.HALF_UP));
        po.setReceivedAmount(received.setScale(4, RoundingMode.HALF_UP));
    }

    private static BigDecimal scale4(BigDecimal value) {
        return (value == null ? BigDecimal.ZERO : value).setScale(4, RoundingMode.HALF_UP);
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
