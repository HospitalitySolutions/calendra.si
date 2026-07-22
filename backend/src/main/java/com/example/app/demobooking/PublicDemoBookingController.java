package com.example.app.demobooking;

import com.example.app.demobooking.DemoBookingApiModels.AvailabilityResponse;
import com.example.app.demobooking.DemoBookingApiModels.BookingView;
import com.example.app.demobooking.DemoBookingApiModels.ConfirmRequest;
import com.example.app.demobooking.DemoBookingApiModels.HoldRequest;
import com.example.app.demobooking.DemoBookingApiModels.HoldResponse;
import com.example.app.demobooking.DemoBookingApiModels.PublicProfile;
import com.example.app.demobooking.DemoBookingApiModels.RescheduleRequest;
import java.time.LocalDate;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/public/demo-bookings")
public class PublicDemoBookingController {
    private final DemoBookingService service;

    public PublicDemoBookingController(DemoBookingService service) {
        this.service = service;
    }

    @GetMapping("/profile")
    public PublicProfile profile() {
        return service.publicProfile();
    }

    @GetMapping("/availability")
    public AvailabilityResponse availability(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String timeZone) {
        return service.availability(from, to, timeZone);
    }

    @PostMapping("/holds")
    public HoldResponse hold(@RequestBody HoldRequest request) {
        return service.hold(request);
    }

    @PostMapping("/confirm")
    public BookingView confirm(@RequestBody ConfirmRequest request) {
        return service.confirm(request);
    }

    @GetMapping("/manage/{token}")
    public BookingView manage(@PathVariable String token) {
        return service.manage(token);
    }

    @PostMapping("/manage/{token}/cancel")
    public BookingView cancel(@PathVariable String token, @RequestParam(required = false) String locale) {
        return service.cancel(token, locale);
    }

    @PostMapping("/manage/{token}/reschedule")
    public BookingView reschedule(@PathVariable String token, @RequestBody RescheduleRequest request) {
        return service.reschedule(token, request);
    }
}
