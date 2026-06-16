package com.example.app.guest.order;

import com.example.app.billing.InvoiceOrderIdService;
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
import com.example.app.settings.GlobalPaymentProviderService;
import com.example.app.stripe.StripeCheckoutSessionResult;
import com.example.app.stripe.StripeGuestCheckoutService;
import com.example.app.widget.WebsiteWidgetSettingsService;
import com.example.app.reminder.ReminderService;
import com.example.app.session.BookingChangePublisher;
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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class GuestOrderService {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final List<String> ALL_ALLOWED_GUEST_PRODUCT_TYPES = List.of("SESSION_SINGLE", "CLASS_TICKET", "PACK", "MEMBERSHIP", "GIFT_CARD", "COURSE");

    private final GuestTenantService guestTenantService;
    private final GuestCatalogService catalogService;
    private final GuestSettingsService guestSettings;
    private final CompanyRepository companies;
    private final GuestOrderRepository orders;
    private final GuestEntitlementRepository entitlements;
    private final GuestEntitlementUsageRepository entitlementUsages;
    private final SessionBookingRepository bookings;
    private final SessionBookingCreationService bookingCreationService;
    private final BookingChangePublisher bookingChangePublisher;
    private final UserRepository users;
    private final PaymentMethodRepository paymentMethods;
    private final GuestNotificationService notifications;
    private final ReminderService reminders;
    private final GuestEntitlementService entitlementService;
    private final GuestBankTransferBillingService bankTransferBillingService;
    private final GuestProductBillingService productBillingService;
    private final PayPalClient payPalClient;
    private final StripeGuestCheckoutService stripeGuestCheckoutService;
    private final GlobalPaymentProviderService globalPaymentProviders;
    private final WebsiteWidgetSettingsService websiteWidgetSettings;
    private final InvoiceOrderIdService invoiceOrderIdService;

    @Autowired
    public GuestOrderService(
            GuestTenantService guestTenantService,
            GuestCatalogService catalogService,
            GuestSettingsService guestSettings,
            CompanyRepository companies,
            GuestOrderRepository orders,
            GuestEntitlementRepository entitlements,
            GuestEntitlementUsageRepository entitlementUsages,
            SessionBookingRepository bookings,
            SessionBookingCreationService bookingCreationService,
            BookingChangePublisher bookingChangePublisher,
            UserRepository users,
            PaymentMethodRepository paymentMethods,
            GuestNotificationService notifications,
            ReminderService reminders,
            GuestEntitlementService entitlementService,
            GuestBankTransferBillingService bankTransferBillingService,
            GuestProductBillingService productBillingService,
            PayPalClient payPalClient,
            StripeGuestCheckoutService stripeGuestCheckoutService,
            GlobalPaymentProviderService globalPaymentProviders,
            WebsiteWidgetSettingsService websiteWidgetSettings,
            InvoiceOrderIdService invoiceOrderIdService
    ) {
        this.guestTenantService = guestTenantService;
        this.catalogService = catalogService;
        this.guestSettings = guestSettings;
        this.companies = companies;
        this.orders = orders;
        this.entitlements = entitlements;
        this.entitlementUsages = entitlementUsages;
        this.bookings = bookings;
        this.bookingCreationService = bookingCreationService;
        this.bookingChangePublisher = bookingChangePublisher;
        this.users = users;
        this.paymentMethods = paymentMethods;
        this.notifications = notifications;
        this.reminders = reminders;
        this.entitlementService = entitlementService;
        this.bankTransferBillingService = bankTransferBillingService;
        this.productBillingService = productBillingService;
        this.payPalClient = payPalClient;
        this.stripeGuestCheckoutService = stripeGuestCheckoutService;
        this.globalPaymentProviders = globalPaymentProviders;
        this.websiteWidgetSettings = websiteWidgetSettings;
        this.invoiceOrderIdService = invoiceOrderIdService;
    }

    /** Backwards-compatible constructor used by older unit tests. Runtime wiring uses the @Autowired constructor above. */
    GuestOrderService(
            GuestTenantService guestTenantService,
            GuestCatalogService catalogService,
            GuestSettingsService guestSettings,
            CompanyRepository companies,
            GuestOrderRepository orders,
            GuestEntitlementRepository entitlements,
            GuestEntitlementUsageRepository entitlementUsages,
            SessionBookingRepository bookings,
            SessionBookingCreationService bookingCreationService,
            BookingChangePublisher bookingChangePublisher,
            UserRepository users,
            PaymentMethodRepository paymentMethods,
            GuestNotificationService notifications,
            ReminderService reminders,
            GuestEntitlementService entitlementService,
            GuestBankTransferBillingService bankTransferBillingService,
            GuestProductBillingService productBillingService,
            PayPalClient payPalClient
    ) {
        this(guestTenantService, catalogService, guestSettings, companies, orders, entitlements, entitlementUsages,
                bookings, bookingCreationService, bookingChangePublisher, users, paymentMethods, notifications, reminders,
                entitlementService, bankTransferBillingService, productBillingService, payPalClient, null, null, null, null);
    }

    /** Backwards-compatible constructor used by unit tests that mock Stripe and global payment providers. */
    GuestOrderService(
            GuestTenantService guestTenantService,
            GuestCatalogService catalogService,
            GuestSettingsService guestSettings,
            CompanyRepository companies,
            GuestOrderRepository orders,
            GuestEntitlementRepository entitlements,
            GuestEntitlementUsageRepository entitlementUsages,
            SessionBookingRepository bookings,
            SessionBookingCreationService bookingCreationService,
            BookingChangePublisher bookingChangePublisher,
            UserRepository users,
            PaymentMethodRepository paymentMethods,
            GuestNotificationService notifications,
            ReminderService reminders,
            GuestEntitlementService entitlementService,
            GuestBankTransferBillingService bankTransferBillingService,
            GuestProductBillingService productBillingService,
            PayPalClient payPalClient,
            StripeGuestCheckoutService stripeGuestCheckoutService,
            GlobalPaymentProviderService globalPaymentProviders
    ) {
        this(guestTenantService, catalogService, guestSettings, companies, orders, entitlements, entitlementUsages,
                bookings, bookingCreationService, bookingChangePublisher, users, paymentMethods, notifications, reminders,
                entitlementService, bankTransferBillingService, productBillingService, payPalClient,
                stripeGuestCheckoutService, globalPaymentProviders, null, null);
    }

    @Transactional
    public GuestDtos.CreateOrderResponse createOrder(GuestUser guestUser, GuestDtos.CreateOrderRequest request, PaymentChannel channel) {
        Long companyId = parseId(request.companyId());
        GuestTenantLink link = guestTenantService.requireLink(guestUser, companyId);
        var product = catalogService.resolveProduct(companyId, request.productId(), guestUser);
        GuestPaymentMethodType paymentMethodType = parsePaymentMethod(request.paymentMethodType());
        GuestSettingsService.GuestBookingRules rules = bookingRulesForChannel(companyId, channel);
        assertPaymentMethodAllowed(companyId, paymentMethodType, product.productType(), channel);
        assertExternalCheckoutReadyBeforeOrderCreated(link, paymentMethodType);
        cancelOpenExternalCheckoutsForGuest(guestUser, companyId, paymentMethodType);

        GuestOrder order = new GuestOrder();
        order.setCompany(link.getCompany());
        order.setClient(link.getClient());
        order.setGuestUser(guestUser);
        order.setInvoiceLocale(resolveRequestedInvoiceLocale(request.locale(), request.language(), guestUser));
        order.setStatus(OrderStatus.PENDING);
        order.setPaymentMethodType(paymentMethodType);
        order.setCurrency(product.currency());
        BigDecimal orderSubtotal = calculateOrderSubtotal(product, paymentMethodType, rules);
        order.setSubtotalGross(orderSubtotal);
        order.setTaxAmount(BigDecimal.ZERO);
        order.setTotalGross(orderSubtotal);
        order.setReferenceCode(nextGuestOrderReferenceCode(link));
        order.setMetadataJson(buildMetadataJson(request.slotId(), product, request.entitlementId()));
        order = orders.save(order);

        GuestDtos.BookingSummaryResponse bookingSummary = request.slotId() == null ? null : new GuestDtos.BookingSummaryResponse(String.valueOf(order.getId()), "PENDING_PAYMENT");
        return new GuestDtos.CreateOrderResponse(toOrder(order), bookingSummary, "CHECKOUT");
    }

    private static void applyRequestedInvoiceLocale(GuestOrder order, String locale, String language, GuestUser guestUser) {
        if (order == null) return;
        String normalized = resolveRequestedInvoiceLocale(locale, language, guestUser);
        if (normalized != null && !normalized.isBlank()) {
            order.setInvoiceLocale(normalized);
        }
    }

    private static String resolveRequestedInvoiceLocale(String locale, String language, GuestUser guestUser) {
        String requested = firstNonBlank(locale, language, guestUser == null ? null : guestUser.getLanguage());
        if (requested == null || requested.isBlank()) return null;
        String normalized = requested.trim().toLowerCase(Locale.ROOT);
        return normalized.startsWith("sl") ? "sl" : "en";
    }

    private static String firstNonBlank(String... values) {
        if (values == null) return null;
        for (String value : values) {
            if (value != null && !value.isBlank()) return value.trim();
        }
        return null;
    }

    private static BigDecimal calculateOrderSubtotal(
            GuestCatalogService.ResolvedProduct product,
            GuestPaymentMethodType paymentMethodType,
            GuestSettingsService.GuestBookingRules rules
    ) {
        if (paymentMethodType == GuestPaymentMethodType.ENTITLEMENT) {
            return BigDecimal.ZERO;
        }
        BigDecimal fullPrice = product.priceGross() == null ? BigDecimal.ZERO : product.priceGross();
        if (paymentMethodType == GuestPaymentMethodType.PAY_AT_VENUE) {
            return fullPrice;
        }
        if (!isSessionLikeProductType(product.productType())) {
            return fullPrice;
        }
        if (!rules.requireOnlinePayment()) {
            return fullPrice;
        }
        if (!"deposit".equalsIgnoreCase(rules.paymentRequirement())) {
            return fullPrice;
        }
        BigDecimal percent = BigDecimal.valueOf(Math.max(1, Math.min(100, rules.depositPercent())));
        BigDecimal deposit = fullPrice
                .multiply(percent)
                .divide(BigDecimal.valueOf(100), 2, java.math.RoundingMode.HALF_UP);
        if (deposit.compareTo(BigDecimal.ZERO) <= 0 && fullPrice.compareTo(BigDecimal.ZERO) > 0) {
            return new BigDecimal("0.01");
        }
        return deposit;
    }

    @Transactional
    public GuestDtos.CheckoutResponse checkout(GuestUser guestUser, Long orderId, GuestDtos.CheckoutRequest request, PaymentChannel channel) {
        GuestOrder order = orders.findByIdAndGuestUserId(orderId, guestUser.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Order not found."));
        GuestPaymentMethodType paymentMethodType = parsePaymentMethod(request.paymentMethodType());
        applyRequestedInvoiceLocale(order, request.locale(), request.language(), guestUser);
        if (order.getPaymentMethodType() != paymentMethodType) {
            order.setPaymentMethodType(paymentMethodType);
        }
        assertPaymentMethodAllowed(order.getCompany().getId(), paymentMethodType, inferProductType(order), channel);

        if (checkoutAlreadyCompleted(order, paymentMethodType)) {
            return completedCheckoutResponse(order, paymentMethodType);
        }

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
            Long selectedEntitlementId = extractSelectedEntitlementId(order);
            if (selectedEntitlementId != null) {
                entitlementService.consumeSelectedEntitlement(order.getClient(), order.getCompany().getId(), slotContext.sessionTypeId(), selectedEntitlementId, booking);
            } else {
                entitlementService.consumeBestMatchingEntitlement(order.getClient(), order.getCompany().getId(), slotContext.sessionTypeId(), booking);
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

        if (paymentMethodType == GuestPaymentMethodType.GIFT_CARD) {
            order.setStatus(OrderStatus.PAID);
            order.setPaidAt(Instant.now());
            order = orders.save(order);
            SessionBooking booking = maybeCreateConfirmedBooking(order);
            if (booking == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Gift card checkout requires a booking slot.");
            }
            entitlementService.consumeBestMatchingGiftCard(
                    order.getClient(),
                    order.getCompany().getId(),
                    order.getTotalGross(),
                    order.getCurrency(),
                    booking
            );
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
            String referenceCode = bankTransferReferenceForResponse(order, null, channel);
            double responseAmount = order.getTotalGross().doubleValue();
            if (booking != null) {
                var bill = bankTransferBillingService.issueConfirmedBookingBill(order, booking);
                referenceCode = bankTransferReferenceForResponse(order, bill.getBankTransferReference(), channel);
                order.setBillId(bill.getId());
                if (bill.getTotalGross() != null) {
                    order.setSubtotalGross(bill.getTotalGross());
                    order.setTaxAmount((bill.getTotalGross().subtract(bill.getTotalNet())).max(BigDecimal.ZERO));
                    order.setTotalGross(bill.getTotalGross());
                    responseAmount = bill.getTotalGross().doubleValue();
                }
                order = orders.save(order);
            } else {
                // Wallet product purchase (pack/membership/class ticket with no booking slot).
                GuestProduct walletProduct = loadWalletProduct(order);
                if (walletProduct != null) {
                    var bill = productBillingService.issuePendingBill(order, walletProduct, "BANK_TRANSFER");
                    referenceCode = bankTransferReferenceForResponse(order, bill.getBankTransferReference(), channel);
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

        if (paymentMethodType == GuestPaymentMethodType.CARD) {
            // Do not create the tenant invoice before Stripe succeeds. The GuestOrder
            // already has the public TenantCode-client-counter reference for Wallet > Orders.
            if (stripeGuestCheckoutService == null) {
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
            StripeCheckoutSessionResult session = channel == PaymentChannel.WEBSITE
                    ? stripeGuestCheckoutService.createWebsiteWidgetCheckoutSession(order)
                    : stripeGuestCheckoutService.createCheckoutSession(order);
            order.setStripeCheckoutSessionId(session.id());
            order = orders.save(order);
            return new GuestDtos.CheckoutResponse(
                    String.valueOf(order.getId()),
                    paymentMethodType.name(),
                    order.getStatus().name(),
                    session.url(),
                    null,
                    "REDIRECT",
                    null,
                    order.getGuestUser().getStripeCustomerId(),
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


    @Transactional
    public GuestDtos.CheckoutResponse cancelPendingExternalCheckout(GuestUser guestUser, Long orderId, String checkoutSessionId) {
        GuestOrder order = orders.findByIdAndGuestUserId(orderId, guestUser.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Order not found."));
        if (order.getStatus() == OrderStatus.PAID || order.getStatus() == OrderStatus.CANCELLED) {
            return checkoutStatusResponse(order);
        }
        if (checkoutSessionId != null && !checkoutSessionId.isBlank()
                && order.getStripeCheckoutSessionId() != null && !order.getStripeCheckoutSessionId().isBlank()
                && !checkoutSessionId.equals(order.getStripeCheckoutSessionId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Checkout session does not match guest order.");
        }
        cancelUnfinishedExternalOrder(order);
        order = orders.findById(order.getId()).orElse(order);
        return checkoutStatusResponse(order);
    }

    private GuestDtos.CheckoutResponse checkoutStatusResponse(GuestOrder order) {
        return new GuestDtos.CheckoutResponse(
                String.valueOf(order.getId()),
                order.getPaymentMethodType().name(),
                order.getStatus().name(),
                null,
                null,
                "COMPLETE",
                null,
                order.getGuestUser() == null ? null : order.getGuestUser().getStripeCustomerId(),
                null,
                order.getCompany().getName()
        );
    }

    private boolean checkoutAlreadyCompleted(GuestOrder order, GuestPaymentMethodType paymentMethodType) {
        if (order == null || paymentMethodType == null) {
            return false;
        }
        if (order.getStatus() == OrderStatus.PAID
                && (paymentMethodType == GuestPaymentMethodType.PAY_AT_VENUE
                || paymentMethodType == GuestPaymentMethodType.ENTITLEMENT
                || paymentMethodType == GuestPaymentMethodType.GIFT_CARD
                || paymentMethodType == GuestPaymentMethodType.CARD
                || paymentMethodType == GuestPaymentMethodType.PAYPAL)) {
            return true;
        }
        // Bank transfer keeps the order PENDING until the bank payment is reconciled.
        // Once a bill exists, checkout has already created the booking/invoice, so a browser
        // retry or double click must return the same instructions instead of creating another
        // booking/bill or failing with a stale-slot validation error.
        return paymentMethodType == GuestPaymentMethodType.BANK_TRANSFER && order.getBillId() != null;
    }

    private GuestDtos.CheckoutResponse completedCheckoutResponse(GuestOrder order, GuestPaymentMethodType paymentMethodType) {
        if (paymentMethodType == GuestPaymentMethodType.BANK_TRANSFER) {
            boolean hasBooking = findBookingForOrder(order) != null;
            double responseAmount = order.getTotalGross() == null ? 0.0 : order.getTotalGross().doubleValue();
            return new GuestDtos.CheckoutResponse(
                    String.valueOf(order.getId()),
                    paymentMethodType.name(),
                    order.getStatus().name(),
                    null,
                    new GuestDtos.BankTransferInstructionsResponse(
                            responseAmount,
                            order.getCurrency(),
                            bankTransferReferenceForResponse(order, null, null),
                            hasBooking
                                    ? "Booking confirmed. We emailed your folio/invoice PDF. Use the QR code or reference on the invoice to complete the bank transfer."
                                    : "We emailed your invoice PDF. Use the QR code or reference on the invoice to complete the bank transfer."
                    ),
                    "SHOW_INSTRUCTIONS",
                    null,
                    null,
                    null,
                    order.getCompany().getName()
            );
        }
        return new GuestDtos.CheckoutResponse(
                String.valueOf(order.getId()),
                paymentMethodType.name(),
                order.getStatus().name(),
                null,
                null,
                "COMPLETE",
                null,
                order.getGuestUser() == null ? null : order.getGuestUser().getStripeCustomerId(),
                null,
                order.getCompany().getName()
        );
    }

    private void assertExternalCheckoutReadyBeforeOrderCreated(GuestTenantLink link, GuestPaymentMethodType paymentMethodType) {
        if (paymentMethodType != GuestPaymentMethodType.CARD || stripeGuestCheckoutService == null) {
            return;
        }
        // Stripe Checkout needs a saved order id for metadata/return URLs, but Stripe Connect
        // readiness can be checked before persisting anything. If onboarding is incomplete,
        // fail here so the guest sees the Stripe error without a new PENDING order appearing.
        stripeGuestCheckoutService.assertCheckoutReady(link.getCompany());
    }

    private void cancelOpenExternalCheckoutsForGuest(GuestUser guestUser, Long companyId, GuestPaymentMethodType newPaymentMethodType) {
        if (guestUser == null || companyId == null) return;
        if (newPaymentMethodType != GuestPaymentMethodType.CARD && newPaymentMethodType != GuestPaymentMethodType.PAYPAL) return;
        orders.findAllByGuestUserIdAndCompanyIdAndStatusOrderByCreatedAtDesc(
                        guestUser.getId(), companyId, OrderStatus.PENDING, PageRequest.of(0, 50)
                )
                .stream()
                .filter(order -> order.getPaymentMethodType() == GuestPaymentMethodType.CARD
                        || order.getPaymentMethodType() == GuestPaymentMethodType.PAYPAL)
                .forEach(this::cancelUnfinishedExternalOrder);
    }

    private void cancelUnfinishedExternalOrder(GuestOrder order) {
        if (order == null || order.getStatus() == OrderStatus.PAID || order.getStatus() == OrderStatus.CANCELLED) return;
        Long unpaidBillId = order.getBillId();
        order.setBillId(null);
        order.setStatus(OrderStatus.CANCELLED);
        order.setCancelledAt(Instant.now());
        orders.save(order);
        if (productBillingService != null) {
            productBillingService.deleteUnpaidBill(unpaidBillId);
        }
    }

    private String bankTransferReferenceForResponse(GuestOrder order, String bankTransferReference, PaymentChannel channel) {
        // Bank-transfer instructions should always show the public order id as "Sklic".
        // The same reference is now used in the guest app, website widget, invoice PDF/QR
        // payload, and bank reconciliation whenever a public order id exists.
        return publicOrderReference(order);
    }

    private String publicOrderReference(GuestOrder order) {
        if (order == null) {
            return "";
        }
        if (order.getReferenceCode() != null && !order.getReferenceCode().isBlank()) {
            return order.getReferenceCode().trim();
        }
        return order.getId() == null ? "" : String.valueOf(order.getId());
    }

    private String nextGuestOrderReferenceCode(GuestTenantLink link) {
        if (invoiceOrderIdService != null) {
            try {
                String value = invoiceOrderIdService.nextOrderId(link.getCompany(), link.getClient());
                if (value != null && !value.isBlank() && !orders.existsByReferenceCode(value)) {
                    return value;
                }
            } catch (Exception ignored) {
                // Fall back to a random code instead of blocking checkout if the counter is unavailable.
            }
        }
        for (int attempt = 0; attempt < 20; attempt++) {
            String fallback = "ORD-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(Locale.ROOT);
            if (!orders.existsByReferenceCode(fallback)) {
                return fallback;
            }
        }
        return "ORD-" + UUID.randomUUID().toString().toUpperCase(Locale.ROOT);
    }

    private String buildMetadataJson(String slotId, GuestCatalogService.ResolvedProduct product, String entitlementId) {
        try {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("slotId", slotId);
            map.put("entitlementId", entitlementId == null || entitlementId.isBlank() ? null : entitlementId);
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

    private Long extractSelectedEntitlementId(GuestOrder order) {
        try {
            Map<?, ?> map = JSON.readValue(order.getMetadataJson(), Map.class);
            Object raw = map.get("entitlementId");
            if (raw == null) return null;
            String text = String.valueOf(raw).trim();
            if (text.isBlank() || "null".equalsIgnoreCase(text)) return null;
            return Long.parseLong(text);
        } catch (Exception ex) {
            return null;
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

    private void assertPaymentMethodAllowed(Long companyId, GuestPaymentMethodType paymentMethodType, String productType, PaymentChannel channel) {
        GuestSettingsService.GuestBookingRules rules = bookingRulesForChannel(companyId, channel);
        boolean billingEnabled = billingEnabledForChannel(companyId, channel);
        boolean advanceBillingEnabled = advanceBillingEnabledForChannel(companyId, channel);

        if (!billingEnabled) {
            if (paymentMethodType != GuestPaymentMethodType.PAY_AT_VENUE || !isSessionLikeProductType(productType)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Billing is disabled for this tenant.");
            }
        }

        if (!advanceBillingEnabled
                && isSessionLikeProductType(productType)
                && paymentMethodType != GuestPaymentMethodType.PAY_AT_VENUE
                && paymentMethodType != GuestPaymentMethodType.ENTITLEMENT
                && paymentMethodType != GuestPaymentMethodType.GIFT_CARD) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Advance payments are disabled for this tenant.");
        }

        if (paymentMethodType == GuestPaymentMethodType.PAY_AT_VENUE) {
            if (!isSessionLikeProductType(productType)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Pay at venue is only allowed for session bookings.");
            }
            boolean websitePayAtVenueAllowed = channel == PaymentChannel.WEBSITE
                    && websiteWidgetSettings != null
                    && websiteWidgetSettings.widgetSettings(companyId).paymentOnLocation();
            if (rules.requireOnlinePayment() && !websitePayAtVenueAllowed) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This tenant requires online payment for bookings.");
            }
            return;
        }

        if (!rules.requireOnlinePayment()
                && isSessionLikeProductType(productType)
                && paymentMethodType != GuestPaymentMethodType.ENTITLEMENT
                && paymentMethodType != GuestPaymentMethodType.GIFT_CARD) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Use pay at venue to complete this booking without online payment.");
        }

        if (paymentMethodType == GuestPaymentMethodType.CARD
                && globalPaymentProviders != null
                && !globalPaymentProviders.isStripeEnabled()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Stripe is disabled in Platform Admin.");
        }
        if (paymentMethodType == GuestPaymentMethodType.PAYPAL
                && globalPaymentProviders != null
                && !globalPaymentProviders.isPaypalEnabled()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "PayPal is disabled in Platform Admin.");
        }

        if (paymentMethodType != GuestPaymentMethodType.ENTITLEMENT) {
            List<String> accepted = acceptedPaymentMethodsForChannel(companyId, channel);
            if (!accepted.contains(paymentMethodType.name())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This payment method is not enabled for this tenant.");
            }
        }

        if (paymentMethodType == GuestPaymentMethodType.ENTITLEMENT) {
            if (!("SESSION_SINGLE".equals(productType) || "CLASS_TICKET".equals(productType))) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Memberships and packs can only be used to pay for bookable sessions.");
            }
            return;
        }
        if (paymentMethodType == GuestPaymentMethodType.GIFT_CARD) {
            if (!("SESSION_SINGLE".equals(productType) || "CLASS_TICKET".equals(productType))) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Gift cards can only be used to pay for bookable sessions.");
            }
            return;
        }
        List<PaymentMethod> methods = paymentMethods.findAllByCompanyIdOrderByNameAsc(companyId);

        if (paymentMethodType == GuestPaymentMethodType.PAYPAL) {
            String merchantId = companies.findById(companyId).map(c -> c.getPaypalMerchantId()).orElse(null);
            if (merchantId == null || merchantId.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "PayPal is not configured for this tenancy.");
            }
            PaymentMethod method = methods.stream()
                    .filter(pm -> isChannelEnabled(pm, channel) && matches(pm, paymentMethodType))
                    .findFirst()
                    .orElse(null);
            if (method == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "PayPal is not enabled for the selected booking channel.");
            }
            if (!allowedGuestProductTypes(method).contains(productType)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This payment method is not allowed for the selected product.");
            }
            return;
        }
        PaymentMethod method = methods.stream()
                .filter(pm -> isChannelEnabled(pm, channel) && matches(pm, paymentMethodType))
                .findFirst()
                .orElse(null);
        if (method == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This payment method is not enabled for the selected booking channel.");
        }
        if (!allowedGuestProductTypes(method).contains(productType)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This payment method is not allowed for the selected product.");
        }
    }

    private GuestSettingsService.GuestBookingRules bookingRulesForChannel(Long companyId, PaymentChannel channel) {
        if (channel == PaymentChannel.WEBSITE && websiteWidgetSettings != null) {
            return websiteWidgetSettings.bookingRules(companyId);
        }
        return catalogService.bookingRules(companyId);
    }

    private boolean billingEnabledForChannel(Long companyId, PaymentChannel channel) {
        if (channel == PaymentChannel.WEBSITE && websiteWidgetSettings != null) {
            return websiteWidgetSettings.billingEnabled(companyId);
        }
        return !Boolean.FALSE.equals(guestSettings.billingEnabled(companyId));
    }

    private boolean advanceBillingEnabledForChannel(Long companyId, PaymentChannel channel) {
        if (channel == PaymentChannel.WEBSITE && websiteWidgetSettings != null) {
            return websiteWidgetSettings.advanceBillingEnabled(companyId);
        }
        return guestSettings.advanceBillingEnabled(companyId);
    }

    private List<String> acceptedPaymentMethodsForChannel(Long companyId, PaymentChannel channel) {
        if (channel == PaymentChannel.WEBSITE && websiteWidgetSettings != null) {
            return websiteWidgetSettings.acceptedPaymentMethods(companyId);
        }
        return guestSettings.acceptedPaymentMethods(companyId);
    }

    private boolean matches(PaymentMethod method, GuestPaymentMethodType type) {
        return (type == GuestPaymentMethodType.CARD && method.getPaymentType() == PaymentType.CARD && method.isStripeEnabled())
                || (type == GuestPaymentMethodType.BANK_TRANSFER && method.getPaymentType() == PaymentType.BANK_TRANSFER)
                || (type == GuestPaymentMethodType.PAYPAL && method.getPaymentType() == PaymentType.OTHER);
    }

    private boolean isChannelEnabled(PaymentMethod method, PaymentChannel channel) {
        if (channel == PaymentChannel.WEBSITE) {
            // Website visibility is controlled by Configuration -> Website acceptedPaymentMethods.
            // Reuse existing guest-enabled payment method rows so tenants do not have to enable
            // the same method again in Billing > Payment methods just for the website widget.
            return method.isGuestEnabled() || method.isWidgetEnabled();
        }
        // Guest mobile app availability is controlled by tenant acceptedPaymentMethods,
        // not per-method guestEnabled flags from Billing > Payment methods.
        return true;
    }

    private List<String> allowedGuestProductTypes(PaymentMethod method) {
        return ALL_ALLOWED_GUEST_PRODUCT_TYPES;
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
        // UI as a PAID invoice. Session-linked paid guest bookings always receive an ADVANCE bill.
        if (booking == null
                && (paymentMethodType == GuestPaymentMethodType.CARD
                        || paymentMethodType == GuestPaymentMethodType.PAYPAL)) {
            GuestProduct walletProduct = loadWalletProduct(order);
            if (walletProduct != null) {
                try {
                    var bill = productBillingService.issuePendingBill(order, walletProduct, paymentMethodType.name());
                    bill = productBillingService.markBillPaid(bill, java.time.OffsetDateTime.now());
                    order.setBillId(bill.getId());
                    if (bill.getOrderId() != null && !bill.getOrderId().isBlank()) {
                        order.setReferenceCode(bill.getOrderId());
                    }
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
            if (!("PACK".equals(typeName) || "MEMBERSHIP".equals(typeName) || "CLASS_TICKET".equals(typeName) || "GIFT_CARD".equals(typeName) || "COURSE".equals(typeName))) {
                return null;
            }
            return catalogService
                    .resolveProduct(order.getCompany().getId(), String.valueOf(guestProductId), order.getGuestUser())
                    .persistedProduct();
        } catch (Exception ex) {
            return null;
        }
    }

    @Transactional
    public GuestOrder onStripeCheckoutCompleted(Long orderId, String checkoutSessionId, String paymentIntentId, String customerId) {
        if (orderId == null) {
            return orders.findByStripeCheckoutSessionId(checkoutSessionId)
                    .map(order -> onStripeCheckoutCompleted(order.getId(), checkoutSessionId, paymentIntentId, customerId))
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Guest order not found for Stripe checkout session."));
        }
        GuestOrder order = orders.findById(orderId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Guest order not found for Stripe checkout session."));
        if (order.getStatus() == OrderStatus.PAID) {
            return order;
        }
        if (checkoutSessionId != null && !checkoutSessionId.isBlank()
                && order.getStripeCheckoutSessionId() != null && !order.getStripeCheckoutSessionId().isBlank()
                && !checkoutSessionId.equals(order.getStripeCheckoutSessionId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Stripe session does not match guest order.");
        }
        order.setStripePaymentIntentId(paymentIntentId == null || paymentIntentId.isBlank() ? order.getStripePaymentIntentId() : paymentIntentId);
        order.setStripeCustomerId(customerId == null || customerId.isBlank() ? order.getStripeCustomerId() : customerId);
        return markOrderPaid(order, GuestPaymentMethodType.CARD, null);
    }

    @Transactional
    public void onStripeCheckoutExpiredOrFailed(Long orderId, String checkoutSessionId) {
        GuestOrder order = orderId == null
                ? orders.findByStripeCheckoutSessionId(checkoutSessionId).orElse(null)
                : orders.findById(orderId).orElse(null);
        if (order == null || order.getStatus() == OrderStatus.PAID) return;
        if (checkoutSessionId != null && !checkoutSessionId.isBlank()
                && order.getStripeCheckoutSessionId() != null && !order.getStripeCheckoutSessionId().isBlank()
                && !checkoutSessionId.equals(order.getStripeCheckoutSessionId())) {
            return;
        }
        cancelUnfinishedExternalOrder(order);
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
        orders.findByBillId(billId).ifPresent(order -> {
            if (order.getStatus() != OrderStatus.PAID) {
                markOrderPaid(order, order.getPaymentMethodType(), null);
            } else {
                // Idempotent safety net: if an order was already flipped to PAID but the
                // entitlement was not created (for example before this listener existed),
                // make sure Client > Wallet and guest mobile Wallet get the entitlement.
                maybeCreateEntitlement(order);
            }
        });
    }

    /**
     * Reconciles paid wallet-product orders for the client. This makes Client > Wallet
     * self-healing for already-paid invoices where the payment event was missed.
     */
    @Transactional
    public void ensurePaidWalletEntitlementsForClient(Long clientId, Long companyId) {
        if (clientId == null || companyId == null) return;
        orders.findAllByClientIdAndCompanyIdAndStatusOrderByCreatedAtDesc(clientId, companyId, OrderStatus.PAID)
                .forEach(this::maybeCreateEntitlement);
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
                bookingChangePublisher.publish(
                        existing.getCompany().getId(),
                        existing.getId(),
                        existing.getStartTime(),
                        existing.getEndTime(),
                        BookingChangePublisher.BOOKING_UPDATED
                );
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

            String slotText = String.valueOf(rawSlot);
            String[] parts = slotText.split("\\|");
            if (GuestCatalogService.isGroupSlotToken(slotText)) {
                Long groupBookingId = GuestCatalogService.groupBookingIdFromSlotToken(slotText);
                if (groupBookingId == null || parts.length < 4) {
                    return null;
                }
                return new SlotContext(
                        Long.parseLong(String.valueOf(rawTypeId)),
                        null,
                        java.time.LocalDateTime.parse(parts[2]),
                        java.time.LocalDateTime.parse(parts[3]),
                        groupBookingId
                );
            }
            if (parts.length < 3) {
                return null;
            }

            Long consultantId = parseOptionalConsultantId(parts[0]);
            return new SlotContext(
                    Long.parseLong(String.valueOf(rawTypeId)),
                    consultantId,
                    java.time.LocalDateTime.parse(parts[1]),
                    java.time.LocalDateTime.parse(parts[2]),
                    null
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
        try {
            if (slotContext.groupSessionId() != null) {
                return bookingCreationService.joinClientToGroupSession(new SessionBookingCreationService.GroupJoinRequest(
                        order.getCompany().getId(),
                        slotContext.groupSessionId(),
                        order.getClient().getId(),
                        "GUEST_APP",
                        String.valueOf(order.getId()),
                        String.valueOf(order.getGuestUser().getId()),
                        status,
                        "CONFIRMED".equalsIgnoreCase(status)
                ));
            }
            User consultant = resolveBookingConsultant(order, slotContext);
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
            if (!("PACK".equals(productTypeName) || "MEMBERSHIP".equals(productTypeName) || "CLASS_TICKET".equals(productTypeName) || "GIFT_CARD".equals(productTypeName) || "COURSE".equals(productTypeName))) return;
            Long guestProductIdLong = Long.parseLong(String.valueOf(guestProductId));
            GuestProduct product = catalogService.resolveProduct(order.getCompany().getId(), String.valueOf(guestProductIdLong), order.getGuestUser()).persistedProduct();
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

    private record SlotContext(Long sessionTypeId, Long consultantId, java.time.LocalDateTime startsAt, java.time.LocalDateTime endsAt, Long groupSessionId) {}

    public enum PaymentChannel {
        GUEST,
        WEBSITE
    }
}
