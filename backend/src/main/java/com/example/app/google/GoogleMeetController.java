package com.example.app.google;

import com.example.app.user.User;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.springframework.http.HttpStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.UriComponentsBuilder;

import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;

@RestController
@RequestMapping("/api/google")
public class GoogleMeetController {
    private static final Logger log = LoggerFactory.getLogger(GoogleMeetController.class);
    private static final String AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";

    private final GoogleMeetConfig config;
    private final GoogleMeetService googleMeetService;

    public GoogleMeetController(GoogleMeetConfig config, GoogleMeetService googleMeetService) {
        this.config = config;
        this.googleMeetService = googleMeetService;
    }

    @GetMapping("/authorize")
    public GoogleAuthorizeResponse authorize(@AuthenticationPrincipal User me) {
        if (!config.isConfigured()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Google Meet is not configured.");
        }
        String state = String.valueOf(me.getId());
        String scope = "https://www.googleapis.com/auth/calendar.events";
        log.info(
                "Google Meet authorize requested. userId={}, redirectUri={}, frontendUrl={}",
                me.getId(),
                config.getRedirectUri(),
                config.getFrontendUrl()
        );
        String url = UriComponentsBuilder.fromHttpUrl(AUTHORIZE_URL)
                .queryParam("response_type", "code")
                .queryParam("client_id", config.getClientId())
                .queryParam("redirect_uri", config.getRedirectUri())
                .queryParam("scope", scope)
                .queryParam("state", state)
                .queryParam("access_type", "offline")
                .queryParam("prompt", "consent")
                .build()
                .toUriString();
        return new GoogleAuthorizeResponse(url);
    }

    public record GoogleAuthorizeResponse(String redirectUrl) {}

    @GetMapping("/callback")
    @Transactional
    public void callback(
            @RequestParam(required = false) String code,
            @RequestParam(required = false) String state,
            @RequestParam(required = false) String error,
            HttpServletResponse response
    ) throws IOException {
        String frontendBase = config.getFrontendUrl() != null && !config.getFrontendUrl().isBlank()
                ? config.getFrontendUrl() : "http://localhost:5173";
        if (error != null) {
            response.sendRedirect(frontendBase + "?google_error=" + URLEncoder.encode(error, StandardCharsets.UTF_8));
            return;
        }
        if (code == null || state == null) {
            response.sendRedirect(frontendBase + "?google_error=missing_code_or_state");
            return;
        }
        try {
            Long userId = Long.parseLong(state);
            googleMeetService.exchangeCodeForToken(userId, code);
            response.sendRedirect(frontendBase + "?google_connected=1");
        } catch (Exception e) {
            String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            if (msg.length() > 200) msg = msg.substring(0, 200) + "...";
            response.sendRedirect(frontendBase + "?google_error=" + URLEncoder.encode(msg, StandardCharsets.UTF_8));
        }
    }

    @GetMapping("/status")
    public GoogleStatusResponse status(@AuthenticationPrincipal User me) {
        boolean connected = googleMeetService.hasValidToken(me.getId());
        return new GoogleStatusResponse(connected);
    }

    public record GoogleStatusResponse(boolean connected) {}
}
