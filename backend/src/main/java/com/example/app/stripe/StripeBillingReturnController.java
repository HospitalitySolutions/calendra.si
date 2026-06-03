package com.example.app.stripe;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/guest/stripe/billing")
public class StripeBillingReturnController {
    private static final Logger log = LoggerFactory.getLogger(StripeBillingReturnController.class);

    private final StripeWebhookService stripeWebhookService;

    public StripeBillingReturnController(StripeWebhookService stripeWebhookService) {
        this.stripeWebhookService = stripeWebhookService;
    }

    @GetMapping(value = "/return", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> paymentReturn(
            @RequestParam(defaultValue = "success") String status,
            @RequestParam(name = "billId", required = false) String billId,
            @RequestParam(name = "billNumber", required = false) String billNumber,
            @RequestParam(name = "session_id", required = false) String checkoutSessionId
    ) {
        String normalized = normalizeStatus(status);
        PageCopy copy;
        if ("success".equals(normalized)) {
            copy = reconcileAndBuildSuccessCopy(billId, billNumber, checkoutSessionId);
        } else {
            copy = new PageCopy(
                    "Payment status updated",
                    "Your payment status was updated. You can close this window.",
                    null
            );
        }
        return ResponseEntity.ok(renderPage(copy.title(), copy.message(), billNumber, checkoutSessionId, copy.detail()));
    }

    @GetMapping(value = "/cancel", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> paymentCancel(
            @RequestParam(name = "billId", required = false) String billId,
            @RequestParam(name = "billNumber", required = false) String billNumber,
            @RequestParam(name = "session_id", required = false) String checkoutSessionId
    ) {
        return ResponseEntity.ok(renderPage(
                "Payment cancelled",
                "The card payment was cancelled. You can close this window and use the payment link again if needed.",
                billNumber,
                checkoutSessionId,
                null
        ));
    }

    private PageCopy reconcileAndBuildSuccessCopy(String billId, String billNumber, String checkoutSessionId) {
        try {
            StripeWebhookService.BillCheckoutReconcileResult result = stripeWebhookService.reconcileBillCheckoutReturn(billId, checkoutSessionId);
            if (result.paid()) {
                return new PageCopy(
                        "Payment completed",
                        "Thank you. Your card payment was completed successfully. You can close this window.",
                        result.alreadyPaid() ? "This bill was already marked as paid." : "The bill has been marked as paid."
                );
            }
            return new PageCopy(
                    "Payment processing",
                    "Thank you. Stripe confirmed the checkout return, but the payment is still being finalized. You can close this window.",
                    result.paymentStatus() == null || result.paymentStatus().isBlank() ? result.status() : "Stripe payment status: " + result.paymentStatus()
            );
        } catch (Exception ex) {
            log.warn("Unable to reconcile Stripe billing return billId={} billNumber={} sessionId={}", billId, billNumber, checkoutSessionId, ex);
            return new PageCopy(
                    "Payment received",
                    "Thank you. Stripe returned you after payment. The bill will be finalized shortly.",
                    "If it remains pending, please check the Stripe webhook or server logs."
            );
        }
    }

    private static String normalizeStatus(String status) {
        String value = status == null ? "success" : status.trim().toLowerCase();
        return switch (value) {
            case "cancel", "canceled", "cancelled" -> "cancelled";
            case "error", "failed", "failure" -> "error";
            default -> "success";
        };
    }

    private static String renderPage(String title, String message, String billNumber, String checkoutSessionId, String detail) {
        String safeBill = billNumber == null || billNumber.isBlank() ? "" : "<p class=\"muted\">Bill: " + escapeHtml(billNumber) + "</p>";
        String safeDetail = detail == null || detail.isBlank() ? "" : "<p class=\"detail\">" + escapeHtml(detail) + "</p>";
        String safeSession = checkoutSessionId == null || checkoutSessionId.isBlank() ? "" : "<p class=\"tiny\">Stripe session: " + escapeHtml(checkoutSessionId) + "</p>";
        return """
                <!doctype html>
                <html lang="en">
                <head>
                  <meta charset="utf-8" />
                  <meta name="viewport" content="width=device-width,initial-scale=1" />
                  <title>%s</title>
                  <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f8fafc; color: #0f172a; padding: 32px; }
                    .card { max-width: 560px; margin: 10vh auto; background: white; border-radius: 18px; padding: 28px; box-shadow: 0 18px 48px rgba(15,23,42,.10); }
                    h1 { margin: 0 0 12px; font-size: 1.7rem; }
                    p { line-height: 1.55; margin: 0 0 10px; }
                    .muted { color: #475569; font-weight: 700; }
                    .detail { color: #64748b; }
                    .tiny { color: #94a3b8; font-size: .78rem; word-break: break-all; margin-top: 18px; }
                  </style>
                </head>
                <body>
                  <div class="card">
                    <h1>%s</h1>
                    <p>%s</p>
                    %s
                    %s
                    %s
                  </div>
                </body>
                </html>
                """.formatted(escapeHtml(title), escapeHtml(title), escapeHtml(message), safeBill, safeDetail, safeSession);
    }

    private static String escapeHtml(String value) {
        if (value == null) return "";
        return value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;");
    }

    private record PageCopy(String title, String message, String detail) {}
}
