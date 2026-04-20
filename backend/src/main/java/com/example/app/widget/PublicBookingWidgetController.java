package com.example.app.widget;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/public/widget")
public class PublicBookingWidgetController {
    private final PublicBookingWidgetService service;

    public PublicBookingWidgetController(PublicBookingWidgetService service) {
        this.service = service;
    }

    public record WidgetConfigResponse(
            String tenantCode,
            String companyName,
            boolean availabilityEnabled,
            boolean typesEnabled,
            int sessionLengthMinutes,
            String workingHoursStart,
            String workingHoursEnd,
            String timezone,
            boolean turnstileEnabled,
            String turnstileSiteKey,
            boolean employeeSelectionStep,
            AllowedPaymentMethodsResponse allowedPaymentMethods
    ) {}

    public record AllowedPaymentMethodsResponse(
            boolean card,
            boolean bankTransfer,
            boolean paypal
    ) {}

    public record WidgetServiceResponse(
            Long id,
            String name,
            String description,
            Integer durationMinutes,
            String priceLabel,
            Integer maxParticipantsPerSession,
            boolean widgetGroupBookingEnabled
    ) {}

    public record WidgetConsultantResponse(
            Long id,
            String name
    ) {}

    public record AvailabilitySlotResponse(
            String slotId,
            String label,
            String startTime,
            String endTime,
            Long consultantId,
            String consultantName
    ) {}

    public record GroupSessionSlotResponse(
            Long id,
            String label,
            String startTime,
            String endTime,
            Long consultantId,
            String consultantName,
            Integer maxParticipants,
            int bookedParticipants,
            Integer remainingSpots
    ) {}

    public record AvailabilityResponse(
            boolean availabilityEnabled,
            String date,
            List<AvailabilitySlotResponse> slots,
            List<GroupSessionSlotResponse> groupSessions
    ) {}

    public record BookingRequest(
            @NotNull Long typeId,
            @NotBlank String date,
            @NotBlank String startTime,
            Long consultantId,
            Long groupSessionId,
            @NotBlank String firstName,
            @NotBlank String lastName,
            @NotBlank @Email String email,
            @NotBlank String phone,
            String turnstileToken
    ) {}

    public record BookingResponse(
            Long bookingId,
            String serviceName,
            String startTime,
            String startsAtLabel,
            String email,
            String consultantName
    ) {}

    @GetMapping("/{tenantCode}/config")
    public WidgetConfigResponse config(@PathVariable String tenantCode, HttpServletRequest request) {
        return service.config(tenantCode, request);
    }

    @GetMapping("/{tenantCode}/services")
    public List<WidgetServiceResponse> services(@PathVariable String tenantCode, HttpServletRequest request) {
        return service.services(tenantCode, request);
    }

    @GetMapping("/{tenantCode}/consultants")
    public List<WidgetConsultantResponse> consultants(
            @PathVariable String tenantCode,
            @RequestParam Long typeId,
            HttpServletRequest request
    ) {
        return service.consultants(tenantCode, typeId, request);
    }

    @GetMapping("/{tenantCode}/availability")
    public AvailabilityResponse availability(
            @PathVariable String tenantCode,
            @RequestParam Long typeId,
            @RequestParam String date,
            @RequestParam(required = false) Long consultantId,
            HttpServletRequest request
    ) {
        return service.availability(tenantCode, typeId, date, consultantId, request);
    }

    @PostMapping("/{tenantCode}/bookings")
    public BookingResponse createBooking(
            @PathVariable String tenantCode,
            @Valid @RequestBody BookingRequest request,
            @org.springframework.web.bind.annotation.RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            HttpServletRequest httpRequest
    ) {
        return service.createBooking(tenantCode, request, idempotencyKey, httpRequest);
    }
}
