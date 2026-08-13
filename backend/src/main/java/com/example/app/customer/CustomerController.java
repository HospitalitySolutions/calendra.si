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

    public CustomerController(GuestAuthContextService authContextService, CustomerService customerService) {
        this.authContextService = authContextService;
        this.customerService = customerService;
    }

    @GetMapping("/home")
    public CustomerDtos.HomeResponse home(HttpServletRequest request) {
        return customerService.home(requireGuest(request));
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
