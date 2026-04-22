package com.example.app.guest.order;

import com.example.app.billing.PaymentMethod;
import com.example.app.billing.PaymentMethodRepository;
import com.example.app.billing.PaymentType;
import com.example.app.company.CompanyRepository;
import com.example.app.guest.catalog.GuestCatalogService;
import com.example.app.guest.common.GuestDtos;
import com.example.app.guest.common.GuestSettingsService;
import com.example.app.guest.model.*;
import com.example.app.guest.notifications.GuestNotificationService;
import com.example.app.guest.tenant.GuestTenantService;
import com.example.app.paypal.PayPalClient;
import com.example.app.reminder.ReminderService;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.SessionBookingCreationService;
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
    private final CompanyRepository companies;
    private final GuestOrderRepository orders;
    private final GuestEntitlementRepository entitlements;
    private final GuestEntitlementUsageRepository entitlementUsages;
    private final SessionBookingRepository bookings;
    private final SessionBookingCreationService bookingCreationService;
    private final UserRepository users;
    private final PaymentMethodRepository paymentMethods;
    private final GuestNotificationService notifications;
    private final ReminderService reminders;
    private final GuestEntitlementService entitlementService;
    private final GuestBankTransferBillingService bankTransferBillingService;
    private final GuestProductBillingService productBillingService;
    private final PayPalClient payPalClient;

    public GuestOrderService(
            GuestTenantService guestTenantService,
            GuestCatalogService catalogService,
            CompanyRepository companies,
            GuestOrderRepository orders,
            GuestEntitlementRepository entitlements,
            GuestEntitlementUsageRepository entitlementUsages,
            SessionBookingRepository bookings,
            SessionBookingCreationService bookingCreationService,
            UserRepository users,
            PaymentMethodRepository paymentMethods,
            GuestNotificationService notifications,
            ReminderService reminders,
            GuestEntitlementService entitlementService,
            GuestBankTransferBillingService bankTransferBillingService,
            GuestProductBillingService productBillingService,
            PayPalClient payPalClient
    ) {
        this.guestTenantService = guestTenantService;
        this.catalogService = catalogService;
        this.companies = companies;
        this.orders = orders;
        this.entitlements = entitlements;
        this.entitlementUsages = entitlementUsages;
        this.bookings = bookings;
        this.bookingCreationService = bookingCreationService;
        this.users = users;
        this.paymentMethods = paymentMethods;
        this.notifications = notifications;
        this.reminders = reminders;
        this.entitlementService = entitlementService;
        this.bankTransferBillingService = bankTransferBillingService;
        this.productBillingService = productBillingService;
        this.payPalClient = payPalClient;
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
        BigDecimal orderSubtotal =
                paymentMethodType == GuestPaymentMethodType.ENTITLEMENT ? BigDecimal.ZERO : product.priceGross();
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

        if (paymentMethodType == GuestPaymentMethodType.PAY_AT_VENUE) {
            // PAID clears pending-order noise in the app; amount is informational until collected at venue.
            order.setStatus(OrderStatus.PAID);
            order.setPaidAt(Instant.now());
            order = orders.save(order);
            SessionBooking booking = maybeCreateConfirmedBooking(order);
            if (booking == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Pay at venue checkout requires a booking slot.");
            }
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
            SessionBooking booking = maybeCreateConfirmedBooking(order);
            String referenceCode = order.getReferenceCode();
            double responseAmount = order.getTotalGross().doubleValue();
            if (booking != null) {
                var bill = bankTransferBillingService.issueConfirmedBookingBill(order, booking);
                if (bill.getBankTransferReference() != null && !bill.getBankTransferReference().isBlank()) {
                    referenceCode = bill.getBankTransferReference();
                }
                if (bill.getTotalGross() != null) {
                    order.setSubtotalGross(bill.getTotalGross());
                    order.setTaxAmount((bill.getTotalGross().subtract(bill.getTotalNet())).max(BigDecimal.ZERO));
                    order.setTotalGross(bill.getTotalGross());
                    order.setBillId(bill.getId());
                    order = orders.save(order);
                    responseAmount = bill.getTotalGross().doubleValue();
                }
            } else {
                // Wallet product purchase (pack/membership/class ticket with no booking slot).
                GuestProduct walletProduct = loadWalletProduct(order);
                if (walletProduct != null) {
                    var bill = productBillingService.issuePendingBill(order, walletProduct, "BANK_TRANSFER");
                    if (bill.getBankTransferReference() != null && !bill.getBankTransferReference().isBlank()) {
                        referenceCode = bill.getBankTransferReference();
                    }
                    order.setBillId(bill.getId());
                    order = orders.save(order);
                }
            }
            notifications.paymentPending(order.getGuestUser(), order.getCompany(), order.getClient(), "Invoice sent", "Your order is ready. We emailed you the invoice PDF and bank transfer instructions.");
            return new GuestDtos.CheckoutResponse(
                    String.valueOf(order.getId()),
                    paymentMethodType.name(),
                    order.getStatus().name(),
                    null,
                    new GuestDtos.BankTransferInstructionsResponse(responseAmount, order.getCurrency(), referenceCode, booking != null
                            ? "Booking confirmed. We emailed your folio/invoice PDF. Use the QR code or reference on the invoice to complete the bank transfer."
                            : "We emailed your invoice PDF. Use the QR code or reference on the invoice to complete the bank transfer."),
                    "SHOW_INSTRUCTIONS",
                    null,
                    null,
                    null,
                    order.getCompany().getName()
            );
        }

        if (paymentMethodType == GuestPaymentMethodType.PAYPAL) {
            String merchantId = order.getCompany().getPaypalMerchantId();
            if (merchantId == null || merchantId.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "PayPal is not configured for this tenancy.");
            }
            PayPalClient.PayPalOrderSession session = payPalClient.createOrder(order, merchantId);
            order.setPaypalOrderId(session.paypalOrderId());
            order = orders.save(order);
            return new GuestDtos.CheckoutResponse(
                    String.valueOf(order.getId()),
                    paymentMethodType.name(),
                    order.getStatus().name(),
                    session.approveUrl(),
                    null,
                    "REDIRECT",
                    null,
                    null,
                    null,
                    order.getCompany().getName()
            );
        }

        order = markOrderPaid(order, paymentMethodType, null);
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

    @Transactional
    public PayPalCompletionResult handlePayPalReturn(Long orderId, String token) {
        GuestOrder order = orders.findById(orderId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Order not found."));
        if (token != null && !token.isBlank() && order.getPaypalOrderId() != null && !order.getPaypalOrderId().isBlank() && !token.equals(order.getPaypalOrderId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "PayPal return token did not match the pending order.");
        }
        if (order.getStatus() == OrderStatus.PAID) {
            return new PayPalCompletionResult(order, true, "PayPal payment confirmed.");
        }
        String merchantId = order.getCompany().getPaypalMerchantId();
        if (merchantId == null || merchantId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "PayPal is not configured for this tenancy.");
        }
        String paypalOrderId = order.getPaypalOrderId();
        if (paypalOrderId == null || paypalOrderId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing PayPal checkout session for this order.");
        }
        PayPalClient.PayPalCaptureResult capture = payPalClient.captureOrder(paypalOrderId, merchantId);
        order = markOrderPaid(order, GuestPaymentMethodType.PAYPAL, capture.captureId());
        return new PayPalCompletionResult(order, true, "PayPal payment confirmed.");
    }

    public PayPalCompletionResult handlePayPalCancel(Long orderId, String token) {
        GuestOrder order = orders.findById(orderId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Order not found."));
        if (token != null && !token.isBlank() && order.getPaypalOrderId() != null && !order.getPaypalOrderId().isBlank() && !token.equals(order.getPaypalOrderId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "PayPal return token did not match the pending order.");
        }
        return new PayPalCompletionResult(order, false, "PayPal payment was canceled.");
    }

    private String buildMetadataJson(String slotId, GuestCatalogService.ResolvedProduct product) {
        try {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("slotId", slotId);
            map.put("productType", product.productType());
            map.put("productName", product.name());
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

    private static boolean isSessionLikeProductType(String productType) {
        return "SESSION_SINGLE".equals(productType) || "CLASS_TICKET".equals(productType);
    }

    private void assertPaymentMethodAllowed(Long companyId, GuestPaymentMethodType paymentMethodType, String productType) {
        GuestSettingsService.GuestBookingRules rules = catalogService.bookingRules(companyId);

        if (paymentMethodType == GuestPaymentMethodType.PAY_AT_VENUE) {
            if (!isSessionLikeProductType(productType)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Pay at venue is only allowed for session bookings.");
            }
            if (rules.requireOnlinePayment()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This tenant requires online payment for bookings.");
            }
            return;
        }

        if (!rules.requireOnlinePayment() && isSessionLikeProductType(productType)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Use pay at venue to complete this booking without online payment.");
        }

        if (paymentMethodType == GuestPaymentMethodType.ENTITLEMENT) {
            if (!("SESSION_SINGLE".equals(productType) || "CLASS_TICKET".equals(productType))) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Memberships and packs can only be used to pay for bookable sessions.");
            }
            return;
        }
        if (paymentMethodType == GuestPaymentMethodType.PAYPAL) {
            String merchantId = companies.findById(companyId).map(c -> c.getPaypalMerchantId()).orElse(null);
            if (merchantId == null || merchantId.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "PayPal is not configured for this tenancy.");
            }
            if (!rules.allowCardFor().contains(productType)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This payment method is not allowed for the selected product.");
            }
            return;
        }
        List<PaymentMethod> methods = paymentMethods.findAllByCompanyIdOrderByNameAsc(companyId);
        boolean enabled = methods.stream().anyMatch(pm -> pm.isGuestEnabled() && matches(pm, paymentMethodType));
        if (!enabled) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This payment method is not enabled for the guest app.");
        }
        List<String> allowedFor = paymentMethodType == GuestPaymentMethodType.CARD ? rules.allowCardFor() : rules.allowBankTransferFor();
        if (!allowedFor.contains(productType)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This payment method is not allowed for the selected product.");
        }
    }

    private boolean matches(PaymentMethod method, GuestPaymentMethodType type) {
        return (type == GuestPaymentMethodType.CARD && method.getPaymentType() == PaymentType.CARD && method.isStripeEnabled())
                || (type == GuestPaymentMethodType.BANK_TRANSFER && method.getPaymentType() == PaymentType.BANK_TRANSFER);
    }

    private GuestOrder markOrderPaid(GuestOrder order, GuestPaymentMethodType paymentMethodType, String paypalCaptureId) {
        order.setPaymentMethodType(paymentMethodType);
        order.setStatus(OrderStatus.PAID);
        order.setPaidAt(Instant.now());
        if (paypalCaptureId != null && !paypalCaptureId.isBlank()) {
            order.setPaypalCaptureId(paypalCaptureId);
        }
        order = orders.save(order);
        SessionBooking booking = maybeCreateConfirmedBooking(order);
        maybeCreateEntitlement(order);
        if (booking != null
                && (paymentMethodType == GuestPaymentMethodType.CARD
                || paymentMethodType == GuestPaymentMethodType.PAYPAL)) {
            try {
                var bill = bankTransferBillingService.issuePaidAdvanceBill(order, booking, paymentMethodType.name());
                order.setBillId(bill.getId());
                order = orders.save(order);
            } catch (Exception ignore) {
                // Swallowing so a bookkeeping failure can't unwind a successful payment.
            }
        }
        // Wallet product purchases (no booking) should also land in the web-app Billing
        // UI as a PAID invoice. Session-linked orders now receive an ADVANCE invoice at booking time.
        if (booking == null
                && (paymentMethodType == GuestPaymentMethodType.CARD
                        || paymentMethodType == GuestPaymentMethodType.PAYPAL)) {
            GuestProduct walletProduct = loadWalletProduct(order);
            if (walletProduct != null) {
                try {
                    var bill = productBillingService.issuePendingBill(order, walletProduct, paymentMethodType.name());
                    bill = productBillingService.markBillPaid(bill, java.time.OffsetDateTime.now());
                    order.setBillId(bill.getId());
                    order = orders.save(order);
                } catch (Exception ignore) {
                    // Swallowing so a bookkeeping failure can't unwind a successful payment.
                }
            }
        }
        notifications.paymentConfirmed(order.getGuestUser(), order.getCompany(), order.getClient(), "Payment confirmed", "Your payment was received successfully.");
        return order;
    }

    /** Resolves the persisted {@link GuestProduct} behind a wallet (non-session) order. */
    private GuestProduct loadWalletProduct(GuestOrder order) {
        try {
            Map<?, ?> map = JSON.readValue(order.getMetadataJson(), Map.class);
            Object guestProductId = map.get("guestProductId");
            Object productType = map.get("productType");
            if (guestProductId == null || productType == null) return null;
            String typeName = String.valueOf(productType);
            if (!("PACK".equals(typeName) || "MEMBERSHIP".equals(typeName) || "CLASS_TICKET".equals(typeName))) {
                return null;
            }
            return catalogService
                    .resolveProduct(order.getCompany().getId(), String.valueOf(guestProductId))
                    .persistedProduct();
        } catch (Exception ex) {
            return null;
        }
    }

    /**
     * Called when a wallet-product {@link com.example.app.billing.Bill} tied to this
     * service's orders is reconciled as paid on the web app. Flips the matching
     * {@link GuestOrder} to {@link OrderStatus#PAID} and runs the same post-payment
     * side effects as a live checkout.
     */
    @Transactional
    public void onWalletBillPaid(Long billId) {
        if (billId == null) return;
        orders.findByBillId(billId)
                .filter(order -> order.getStatus() != OrderStatus.PAID)
                .ifPresent(order -> markOrderPaid(order, order.getPaymentMethodType(), null));
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
            boolean wasConfirmed = "CONFIRMED".equalsIgnoreCase(existing.getBookingStatus());
            existing.setBookingStatus("CONFIRMED");
            existing = bookings.save(existing);
            if (!wasConfirmed) {
                reminders.sendBookingConfirmation(existing);
            }
            return existing;
        }
        SlotContext context = extractSlotContext(order);
        if (context == null) return null;
        return createBooking(order, context, "CONFIRMED");
    }

    private SessionBooking findBookingForOrder(GuestOrder order) {
        return bookings.findFirstByCompanyIdAndSourceOrderId(order.getCompany().getId(), String.valueOf(order.getId()))
                .orElse(null);
    }

    private SlotContext extractSlotContext(GuestOrder order) {
        try {
            Map<?, ?> map = JSON.readValue(order.getMetadataJson(), Map.class);
            Object rawSlot = map.get("slotId");
            Object rawTypeId = map.get("sessionTypeId");
            if (rawSlot == null || rawTypeId == null) return null;

            String[] parts = String.valueOf(rawSlot).split("\\|");
            if (parts.length < 3) {
                return null;
            }

            Long consultantId = parseOptionalConsultantId(parts[0]);
            return new SlotContext(
                    Long.parseLong(String.valueOf(rawTypeId)),
                    consultantId,
                    java.time.LocalDateTime.parse(parts[1]),
                    java.time.LocalDateTime.parse(parts[2])
            );
        } catch (Exception ex) {
            return null;
        }
    }

    private Long parseOptionalConsultantId(String raw) {
        if (raw == null) {
            return null;
        }
        String value = raw.trim();
        if (value.isBlank() || "null".equalsIgnoreCase(value) || "unassigned".equalsIgnoreCase(value) || "0".equals(value)) {
            return null;
        }
        return Long.parseLong(value);
    }

    private User resolveBookingConsultant(GuestOrder order, SlotContext slotContext) {
        // Prefer the employee encoded in the slot the guest booked (format: consultantId|start|end).
        if (slotContext != null && slotContext.consultantId() != null) {
            User fromSlot = users.findById(slotContext.consultantId())
                    .filter(u -> Objects.equals(u.getCompany().getId(), order.getCompany().getId()))
                    .filter(User::isActive)
                    .orElse(null);
            if (fromSlot != null) {
                return fromSlot;
            }
        }

        List<User> activeUsers = users.findAllByCompanyId(order.getCompany().getId()).stream()
                .filter(User::isActive)
                .sorted(java.util.Comparator.comparing(User::getId))
                .toList();

        // Guest mobile bookings stay unassigned unless there is exactly one active user in the tenancy.
        return activeUsers.size() == 1 ? activeUsers.get(0) : null;
    }

    private SessionBooking createBooking(GuestOrder order, SlotContext slotContext, String status) {
        User consultant = resolveBookingConsultant(order, slotContext);
        try {
            return bookingCreationService.createChannelBooking(new SessionBookingCreationService.ChannelBookingRequest(
                    order.getCompany().getId(),
                    order.getClient().getId(),
                    consultant != null ? consultant.getId() : null,
                    slotContext.startsAt(),
                    slotContext.endsAt(),
                    null,
                    slotContext.sessionTypeId(),
                    "Booked via guest mobile app",
                    null,
                    false,
                    null,
                    false,
                    "GUEST_APP",
                    String.valueOf(order.getId()),
                    String.valueOf(order.getGuestUser().getId()),
                    status,
                    "CONFIRMED".equalsIgnoreCase(status)
            ));
        } catch (ResponseStatusException ex) {
            if (HttpStatus.CONFLICT.equals(ex.getStatusCode())) {
                SessionBooking existing = findBookingForOrder(order);
                if (existing != null) {
                    return existing;
                }
            }
            throw ex;
        }
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

    public record PayPalCompletionResult(GuestOrder order, boolean completed, String message) {}

    private record SlotContext(Long sessionTypeId, Long consultantId, java.time.LocalDateTime startsAt, java.time.LocalDateTime endsAt) {}
}
