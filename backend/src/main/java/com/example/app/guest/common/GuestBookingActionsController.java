package com.example.app.guest.common;

import com.example.app.observability.legacy.LegacyEndpointDefinition;
import com.example.app.observability.legacy.TrackLegacyEndpoint;
import com.example.app.billing.Bill;
import com.example.app.billing.BillFolioPdfService;
import com.example.app.billing.BillRepository;
import com.example.app.billing.InvoicePdfS3Service;
import com.example.app.billing.OpenBillSyncService;
import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.guest.auth.GuestAuthContextService;
import com.example.app.guest.catalog.GuestCatalogService;
import com.example.app.guest.model.GuestOrder;
import com.example.app.guest.model.GuestOrderRepository;
import com.example.app.guest.model.GuestUser;
import com.example.app.guest.order.GuestEntitlementService;
import com.example.app.guest.tenant.GuestTenantService;
import com.example.app.session.BookingChangePublisher;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingCreationService;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.SessionBookingRealtimeService;
import com.example.app.session.SessionBookingStatus;
import com.example.app.user.UserRepository;
import com.example.app.widget.WidgetBookingIdempotencyService;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Objects;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/guest")
public class GuestBookingActionsController {
    private final GuestAuthContextService authContextService;
    private final SessionBookingRepository bookings;
    private final GuestTenantService tenantService;
    private final GuestCatalogService catalogService;
    private final UserRepository users;
    private final GuestOrderRepository orders;
    private final BillRepository bills;
    private final BillFolioPdfService billFolioPdfService;
    private final InvoicePdfS3Service invoicePdfS3Service;
    private final GuestEntitlementService entitlementService;
    private final SessionBookingRealtimeService bookingRealtimeService;
    private final BookingChangePublisher bookingChangePublisher;
    private final OpenBillSyncService openBillSyncService;
    private final CompanyRepository companies;
    private final SessionBookingCreationService bookingCreationService;
    private final WidgetBookingIdempotencyService idempotencyService;

    public GuestBookingActionsController(GuestAuthContextService authContextService, SessionBookingRepository bookings, GuestTenantService tenantService, GuestCatalogService catalogService, UserRepository users, GuestOrderRepository orders, BillRepository bills, BillFolioPdfService billFolioPdfService, InvoicePdfS3Service invoicePdfS3Service, GuestEntitlementService entitlementService, SessionBookingRealtimeService bookingRealtimeService, BookingChangePublisher bookingChangePublisher, OpenBillSyncService openBillSyncService, CompanyRepository companies, SessionBookingCreationService bookingCreationService, WidgetBookingIdempotencyService idempotencyService) {
        this.authContextService = authContextService;
        this.bookings = bookings;
        this.tenantService = tenantService;
        this.catalogService = catalogService;
        this.users = users;
        this.orders = orders;
        this.bills = bills;
        this.billFolioPdfService = billFolioPdfService;
        this.invoicePdfS3Service = invoicePdfS3Service;
        this.entitlementService = entitlementService;
        this.bookingRealtimeService = bookingRealtimeService;
        this.bookingChangePublisher = bookingChangePublisher;
        this.openBillSyncService = openBillSyncService;
        this.companies = companies;
        this.bookingCreationService = bookingCreationService;
        this.idempotencyService = idempotencyService;
    }

    @GetMapping(value = "/bookings/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@RequestParam Long companyId, HttpServletRequest request) {
        GuestUser guestUser = authContextService.requireGuest(request);
        tenantService.requireLink(guestUser, companyId);
        return bookingRealtimeService.subscribe(companyId);
    }

    @Transactional
    @PostMapping("/bookings/{bookingId}/cancel")
    public GuestDtos.BookingActionResponse cancel(
            @PathVariable Long bookingId,
            @RequestBody(required = false) GuestDtos.CancelBookingRequest payload,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            HttpServletRequest request
    ) {
        GuestUser guestUser = authContextService.requireGuest(request);
        Company company = requireCompanyForGuestAction(guestUser, bookingId);
        return idempotencyService.execute(
                company,
                "guest-booking-cancel:" + bookingId,
                idempotencyKey,
                new GuestBookingActionIdempotencyRequest(bookingId, payload),
                GuestDtos.BookingActionResponse.class,
                () -> cancelLocked(guestUser, bookingId, company.getId())
        );
    }

