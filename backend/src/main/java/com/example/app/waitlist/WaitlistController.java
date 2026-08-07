package com.example.app.waitlist;

import com.example.app.activitylog.ActivityAction;
import com.example.app.activitylog.ActivityDetails;
import com.example.app.activitylog.ActivityLogService;
import com.example.app.activitylog.ActivityModule;
import com.example.app.user.User;
import com.example.app.settings.TenantFeatureAccessService;
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
    private final TenantFeatureAccessService featureAccess;
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private ActivityLogService activityLogs;

    public WaitlistController(WaitlistService service, TenantFeatureAccessService featureAccess) {
        this.service = service;
        this.featureAccess = featureAccess;
    }

    private void assertEnabled(User me) {
        featureAccess.assertWaitlistEnabled(me == null || me.getCompany() == null ? null : me.getCompany().getId());
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
        assertEnabled(me);
        return service.list(me, view, dateFrom, dateTo, serviceId, employeeId, locationId, targetType, source, status, search);
    }

    @GetMapping("/overview")
    public WaitlistService.OverviewView overview(
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
        assertEnabled(me);
        return service.overview(me, view, dateFrom, dateTo, serviceId, employeeId, locationId, targetType, source, status, search);
    }

    @GetMapping("/{id}")
    public WaitlistService.RequestView detail(@AuthenticationPrincipal User me, @PathVariable Long id) {
        assertEnabled(me);
        return service.detail(me, id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public WaitlistService.RequestView create(@AuthenticationPrincipal User me, @Valid @RequestBody WaitlistService.RequestInput input) {
        assertEnabled(me);
        WaitlistService.RequestView result = service.create(me, input);
        record(me, ActivityAction.WAITLIST_CREATED, result, "Created waitlist request", null);
        return result;
    }

    @PatchMapping("/{id}")
    public WaitlistService.RequestView update(@AuthenticationPrincipal User me, @PathVariable Long id, @Valid @RequestBody WaitlistService.RequestInput input) {
        assertEnabled(me);
        WaitlistService.RequestView before = service.detail(me, id);
        WaitlistService.RequestView result = service.update(me, id, input);
        record(me, ActivityAction.WAITLIST_UPDATED, result, "Updated waitlist request", before);
        return result;
    }

    @PostMapping("/{id}/offer")
    public WaitlistService.RequestView offer(@AuthenticationPrincipal User me, @PathVariable Long id, @RequestBody WaitlistService.OfferInput input) {
        assertEnabled(me);
        WaitlistService.RequestView result = service.offer(me, id, input);
        record(me, ActivityAction.WAITLIST_OFFERED, result, "Sent waitlist offer", null);
        return result;
    }

    @PostMapping("/matches")
    public WaitlistService.MatchResult matches(@AuthenticationPrincipal User me, @RequestBody WaitlistService.MatchInput input) {
        assertEnabled(me);
        return service.findMatches(me, input);
    }

    @PostMapping("/offer-first")
    public WaitlistService.RequestView offerFirst(@AuthenticationPrincipal User me, @RequestBody WaitlistService.MatchInput input) {
        assertEnabled(me);
        WaitlistService.RequestView result = service.offerFirst(me, input);
        record(me, ActivityAction.WAITLIST_OFFERED, result, "Sent waitlist offer", null);
        return result;
    }

    @PostMapping("/{id}/skip")
    public WaitlistService.RequestView skip(@AuthenticationPrincipal User me, @PathVariable Long id, @RequestBody WaitlistService.OfferInput input) {
        assertEnabled(me);
        WaitlistService.RequestView result = service.skip(me, id, input);
        record(me, ActivityAction.WAITLIST_SKIPPED, result, "Skipped waitlist request for slot", null);
        return result;
    }

    public record ConvertRequest(Long bookingId) {}

    @PostMapping("/{id}/convert-to-booking")
    public WaitlistService.RequestView convert(@AuthenticationPrincipal User me, @PathVariable Long id, @RequestBody ConvertRequest input) {
        assertEnabled(me);
        WaitlistService.RequestView result = service.convertToBooking(me, id, input.bookingId());
        record(me, ActivityAction.WAITLIST_CONVERTED_TO_BOOKING, result, "Converted waitlist request to booking", null);
        return result;
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void remove(@AuthenticationPrincipal User me, @PathVariable Long id) {
        assertEnabled(me);
        WaitlistService.RequestView before = service.detail(me, id);
        service.remove(me, id);
        record(me, ActivityAction.WAITLIST_REMOVED, before, "Removed waitlist request", null);
    }

    @PostMapping("/offers/{offerId}/accept")
    public WaitlistService.RequestView accept(@AuthenticationPrincipal User me, @PathVariable Long offerId) {
        assertEnabled(me);
        WaitlistService.RequestView result = service.accept(me, offerId);
        record(me, ActivityAction.WAITLIST_OFFER_ACCEPTED, result, "Accepted waitlist offer", null);
        return result;
    }

    @PostMapping("/offers/{offerId}/decline")
    public WaitlistService.RequestView decline(@AuthenticationPrincipal User me, @PathVariable Long offerId) {
        assertEnabled(me);
        WaitlistService.RequestView result = service.decline(me, offerId);
        record(me, ActivityAction.WAITLIST_OFFER_DECLINED, result, "Declined waitlist offer", null);
        return result;
    }

    @PostMapping("/offers/{offerId}/decline-and-leave")
    public WaitlistService.RequestView declineAndLeave(@AuthenticationPrincipal User me, @PathVariable Long offerId) {
        assertEnabled(me);
        WaitlistService.RequestView result = service.declineAndLeave(me, offerId);
        record(me, ActivityAction.WAITLIST_OFFER_DECLINED, result, "Declined waitlist offer and left waitlist", null);
        return result;
    }

    @DeleteMapping("/offers/{offerId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revokeOffer(@AuthenticationPrincipal User me, @PathVariable Long offerId) {
        assertEnabled(me);
        WaitlistService.RequestView result = service.revokeOffer(me, offerId);
        record(me, ActivityAction.WAITLIST_OFFER_REVOKED, result, "Revoked waitlist offer", null);
    }

    private void record(User me, ActivityAction action, WaitlistService.RequestView row, String summary, WaitlistService.RequestView before) {
        if (activityLogs == null || row == null) return;
        var details = ActivityDetails.of(
                "service", row.serviceName(),
                "status", row.status(),
                "requestedParticipants", row.requestedParticipants(),
                "dateFrom", row.dateFrom(),
                "dateTo", row.dateTo(),
                "targetPath", "/appointments"
        );
        if (before != null) {
            details.put("before", ActivityDetails.of(
                    "service", before.serviceName(), "status", before.status(),
                    "requestedParticipants", before.requestedParticipants(),
                    "dateFrom", before.dateFrom(), "dateTo", before.dateTo(),
                    "location", before.locationName()));
            details.put("after", ActivityDetails.of(
                    "service", row.serviceName(), "status", row.status(),
                    "requestedParticipants", row.requestedParticipants(),
                    "dateFrom", row.dateFrom(), "dateTo", row.dateTo(),
                    "location", row.locationName()));
        }
        activityLogs.recordUser(me, ActivityModule.WAITLIST, action,
                "WAITLIST_REQUEST", row.id(), row.clientName(),
                "CLIENT", row.clientId(), row.clientName(),
                summary, row.locationId(), null, details);
    }
}
