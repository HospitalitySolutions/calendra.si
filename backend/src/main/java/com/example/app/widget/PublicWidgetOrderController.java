package com.example.app.widget;

import com.example.app.guest.common.GuestDtos;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public (Turnstile-gated) order pipeline for the website booking widget. Mirrors the
 * guest mobile app's {@code POST /api/guest/orders} / {@code POST /api/guest/orders/{id}/checkout}
 * but delegates auth to a short-lived guest JWT issued by {@link #startSession}.
 */
@RestController
@RequestMapping("/api/public/widget")
public class PublicWidgetOrderController {
    private final PublicWidgetOrderService service;

    public PublicWidgetOrderController(PublicWidgetOrderService service) {
        this.service = service;
    }

    public record GuestSessionRequest(
            @NotBlank String firstName,
            @NotBlank String lastName,
            @NotBlank @Email String email,
            String phone,
            String companyName,
            String turnstileToken
    ) {}

    public record GuestSessionResponse(
            String token,
            String guestUserId,
            String companyId,
            String email,
            String firstName,
            String lastName
    ) {}

    @PostMapping("/{tenantCode}/guest-session")
    public GuestSessionResponse startSession(
            @PathVariable String tenantCode,
            @Valid @RequestBody GuestSessionRequest request,
            HttpServletRequest httpRequest
    ) {
        return service.startSession(tenantCode, request, httpRequest);
    }

    @PostMapping("/{tenantCode}/orders")
    public GuestDtos.CreateOrderResponse createOrder(
            @PathVariable String tenantCode,
            @RequestBody GuestDtos.CreateOrderRequest request,
            HttpServletRequest httpRequest
    ) {
        return service.createOrder(tenantCode, request, httpRequest);
    }

    @PostMapping("/{tenantCode}/orders/{orderId}/checkout")
    public GuestDtos.CheckoutResponse checkout(
            @PathVariable String tenantCode,
            @PathVariable Long orderId,
            @RequestBody GuestDtos.CheckoutRequest request,
            HttpServletRequest httpRequest
    ) {
        return service.checkout(tenantCode, orderId, request, httpRequest);
    }


    @GetMapping(value = "/stripe/return", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> stripeReturn(
            @RequestParam Long orderId,
            @RequestParam(defaultValue = "success") String status,
            @RequestParam(name = "session_id", required = false) String checkoutSessionId
    ) {
        return ResponseEntity.ok(service.renderStripeReturnPage(orderId, status, checkoutSessionId));
    }

    @GetMapping(value = "/stripe/cancel", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> stripeCancel(
            @RequestParam Long orderId,
            @RequestParam(name = "session_id", required = false) String checkoutSessionId
    ) {
        return ResponseEntity.ok(service.renderStripeCancelPage(orderId, checkoutSessionId));
    }
}