    @Transactional
    @PostMapping("/bookings/{bookingId}/reschedule")
    public GuestDtos.BookingActionResponse reschedule(
            @PathVariable Long bookingId,
            @RequestBody GuestDtos.RescheduleBookingRequest payload,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            HttpServletRequest request
    ) {
        GuestUser guestUser = authContextService.requireGuest(request);
        Company company = requireCompanyForGuestAction(guestUser, bookingId);
        return idempotencyService.execute(
                company,
                "guest-booking-reschedule:" + bookingId,
                idempotencyKey,
                new GuestBookingActionIdempotencyRequest(bookingId, payload),
                GuestDtos.BookingActionResponse.class,
                () -> rescheduleLocked(guestUser, bookingId, company.getId(), payload)
        );
    }

    @GetMapping("/orders/{orderId}/receipt")
    @TrackLegacyEndpoint(LegacyEndpointDefinition.GUEST_RECEIPT_METADATA)
    public GuestDtos.ReceiptResponse receipt(@PathVariable Long orderId, HttpServletRequest request) {
        GuestUser guestUser = authContextService.requireGuest(request);
        GuestOrder order = requireOwnedOrder(guestUser, orderId);
        String type = order.getStatus().name().equals("PAID") ? "RECEIPT" : "PAYMENT_INSTRUCTIONS";
        return new GuestDtos.ReceiptResponse(String.valueOf(order.getId()), "/api/guest/orders/" + order.getId() + "/receipt.pdf", type);
    }

    @GetMapping(value = "/orders/{orderId}/receipt.pdf", produces = MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<byte[]> receiptPdf(@PathVariable Long orderId, HttpServletRequest request) {
        GuestUser guestUser = authContextService.requireGuest(request);
        GuestOrder order = requireOwnedOrder(guestUser, orderId);
        Bill bill = requireOrderBill(order);
        byte[] pdf = invoicePdfS3Service.downloadIfPresent(bill);
        if (pdf == null) {
            pdf = billFolioPdfService.generate(bill, bill.getCompany().getId(), guestUser.getLanguage());
        }
        String fileName = receiptFileName(order, bill);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + fileName + "\"")
                .contentType(MediaType.APPLICATION_PDF)
                .body(pdf);
    }

