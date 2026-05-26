package com.example.app.guest.common;

import com.example.app.guest.auth.GuestAuthContextService;
import com.example.app.guest.catalog.GuestCatalogService;
import com.example.app.guest.model.GuestUser;
import com.example.app.guest.notifications.GuestNotificationService;
import com.example.app.guest.order.GuestOrderService;
import com.example.app.guest.wallet.GuestWalletService;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/guest")
public class GuestHomeController {
    private final GuestAuthContextService authContextService;
    private final GuestHomeService homeService;
    private final GuestCatalogService catalogService;
    private final GuestOrderService orderService;
    private final GuestWalletService walletService;
    private final GuestNotificationService notificationService;

    public GuestHomeController(
            GuestAuthContextService authContextService,
            GuestHomeService homeService,
            GuestCatalogService catalogService,
            GuestOrderService orderService,
            GuestWalletService walletService,
            GuestNotificationService notificationService
    ) {
        this.authContextService = authContextService;
        this.homeService = homeService;
        this.catalogService = catalogService;
        this.orderService = orderService;
        this.walletService = walletService;
        this.notificationService = notificationService;
    }

    @GetMapping("/home")
    public GuestDtos.HomeResponse home(@RequestParam String companyId, HttpServletRequest request) {
        GuestUser guestUser = authContextService.requireGuest(request);
        return homeService.home(guestUser, Long.parseLong(companyId));
    }

    @GetMapping("/products")
    public List<GuestDtos.ProductResponse> products(@RequestParam String companyId, HttpServletRequest request) {
        GuestUser guestUser = authContextService.requireGuest(request);
        return catalogService.products(Long.parseLong(companyId), guestUser);
    }

    @GetMapping("/availability")
    public GuestDtos.AvailabilityResponse availability(@RequestParam String companyId, @RequestParam String sessionTypeId, @RequestParam String date, @RequestParam(required = false) String consultantId, HttpServletRequest request) {
        GuestUser guestUser = authContextService.requireGuest(request);
        Long consultantIdNum = (consultantId == null || consultantId.isBlank()) ? null : Long.parseLong(consultantId.trim());
        return catalogService.availability(Long.parseLong(companyId), Long.parseLong(sessionTypeId), date, consultantIdNum, guestUser);
    }

    @GetMapping("/consultants")
    public List<GuestDtos.ConsultantResponse> consultants(@RequestParam String companyId, @RequestParam String sessionTypeId, HttpServletRequest request) {
        authContextService.requireGuest(request);
        return catalogService.consultants(Long.parseLong(companyId), Long.parseLong(sessionTypeId));
    }

    @PostMapping("/orders")
    public GuestDtos.CreateOrderResponse createOrder(@RequestBody GuestDtos.CreateOrderRequest payload, HttpServletRequest request) {
        GuestUser guestUser = authContextService.requireGuest(request);
        return orderService.createOrder(guestUser, payload, GuestOrderService.PaymentChannel.GUEST);
    }

    @PostMapping("/orders/{orderId}/checkout")
    public GuestDtos.CheckoutResponse checkout(@PathVariable Long orderId, @RequestBody GuestDtos.CheckoutRequest payload, HttpServletRequest request) {
        GuestUser guestUser = authContextService.requireGuest(request);
        return orderService.checkout(guestUser, orderId, payload, GuestOrderService.PaymentChannel.GUEST);
    }


