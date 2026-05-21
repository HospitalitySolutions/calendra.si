package com.example.app.zoom;

import com.example.app.user.User;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.UriComponentsBuilder;

import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;

@RestController
@RequestMapping("/api/zoom")
public class ZoomController {
    private static final String AUTHORIZE_URL = "https://zoom.us/oauth/authorize";

    private final ZoomConfig config;
    private final ZoomService zoomService;

    public ZoomController(ZoomConfig config, ZoomService zoomService) {
        this.config = config;
        this.zoomService = zoomService;
    }

    /**
     * Returns the Zoom OAuth URL for the current user to authorize.
     * Frontend should redirect to this URL.
     */
    @GetMapping("/authorize")
    public ZoomAuthorizeResponse authorize(@AuthenticationPrincipal User me) {
        if (!config.isConfigured()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Zoom is not configured.");
        }
        String state = String.valueOf(me.getId());
        var builder = UriComponentsBuilder.fromHttpUrl(AUTHORIZE_URL)
                .queryParam("response_type", "code")
                .queryParam("client_id", config.getClientId())
                .queryParam("redirect_uri", config.getRedirectUri())
                .queryParam("state", state);
        // Only add scope if explicitly configured. Otherwise Zoom uses app-configured scopes.
        // Passing wrong scope causes "Invalid scope" for non-creator users.
        if (config.getScope() != null && !config.getScope().isBlank()) {
            builder.queryParam("scope", config.getScope());
        }
        String url = builder.build().toUriString();
        return new ZoomAuthorizeResponse(url);
    }

    public record ZoomAuthorizeResponse(String redirectUrl) {}

    /**
     * OAuth callback from Zoom. Exchanges code for token and stores for the user.
     * Redirects to frontend with success or error.
     */
    @GetMapping("/callback")
    @Transactional
    public void callback(
            @RequestParam(required = false) String code,
            @RequestParam(required = false) String state,
            @RequestParam(required = false) String error,
            HttpServletResponse response
    ) throws IOException {
        String frontendBase = config.getFrontendUrl() != null && !config.getFrontendUrl().isBlank()
                ? config.getFrontendUrl() : config.getRedirectUri().replace("/api/zoom/callback", "");
        String frontendInstallUrl = frontendBase.endsWith("/") ? frontendBase + "zoom/install" : frontendBase + "/zoom/install";
        if (error != null) {
            response.sendRedirect(frontendInstallUrl + "?zoom_error=" + URLEncoder.encode(error, StandardCharsets.UTF_8));
            return;
        }
        if (code == null || state == null) {
            response.sendRedirect(frontendInstallUrl + "?zoom_error=missing_code_or_state");
            return;
        }
        try {
            Long userId = Long.parseLong(state);
            zoomService.exchangeCodeForToken(userId, code);
            response.sendRedirect(frontendInstallUrl + "?zoom_connected=1");
        } catch (Exception e) {
            String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            if (msg.length() > 200) msg = msg.substring(0, 200) + "...";
            response.sendRedirect(frontendInstallUrl + "?zoom_error=" + URLEncoder.encode(msg, StandardCharsets.UTF_8));
        }
    }

    /**
     * Check if the current user has connected Zoom.
     */
    @GetMapping("/status")
    public ZoomStatusResponse status(@AuthenticationPrincipal User me) {
        boolean connected = zoomService.hasValidToken(me.getId());
        return new ZoomStatusResponse(connected);
    }

    public record ZoomStatusResponse(boolean connected) {}
}
