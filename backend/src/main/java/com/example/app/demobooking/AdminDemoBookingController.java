package com.example.app.demobooking;

import com.example.app.demobooking.DemoBookingApiModels.AdminBookingView;
import com.example.app.demobooking.DemoBookingApiModels.AdminProfileRequest;
import com.example.app.demobooking.DemoBookingApiModels.AdminProfileView;
import com.example.app.demobooking.DemoBookingApiModels.BookingView;
import com.example.app.demobooking.DemoBookingApiModels.HostView;
import com.example.app.user.User;
import java.time.Instant;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/platform-admin/demo-bookings")
@PreAuthorize("hasRole('SUPER_ADMIN')")
public class AdminDemoBookingController {
    private final DemoBookingService service;

    public AdminDemoBookingController(DemoBookingService service) {
        this.service = service;
    }

    @GetMapping("/profile")
    public AdminProfileView profile(@AuthenticationPrincipal User me) {
        return service.adminProfile(me);
    }

    @PutMapping("/profile")
    public AdminProfileView saveProfile(@AuthenticationPrincipal User me, @RequestBody AdminProfileRequest request) {
        return service.saveAdminProfile(me, request);
    }

    @GetMapping("/hosts")
    public List<HostView> hosts() {
        return service.hosts();
    }

    @GetMapping
    public List<AdminBookingView> bookings(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to) {
        return service.adminBookings(from, to);
    }

    @PostMapping("/{bookingId}/cancel")
    public BookingView cancel(@PathVariable Long bookingId, @RequestParam(required = false) String locale) {
        return service.adminCancel(bookingId, locale);
    }
}
