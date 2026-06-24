package com.example.app.widget.manage;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/public-bookings/manage")
public class PublicBookingManageController {
    private final PublicBookingManageService service;

    public PublicBookingManageController(PublicBookingManageService service) {
        this.service = service;
    }

    public record BookingManageResponse(
            String tenantCode,
            String tenantName,
            String serviceName,
            String currentStart,
            String currentEnd,
            String startsAtLabel,
            String consultantName,
            String bookingStatus,
            boolean canModify,
            boolean canCancel,
            String modifyBlockedReason,
            String cancelBlockedReason,
            String timezone,
            String paymentNote
    ) {}

    public record AvailabilitySlotResponse(
            String slotId,
            String label,
            String startTime,
            String endTime
    ) {}

    public record AvailabilityResponse(
            String date,
            List<AvailabilitySlotResponse> slots
    ) {}

    public record RescheduleRequest(@NotBlank String startTime) {}

    public record RescheduleResponse(
            String serviceName,
            String startTime,
            String endTime,
            String startsAtLabel
    ) {}

    public record CancelRequest(String reason) {}

    public record CancelResponse(String status, String message) {}

    @GetMapping("/{token}")
    public BookingManageResponse get(@PathVariable String token) {
        return service.get(token);
    }

    @GetMapping("/{token}/availability")
    public AvailabilityResponse availability(
            @PathVariable String token,
            @RequestParam String date
    ) {
        return service.availability(token, date);
    }

    @PostMapping("/{token}/reschedule")
    public RescheduleResponse reschedule(
            @PathVariable String token,
            @Valid @RequestBody RescheduleRequest request
    ) {
        return service.reschedule(token, request);
    }

    @PostMapping("/{token}/cancel")
    public CancelResponse cancel(
            @PathVariable String token,
            @RequestBody(required = false) CancelRequest request
    ) {
        return service.cancel(token, request);
    }
}
