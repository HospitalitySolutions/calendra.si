package com.example.app.guest.common;

import com.example.app.guest.auth.GuestAuthContextService;
import com.example.app.guest.catalog.GuestCatalogService;
import com.example.app.guest.model.GuestOrder;
import com.example.app.guest.model.GuestOrderRepository;
import com.example.app.guest.model.GuestUser;
import com.example.app.guest.order.GuestEntitlementService;
import com.example.app.guest.tenant.GuestTenantService;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingRepository;
import com.example.app.user.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Objects;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/guest")
public class GuestBookingActionsController {
    private final GuestAuthContextService authContextService;
    private final SessionBookingRepository bookings;
    private final GuestTenantService tenantService;
    private final GuestCatalogService catalogService;
    private final UserRepository users;
    private final GuestOrderRepository orders;
    private final GuestEntitlementService entitlementService;

    public GuestBookingActionsController(GuestAuthContextService authContextService, SessionBookingRepository bookings, GuestTenantService tenantService, GuestCatalogService catalogService, UserRepository users, GuestOrderRepository orders, GuestEntitlementService entitlementService) {
        this.authContextService = authContextService;
        this.bookings = bookings;
        this.tenantService = tenantService;
        this.catalogService = catalogService;
        this.users = users;
        this.orders = orders;
        this.entitlementService = entitlementService;
    }

    @PostMapping("/bookings/{bookingId}/cancel")
    public GuestDtos.BookingActionResponse cancel(@PathVariable Long bookingId, @RequestBody(required = false) GuestDtos.CancelBookingRequest payload, HttpServletRequest request) {
        GuestUser guestUser = authContextService.requireGuest(request);
        SessionBooking booking = requireGuestBooking(guestUser, bookingId);
        var rules = catalogService.bookingRules(booking.getCompany().getId());
        LocalDateTime now = LocalDateTime.now();
        if (booking.getStartTime() != null && !booking.getStartTime().isAfter(now)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This booking has already started.");
        }
        long hoursUntil = booking.getStartTime() == null ? Long.MAX_VALUE : Duration.between(now, booking.getStartTime()).toHours();
        boolean lateCancel = hoursUntil < rules.cancelUntilHours();
        boolean creditConsumed = lateCancel && rules.lateCancelConsumesCredit();
        booking.setBookingStatus("CANCELLED");
        bookings.save(booking);
        if (!creditConsumed) {
            entitlementService.maybeRestoreCreditForBooking(booking);
        }
        return new GuestDtos.BookingActionResponse(String.valueOf(booking.getId()), booking.getBookingStatus(), creditConsumed, booking.getStartTime().toString(), booking.getEndTime().toString());
    }

    @PostMapping("/bookings/{bookingId}/reschedule")
    public GuestDtos.BookingActionResponse reschedule(@PathVariable Long bookingId, @RequestBody GuestDtos.RescheduleBookingRequest payload, HttpServletRequest request) {
        GuestUser guestUser = authContextService.requireGuest(request);
        SessionBooking booking = requireGuestBooking(guestUser, bookingId);
        var rules = catalogService.bookingRules(booking.getCompany().getId());
        long hoursUntil = Duration.between(LocalDateTime.now(), booking.getStartTime()).toHours();
        if (hoursUntil < rules.rescheduleUntilHours()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Reschedule window has passed.");
        }
        var slot = catalogService.parseSlotId(payload.newSlotId());
        var consultant = users.findByIdAndCompanyId(slot.consultantId(), booking.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Consultant not found."));
        booking.setConsultant(consultant);
        booking.setStartTime(slot.startsAt());
        booking.setEndTime(slot.endsAt());
        booking.setBookingStatus("CONFIRMED");
        bookings.save(booking);
        return new GuestDtos.BookingActionResponse(String.valueOf(booking.getId()), booking.getBookingStatus(), false, booking.getStartTime().toString(), booking.getEndTime().toString());
    }

    @GetMapping("/orders/{orderId}/receipt")
    public GuestDtos.ReceiptResponse receipt(@PathVariable Long orderId, HttpServletRequest request) {
        GuestUser guestUser = authContextService.requireGuest(request);
        GuestOrder order = orders.findByIdAndGuestUserId(orderId, guestUser.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Order not found."));
        String type = order.getStatus().name().equals("PAID") ? "RECEIPT" : "PAYMENT_INSTRUCTIONS";
        return new GuestDtos.ReceiptResponse(String.valueOf(order.getId()), "/api/guest/orders/" + order.getId() + "/receipt", type);
    }

    private SessionBooking requireGuestBooking(GuestUser guestUser, Long bookingId) {
        return bookings.findById(bookingId)
                .filter(booking -> booking.getClient() != null)
                .filter(booking -> tenantService.requireLink(guestUser, booking.getCompany().getId()).getClient().getId().equals(booking.getClient().getId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Booking not found."));
    }
}
