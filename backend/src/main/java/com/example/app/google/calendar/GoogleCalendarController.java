package com.example.app.google.calendar;

import com.example.app.activitylog.ActivityAction;
import com.example.app.activitylog.ActivityDetails;
import com.example.app.activitylog.ActivityLogService;
import com.example.app.activitylog.ActivityModule;
import com.example.app.user.User;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/google/calendar")
public class GoogleCalendarController {
    private final GoogleCalendarConfig config;
    private final GoogleCalendarConnectionService connectionService;

    @Autowired(required = false)
    private ActivityLogService activityLogs;

    public GoogleCalendarController(GoogleCalendarConfig config, GoogleCalendarConnectionService connectionService) {
        this.config = config;
        this.connectionService = connectionService;
    }

    @GetMapping("/authorize")
    public GoogleCalendarAuthorizeResponse authorize(@AuthenticationPrincipal User me, @RequestParam(required = false) Long companyId, @RequestParam(required = false) Long ownerUserId, @RequestParam(required = false) String returnUrl) {
        if (me == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        return new GoogleCalendarAuthorizeResponse(connectionService.authorizationUrl(me, companyId, ownerUserId, returnUrl));
    }

    @GetMapping("/callback")
    @Transactional
    public void callback(@RequestParam(required = false) String code, @RequestParam(required = false) String state, @RequestParam(required = false) String error, HttpServletResponse response) throws IOException {
        String frontendBase = config.effectiveFrontendUrl();
        if (error != null) { response.sendRedirect(frontendBase + "?google_calendar_error=" + url(error)); return; }
        if (code == null || code.isBlank() || state == null || state.isBlank()) { response.sendRedirect(frontendBase + "?google_calendar_error=missing_code_or_state"); return; }
        try {
            String returnUrl = connectionService.handleCallback(code, state);
            response.sendRedirect(returnUrl + (returnUrl.contains("?") ? "&" : "?") + "google_calendar_connected=1");
        } catch (Exception e) {
            String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            if (msg.length() > 200) msg = msg.substring(0, 200) + "...";
            response.sendRedirect(frontendBase + "?google_calendar_error=" + url(msg));
        }
    }

    @GetMapping("/status")
    public List<GoogleCalendarConnectionService.GoogleCalendarConnectionResponse> status(@AuthenticationPrincipal User me, @RequestParam(required = false) Long companyId) {
        if (me == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        return connectionService.listStatus(me, companyId);
    }

    @GetMapping("/conflicts")
    public List<GoogleCalendarConnectionService.GoogleCalendarEventLinkResponse> conflicts(@AuthenticationPrincipal User me, @RequestParam(required = false) Long companyId) {
        if (me == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        return connectionService.listCompanyConflicts(me, companyId);
    }

    @GetMapping("/connections/{connectionId}/calendars")
    public List<GoogleCalendarApiClient.CalendarSummary> calendars(@AuthenticationPrincipal User me, @PathVariable Long connectionId) throws Exception {
        if (me == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        return connectionService.listCalendars(me, connectionId);
    }

    @GetMapping("/connections/{connectionId}/links")
    public List<GoogleCalendarConnectionService.GoogleCalendarEventLinkResponse> links(@AuthenticationPrincipal User me, @PathVariable Long connectionId) {
        if (me == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        return connectionService.listConnectionLinks(me, connectionId);
    }

    @PutMapping("/connections/{connectionId}")
    public GoogleCalendarConnectionService.GoogleCalendarConnectionResponse updateConnection(@AuthenticationPrincipal User me, @PathVariable Long connectionId, @RequestBody GoogleCalendarConnectionService.GoogleCalendarSettingsRequest request) throws Exception {
        if (me == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        var updated = connectionService.updateSettings(me, connectionId, request);
        record(me, ActivityAction.INTEGRATION_UPDATED, connectionId,
                updated.googleAccountEmail() != null ? updated.googleAccountEmail() : "Google Calendar",
                "Updated Google Calendar integration",
                ActivityDetails.of("calendar", updated.calendarSummary(), "calendarId", updated.calendarId(),
                        "syncDirection", updated.syncDirection(), "enabled", updated.status(),
                        "targetPath", "/configuration?tab=integrations&subtab=googleCalendar"));
        return updated;
    }

    @PostMapping("/connections/{connectionId}/full-sync")
    public void fullSync(@AuthenticationPrincipal User me, @PathVariable Long connectionId) {
        if (me == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        connectionService.enqueueFullSync(me, connectionId);
        record(me, ActivityAction.INTEGRATION_SYNC_REQUESTED, connectionId, "Google Calendar",
                "Requested Google Calendar full sync",
                ActivityDetails.of("targetPath", "/configuration?tab=integrations&subtab=googleCalendar"));
    }

    @PostMapping("/connections/{connectionId}/disconnect")
    public void disconnect(@AuthenticationPrincipal User me, @PathVariable Long connectionId) {
        if (me == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        connectionService.disconnect(me, connectionId);
        record(me, ActivityAction.INTEGRATION_DISCONNECTED, connectionId, "Google Calendar",
                "Disconnected Google Calendar integration",
                ActivityDetails.of("targetPath", "/configuration?tab=integrations&subtab=googleCalendar"));
    }

    private void record(User me, ActivityAction action, Long id, String label, String summary, java.util.Map<String, ?> details) {
        if (activityLogs == null || me == null) return;
        activityLogs.recordUser(me, ActivityModule.INTEGRATIONS, action, "INTEGRATION", id, label, summary, null, null, details);
    }

    private static String url(String value) { return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8); }
    public record GoogleCalendarAuthorizeResponse(String redirectUrl) {}
}
