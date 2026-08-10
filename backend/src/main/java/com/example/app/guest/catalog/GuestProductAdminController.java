package com.example.app.guest.catalog;

import com.example.app.commerce.CommerceLocationScopeService;

import com.example.app.activitylog.ActivityAction;
import com.example.app.activitylog.ActivityDetails;
import com.example.app.activitylog.ActivityLogService;
import com.example.app.activitylog.ActivityModule;
import com.example.app.course.Course;
import com.example.app.course.CourseRepository;
import com.example.app.course.MembershipCourse;
import com.example.app.course.MembershipCourseRepository;
import com.example.app.guest.model.GuestEntitlementRepository;
import com.example.app.guest.model.GuestOrderItemRepository;
import com.example.app.guest.model.GuestProduct;
import com.example.app.billing.TransactionService;
import com.example.app.billing.TransactionServiceRepository;
import com.example.app.guest.model.GuestProductRepository;
import com.example.app.billing.PriceMath;
import com.example.app.guest.model.ProductType;
import com.example.app.guest.model.VoucherRedemptionMode;
import com.example.app.guest.model.VoucherServiceScope;
import com.example.app.session.SessionType;
import com.example.app.session.SessionTypeRepository;
import com.example.app.session.ServiceGroup;
import com.example.app.session.ServiceGroupRepository;
import com.example.app.session.TypeTransactionService;
import com.example.app.settings.CourseModuleAccessService;
import com.example.app.settings.EntitlementsModuleAccessService;
import com.example.app.settings.BillingModuleAccessService;
import com.example.app.user.User;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/guest/admin/products")
@PreAuthorize("hasRole('ADMIN')")
public class GuestProductAdminController {
    private final GuestProductRepository products;
    private final SessionTypeRepository sessionTypes;
    private final TransactionServiceRepository transactionServices;
    private final GuestOrderItemRepository orderItems;
    private final GuestEntitlementRepository entitlements;
    private final CourseRepository courses;
    private final MembershipCourseRepository membershipCourses;
    private final CourseModuleAccessService courseModuleAccessService;
    private final BillingModuleAccessService billingModuleAccessService;

    @Autowired(required = false)
    private ActivityLogService activityLogs;

    @Autowired(required = false)
    private CommerceLocationScopeService commerceLocations;

    @Autowired(required = false)
    private EntitlementsModuleAccessService entitlementsModuleAccessService;

    @Autowired(required = false)
    private ServiceGroupRepository serviceGroups;

    @Autowired
    public GuestProductAdminController(
            GuestProductRepository products,
            SessionTypeRepository sessionTypes,
            TransactionServiceRepository transactionServices,
            GuestOrderItemRepository orderItems,
            GuestEntitlementRepository entitlements,
            CourseRepository courses,
            MembershipCourseRepository membershipCourses,
            CourseModuleAccessService courseModuleAccessService,
            BillingModuleAccessService billingModuleAccessService
    ) {
        this.products = products;
        this.sessionTypes = sessionTypes;
        this.transactionServices = transactionServices;
        this.orderItems = orderItems;
        this.entitlements = entitlements;
        this.courses = courses;
        this.membershipCourses = membershipCourses;
        this.courseModuleAccessService = courseModuleAccessService;
        this.billingModuleAccessService = billingModuleAccessService;
    }

    /** Backwards-compatible constructor for older unit tests. Runtime wiring uses the @Autowired constructor above. */
    public GuestProductAdminController(
            GuestProductRepository products,
            SessionTypeRepository sessionTypes,
            TransactionServiceRepository transactionServices,
            GuestOrderItemRepository orderItems,
            GuestEntitlementRepository entitlements,
            CourseRepository courses,
            MembershipCourseRepository membershipCourses
    ) {
        this(products, sessionTypes, transactionServices, orderItems, entitlements, courses, membershipCourses, null, null);
    }

