package com.example.app.customer;

import com.example.app.guest.auth.GuestAuthContextService;
import com.example.app.guest.common.GuestDtos;
import com.example.app.guest.model.GuestUser;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/customer/v1")
public class CustomerController {
    private final GuestAuthContextService authContextService;
    private final CustomerService customerService;
    private final CustomerBookingHandoffService bookingHandoffs;
    private final CustomerCommerceService commerce;

    public CustomerController(
            GuestAuthContextService authContextService,
            CustomerService customerService,
            CustomerBookingHandoffService bookingHandoffs,
            CustomerCommerceService commerce
    ) {
        this.authContextService = authContextService;
        this.customerService = customerService;
        this.bookingHandoffs = bookingHandoffs;
        this.commerce = commerce;
    }

    @GetMapping("/home")
    public CustomerDtos.HomeResponse home(HttpServletRequest request) {
        return customerService.home(requireGuest(request));
    }

    @PostMapping("/booking-handoffs")
    public CustomerDtos.BookingHandoffResponse createBookingHandoff(
            @org.springframework.web.bind.annotation.RequestBody CustomerDtos.BookingHandoffRequest payload,
            HttpServletRequest request
    ) {
        return bookingHandoffs.issue(requireGuest(request), payload);
    }

    @GetMapping("/bookings")
    public List<CustomerDtos.BookingResponse> bookings(
            @RequestParam(defaultValue = "upcoming") String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            HttpServletRequest request
    ) {
        return customerService.bookings(requireGuest(request), status, page, size);
    }

    @GetMapping("/bookings/{bookingId}")
    public CustomerDtos.BookingResponse booking(
            @PathVariable Long bookingId,
            HttpServletRequest request
    ) {
        return customerService.booking(requireGuest(request), bookingId);
    }


    @GetMapping("/commerce/locations/{locationId}")
    public CustomerDtos.CommerceCatalogResponse commerceCatalog(
            @PathVariable Long locationId,
            HttpServletRequest request
    ) {
        return commerce.catalog(requireGuest(request), locationId);
    }

    @PostMapping("/commerce/orders")
    public GuestDtos.CreateOrderResponse createCommerceOrder(
            @org.springframework.web.bind.annotation.RequestBody CustomerDtos.CreateCommerceOrderRequest payload,
            @org.springframework.web.bind.annotation.RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            HttpServletRequest request
    ) {
        return commerce.createOrder(requireGuest(request), payload, idempotencyKey);
    }

    @PostMapping("/commerce/orders/{orderId}/checkout")
    public GuestDtos.CheckoutResponse checkoutCommerceOrder(
            @PathVariable Long orderId,
            @org.springframework.web.bind.annotation.RequestBody CustomerDtos.CustomerCheckoutRequest payload,
            @org.springframework.web.bind.annotation.RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            HttpServletRequest request
    ) {
        return commerce.checkout(requireGuest(request), orderId, payload, idempotencyKey);
    }

    @GetMapping("/commerce/orders/{orderId}")
    public CustomerDtos.WalletOrderResponse commerceOrder(
            @PathVariable Long orderId,
            HttpServletRequest request
    ) {
        return commerce.order(requireGuest(request), orderId);
    }

    @PostMapping("/commerce/orders/{orderId}/cancel")
    public CustomerDtos.WalletOrderResponse cancelCommerceCheckout(
            @PathVariable Long orderId,
            @RequestParam(name = "session_id", required = false) String checkoutSessionId,
            HttpServletRequest request
    ) {
        return commerce.cancelExternalCheckout(requireGuest(request), orderId, checkoutSessionId);
    }

    @GetMapping("/wallet")
    public CustomerDtos.WalletResponse wallet(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "100") int size,
            HttpServletRequest request
    ) {
        return customerService.wallet(requireGuest(request), page, size);
    }

    @GetMapping("/notifications")
    public CustomerDtos.NotificationsResponse notifications(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "100") int size,
            HttpServletRequest request
    ) {
        return customerService.notifications(requireGuest(request), page, size);
    }

    @PostMapping("/notifications/{notificationId}/read")
    public GuestDtos.ReadNotificationResponse markNotificationRead(
            @PathVariable Long notificationId,
            HttpServletRequest request
    ) {
        return customerService.markNotificationRead(requireGuest(request), notificationId);
    }

    @PostMapping("/notifications/read-all")
    public GuestDtos.MarkAllReadResponse markAllNotificationsRead(HttpServletRequest request) {
        return customerService.markAllNotificationsRead(requireGuest(request));
    }

    @GetMapping("/inbox/threads")
    public List<CustomerDtos.InboxThreadResponse> inboxThreads(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "100") int size,
            HttpServletRequest request
    ) {
        return customerService.inboxThreads(requireGuest(request), page, size);
    }

    private GuestUser requireGuest(HttpServletRequest request) {
        return authContextService.requireGuest(request);
    }
}
