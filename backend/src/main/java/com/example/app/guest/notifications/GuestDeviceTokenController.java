package com.example.app.guest.notifications;

import com.example.app.guest.auth.GuestAuthContextService;
import com.example.app.guest.common.GuestDtos;
import com.example.app.guest.model.*;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/guest/device-tokens")
public class GuestDeviceTokenController {
    private final GuestAuthContextService authContextService;
    private final GuestDeviceTokenRepository deviceTokens;

    public GuestDeviceTokenController(GuestAuthContextService authContextService, GuestDeviceTokenRepository deviceTokens) {
        this.authContextService = authContextService;
        this.deviceTokens = deviceTokens;
    }

    @PostMapping
    public GuestDtos.DeviceTokenResponse register(@RequestBody GuestDtos.DeviceTokenRequest payload, HttpServletRequest request) {
        GuestUser guestUser = authContextService.requireGuest(request);
        GuestDeviceToken token = deviceTokens.findByPushToken(payload.pushToken()).orElseGet(GuestDeviceToken::new);
        token.setGuestUser(guestUser);
        token.setPlatform(GuestDevicePlatform.valueOf(payload.platform()));
        token.setPushToken(payload.pushToken());
        token.setLocale(payload.locale());
        token.setLastSeenAt(Instant.now());
        deviceTokens.save(token);
        return new GuestDtos.DeviceTokenResponse(true);
    }
}
