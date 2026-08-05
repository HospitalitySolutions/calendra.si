package com.example.app.workspacebooking;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class WorkspacePublicBookingTokenService {
    private final byte[] secret;

    public WorkspacePublicBookingTokenService(@Value("${app.jwt.secret}") String secret) {
        this.secret = secret.getBytes(StandardCharsets.UTF_8);
    }

    public String issue(String kind, Long workspaceId, Long companyId, Long entityId) {
        long expires = Instant.now().plusSeconds(60L * 60L).getEpochSecond();
        String payload = kind + ":" + workspaceId + ":" + companyId + ":" + entityId + ":" + expires;
        return encode(payload) + "." + encode(sign(payload));
    }

    public TokenPayload require(String token, String expectedKind, Long expectedWorkspaceId) {
        try {
            String[] parts = token == null ? new String[0] : token.split("\\.", 2);
            if (parts.length != 2) throw new IllegalArgumentException();
            String payload = new String(Base64.getUrlDecoder().decode(parts[0]), StandardCharsets.UTF_8);
            byte[] supplied = Base64.getUrlDecoder().decode(parts[1]);
            if (!java.security.MessageDigest.isEqual(sign(payload), supplied)) throw new IllegalArgumentException();
            String[] fields = payload.split(":", 5);
            if (fields.length != 5 || !expectedKind.equals(fields[0])) throw new IllegalArgumentException();
            Long workspaceId = Long.valueOf(fields[1]);
            Long companyId = Long.valueOf(fields[2]);
            Long entityId = Long.valueOf(fields[3]);
            long expires = Long.parseLong(fields[4]);
            if (!workspaceId.equals(expectedWorkspaceId) || expires < Instant.now().getEpochSecond()) {
                throw new IllegalArgumentException();
            }
            return new TokenPayload(companyId, entityId);
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid or expired public booking selection.");
        }
    }

    private byte[] sign(String value) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            return mac.doFinal(value.getBytes(StandardCharsets.UTF_8));
        } catch (java.security.GeneralSecurityException ex) {
            throw new IllegalStateException("Could not sign public booking selection.", ex);
        }
    }

    private static String encode(String value) {
        return encode(value.getBytes(StandardCharsets.UTF_8));
    }

    private static String encode(byte[] value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }

    public record TokenPayload(Long companyId, Long entityId) {}
}
