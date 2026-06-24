package com.example.app.widget.manage;

import com.example.app.company.Company;
import com.example.app.session.SessionBooking;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Base64;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PublicBookingManageTokenService {
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Base64.Encoder TOKEN_ENCODER = Base64.getUrlEncoder().withoutPadding();
    private final PublicBookingManageTokenRepository tokens;

    public PublicBookingManageTokenService(PublicBookingManageTokenRepository tokens) {
        this.tokens = tokens;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public String createToken(SessionBooking booking, ZoneId zoneId) {
        if (booking == null || booking.getId() == null || booking.getCompany() == null || booking.getEndTime() == null) {
            return "";
        }
        byte[] raw = new byte[32];
        RANDOM.nextBytes(raw);
        String token = TOKEN_ENCODER.encodeToString(raw);

        PublicBookingManageToken row = new PublicBookingManageToken();
        row.setCompany(booking.getCompany());
        row.setBooking(booking);
        row.setTokenHash(hash(token));
        row.setExpiresAt(booking.getEndTime().atZone(zoneId).toInstant());
        tokens.save(row);
        return token;
    }

    @Transactional
    public PublicBookingManageToken resolve(String rawToken) {
        String normalized = normalize(rawToken);
        if (normalized.isBlank()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Invalid booking management link.");
        }
        PublicBookingManageToken token = tokens.findActiveByTokenHash(hash(normalized))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Invalid booking management link."));
        Instant now = Instant.now();
        if (token.getExpiresAt() != null && token.getExpiresAt().isBefore(now)) {
            throw new ResponseStatusException(HttpStatus.GONE, "This booking management link has expired.");
        }
        token.setLastUsedAt(now);
        return tokens.save(token);
    }

    private static String normalize(String token) {
        return token == null ? "" : token.trim();
    }

    private static String hash(String token) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(normalize(token).getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(bytes.length * 2);
            for (byte b : bytes) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to hash public booking management token.", ex);
        }
    }
}
