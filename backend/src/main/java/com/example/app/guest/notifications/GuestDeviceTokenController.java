package com.example.app.guest.notifications;

import com.example.app.guest.auth.GuestAuthContextService;
import com.example.app.guest.common.GuestDtos;
import com.example.app.guest.model.*;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/guest/device-tokens")
public class GuestDeviceTokenController {
    private static final Logger log = LoggerFactory.getLogger(GuestDeviceTokenController.class);

    private final GuestAuthContextService authContextService;
    private final GuestDeviceTokenRepository deviceTokens;

    public GuestDeviceTokenController(GuestAuthContextService authContextService, GuestDeviceTokenRepository deviceTokens) {
        this.authContextService = authContextService;
        this.deviceTokens = deviceTokens;
    }

    @PostMapping
    public GuestDtos.DeviceTokenResponse register(@RequestBody GuestDtos.DeviceTokenRequest payload, HttpServletRequest request) {
        GuestUser guestUser = authContextService.requireGuest(request);
        String rawToken = payload == null ? null : payload.pushToken();
        String rawPlatform = payload == null ? null : payload.platform();
        if (rawToken == null || rawToken.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Push token is required.");
        }
        GuestDevicePlatform platform;
        try {
            platform = GuestDevicePlatform.valueOf(rawPlatform == null ? "" : rawPlatform.trim().toUpperCase());
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported push token platform.");
        }
        String normalizedToken = rawToken.trim();
        GuestDeviceToken token = deviceTokens.findByPushToken(normalizedToken).orElseGet(GuestDeviceToken::new);
        token.setGuestUser(guestUser);
        token.setPlatform(platform);
        token.setPushToken(normalizedToken);
        token.setLocale(payload.locale());
        token.setLastSeenAt(Instant.now());
        deviceTokens.save(token);
        log.info("Registered guest push device guestUserId={}, platform={}, tokenSuffix={}",
                guestUser.getId(), platform, tokenSuffix(normalizedToken));
        return new GuestDtos.DeviceTokenResponse(true);
    }

    private static String tokenSuffix(String token) {
        if (token == null || token.isBlank()) return "n/a";
        int keep = Math.min(8, token.length());
        return token.substring(token.length() - keep);
    }
}
