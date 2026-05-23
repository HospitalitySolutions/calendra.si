package com.example.app.google.calendar;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;

@Service
public class GoogleCalendarOAuthStateService {
    private final GoogleCalendarConfig config;
    private final Environment environment;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public GoogleCalendarOAuthStateService(GoogleCalendarConfig config, Environment environment) {
        this.config = config;
        this.environment = environment;
    }

    public String create(Long companyId, Long ownerUserId, Long requestedByUserId, String returnUrl) {
        try {
            StatePayload payload = new StatePayload(companyId, ownerUserId, requestedByUserId, returnUrl, Instant.now().getEpochSecond());
            String encoded = b64(objectMapper.writeValueAsBytes(payload));
            return encoded + "." + b64(hmac(encoded));
        } catch (Exception e) {
            throw new IllegalStateException("Failed to create Google OAuth state", e);
        }
    }

    public StatePayload parse(String state) {
        try {
            if (state == null || !state.contains(".")) throw new IllegalArgumentException("Invalid state");
            String[] parts = state.split("\\.", 2);
            if (!constantTimeEquals(b64(hmac(parts[0])), parts[1])) throw new IllegalArgumentException("Invalid signature");
            StatePayload payload = objectMapper.readValue(Base64.getUrlDecoder().decode(parts[0]), StatePayload.class);
            long age = Instant.now().getEpochSecond() - payload.issuedAtEpochSeconds();
            if (age < 0 || age > 15L * 60L) throw new IllegalArgumentException("State expired");
            return payload;
        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid Google OAuth state", e);
        }
    }

    private byte[] hmac(String data) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(resolveSecret().getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
    }

    private String resolveSecret() {
        if (config.getStateSecret() != null && !config.getStateSecret().isBlank()) return config.getStateSecret();
        String jwt = environment.getProperty("app.jwt.secret");
        if (jwt != null && !jwt.isBlank()) return jwt;
        throw new IllegalStateException("Configure GOOGLE_CALENDAR_STATE_SECRET or APP_JWT_SECRET.");
    }

    private static String b64(byte[] bytes) { return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); }

    private static boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null) return false;
        byte[] ax = a.getBytes(StandardCharsets.UTF_8);
        byte[] bx = b.getBytes(StandardCharsets.UTF_8);
        if (ax.length != bx.length) return false;
        int r = 0;
        for (int i = 0; i < ax.length; i++) r |= ax[i] ^ bx[i];
        return r == 0;
    }

    public record StatePayload(Long companyId, Long ownerUserId, Long requestedByUserId, String returnUrl, long issuedAtEpochSeconds) {}
}
