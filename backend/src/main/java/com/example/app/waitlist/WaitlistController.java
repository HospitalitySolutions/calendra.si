package com.example.app.waitlist;

import com.example.app.user.User;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/waitlists")
public class WaitlistController {
    private final WaitlistService service;

    public WaitlistController(WaitlistService service) {
        this.service = service;
    }

    @GetMapping
    public List<WaitlistService.RequestView> list(
            @AuthenticationPrincipal User me,
            @RequestParam(required = false, defaultValue = "ACTIVE") String view,
            @RequestParam(required = false) LocalDate dateFrom,
            @RequestParam(required = false) LocalDate dateTo,
            @RequestParam(required = false) Long serviceId,
            @RequestParam(required = false) Long employeeId,
            @RequestParam(required = false) Long locationId,
            @RequestParam(required = false) String targetType,
            @RequestParam(required = false) String source,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String search
    ) {
        return service.list(me, view, dateFrom, dateTo, serviceId, employeeId, locationId, targetType, source, status, search);
    }

    @GetMapping("/{id}")
    public WaitlistService.RequestView detail(@AuthenticationPrincipal User me, @PathVariable Long id) {
        return service.detail(me, id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public WaitlistService.RequestView create(@AuthenticationPrincipal User me, @Valid @RequestBody WaitlistService.RequestInput input) {
        return service.create(me, input);
    }

    @PatchMapping("/{id}")
    public WaitlistService.RequestView update(@AuthenticationPrincipal User me, @PathVariable Long id, @Valid @RequestBody WaitlistService.RequestInput input) {
        return service.update(me, id, input);
    }

    @PostMapping("/{id}/offer")
    public WaitlistService.RequestView offer(@AuthenticationPrincipal User me, @PathVariable Long id, @RequestBody WaitlistService.OfferInput input) {
        return service.offer(me, id, input);
    }

    @PostMapping("/{id}/skip")
    public WaitlistService.RequestView skip(@AuthenticationPrincipal User me, @PathVariable Long id, @RequestBody WaitlistService.OfferInput input) {
        return service.skip(me, id, input);
    }

    public record ConvertRequest(Long bookingId) {}

    @PostMapping("/{id}/convert-to-booking")
    public WaitlistService.RequestView convert(@AuthenticationPrincipal User me, @PathVariable Long id, @RequestBody ConvertRequest input) {
        return service.convertToBooking(me, id, input.bookingId());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void remove(@AuthenticationPrincipal User me, @PathVariable Long id) {
        service.remove(me, id);
    }

    @PostMapping("/offers/{offerId}/accept")
    public WaitlistService.RequestView accept(@AuthenticationPrincipal User me, @PathVariable Long offerId) {
        return service.accept(me, offerId);
    }

    @PostMapping("/offers/{offerId}/decline")
    public WaitlistService.RequestView decline(@AuthenticationPrincipal User me, @PathVariable Long offerId) {
        return service.decline(me, offerId);
    }
}
