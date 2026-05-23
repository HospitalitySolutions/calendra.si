package com.example.app.google.calendar;

import com.example.app.user.User;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
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
        return connectionService.updateSettings(me, connectionId, request);
    }

    @PostMapping("/connections/{connectionId}/full-sync")
    public void fullSync(@AuthenticationPrincipal User me, @PathVariable Long connectionId) {
        if (me == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        connectionService.enqueueFullSync(me, connectionId);
    }

    @PostMapping("/connections/{connectionId}/disconnect")
    public void disconnect(@AuthenticationPrincipal User me, @PathVariable Long connectionId) {
        if (me == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        connectionService.disconnect(me, connectionId);
    }

    private static String url(String value) { return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8); }
    public record GoogleCalendarAuthorizeResponse(String redirectUrl) {}
}
