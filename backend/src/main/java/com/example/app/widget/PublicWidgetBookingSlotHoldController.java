package com.example.app.widget;

import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.session.BookingSlotHoldService;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/public/widget/{tenantCode}/booking-holds")
public class PublicWidgetBookingSlotHoldController {
    public record HoldErrorResponse(
            Instant timestamp,
            int status,
            String error,
            String code,
            String message,
            String path
    ) {}

    private final CompanyRepository companies;
    private final BookingSlotHoldService holds;
    private final PublicBookingWidgetService widgetService;

    public PublicWidgetBookingSlotHoldController(
            CompanyRepository companies,
            BookingSlotHoldService holds,
            PublicBookingWidgetService widgetService
    ) {
        this.companies = companies;
        this.holds = holds;
        this.widgetService = widgetService;
    }

    @PostMapping
    public BookingSlotHoldService.HoldResponse create(
            @PathVariable String tenantCode,
            @RequestBody BookingSlotHoldService.HoldRequest request,
            HttpServletRequest httpRequest
    ) {
        Company company = requireCompany(tenantCode);
        widgetService.guardPublicWidgetBookingHoldRequest(company, httpRequest, "booking-hold");
        return holds.create(company.getId(), request);
    }

    @DeleteMapping("/{token}")
    public ResponseEntity<Void> release(
            @PathVariable String tenantCode,
            @PathVariable String token,
            HttpServletRequest httpRequest
    ) {
        Company company = requireCompany(tenantCode);
        widgetService.guardPublicWidgetRequest(company, httpRequest, false, "booking-hold-release");
        holds.release(company.getId(), token);
        return ResponseEntity.noContent().build();
    }


    /**
     * Production disables the default Spring error message, which previously reduced every hold
     * rejection to just {"error":"Conflict"}. Keep this endpoint safe but diagnosable by returning
     * a stable code and the non-sensitive booking conflict reason.
     */
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<HoldErrorResponse> handleStatusException(
            ResponseStatusException exception,
            HttpServletRequest request
    ) {
        int status = exception.getStatusCode().value();
        String message = exception.getReason() == null || exception.getReason().isBlank()
                ? "Booking hold request failed."
                : exception.getReason();
        return ResponseEntity.status(exception.getStatusCode()).body(new HoldErrorResponse(
                Instant.now(),
                status,
                HttpStatus.resolve(status) == null ? "Request failed" : HttpStatus.resolve(status).getReasonPhrase(),
                holdErrorCode(status, message),
                message,
                request == null ? null : request.getRequestURI()
        ));
    }

    private static String holdErrorCode(int status, String message) {
        if (status == HttpStatus.TOO_MANY_REQUESTS.value()) return "BOOKING_HOLD_RATE_LIMITED";
        if (status != HttpStatus.CONFLICT.value()) return "BOOKING_HOLD_REQUEST_FAILED";
        String reason = message == null ? "" : message.toLowerCase(Locale.ROOT);
        if (reason.contains("no longer matches the selected services")) return "SLOT_SERVICE_DURATION_MISMATCH";
        if (reason.contains("temporarily reserved by another guest")) return "SLOT_ALREADY_HELD";
        if (reason.contains("waitlist")) return "SLOT_HELD_FOR_WAITLIST";
        if (reason.contains("employee is no longer available")) return "EMPLOYEE_UNAVAILABLE";
        if (reason.contains("consultant is unavailable") || reason.contains("personal session")) {
            return "EMPLOYEE_AVAILABILITY_CONFLICT";
        }
        if (reason.contains("consultant already has") || reason.contains("space is already booked")) {
            return "SLOT_ALREADY_BOOKED";
        }
        return "BOOKING_HOLD_CONFLICT";
    }

    private Company requireCompany(String tenantCode) {
        if (tenantCode == null || tenantCode.isBlank()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Booking page not found.");
        }
        return companies.findByTenantCodeIgnoreCase(tenantCode.trim())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Booking page not found."));
    }
}
