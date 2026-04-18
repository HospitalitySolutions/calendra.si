package com.example.app.guest.common;

import com.example.app.guest.auth.GuestAuthContextService;
import com.example.app.guest.catalog.GuestCatalogService;
import com.example.app.guest.model.GuestUser;
import com.example.app.guest.notifications.GuestNotificationService;
import com.example.app.guest.order.GuestOrderService;
import com.example.app.guest.wallet.GuestWalletService;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
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
        authContextService.requireGuest(request);
        return catalogService.products(Long.parseLong(companyId));
    }

    @GetMapping("/availability")
    public GuestDtos.AvailabilityResponse availability(@RequestParam String companyId, @RequestParam String sessionTypeId, @RequestParam String date, HttpServletRequest request) {
        authContextService.requireGuest(request);
        return catalogService.availability(Long.parseLong(companyId), Long.parseLong(sessionTypeId), date);
    }

    @PostMapping("/orders")
    public GuestDtos.CreateOrderResponse createOrder(@RequestBody GuestDtos.CreateOrderRequest payload, HttpServletRequest request) {
        GuestUser guestUser = authContextService.requireGuest(request);
        return orderService.createOrder(guestUser, payload);
    }

    @PostMapping("/orders/{orderId}/checkout")
    public GuestDtos.CheckoutResponse checkout(@PathVariable Long orderId, @RequestBody GuestDtos.CheckoutRequest payload, HttpServletRequest request) {
        GuestUser guestUser = authContextService.requireGuest(request);
        return orderService.checkout(guestUser, orderId, payload);
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
}
