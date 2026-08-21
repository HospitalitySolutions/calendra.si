package com.example.app.customer;

import com.example.app.company.Company;
import com.example.app.guest.catalog.GuestCatalogService;
import com.example.app.guest.common.GuestDtos;
import com.example.app.guest.common.GuestMapper;
import com.example.app.guest.common.GuestSettingsService;
import com.example.app.guest.model.GuestOrder;
import com.example.app.guest.model.GuestOrderRepository;
import com.example.app.guest.model.GuestUser;
import com.example.app.guest.order.GuestOrderService;
import com.example.app.guest.tenant.GuestProviderLinkService;
import com.example.app.location.Location;
import com.example.app.location.LocationPublicPresentationService;
import com.example.app.location.LocationRepository;
import com.example.app.session.BookingSource;
import com.example.app.widget.WidgetBookingIdempotencyService;
import java.util.List;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CustomerCommerceService {
    private static final List<String> BUYABLE_TYPES = List.of("PACK", "MEMBERSHIP", "GIFT_CARD");
    private static final List<String> BUY_PAYMENT_METHODS = List.of("CARD", "BANK_TRANSFER");

    private final LocationRepository locations;
    private final GuestCatalogService catalog;
    private final GuestSettingsService settings;
    private final GuestProviderLinkService providerLinks;
    private final GuestOrderService orderService;
    private final GuestOrderRepository orders;
    private final WidgetBookingIdempotencyService idempotency;
    private final LocationPublicPresentationService presentations;

    public CustomerCommerceService(
            LocationRepository locations,
            GuestCatalogService catalog,
            GuestSettingsService settings,
            GuestProviderLinkService providerLinks,
            GuestOrderService orderService,
            GuestOrderRepository orders,
            WidgetBookingIdempotencyService idempotency,
            LocationPublicPresentationService presentations
    ) {
        this.locations = locations;
        this.catalog = catalog;
        this.settings = settings;
        this.providerLinks = providerLinks;
        this.orderService = orderService;
        this.orders = orders;
        this.idempotency = idempotency;
        this.presentations = presentations;
    }

    @Transactional(readOnly = true)
    public CustomerDtos.CommerceCatalogResponse catalog(GuestUser guestUser, Long locationId) {
        Location location = requireMarketplaceLocation(locationId);
        Company company = location.getCompany();
        GuestSettingsService.GuestPublicSettings publicSettings = settings.publicSettings(company.getId());
        List<GuestDtos.ProductResponse> products = catalog.publicProducts(company.getId(), location.getId()).stream()
                .filter(CustomerCommerceService::buyableProduct)
                .toList();
        List<String> paymentMethods = settings.acceptedPaymentMethods(company.getId()).stream()
                .map(value -> value == null ? "" : value.trim().toUpperCase(Locale.ROOT))
                .filter(BUY_PAYMENT_METHODS::contains)
                .distinct()
                .toList();
        return new CustomerDtos.CommerceCatalogResponse(
                provider(company, location, publicSettings),
                products,
                paymentMethods
        );
    }

    @Transactional
    public GuestDtos.CreateOrderResponse createOrder(
            GuestUser guestUser,
            CustomerDtos.CreateCommerceOrderRequest payload,
            String idempotencyKey
    ) {
        if (payload == null || payload.locationId() == null || payload.locationId().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Location is required.");
        }
        Long locationId = parseId(payload.locationId(), "Invalid location.");
        Location location = requireMarketplaceLocation(locationId);
        Company company = location.getCompany();
        GuestDtos.ProductResponse product = catalog.publicProducts(company.getId(), locationId).stream()
                .filter(CustomerCommerceService::buyableProduct)
                .filter(row -> row.productId() != null && row.productId().equals(payload.productId()))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Product not found."));

        String paymentMethod = normalizePaymentMethod(payload.paymentMethodType());
        providerLinks.activateMarketplaceLocation(
                guestUser,
                company,
                location,
                firstNonBlank(payload.locale(), guestUser.getLanguage())
        );

        GuestDtos.CreateOrderRequest normalized = new GuestDtos.CreateOrderRequest(
                String.valueOf(company.getId()),
                product.productId(),
                null,
                paymentMethod,
                null,
                payload.locale(),
                payload.locale(),
                null,
                null,
                null,
                String.valueOf(locationId)
        );
        return idempotency.execute(
                company,
                "customer-commerce-orders",
                idempotencyKey,
                payload,
                GuestDtos.CreateOrderResponse.class,
                () -> orderService.createOrder(
                        guestUser,
                        normalized,
                        GuestOrderService.PaymentChannel.GUEST,
                        BookingSource.MOBILE_APP
                )
        );
    }

    @Transactional
    public GuestDtos.CheckoutResponse checkout(
            GuestUser guestUser,
            Long orderId,
            CustomerDtos.CustomerCheckoutRequest payload,
            String idempotencyKey
    ) {
        GuestOrder order = requireOwnedCommerceOrder(guestUser, orderId);
        String paymentMethod = normalizePaymentMethod(payload == null ? null : payload.paymentMethodType());
        GuestDtos.CheckoutRequest request = new GuestDtos.CheckoutRequest(
                paymentMethod,
                false,
                null,
                payload == null ? null : payload.locale(),
                payload == null ? null : payload.locale(),
                null,
                List.of()
        );
        return idempotency.execute(
                order.getCompany(),
                "customer-commerce-checkout",
                idempotencyKey,
                new CheckoutIdempotencyRequest(orderId, request),
                GuestDtos.CheckoutResponse.class,
                () -> orderService.checkout(guestUser, orderId, request, GuestOrderService.PaymentChannel.CUSTOMER_WEB)
        );
    }

    @Transactional
    public CustomerDtos.WalletOrderResponse cancelExternalCheckout(
            GuestUser guestUser,
            Long orderId,
            String checkoutSessionId
    ) {
        GuestOrder order = requireOwnedCommerceOrder(guestUser, orderId);
        orderService.cancelPendingExternalCheckout(guestUser, orderId, checkoutSessionId);
        return orderView(requireOwnedCommerceOrder(guestUser, orderId));
    }

    @Transactional(readOnly = true)
    public CustomerDtos.WalletOrderResponse order(GuestUser guestUser, Long orderId) {
        return orderView(requireOwnedCommerceOrder(guestUser, orderId));
    }

    private Location requireMarketplaceLocation(Long locationId) {
        return locations.findById(locationId)
                .filter(Location::isActive)
                .filter(Location::isGuestAppDiscoverable)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Provider location not found."));
    }

    private GuestOrder requireOwnedCommerceOrder(GuestUser guestUser, Long orderId) {
        if (orderId == null || orderId <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid order.");
        }
        GuestOrder order = orders.findByIdAndGuestUserId(orderId, guestUser.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Order not found."));
        String productType = metadataProductType(order);
        if (productType == null || !BUYABLE_TYPES.contains(productType.trim().toUpperCase(Locale.ROOT))) {
            // Keep the commerce facade scoped to wallet products. Booking orders continue
            // to use the existing booking/guest APIs and cannot be repurposed through this endpoint.
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Commerce order not found.");
        }
        return order;
    }

    private CustomerDtos.WalletOrderResponse orderView(GuestOrder order) {
        return new CustomerDtos.WalletOrderResponse(
                provider(order.getCompany(), order.getLocation(), settings.publicSettings(order.getCompany().getId())),
                String.valueOf(order.getId()),
                order.getStatus().name(),
                order.getPaymentMethodType().name(),
                order.getTotalGross().doubleValue(),
                order.getCurrency(),
                order.getPaidAt() == null ? null : order.getPaidAt().toString(),
                order.getCreatedAt() == null ? null : order.getCreatedAt().toString(),
                order.getReferenceCode(),
                metadataProductName(order),
                metadataProductType(order)
        );
    }

    private CustomerDtos.ProviderResponse provider(
            Company company,
            Location location,
            GuestSettingsService.GuestPublicSettings publicSettings
    ) {
        LocationPublicPresentationService.PublicPresentation presentation = presentations.resolve(
                location,
                publicSettings.companyLogoUrl()
        );
        return new CustomerDtos.ProviderResponse(
                String.valueOf(company.getId()),
                GuestMapper.displayCompanyName(company, publicSettings),
                presentation.publicLogoUrl(),
                String.valueOf(location.getId()),
                presentation.publicName(),
                presentation.publicAddress()
        );
    }

    private static boolean buyableProduct(GuestDtos.ProductResponse product) {
        return product != null && product.productType() != null
                && BUYABLE_TYPES.contains(product.productType().trim().toUpperCase(Locale.ROOT));
    }

    private static String normalizePaymentMethod(String raw) {
        String normalized = raw == null ? "" : raw.trim().toUpperCase(Locale.ROOT);
        if (!BUY_PAYMENT_METHODS.contains(normalized)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported payment method.");
        }
        return normalized;
    }

    private static Long parseId(String raw, String message) {
        try {
            long parsed = Long.parseLong(raw.trim());
            if (parsed <= 0) throw new NumberFormatException();
            return parsed;
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
        }
    }

    private static String firstNonBlank(String first, String second) {
        if (first != null && !first.isBlank()) return first.trim();
        return second == null || second.isBlank() ? null : second.trim();
    }

    private static String metadataProductName(GuestOrder order) {
        return metadataText(order, "productName");
    }

    private static String metadataProductType(GuestOrder order) {
        return metadataText(order, "productType");
    }

    private static String metadataText(GuestOrder order, String field) {
        if (order == null || order.getMetadataJson() == null || order.getMetadataJson().isBlank()) return null;
        try {
            var node = new com.fasterxml.jackson.databind.ObjectMapper().readTree(order.getMetadataJson());
            String value = node.path(field).asText(null);
            return value == null || value.isBlank() ? null : value;
        } catch (Exception ignored) {
            return null;
        }
    }

    private record CheckoutIdempotencyRequest(Long orderId, GuestDtos.CheckoutRequest request) {}
}
