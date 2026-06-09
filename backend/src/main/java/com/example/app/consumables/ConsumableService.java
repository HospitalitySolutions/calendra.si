package com.example.app.consumables;

import com.example.app.common.TimeService;
import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.consumables.ConsumableEnums.PurchaseOrderStatus;
import com.example.app.consumables.ConsumableEnums.QuantityMode;
import com.example.app.consumables.ConsumableEnums.StockMovementSourceType;
import com.example.app.consumables.ConsumableEnums.StockMovementType;
import com.example.app.consumables.ConsumableEnums.SupplierStatus;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.SessionBookingStatus;
import com.example.app.session.SessionType;
import com.example.app.session.SessionTypeRepository;
import com.example.app.user.User;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
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
    private final ConsumableRepository consumables;
    private final ConsumableCategoryRepository categories;
    private final ConsumableStockMovementRepository movements;
    private final ServiceTypeConsumableRepository serviceTypeConsumables;
    private final SessionConsumableRepository sessionConsumables;
    private final SessionTypeRepository sessionTypes;
    private final SessionBookingRepository bookings;
    private final ConsumableSupplierRepository suppliers;
    private final ConsumablePurchaseOrderRepository purchaseOrders;
    private final TimeService timeService;

    public ConsumableService(
            CompanyRepository companies,
            ConsumableRepository consumables,
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
        this.consumables = consumables;
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
    public List<Consumable> listItems(Long companyId) {
        return consumables.findAllForCompany(companyId);
    }

    @Transactional
    public Consumable createItem(User me, ConsumableController.ItemRequest req) {
        var item = new Consumable();
        item.setCompany(requireCompany(me.getCompany().getId()));
        applyItemRequest(item, req, me.getCompany().getId());
        return consumables.save(item);
    }

    @Transactional
    public Consumable updateItem(User me, Long id, ConsumableController.ItemRequest req) {
        var item = consumables.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        applyItemRequest(item, req, me.getCompany().getId());
        return consumables.save(item);
    }

    private void applyItemRequest(Consumable item, ConsumableController.ItemRequest req, Long companyId) {
        if (req == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Request is required.");
        String name = trim(req.name());
        if (name == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name is required.");
        item.setName(name);
        item.setDescription(trim(req.description()));
        item.setSku(blankToNull(req.sku()));
        item.setBarcode(blankToNull(req.barcode()));
        item.setUnit(defaultString(req.unit(), "kos"));
        item.setLocation(blankToNull(req.location()));
        item.setMinimumStock(nonNegative(req.minimumStock()));
        item.setCostPrice(nonNegative(req.costPrice()));
        item.setSalePrice(req.salePrice() != null ? nonNegative(req.salePrice()) : null);
        item.setVatRateId(req.vatRateId());
        item.setTrackStock(req.trackStock() == null || Boolean.TRUE.equals(req.trackStock()));
        item.setBillable(Boolean.TRUE.equals(req.billable()));
        item.setActive(req.active() == null || Boolean.TRUE.equals(req.active()));
        if (req.currentStock() != null) {
            item.setCurrentStock(nonNegative(req.currentStock()));
        }
        if (req.categoryId() == null || req.categoryId() <= 0) {
            item.setCategory(null);
        } else {
            item.setCategory(categories.findByIdAndCompanyId(req.categoryId(), companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Category not found.")));
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
        var item = consumables.findByIdAndCompanyId(consumableId, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        BigDecimal delta = req != null ? nz(req.quantityDelta()) : BigDecimal.ZERO;
        if (delta.compareTo(BigDecimal.ZERO) == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Quantity delta must not be zero.");
        }
        StockMovementType type = req != null && req.movementType() != null ? req.movementType() : StockMovementType.CORRECTION;
        return createMovement(me, item, type, StockMovementSourceType.MANUAL, null, delta, req != null ? req.note() : null);
    }

    @Transactional
    public ConsumableStockMovement createMovement(User actor, Consumable item, StockMovementType type, StockMovementSourceType sourceType, Long sourceId, BigDecimal delta, String note) {
        if (item == null || item.getCompany() == null || item.getCompany().getId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Consumable is required.");
        }
        if (delta == null || delta.compareTo(BigDecimal.ZERO) == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Quantity delta must not be zero.");
        }
        BigDecimal before = nz(item.getCurrentStock());
        BigDecimal after = before.add(delta).setScale(4, RoundingMode.HALF_UP);
        if (item.isTrackStock() && after.compareTo(BigDecimal.ZERO) < 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Not enough stock for " + item.getName() + ".");
        }
        item.setCurrentStock(after);
        consumables.save(item);

        var movement = new ConsumableStockMovement();
        movement.setCompany(item.getCompany());
        movement.setConsumable(item);
        movement.setMovementType(type != null ? type : StockMovementType.CORRECTION);
        movement.setSourceType(sourceType != null ? sourceType : StockMovementSourceType.MANUAL);
        movement.setSourceId(sourceId);
        movement.setQuantityDelta(delta.setScale(4, RoundingMode.HALF_UP));
        movement.setStockBefore(before.setScale(4, RoundingMode.HALF_UP));
        movement.setStockAfter(after.setScale(4, RoundingMode.HALF_UP));
        movement.setUnitCostSnapshot(nz(item.getCostPrice()));
        movement.setValueDelta(delta.multiply(nz(item.getCostPrice())).setScale(4, RoundingMode.HALF_UP));
        movement.setNote(blankToNull(note));
        movement.setCreatedBy(actor);
        return movements.save(movement);
    }

    @Transactional(readOnly = true)
    public List<ConsumableStockMovement> listMovements(Long companyId) {
        return movements.findAllForCompany(companyId);
    }

    @Transactional(readOnly = true)
    public ConsumableController.OverviewResponse overview(Long companyId) {
        var items = consumables.findAllForCompany(companyId);
        var low = items.stream().filter(Consumable::isActive).filter(Consumable::isTrackStock)
                .filter(item -> nz(item.getCurrentStock()).compareTo(nz(item.getMinimumStock())) < 0)
                .toList();
        var thirtyDaysAgo = timeService.instant(companyId).minus(30, ChronoUnit.DAYS);
        var recent = movements.findAllForCompanySince(companyId, thirtyDaysAgo);
        BigDecimal totalValue = items.stream()
                .filter(Consumable::isActive)
                .map(item -> nz(item.getCurrentStock()).multiply(nz(item.getCostPrice())))
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
        return new ConsumableController.OverviewResponse(
                items.stream().filter(Consumable::isActive).count(),
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
            if (manuallyChanged) {
                return existing;
            }
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
            row.setCostPriceSnapshot(nz(item.getCostPrice()));
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
                row.setCostPriceSnapshot(nz(item.getCostPrice()));
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
        String key = groupKey(representative);
        boolean checkedOut = rows.stream().anyMatch(row -> SessionBookingStatus.CHECKED_OUT.equals(SessionBookingStatus.normalizeStored(row.getBookingStatus())));
        boolean previouslyCheckedOut = previousStatuses != null && previousStatuses.values().stream()
                .anyMatch(s -> SessionBookingStatus.CHECKED_OUT.equals(SessionBookingStatus.normalizeStored(s)));
        if (checkedOut && !previouslyCheckedOut) {
            ensureSessionDefaultsForBookings(rows, companyId);
            var sessionRows = sessionConsumables.findByCompanyIdAndBookingGroupKey(companyId, key);
            for (var sc : sessionRows) {
                if (sc.getConsumable().isTrackStock() && nz(sc.getQuantity()).compareTo(BigDecimal.ZERO) > 0) {
                    if (!movements.existsByCompanyIdAndMovementTypeAndSourceTypeAndSourceId(companyId, StockMovementType.SESSION_USAGE, StockMovementSourceType.SESSION, sc.getId())) {
                        createMovement(actor, sc.getConsumable(), StockMovementType.SESSION_USAGE, StockMovementSourceType.SESSION, sc.getId(), nz(sc.getQuantity()).negate(), "Session usage: " + key);
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
            var usedMovements = movements.findByCompanyIdAndMovementTypeAndSourceTypeAndSourceId(companyId, StockMovementType.SESSION_USAGE, StockMovementSourceType.SESSION, sc.getId());
            for (var used : usedMovements) {
                BigDecimal reverse = nz(used.getQuantityDelta()).negate();
                if (reverse.compareTo(BigDecimal.ZERO) != 0) {
                    createMovement(actor, used.getConsumable(), StockMovementType.RETURN, StockMovementSourceType.SESSION, sc.getId(), reverse, "Reverse session usage: " + groupKey);
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
        String name = trim(req != null ? req.name() : null);
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
    public List<ConsumablePurchaseOrder> listPurchaseOrders(Long companyId) {
        return purchaseOrders.findByCompanyId(companyId);
    }

    @Transactional
    public ConsumablePurchaseOrder savePurchaseOrder(User me, Long id, ConsumableController.PurchaseOrderRequest req) {
        if (req == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Request is required.");
        var po = id == null
                ? new ConsumablePurchaseOrder()
                : purchaseOrders.findByIdAndCompanyId(id, me.getCompany().getId()).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (id == null) po.setCompany(requireCompany(me.getCompany().getId()));
        po.setOrderNumber(blankToNull(req.orderNumber()) != null ? req.orderNumber().trim() : generateOrderNumber());
        po.setStatus(req.status() != null ? req.status() : PurchaseOrderStatus.DRAFT);
        po.setOrderDate(req.orderDate() != null ? req.orderDate() : timeService.localDate());
        po.setExpectedDate(req.expectedDate());
        po.setTotalAmount(nz(req.totalAmount()));
        po.setReceivedAmount(nz(req.receivedAmount()));
        po.setNotes(blankToNull(req.notes()));
        if (req.supplierId() != null && req.supplierId() > 0) {
            po.setSupplier(suppliers.findByIdAndCompanyId(req.supplierId(), me.getCompany().getId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Supplier not found.")));
        } else {
            po.setSupplier(null);
        }
        return purchaseOrders.save(po);
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

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v.setScale(4, RoundingMode.HALF_UP);
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
