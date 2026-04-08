package com.example.app.widget;

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
            String timezone
    ) {}

    public record WidgetServiceResponse(
            Long id,
            String name,
            String description,
            Integer durationMinutes,
            String priceLabel
    ) {}

    public record WidgetConsultantResponse(
            Long id,
            String name
    ) {}

    public record AvailabilitySlotResponse(
            String label,
            String startTime,
            Long consultantId,
            String consultantName
    ) {}

    public record AvailabilityResponse(
            boolean availabilityEnabled,
            String date,
            List<AvailabilitySlotResponse> slots
    ) {}

    public record BookingRequest(
            @NotNull Long typeId,
            @NotBlank String date,
            @NotBlank String startTime,
            Long consultantId,
            @NotBlank String firstName,
            @NotBlank String lastName,
            @NotBlank @Email String email,
            @NotBlank String phone
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
    public WidgetConfigResponse config(@PathVariable String tenantCode) {
        return service.config(tenantCode);
    }

    @GetMapping("/{tenantCode}/services")
    public List<WidgetServiceResponse> services(@PathVariable String tenantCode) {
        return service.services(tenantCode);
    }

    @GetMapping("/{tenantCode}/consultants")
    public List<WidgetConsultantResponse> consultants(
            @PathVariable String tenantCode,
            @RequestParam Long typeId
    ) {
        return service.consultants(tenantCode, typeId);
    }

    @GetMapping("/{tenantCode}/availability")
    public AvailabilityResponse availability(
            @PathVariable String tenantCode,
            @RequestParam Long typeId,
            @RequestParam String date,
            @RequestParam(required = false) Long consultantId
    ) {
        return service.availability(tenantCode, typeId, date, consultantId);
    }

    @PostMapping("/{tenantCode}/bookings")
    public BookingResponse createBooking(
            @PathVariable String tenantCode,
            @RequestBody BookingRequest request
    ) {
        return service.createBooking(tenantCode, request);
    }
}
