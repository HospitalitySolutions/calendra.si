package com.example.app.guest.order;

import com.example.app.billing.PaymentMethod;
import com.example.app.billing.PaymentMethodRepository;
import com.example.app.billing.PaymentType;
import com.example.app.guest.catalog.GuestCatalogService;
import com.example.app.guest.common.GuestDtos;
import com.example.app.guest.common.GuestSettingsService;
import com.example.app.guest.model.*;
import com.example.app.guest.notifications.GuestNotificationService;
import com.example.app.guest.tenant.GuestTenantService;
import com.example.app.reminder.ReminderService;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.SessionType;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class GuestOrderService {
    private static final ObjectMapper JSON = new ObjectMapper();

    private final GuestTenantService guestTenantService;
    private final GuestCatalogService catalogService;
    private final GuestOrderRepository orders;
    private final GuestEntitlementRepository entitlements;
    private final GuestEntitlementUsageRepository entitlementUsages;
    private final SessionBookingRepository bookings;
    private final UserRepository users;
    private final PaymentMethodRepository paymentMethods;
    private final GuestNotificationService notifications;
    private final ReminderService reminders;
    private final GuestEntitlementService entitlementService;

    public GuestOrderService(
            GuestTenantService guestTenantService,
            GuestCatalogService catalogService,
            GuestOrderRepository orders,
            GuestEntitlementRepository entitlements,
            GuestEntitlementUsageRepository entitlementUsages,
            SessionBookingRepository bookings,
            UserRepository users,
            PaymentMethodRepository paymentMethods,
            GuestNotificationService notifications,
            ReminderService reminders,
            GuestEntitlementService entitlementService
    ) {
        this.guestTenantService = guestTenantService;
        this.catalogService = catalogService;
        this.orders = orders;
        this.entitlements = entitlements;
        this.entitlementUsages = entitlementUsages;
        this.bookings = bookings;
        this.users = users;
        this.paymentMethods = paymentMethods;
        this.notifications = notifications;
        this.reminders = reminders;
        this.entitlementService = entitlementService;
    }

    @Transactional
    public GuestDtos.CreateOrderResponse createOrder(GuestUser guestUser, GuestDtos.CreateOrderRequest request) {
        Long companyId = parseId(request.companyId());
        GuestTenantLink link = guestTenantService.requireLink(guestUser, companyId);
        var product = catalogService.resolveProduct(companyId, request.productId());
        GuestPaymentMethodType paymentMethodType = parsePaymentMethod(request.paymentMethodType());
        assertPaymentMethodAllowed(companyId, paymentMethodType, product.productType());

        GuestOrder order = new GuestOrder();
        order.setCompany(link.getCompany());
        order.setClient(link.getClient());
        order.setGuestUser(guestUser);
        order.setStatus(OrderStatus.PENDING);
        order.setPaymentMethodType(paymentMethodType);
        order.setCurrency(product.currency());
        BigDecimal orderSubtotal = paymentMethodType == GuestPaymentMethodType.ENTITLEMENT ? BigDecimal.ZERO : product.priceGross();
        order.setSubtotalGross(orderSubtotal);
        order.setTaxAmount(BigDecimal.ZERO);
        order.setTotalGross(orderSubtotal);
        order.setReferenceCode("ORD-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(Locale.ROOT));
        order.setMetadataJson(buildMetadataJson(request.slotId(), product));
        order = orders.save(order);

        GuestDtos.BookingSummaryResponse bookingSummary = request.slotId() == null ? null : new GuestDtos.BookingSummaryResponse(String.valueOf(order.getId()), "PENDING_PAYMENT");
        return new GuestDtos.CreateOrderResponse(toOrder(order), bookingSummary, "CHECKOUT");
    }

    @Transactional
    public GuestDtos.CheckoutResponse checkout(GuestUser guestUser, Long orderId, GuestDtos.CheckoutRequest request) {
        GuestOrder order = orders.findByIdAndGuestUserId(orderId, guestUser.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Order not found."));
        GuestPaymentMethodType paymentMethodType = parsePaymentMethod(request.paymentMethodType());
        if (order.getPaymentMethodType() != paymentMethodType) {
            order.setPaymentMethodType(paymentMethodType);
        }
        assertPaymentMethodAllowed(order.getCompany().getId(), paymentMethodType, inferProductType(order));

        if (paymentMethodType == GuestPaymentMethodType.ENTITLEMENT) {
            order.setStatus(OrderStatus.PAID);
            order.setPaidAt(Instant.now());
            order = orders.save(order);
            SessionBooking booking = maybeCreateConfirmedBooking(order);
            if (booking == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Entitlement checkout requires a booking slot.");
            }
            SlotContext slotContext = extractSlotContext(order);
            if (slotContext == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Entitlement checkout requires a valid service.");
            }
            entitlementService.consumeBestMatchingEntitlement(order.getClient(), order.getCompany().getId(), slotContext.sessionTypeId(), booking);
            notifications.bookingConfirmed(order.getGuestUser(), order.getCompany(), order.getClient(), booking);
            return new GuestDtos.CheckoutResponse(
                    String.valueOf(order.getId()),
                    paymentMethodType.name(),
                    order.getStatus().name(),
                    null,
                    null,
                    "COMPLETE",
                    null,
                    null,
                    null,
                    order.getCompany().getName()
            );
        }

        if (paymentMethodType == GuestPaymentMethodType.BANK_TRANSFER) {
            maybeCreatePendingBooking(order);
            notifications.paymentPending(order.getGuestUser(), order.getCompany(), order.getClient(), "Payment pending", "Your bank transfer will activate the purchase once received.");
            return new GuestDtos.CheckoutResponse(
                    String.valueOf(order.getId()),
                    paymentMethodType.name(),
                    order.getStatus().name(),
                    null,
                    new GuestDtos.BankTransferInstructionsResponse(order.getTotalGross().doubleValue(), order.getCurrency(), order.getReferenceCode(), "Use the reference code when paying by bank transfer."),
                    "SHOW_INSTRUCTIONS",
                    null,
                    null,
                    null,
                    null
            );
        }

        // Dev-friendly default: confirm card orders immediately unless you later swap this to Stripe PaymentSheet.
        order.setStatus(OrderStatus.PAID);
        order.setPaidAt(Instant.now());
        order = orders.save(order);
        SessionBooking booking = maybeCreateConfirmedBooking(order);
        maybeCreateEntitlement(order);
        notifications.paymentConfirmed(order.getGuestUser(), order.getCompany(), order.getClient(), "Payment confirmed", "Your payment was received successfully.");
        if (booking != null) {
            notifications.bookingConfirmed(order.getGuestUser(), order.getCompany(), order.getClient(), booking);
        }
        return new GuestDtos.CheckoutResponse(
                String.valueOf(order.getId()),
                paymentMethodType.name(),
                order.getStatus().name(),
                null,
                null,
                "COMPLETE",
                null,
                order.getGuestUser().getStripeCustomerId(),
                null,
                order.getCompany().getName()
        );
    }

    private String buildMetadataJson(String slotId, GuestCatalogService.ResolvedProduct product) {
        try {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("slotId", slotId);
            map.put("productType", product.productType());
            map.put("guestProductId", product.persistedProduct() == null ? null : product.persistedProduct().getId());
            map.put("sessionTypeId", product.sessionType() == null ? null : product.sessionType().getId());
            map.put("currency", product.currency());
            map.put("priceGross", product.priceGross() == null ? null : product.priceGross().doubleValue());
            return JSON.writeValueAsString(map);
        } catch (Exception ex) {
            return "{}";
        }
    }

    private String inferProductType(GuestOrder order) {
        try {
            Map<?, ?> map = JSON.readValue(order.getMetadataJson(), Map.class);
            Object productType = map.get("productType");
            return productType == null ? "SESSION_SINGLE" : String.valueOf(productType);
        } catch (Exception ex) {
            return "SESSION_SINGLE";
        }
    }

    private void assertPaymentMethodAllowed(Long companyId, GuestPaymentMethodType paymentMethodType, String productType) {
        if (paymentMethodType == GuestPaymentMethodType.ENTITLEMENT) {
            if (!("SESSION_SINGLE".equals(productType) || "CLASS_TICKET".equals(productType))) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Memberships and packs can only be used to pay for bookable sessions.");
            }
            return;
        }
        List<PaymentMethod> methods = paymentMethods.findAllByCompanyIdOrderByNameAsc(companyId);
        boolean enabled = methods.stream().anyMatch(pm -> pm.isGuestEnabled() && matches(pm, paymentMethodType));
        if (!enabled) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This payment method is not enabled for the guest app.");
        }
        GuestSettingsService.GuestBookingRules rules = catalogService.bookingRules(companyId);
        List<String> allowedFor = paymentMethodType == GuestPaymentMethodType.CARD ? rules.allowCardFor() : rules.allowBankTransferFor();
        if (!allowedFor.contains(productType)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This payment method is not allowed for the selected product.");
        }
    }

    private boolean matches(PaymentMethod method, GuestPaymentMethodType type) {
        return (type == GuestPaymentMethodType.CARD && method.getPaymentType() == PaymentType.CARD && method.isStripeEnabled())
                || (type == GuestPaymentMethodType.BANK_TRANSFER && method.getPaymentType() == PaymentType.BANK_TRANSFER);
    }

    private void maybeCreatePendingBooking(GuestOrder order) {
        GuestSettingsService.GuestBookingRules rules = catalogService.bookingRules(order.getCompany().getId());
        if (!rules.bankTransferReservesSlot()) return;
        if (findBookingForOrder(order) != null) return;
        SlotContext context = extractSlotContext(order);
        if (context == null) return;
        createBooking(order, context, "PENDING_PAYMENT");
    }

    private SessionBooking maybeCreateConfirmedBooking(GuestOrder order) {
        SessionBooking existing = findBookingForOrder(order);
        if (existing != null) {
            existing.setBookingStatus("CONFIRMED");
            return bookings.save(existing);
        }
        SlotContext context = extractSlotContext(order);
        if (context == null) return null;
        return createBooking(order, context, "CONFIRMED");
    }

    private SessionBooking findBookingForOrder(GuestOrder order) {
        return bookings.findAllByCompanyId(order.getCompany().getId()).stream()
                .filter(b -> Objects.equals(String.valueOf(order.getId()), b.getSourceOrderId()))
                .findFirst().orElse(null);
    }

    private SlotContext extractSlotContext(GuestOrder order) {
        try {
            Map<?, ?> map = JSON.readValue(order.getMetadataJson(), Map.class);
            Object rawSlot = map.get("slotId");
            Object rawTypeId = map.get("sessionTypeId");
            if (rawSlot == null || rawTypeId == null) return null;
            GuestCatalogService.SlotPayload slot = catalogService.parseSlotId(String.valueOf(rawSlot));
            SessionType type = users.findByIdAndCompanyId(slot.consultantId(), order.getCompany().getId())
                    .flatMap(user -> user.getTypes().stream().filter(t -> Objects.equals(t.getId(), Long.parseLong(String.valueOf(rawTypeId)))).findFirst())
                    .orElse(null);
            if (type == null) {
                type = new SessionType();
                type.setId(Long.parseLong(String.valueOf(rawTypeId))); // not persisted, only fallback for compile? won't work.
            }
            return new SlotContext(Long.parseLong(String.valueOf(rawTypeId)), slot.consultantId(), slot.startsAt(), slot.endsAt());
        } catch (Exception ex) {
            return null;
        }
    }

    private SessionBooking createBooking(GuestOrder order, SlotContext slotContext, String status) {
        User consultant = users.findByIdAndCompanyId(slotContext.consultantId(), order.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Consultant not found for slot."));
        SessionType type = consultant.getTypes().stream()
                .filter(t -> Objects.equals(t.getId(), slotContext.sessionTypeId()))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Consultant does not support this service."));
        SessionBooking booking = new SessionBooking();
        booking.setCompany(order.getCompany());
        booking.setClient(order.getClient());
        booking.setConsultant(consultant);
        booking.setType(type);
        booking.setStartTime(slotContext.startsAt());
        booking.setEndTime(slotContext.endsAt());
        booking.setNotes("Booked via guest mobile app");
        booking.setBookingStatus(status);
        booking.setSourceChannel("GUEST_APP");
        booking.setSourceOrderId(String.valueOf(order.getId()));
        booking.setGuestUserId(String.valueOf(order.getGuestUser().getId()));
        booking = bookings.save(booking);
        if ("CONFIRMED".equals(status)) {
            reminders.sendBookingConfirmation(booking);
        }
        return booking;
    }

    private void maybeCreateEntitlement(GuestOrder order) {
        try {
            Map<?, ?> map = JSON.readValue(order.getMetadataJson(), Map.class);
            Object productType = map.get("productType");
            Object guestProductId = map.get("guestProductId");
            if (productType == null || guestProductId == null) return;
            String productTypeName = String.valueOf(productType);
            if (!("PACK".equals(productTypeName) || "MEMBERSHIP".equals(productTypeName) || "CLASS_TICKET".equals(productTypeName))) return;
            Long guestProductIdLong = Long.parseLong(String.valueOf(guestProductId));
            GuestProduct product = catalogService.resolveProduct(order.getCompany().getId(), String.valueOf(guestProductIdLong)).persistedProduct();
            if (product != null) {
                entitlementService.ensureEntitlementForOrder(order, product);
            }
        } catch (Exception ignore) {
        }
    }

    public GuestDtos.OrderSummaryResponse toOrder(GuestOrder order) {
        return new GuestDtos.OrderSummaryResponse(
                String.valueOf(order.getId()),
                order.getStatus().name(),
                order.getPaymentMethodType().name(),
                order.getSubtotalGross().doubleValue(),
                order.getTaxAmount().doubleValue(),
                order.getTotalGross().doubleValue(),
                order.getCurrency()
        );
    }

    private static GuestPaymentMethodType parsePaymentMethod(String raw) {
        try {
            return GuestPaymentMethodType.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported payment method.");
        }
    }

    private static Long parseId(String raw) {
        try {
            return Long.parseLong(raw.trim());
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid identifier.");
        }
    }

    private record SlotContext(Long sessionTypeId, Long consultantId, java.time.LocalDateTime startsAt, java.time.LocalDateTime endsAt) {}
}