    @GetMapping(value = "/paypal/return", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> paypalReturn(@RequestParam Long orderId, @RequestParam(required = false) String token) {
        try {
            GuestOrderService.PayPalCompletionResult result = orderService.handlePayPalReturn(orderId, token);
            String target = "calendra-guest://paypal/return?status=success&orderId=" + result.order().getId();
            return ResponseEntity.ok(renderPaymentRedirectPage("PayPal payment confirmed", "Returning to the guest app…", target));
        } catch (Exception ex) {
            String target = "calendra-guest://paypal/return?status=error&orderId=" + orderId + "&message="
                    + URLEncoder.encode(ex.getMessage() == null ? "Unable to complete PayPal payment." : ex.getMessage(), StandardCharsets.UTF_8);
            return ResponseEntity.ok(renderPaymentRedirectPage("PayPal payment failed", "We could not complete the payment. Return to the app to continue.", target));
        }
    }

    @GetMapping(value = "/paypal/cancel", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> paypalCancel(@RequestParam Long orderId, @RequestParam(required = false) String token) {
        try {
            orderService.handlePayPalCancel(orderId, token);
        } catch (Exception ignore) {
        }
        String target = "calendra-guest://paypal/return?status=cancelled&orderId=" + orderId;
        return ResponseEntity.ok(renderPaymentRedirectPage("PayPal checkout canceled", "Return to the guest app to pick another payment method.", target));
    }


    @GetMapping(value = "/stripe/return", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> stripeReturn(
            @RequestParam Long orderId,
            @RequestParam(defaultValue = "success") String status,
            @RequestParam(name = "session_id", required = false) String checkoutSessionId
    ) {
        String normalized = normalizeStripeReturnStatus(status);
        String target = stripeDeepLink(normalized, orderId, checkoutSessionId, null);
        String title = "success".equals(normalized) ? "Stripe payment completed" : "Stripe checkout status updated";
        String message = "success".equals(normalized)
                ? "Returning to the guest app. Your order will update as soon as Stripe confirms the payment."
                : "Returning to the guest app.";
        return ResponseEntity.ok(renderPaymentRedirectPage(title, message, target));
    }

    @GetMapping(value = "/stripe/cancel", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> stripeCancel(
            @RequestParam Long orderId,
            @RequestParam(name = "session_id", required = false) String checkoutSessionId
    ) {
        try {
            orderService.onStripeCheckoutExpiredOrFailed(orderId, checkoutSessionId);
        } catch (Exception ignore) {
        }
        String target = stripeDeepLink("cancelled", orderId, checkoutSessionId, null);
        return ResponseEntity.ok(renderPaymentRedirectPage("Stripe checkout canceled", "Returning to the guest app…", target));
    }

    private String renderPaymentRedirectPage(String title, String message, String target) {
        String safeTarget = target == null ? "calendra-guest://stripe/return?status=error" : target;
        return """
                <!doctype html>
                <html lang="en">
                <head>
                  <meta charset="utf-8" />
                  <meta name="viewport" content="width=device-width,initial-scale=1" />
                  <title>%s</title>
                  <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #f8fafc; color: #0f172a; padding: 32px; }
                    .card { max-width: 520px; margin: 10vh auto; background: white; border-radius: 16px; padding: 24px; box-shadow: 0 18px 40px rgba(15,23,42,.08); }
                    a { display: inline-block; margin-top: 16px; color: white; background: #0f4ea1; padding: 12px 18px; border-radius: 10px; text-decoration: none; font-weight: 600; }
                  </style>
                </head>
                <body>
                  <div class="card">
                    <h1>%s</h1>
                    <p>%s</p>
                    <a href="%s">Return to app</a>
                  </div>
                  <script>window.location.replace(%s);</script>
                </body>
                </html>
                """.formatted(escapeHtml(title), escapeHtml(title), escapeHtml(message), escapeHtml(safeTarget), toJsString(safeTarget));
    }


    private static String normalizeStripeReturnStatus(String status) {
        String normalized = status == null ? "success" : status.trim().toLowerCase();
        return switch (normalized) {
            case "cancel", "canceled", "cancelled" -> "cancelled";
            case "error", "failed", "failure" -> "error";
            default -> "success";
        };
    }

    private static String stripeDeepLink(String status, Long orderId, String checkoutSessionId, String message) {
        StringBuilder target = new StringBuilder("calendra-guest://stripe/return?status=")
                .append(status == null || status.isBlank() ? "success" : status)
                .append("&orderId=").append(orderId == null ? "" : orderId);
        if (checkoutSessionId != null && !checkoutSessionId.isBlank()) {
            target.append("&session_id=").append(URLEncoder.encode(checkoutSessionId, StandardCharsets.UTF_8));
        }
        if (message != null && !message.isBlank()) {
            target.append("&message=").append(URLEncoder.encode(message, StandardCharsets.UTF_8));
        }
        return target.toString();
    }

    private static String escapeHtml(String value) {
        if (value == null) return "";
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }

    private static String toJsString(String value) {
        String safe = value == null ? "" : value.replace("\\", "\\\\").replace("'", "\\'");
        return "'" + safe + "'";
    }

    @GetMapping("/wallet")
    public GuestDtos.WalletResponse wallet(@RequestParam String companyId, HttpServletRequest request) {
        GuestUser guestUser = authContextService.requireGuest(request);
        return walletService.wallet(guestUser, Long.parseLong(companyId));
    }

    @GetMapping("/bookings/history")
    public List<GuestDtos.BookingHistoryItemResponse> bookingHistory(@RequestParam String companyId, HttpServletRequest request) {
        GuestUser guestUser = authContextService.requireGuest(request);
        return walletService.history(guestUser, Long.parseLong(companyId));
    }

    @PostMapping("/wallet/entitlements/{entitlementId}/auto-renew")
    public GuestDtos.ToggleAutoRenewResponse toggleAutoRenew(@PathVariable Long entitlementId, @RequestParam String companyId, @RequestBody GuestDtos.ToggleAutoRenewRequest payload, HttpServletRequest request) {
        GuestUser guestUser = authContextService.requireGuest(request);
        boolean autoRenews = payload != null && Boolean.TRUE.equals(payload.autoRenews());
        return walletService.updateAutoRenew(guestUser, Long.parseLong(companyId), entitlementId, autoRenews);
    }

    @GetMapping("/notifications")
    public GuestDtos.NotificationsResponse notifications(@RequestParam String companyId, HttpServletRequest request) {
        GuestUser guestUser = authContextService.requireGuest(request);
        return notificationService.list(guestUser, Long.parseLong(companyId));
    }

    @PostMapping("/notifications/{notificationId}/read")
    public GuestDtos.ReadNotificationResponse read(@PathVariable Long notificationId, HttpServletRequest request) {
        GuestUser guestUser = authContextService.requireGuest(request);
        return notificationService.markRead(guestUser, notificationId);
    }

    @PostMapping("/notifications/read-all")
    public GuestDtos.MarkAllReadResponse readAll(@RequestParam String companyId, HttpServletRequest request) {
        GuestUser guestUser = authContextService.requireGuest(request);
        return notificationService.markAllRead(guestUser, Long.parseLong(companyId));
    }
}
