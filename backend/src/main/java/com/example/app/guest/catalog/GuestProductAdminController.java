package com.example.app.guest.catalog;

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
import com.example.app.session.SessionType;
import com.example.app.session.SessionTypeRepository;
import com.example.app.session.TypeTransactionService;
import com.example.app.settings.CourseModuleAccessService;
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
        GuestProduct product = new GuestProduct();
        product.setCompany(me.getCompany());
        apply(product, request, me);
        product = products.save(product);
        syncMembershipCourses(product, request.includedCourseIds(), me.getCompany().getId());
        return toResponse(product);
    }

    @PutMapping("/{id}")
    @Transactional
    public ProductAdminResponse update(@PathVariable Long id, @RequestBody ProductAdminRequest request, @AuthenticationPrincipal User me) {
        GuestProduct product = products.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Product not found."));
        apply(product, request, me);
        product = products.save(product);
        syncMembershipCourses(product, request.includedCourseIds(), me.getCompany().getId());
        return toResponse(product);
    }

    @DeleteMapping("/{id}")
    @Transactional
    public void delete(@PathVariable Long id, @AuthenticationPrincipal User me) {
        GuestProduct product = products.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Product not found."));
        if (orderItems.countByProductId(product.getId()) > 0 || entitlements.countByProductId(product.getId()) > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This card already has orders or entitlements. Archive it instead of deleting it.");
        }
        membershipCourses.deleteAllByMembershipProductIdAndCompanyId(product.getId(), me.getCompany().getId());
        products.delete(product);
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
        SessionType sessionType = productType == ProductType.GIFT_CARD
                ? null
                : resolveSessionType(request.sessionTypeId(), companyId);
        TransactionService transactionService = productType == ProductType.GIFT_CARD
                ? resolveTransactionService(request.transactionServiceId(), companyId)
                : null;
        // Entitlements are wallet products only. Booking-slot selection is handled by
        // session/widget products, not by purchased wallet products.
        boolean bookable = false;
        if (productType == ProductType.CLASS_TICKET && sessionType == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Class tickets must be linked to a service type.");
        }
        if (productType == ProductType.PACK && sessionType == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tickets must be linked to a service type.");
        }
        if (productType == ProductType.COURSE && sessionType == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Course access entitlements must be linked to a service type.");
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
        validatePackOrClassPriceGross(productType, sessionType, usageLimit, priceGross);

        Integer validityDays = productType == ProductType.COURSE ? null : normalizePositiveInteger(request.validityDays(), "Validity days");
        if (productType == ProductType.GIFT_CARD && validityDays == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Gift cards must have an expiry date.");
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

        product.setName(name);
        product.setDescription(trimToNull(request.description()));
        product.setPromoText(trimToNull(request.promoText()));
        product.setProductType(productType);
        product.setPriceGross(priceGross);
        product.setCurrency(normalizeCurrency(request.currency()));
        product.setSessionType(sessionType);
        product.setTransactionService(transactionService);
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

    /** PACK / CLASS_TICKET price must equal sum(link unit gross) × usage (usage 1 for class). */
    private static void validatePackOrClassPriceGross(
            ProductType productType,
            SessionType sessionType,
            Integer usageLimit,
            BigDecimal priceGross
    ) {
        if (productType != ProductType.PACK && productType != ProductType.CLASS_TICKET) {
            return;
        }
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
                product.getTransactionService() == null ? null : product.getTransactionService().getId(),
                product.getTransactionService() == null ? null : product.getTransactionService().getCode(),
                product.getTransactionService() == null ? null : product.getTransactionService().getDescription(),
                includedCourseIds(product),
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
            Long transactionServiceId,
            List<Long> includedCourseIds
    ) {}

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
            Long transactionServiceId,
            String transactionServiceCode,
            String transactionServiceDescription,
            List<Long> includedCourseIds,
            Instant createdAt,
            Instant updatedAt
    ) {}
}
