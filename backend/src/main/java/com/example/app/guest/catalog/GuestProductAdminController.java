package com.example.app.guest.catalog;

import com.example.app.guest.model.GuestEntitlementRepository;
import com.example.app.guest.model.GuestOrderItemRepository;
import com.example.app.guest.model.GuestProduct;
import com.example.app.guest.model.GuestProductRepository;
import com.example.app.guest.model.ProductType;
import com.example.app.session.SessionType;
import com.example.app.session.SessionTypeRepository;
import com.example.app.user.User;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
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
    private final GuestOrderItemRepository orderItems;
    private final GuestEntitlementRepository entitlements;

    public GuestProductAdminController(
            GuestProductRepository products,
            SessionTypeRepository sessionTypes,
            GuestOrderItemRepository orderItems,
            GuestEntitlementRepository entitlements
    ) {
        this.products = products;
        this.sessionTypes = sessionTypes;
        this.orderItems = orderItems;
        this.entitlements = entitlements;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public List<ProductAdminResponse> list(@AuthenticationPrincipal User me) {
        return products.findAllByCompanyIdOrderBySortOrderAscIdAsc(me.getCompany().getId()).stream()
                .map(this::toResponse)
                .toList();
    }

    @PostMapping
    @Transactional
    public ProductAdminResponse create(@RequestBody ProductAdminRequest request, @AuthenticationPrincipal User me) {
        GuestProduct product = new GuestProduct();
        product.setCompany(me.getCompany());
        apply(product, request, me);
        return toResponse(products.save(product));
    }

    @PutMapping("/{id}")
    @Transactional
    public ProductAdminResponse update(@PathVariable Long id, @RequestBody ProductAdminRequest request, @AuthenticationPrincipal User me) {
        GuestProduct product = products.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Product not found."));
        apply(product, request, me);
        return toResponse(products.save(product));
    }

    @DeleteMapping("/{id}")
    @Transactional
    public void delete(@PathVariable Long id, @AuthenticationPrincipal User me) {
        GuestProduct product = products.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Product not found."));
        if (orderItems.countByProductId(product.getId()) > 0 || entitlements.countByProductId(product.getId()) > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This card already has orders or entitlements. Archive it instead of deleting it.");
        }
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

        SessionType sessionType = resolveSessionType(request.sessionTypeId(), me.getCompany().getId());
        boolean bookable = Boolean.TRUE.equals(request.bookable());
        if (bookable && sessionType == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bookable products must be linked to a service type.");
        }
        if (productType == ProductType.CLASS_TICKET && sessionType == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Class tickets must be linked to a service type.");
        }

        Integer usageLimit = productType == ProductType.CLASS_TICKET
                ? 1
                : normalizePositiveInteger(request.usageLimit(), "Usage limit");
        Integer validityDays = normalizePositiveInteger(request.validityDays(), "Validity days");
        boolean autoRenews = productType == ProductType.MEMBERSHIP && Boolean.TRUE.equals(request.autoRenews());

        product.setName(name);
        product.setDescription(trimToNull(request.description()));
        product.setPromoText(trimToNull(request.promoText()));
        product.setProductType(productType);
        product.setPriceGross(priceGross);
        product.setCurrency(normalizeCurrency(request.currency()));
        product.setSessionType(sessionType);
        product.setActive(request.active() == null || Boolean.TRUE.equals(request.active()));
        product.setGuestVisible(request.guestVisible() == null || Boolean.TRUE.equals(request.guestVisible()));
        product.setBookable(bookable);
        product.setUsageLimit(usageLimit);
        product.setValidityDays(validityDays);
        product.setAutoRenews(autoRenews);
        product.setSortOrder(request.sortOrder() == null ? 0 : request.sortOrder());
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
        return sessionTypes.findById(sessionTypeId)
                .filter(type -> type.getCompany() != null && companyId.equals(type.getCompany().getId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected service type was not found."));
    }

    private Integer normalizePositiveInteger(Integer value, String label) {
        if (value == null || value <= 0) return null;
        if (value > 100000) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, label + " is too large.");
        }
        return value;
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
            Long sessionTypeId
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
            Instant createdAt,
            Instant updatedAt
    ) {}
}