    @GetMapping
    @Transactional(readOnly = true)
    public List<ProductAdminResponse> list(@AuthenticationPrincipal User me) {
        Long companyId = me.getCompany().getId();
        assertEntitlementsEnabled(companyId);
        boolean giftCardsEnabled = giftCardsEnabled(companyId);
        return products.findAllByCompanyIdOrderBySortOrderAscIdAsc(companyId).stream()
                .filter(product -> product.getCourse() == null)
                .filter(product -> giftCardsEnabled || product.getProductType() != ProductType.GIFT_CARD)
                .map(this::toResponse)
                .toList();
    }

    @PostMapping
    @Transactional
    public ProductAdminResponse create(@RequestBody ProductAdminRequest request, @AuthenticationPrincipal User me) {
        assertEntitlementsEnabled(me.getCompany().getId());
        GuestProduct product = new GuestProduct();
        product.setCompany(me.getCompany());
        apply(product, request, me);
        product = products.save(product);
        syncMembershipCourses(product, request.includedCourseIds(), me.getCompany().getId());
        ProductAdminResponse result = toResponse(product);
        recordProduct(me, ActivityAction.PRODUCT_CREATED, result, "Created card/membership product");
        return result;
    }

    @PutMapping("/{id}")
    @Transactional
    public ProductAdminResponse update(@PathVariable Long id, @RequestBody ProductAdminRequest request, @AuthenticationPrincipal User me) {
        assertEntitlementsEnabled(me.getCompany().getId());
        GuestProduct product = products.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Product not found."));
        apply(product, request, me);
        product = products.save(product);
        syncMembershipCourses(product, request.includedCourseIds(), me.getCompany().getId());
        ProductAdminResponse result = toResponse(product);
        recordProduct(me, ActivityAction.PRODUCT_UPDATED, result, "Updated card/membership product");
        return result;
    }

    @DeleteMapping("/{id}")
    @Transactional
    public void delete(@PathVariable Long id, @AuthenticationPrincipal User me) {
        assertEntitlementsEnabled(me.getCompany().getId());
        GuestProduct product = products.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Product not found."));
        if (orderItems.countByProductId(product.getId()) > 0 || entitlements.countByProductId(product.getId()) > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This card already has orders or entitlements. Archive it instead of deleting it.");
        }
        Long deletedId = product.getId();
        String deletedName = product.getName();
        String deletedType = product.getProductType() == null ? null : product.getProductType().name();
        membershipCourses.deleteAllByMembershipProductIdAndCompanyId(product.getId(), me.getCompany().getId());
        products.delete(product);
        if (activityLogs != null) {
            activityLogs.recordUser(me, ActivityModule.SERVICES, ActivityAction.PRODUCT_DELETED,
                    "GUEST_PRODUCT", deletedId, deletedName, "Deleted card/membership product", null, null,
                    ActivityDetails.of("productType", deletedType, "targetPath", "/session-types?subtab=cards-memberships"));
        }
    }

    private void assertEntitlementsEnabled(Long companyId) {
        if (entitlementsModuleAccessService != null) {
            entitlementsModuleAccessService.assertEnabled(companyId);
        }
    }

    private void recordProduct(User me, ActivityAction action, ProductAdminResponse row, String summary) {
        if (activityLogs == null || row == null) return;
        activityLogs.recordUser(me, ActivityModule.SERVICES, action,
                "GUEST_PRODUCT", row.id(), row.name(), summary, null, null,
                ActivityDetails.of("productType", row.productType(), "priceGross", row.priceGross(), "currency", row.currency(),
                        "sessionTypeIds", row.sessionTypeIds(), "serviceGroupId", row.serviceGroupId(),
                        "transactionServiceId", row.transactionServiceId(),
                        "voucherRedemptionMode", row.voucherRedemptionMode(), "voucherServiceScope", row.voucherServiceScope(),
                        "availableAllLocations", row.availableAllLocations(), "locationIds", row.locationIds(),
                        "active", row.active(), "guestVisible", row.guestVisible(), "targetPath", "/session-types?subtab=cards-memberships"));
    }