    private Company requireCompanyForGuestAction(GuestUser guestUser, Long bookingId) {
        Long companyId = bookings.findCompanyIdById(bookingId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Booking not found."));
        tenantService.requireLink(guestUser, companyId);
        return companies.findById(companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Company not found."));
    }

    private void lockCompanyForGuestAction(Long companyId) {
        companies.findByIdForUpdate(companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Company not found."));
    }

    private GuestDtos.BookingActionResponse cancelLocked(GuestUser guestUser, Long bookingId, Long companyId) {
        lockCompanyForGuestAction(companyId);
        SessionBooking booking = requireGuestBooking(guestUser, bookingId);
        if (SessionBookingStatus.CANCELLED.equalsIgnoreCase(booking.getBookingStatus())) {
            return actionResponse(booking, false);
        }
        var rules = catalogService.bookingRules(booking.getCompany().getId());
        if (!rules.cancellationAllowed()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cancellation is not available for this business.");
        }
        LocalDateTime now = LocalDateTime.now();
        if (booking.getStartTime() != null && !booking.getStartTime().isAfter(now)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This booking has already started.");
        }
        long hoursUntil = booking.getStartTime() == null ? Long.MAX_VALUE : Duration.between(now, booking.getStartTime()).toHours();
        boolean lateCancel = hoursUntil < rules.cancelUntilHours();
        boolean groupBooking = booking.getClientGroup() != null;
        boolean creditConsumed = !groupBooking && lateCancel && rules.lateCancelConsumesCredit();
        booking.setBookingStatus(SessionBookingStatus.CANCELLED);
        bookings.save(booking);
        if (booking.getBilledAt() == null && booking.getId() != null) {
            openBillSyncService.removeSessionRowsFromOpenBills(booking.getCompany().getId(), java.util.List.of(booking.getId()));
        }
        if (!creditConsumed) {
            entitlementService.maybeRestoreCreditForBooking(booking);
        }
        bookingChangePublisher.publish(
                booking.getCompany().getId(),
                booking.getId(),
                booking.getStartTime(),
                booking.getEndTime(),
                BookingChangePublisher.BOOKING_CANCELLED,
                "GUEST_APP",
                null
        );
        return actionResponse(booking, creditConsumed);
    }

    private GuestDtos.BookingActionResponse rescheduleLocked(GuestUser guestUser, Long bookingId, Long companyId, GuestDtos.RescheduleBookingRequest payload) {
        lockCompanyForGuestAction(companyId);
        SessionBooking booking = requireGuestBooking(guestUser, bookingId);
        if (payload == null || payload.newSlotId() == null || payload.newSlotId().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "New slot is required.");
        }
        if (SessionBookingStatus.CANCELLED.equalsIgnoreCase(booking.getBookingStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cancelled bookings cannot be rescheduled.");
        }
        if (booking.getType() == null || booking.getType().getId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Booking service is missing.");
        }
        var rules = catalogService.bookingRules(booking.getCompany().getId());
        if (!rules.modificationAllowed()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Modification is not available for this business.");
        }
        LocalDateTime now = LocalDateTime.now();
        if (booking.getStartTime() != null && !booking.getStartTime().isAfter(now)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This booking has already started.");
        }
        long hoursUntil = booking.getStartTime() == null ? Long.MAX_VALUE : Duration.between(now, booking.getStartTime()).toHours();
        if (hoursUntil < rules.rescheduleUntilHours()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Reschedule window has passed.");
        }

        var slot = catalogService.requireBookableRescheduleSlot(
                booking.getCompany().getId(),
                booking.getType().getId(),
                payload.newSlotId(),
                booking.getId(),
                guestUser
        );
        var consultant = users.findByIdAndCompanyId(slot.consultantId(), booking.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Consultant not found."));

        bookingCreationService.validateBookingWindow(
                booking.getCompany().getId(),
                java.util.List.of(booking.getClient().getId()),
                consultant.getId(),
                booking.getSpace() == null ? null : booking.getSpace().getId(),
                slot.startsAt(),
                slot.endsAt(),
                booking.getType().getId(),
                SessionBookingCreationService.bookingExcludeIds(booking.getId()),
                bookingCreationService.isSpacesEnabled(booking.getCompany().getId()),
                bookingCreationService.isMultipleSessionsPerSpaceEnabled(booking.getCompany().getId()),
                bookingCreationService.isMultipleClientsPerSessionEnabled(booking.getCompany().getId()),
                booking.isOnlineSession(),
                false
        );

        LocalDateTime previousStartTime = booking.getStartTime();
        booking.setConsultant(consultant);
        booking.setStartTime(slot.startsAt());
        booking.setEndTime(slot.endsAt());
        booking.setBookingStatus(SessionBookingStatus.RESERVED);
        bookings.save(booking);
        bookingChangePublisher.publish(
                booking.getCompany().getId(),
                booking.getId(),
                booking.getStartTime(),
                booking.getEndTime(),
                BookingChangePublisher.BOOKING_RESCHEDULED,
                "GUEST_APP",
                previousStartTime
        );
        return actionResponse(booking, false);
    }

    private static GuestDtos.BookingActionResponse actionResponse(SessionBooking booking, Boolean creditConsumed) {
        return new GuestDtos.BookingActionResponse(
                String.valueOf(booking.getId()),
                booking.getBookingStatus(),
                creditConsumed,
                booking.getStartTime() == null ? null : booking.getStartTime().toString(),
                booking.getEndTime() == null ? null : booking.getEndTime().toString()
        );
    }

    private record GuestBookingActionIdempotencyRequest(Long bookingId, Object payload) {}

    private SessionBooking requireGuestBooking(GuestUser guestUser, Long bookingId) {
        return bookings.findById(bookingId)
                .filter(booking -> booking.getClient() != null)
                .filter(booking -> tenantService.requireLink(guestUser, booking.getCompany().getId()).getClient().getId().equals(booking.getClient().getId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Booking not found."));
    }

    private GuestOrder requireOwnedOrder(GuestUser guestUser, Long orderId) {
        return orders.findByIdAndGuestUserId(orderId, guestUser.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Order not found."));
    }

    private Bill requireOrderBill(GuestOrder order) {
        Long billId = order.getBillId();
        if (billId == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Receipt is not available for this order yet.");
        }
        return bills.findByIdAndCompanyId(billId, order.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Receipt bill not found."));
    }

    private static String receiptFileName(GuestOrder order, Bill bill) {
        String base = bill.getBillNumber();
        if (base == null || base.isBlank()) {
            String referenceCode = order.getReferenceCode();
            if (referenceCode != null && !referenceCode.isBlank()) {
                base = "receipt-" + referenceCode;
            } else {
                base = "receipt-order-" + order.getId();
            }
        }
        String safe = base.replaceAll("[^a-zA-Z0-9._-]", "_");
        if (!safe.toLowerCase().endsWith(".pdf")) {
            safe += ".pdf";
        }
        return safe;
    }
}