    private void apply(GuestProduct product, ProductAdminRequest request, User me) {
        String name = String.valueOf(request.name() == null ? "" : request.name()).trim();
        if (name.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name is required.");
        }
        ProductType productType = parseProductType(request.productType());
        BigDecimal priceGross = request.priceGross() == null ? null : request.priceGross().setScale(2, RoundingMode.HALF_UP);
        if (priceGross == null || priceGross.compareTo(BigDecimal.ZERO) < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Price must be zero or greater.");
        }

        Long companyId = me.getCompany().getId();
        if (productType == ProductType.GIFT_CARD) {
            assertGiftCardsEnabled(companyId);
        }
        ServiceGroup serviceGroup = productType == ProductType.GIFT_CARD
                ? null
                : resolveServiceGroup(request.serviceGroupId(), companyId);
        Set<SessionType> eligibleSessionTypes = productType == ProductType.GIFT_CARD
                ? Set.of()
                : serviceGroup != null
                    ? new LinkedHashSet<>(sessionTypes.findAllByCompanyIdAndServiceGroupId(companyId, serviceGroup.getId()))
                    : resolveProductSessionTypes(request.sessionTypeIds(), request.sessionTypeId(), companyId);
        SessionType sessionType = eligibleSessionTypes.stream().findFirst().orElse(null);
        // Invoice accounting is intentionally independent from the services on which the
        // entitlement may be redeemed. Historical rows without a transaction service keep
        // working through billing fallbacks, while the admin UI requires one for new saves.
        TransactionService transactionService = request.transactionServiceId() == null && product.getId() != null
                ? product.getTransactionService()
                : resolveTransactionService(request.transactionServiceId(), companyId);
        if (product.getId() == null && transactionService == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invoice line item is required.");
        }
        VoucherRedemptionMode voucherRedemptionMode = productType == ProductType.GIFT_CARD
                ? parseVoucherRedemptionMode(request.voucherRedemptionMode())
                : null;
        VoucherServiceScope voucherServiceScope = productType == ProductType.GIFT_CARD
                ? parseVoucherServiceScope(request.voucherServiceScope())
                : null;
        Set<SessionType> voucherSessionTypes = productType == ProductType.GIFT_CARD
                && voucherServiceScope == VoucherServiceScope.SELECTED_SERVICES
                ? resolveVoucherSessionTypes(request.voucherSessionTypeIds(), companyId)
                : Set.of();
        if (productType == ProductType.GIFT_CARD
                && voucherServiceScope == VoucherServiceScope.SELECTED_SERVICES
                && voucherSessionTypes.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected-service vouchers must include at least one service.");
        }
        BigDecimal voucherFaceValueGross = null;
        if (productType == ProductType.GIFT_CARD && voucherRedemptionMode == VoucherRedemptionMode.VALUE) {
            voucherFaceValueGross = request.voucherFaceValueGross() == null
                    ? priceGross
                    : request.voucherFaceValueGross().setScale(2, RoundingMode.HALF_UP);
            if (voucherFaceValueGross.compareTo(BigDecimal.ZERO) <= 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Voucher value must be greater than zero.");
            }
        }
        // Entitlements are wallet products only. Booking-slot selection is handled by
        // session/widget products, not by purchased wallet products.
        boolean bookable = false;
        if (productType == ProductType.CLASS_TICKET && eligibleSessionTypes.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Class tickets must be linked to at least one service type.");
        }
        if (productType == ProductType.PACK && eligibleSessionTypes.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tickets must be linked to at least one service type.");
        }
        if (productType == ProductType.COURSE && eligibleSessionTypes.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Course access entitlements must be linked to at least one service type.");
        }

        Integer usageLimit = (productType == ProductType.CLASS_TICKET || productType == ProductType.MEMBERSHIP || productType == ProductType.GIFT_CARD || productType == ProductType.COURSE)
                ? Integer.valueOf(1)
                : normalizePositiveInteger(request.usageLimit(), "Usage limit");
        if (productType == ProductType.PACK && (usageLimit == null || usageLimit < 1)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ticket quantity must be at least 1.");
        }
        if (productType == ProductType.COURSE && (request.includedCourseIds() == null || request.includedCourseIds().isEmpty())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Course access entitlements must include at least one course.");
        }
        if ((productType == ProductType.COURSE || productType == ProductType.MEMBERSHIP)
                && request.includedCourseIds() != null
                && !request.includedCourseIds().isEmpty()) {
            assertCoursesEnabled(companyId);
        }
        if (serviceGroup == null) {
            validatePackOrClassPriceGross(productType, eligibleSessionTypes, usageLimit, priceGross);
        }

        Integer validityDays = productType == ProductType.COURSE ? null : normalizePositiveInteger(request.validityDays(), "Validity days");
        if (productType == ProductType.GIFT_CARD && validityDays == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Vouchers must have an expiry date.");
        }
        boolean autoRenews = productType == ProductType.MEMBERSHIP && Boolean.TRUE.equals(request.autoRenews());
        boolean nextActive = request.active() == null || Boolean.TRUE.equals(request.active());
        if (productType == ProductType.COURSE && nextActive) {
            assertCoursesEnabled(companyId);
        }
        if (product.getId() != null && product.isActive() && !nextActive
                && entitlements.countByProductId(product.getId()) > 0) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "This card or membership already has guest entitlements and cannot be archived."
            );
        }

        boolean availableAllLocations = request.availableAllLocations() == null || Boolean.TRUE.equals(request.availableAllLocations());
        Set<com.example.app.location.Location> selectedLocations = commerceLocations == null
                ? Set.of()
                : commerceLocations.resolveSelectedLocations(companyId, availableAllLocations, request.locationIds(), "Product");
        product.setAvailableAllLocations(availableAllLocations);
        product.getLocations().clear();
        product.getLocations().addAll(selectedLocations);

        product.setName(name);
        product.setDescription(trimToNull(request.description()));
        product.setPromoText(trimToNull(request.promoText()));
        product.setProductType(productType);
        product.setPriceGross(priceGross);
        product.setCurrency(normalizeCurrency(request.currency()));
        product.setSessionType(sessionType);
        product.getEligibleSessionTypes().clear();
        product.getEligibleSessionTypes().addAll(eligibleSessionTypes);
        product.setServiceGroup(serviceGroup);
        product.setTransactionService(transactionService);
        product.setVoucherRedemptionMode(voucherRedemptionMode);
        product.setVoucherServiceScope(voucherServiceScope);
        product.setVoucherFaceValueGross(voucherFaceValueGross);
        product.getVoucherSessionTypes().clear();
        product.getVoucherSessionTypes().addAll(voucherSessionTypes);
        product.setCourse(null);
        product.setActive(nextActive);
        product.setGuestVisible(request.guestVisible() == null || Boolean.TRUE.equals(request.guestVisible()));
        product.setBookable(bookable);
        product.setUsageLimit(usageLimit);
        product.setValidityDays(validityDays);
        product.setAutoRenews(autoRenews);
        product.setSortOrder(request.sortOrder() == null ? 0 : request.sortOrder());
    }

    private void assertCoursesEnabled(Long companyId) {
        if (courseModuleAccessService != null) {
            courseModuleAccessService.assertEnabled(companyId);
        }
    }

    private boolean giftCardsEnabled(Long companyId) {
        return billingModuleAccessService == null || billingModuleAccessService.isGiftCardsEnabled(companyId);
    }

    private void assertGiftCardsEnabled(Long companyId) {
        if (billingModuleAccessService != null) {
            billingModuleAccessService.assertGiftCardsEnabled(companyId);
        }
    }

    private ProductType parseProductType(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Product type is required.");
        }
        try {
            return ProductType.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported product type.");
        }
    }

    private VoucherRedemptionMode parseVoucherRedemptionMode(String raw) {
        if (raw == null || raw.isBlank()) {
            // Backwards compatibility: all historical GIFT_CARD products are monetary vouchers.
            return VoucherRedemptionMode.VALUE;
        }
        try {
            return VoucherRedemptionMode.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported voucher redemption mode.");
        }
    }

    private VoucherServiceScope parseVoucherServiceScope(String raw) {
        if (raw == null || raw.isBlank()) return VoucherServiceScope.ALL_SERVICES;
        try {
            return VoucherServiceScope.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported voucher service scope.");
        }
    }

    private Set<SessionType> resolveVoucherSessionTypes(List<Long> sessionTypeIds, Long companyId) {
        if (sessionTypeIds == null || sessionTypeIds.isEmpty()) return Set.of();
        LinkedHashSet<SessionType> resolved = new LinkedHashSet<>();
        LinkedHashSet<Long> uniqueIds = new LinkedHashSet<>(sessionTypeIds);
        for (Long sessionTypeId : uniqueIds) {
            if (sessionTypeId == null) continue;
            resolved.add(sessionTypes.findByIdAndCompanyId(sessionTypeId, companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected voucher service was not found.")));
        }
        return resolved;
    }

    private Set<SessionType> resolveProductSessionTypes(List<Long> sessionTypeIds, Long legacySessionTypeId, Long companyId) {
        LinkedHashSet<Long> requestedIds = new LinkedHashSet<>();
        if (sessionTypeIds != null) {
            sessionTypeIds.stream().filter(java.util.Objects::nonNull).forEach(requestedIds::add);
        }
        if (requestedIds.isEmpty() && legacySessionTypeId != null) {
            requestedIds.add(legacySessionTypeId);
        }
        LinkedHashSet<SessionType> resolved = new LinkedHashSet<>();
        for (Long id : requestedIds) {
            resolved.add(sessionTypes.findByIdAndCompanyIdWithLinkedServices(id, companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected service type was not found.")));
        }
        return resolved;
    }

    private ServiceGroup resolveServiceGroup(Long serviceGroupId, Long companyId) {
        if (serviceGroupId == null) return null;
        if (serviceGroups == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Service groups are not available.");
        }
        ServiceGroup group = serviceGroups.findById(serviceGroupId)
                .filter(candidate -> candidate.getCompany() != null
                        && java.util.Objects.equals(candidate.getCompany().getId(), companyId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected service group was not found."));
        if (!group.isActive()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected service group is inactive.");
        }
        return group;
    }

    private SessionType resolveSessionType(Long sessionTypeId, Long companyId) {
        if (sessionTypeId == null) return null;
        return sessionTypes.findByIdAndCompanyIdWithLinkedServices(sessionTypeId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected service type was not found."));
    }

    private TransactionService resolveTransactionService(Long transactionServiceId, Long companyId) {
        if (transactionServiceId == null) return null;
        return transactionServices.findByIdAndCompanyId(transactionServiceId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected transaction service was not found."));
    }

    /**
     * Preserve automatic pricing for a single eligible service. When a pass covers several
     * services the selling price is intentionally manual because those services can have
     * different prices while the pass itself has one fixed selling price.
     */
    private static void validatePackOrClassPriceGross(
            ProductType productType,
            Set<SessionType> eligibleSessionTypes,
            Integer usageLimit,
            BigDecimal priceGross
    ) {
        if (productType != ProductType.PACK && productType != ProductType.CLASS_TICKET) {
            return;
        }
        if (eligibleSessionTypes == null || eligibleSessionTypes.size() != 1) {
            return;
        }
        SessionType sessionType = eligibleSessionTypes.iterator().next();
        BigDecimal expected = expectedGuestCardGrossFromSessionType(sessionType, productType, usageLimit);
        if (expected == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "The service type must have at least one transaction service line with a price.");
        }
        if (priceGross.subtract(expected).abs().compareTo(new BigDecimal("0.01")) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Price gross must match the configured transaction services for this service type (expected " + expected + ").");
        }
    }

    private static BigDecimal expectedGuestCardGrossFromSessionType(
            SessionType sessionType,
            ProductType productType,
            Integer usageLimit
    ) {
        if (sessionType == null || sessionType.getLinkedServices() == null || sessionType.getLinkedServices().isEmpty()) {
            return null;
        }
        BigDecimal unitSum = BigDecimal.ZERO;
        for (TypeTransactionService link : sessionType.getLinkedServices()) {
            var tx = link.getTransactionService();
            if (tx == null) {
                return null;
            }
            BigDecimal effectiveNet = link.getPrice() != null ? link.getPrice() : tx.getNetPrice();
            BigDecimal unitGross = PriceMath.unitGrossFromNet(effectiveNet, tx.getTaxRate());
            if (unitGross == null) {
                return null;
            }
            unitSum = unitSum.add(unitGross);
        }
        int factor = productType == ProductType.CLASS_TICKET ? 1 : usageLimit;
        return unitSum.multiply(BigDecimal.valueOf(factor)).setScale(2, RoundingMode.HALF_UP);
    }

    private Integer normalizePositiveInteger(Integer value, String label) {
        if (value == null || value <= 0) return null;
        if (value > 100000) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, label + " is too large.");
        }
        return value;
    }

    private void syncMembershipCourses(GuestProduct product, List<Long> includedCourseIds, Long companyId) {
        boolean supportsCourseAccess = product.getProductType() == ProductType.MEMBERSHIP || product.getProductType() == ProductType.COURSE;
        if (!supportsCourseAccess) {
            if (product.getId() != null) {
                membershipCourses.deleteAllByMembershipProductIdAndCompanyId(product.getId(), companyId);
            }
            return;
        }
        membershipCourses.deleteAllByMembershipProductIdAndCompanyId(product.getId(), companyId);
        if (includedCourseIds == null || includedCourseIds.isEmpty()) return;
        Set<Long> uniqueIds = new LinkedHashSet<>(includedCourseIds);
        for (Long courseId : uniqueIds) {
            if (courseId == null) continue;
            Course course = courses.findByIdAndCompanyId(courseId, companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected course was not found."));
            MembershipCourse row = new MembershipCourse();
            row.setCompany(product.getCompany());
            row.setMembershipProduct(product);
            row.setCourse(course);
            membershipCourses.save(row);
        }
    }

    private String normalizeCurrency(String raw) {
        String currency = trimToNull(raw);
        String normalized = currency == null ? "EUR" : currency.toUpperCase(Locale.ROOT);
        if (normalized.length() != 3) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Currency must be a 3-letter code.");
        }
        return normalized;
    }

    private static String trimToNull(String raw) {
        if (raw == null) return null;
        String trimmed = raw.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private List<Long> includedCourseIds(GuestProduct product) {
        if (product == null || product.getId() == null || (product.getProductType() != ProductType.MEMBERSHIP && product.getProductType() != ProductType.COURSE)) {
            return List.of();
        }
        Long companyId = product.getCompany() == null ? null : product.getCompany().getId();
        if (companyId == null) return List.of();
        return membershipCourses.findAllByMembershipProductIdAndCompanyIdOrderByCourseTitleAsc(product.getId(), companyId).stream()
                .map(row -> row.getCourse().getId())
                .toList();
    }

    private ProductAdminResponse toResponse(GuestProduct product) {
        return new ProductAdminResponse(
                product.getId(),
                product.getName(),
                product.getDescription(),
                product.getPromoText(),
                product.getProductType().name(),
                product.getPriceGross(),
                product.getCurrency(),
                product.isActive(),
                product.isGuestVisible(),
                product.isBookable(),
                product.getUsageLimit(),
                product.getValidityDays(),
                product.isAutoRenews(),
                product.getSortOrder(),
                product.getSessionType() == null ? null : product.getSessionType().getId(),
                product.getSessionType() == null ? null : product.getSessionType().getName(),
                product.getEligibleSessionTypes().stream().map(SessionType::getId).toList(),
                product.getEligibleSessionTypes().stream().map(SessionType::getName).toList(),
                product.getServiceGroup() == null ? null : product.getServiceGroup().getId(),
                product.getServiceGroup() == null ? null : product.getServiceGroup().getName(),
                product.getTransactionService() == null ? null : product.getTransactionService().getId(),
                product.getTransactionService() == null ? null : product.getTransactionService().getCode(),
                product.getTransactionService() == null ? null : product.getTransactionService().getDescription(),
                includedCourseIds(product),
                product.getVoucherRedemptionMode() == null ? null : product.getVoucherRedemptionMode().name(),
                product.getVoucherServiceScope() == null ? null : product.getVoucherServiceScope().name(),
                product.getVoucherFaceValueGross(),
                product.getVoucherSessionTypes().stream().map(SessionType::getId).toList(),
                product.getVoucherSessionTypes().stream().map(SessionType::getName).toList(),
                product.isAvailableAllLocations(),
                commerceLocations == null ? List.of() : commerceLocations.locationIds(product),
                commerceLocations == null ? List.of() : commerceLocations.locationNames(product),
                product.getCreatedAt(),
                product.getUpdatedAt()
        );
    }

    public record ProductAdminRequest(
            String name,
            String description,
            /** Short badge label shown on the guest Buy card (e.g. "Best value"). */
            String promoText,
            String productType,
            BigDecimal priceGross,
            String currency,
            Boolean active,
            Boolean guestVisible,
            Boolean bookable,
            Integer usageLimit,
            Integer validityDays,
            Boolean autoRenews,
            Integer sortOrder,
            Long sessionTypeId,
            List<Long> sessionTypeIds,
            Long serviceGroupId,
            Long transactionServiceId,
            List<Long> includedCourseIds,
            String voucherRedemptionMode,
            String voucherServiceScope,
            BigDecimal voucherFaceValueGross,
            List<Long> voucherSessionTypeIds,
            Boolean availableAllLocations,
            List<Long> locationIds
    ) {
        /** Backwards-compatible constructor retained for existing tests and callers. */
        public ProductAdminRequest(
                String name,
                String description,
                String promoText,
                String productType,
                BigDecimal priceGross,
                String currency,
                Boolean active,
                Boolean guestVisible,
                Boolean bookable,
                Integer usageLimit,
                Integer validityDays,
                Boolean autoRenews,
                Integer sortOrder,
                Long sessionTypeId,
                Long transactionServiceId,
                List<Long> includedCourseIds
        ) {
            this(name, description, promoText, productType, priceGross, currency, active, guestVisible,
                    bookable, usageLimit, validityDays, autoRenews, sortOrder, sessionTypeId,
                    null, null, transactionServiceId, includedCourseIds, null, null, null, null, null, null);
        }
    }

    public record ProductAdminResponse(
            Long id,
            String name,
            String description,
            String promoText,
            String productType,
            BigDecimal priceGross,
            String currency,
            boolean active,
            boolean guestVisible,
            boolean bookable,
            Integer usageLimit,
            Integer validityDays,
            boolean autoRenews,
            int sortOrder,
            Long sessionTypeId,
            String sessionTypeName,
            List<Long> sessionTypeIds,
            List<String> sessionTypeNames,
            Long serviceGroupId,
            String serviceGroupName,
            Long transactionServiceId,
            String transactionServiceCode,
            String transactionServiceDescription,
            List<Long> includedCourseIds,
            String voucherRedemptionMode,
            String voucherServiceScope,
            BigDecimal voucherFaceValueGross,
            List<Long> voucherSessionTypeIds,
            List<String> voucherSessionTypeNames,
            boolean availableAllLocations,
            List<Long> locationIds,
            List<String> locationNames,
            Instant createdAt,
            Instant updatedAt
    ) {}
}
