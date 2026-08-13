package com.example.app.guest.auth;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import javax.crypto.SecretKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class GuestTokenService {
    private final SecretKey key;
    private static final long BOOKING_HANDOFF_EXPIRATION_MS = 90_000L;

    private final long expirationMs;

    public GuestTokenService(@Value("${app.jwt.secret}") String secret, @Value("${app.jwt.expiration-ms}") long expirationMs) {
        byte[] bytes = secret.getBytes(StandardCharsets.UTF_8);
        this.key = Keys.hmacShaKeyFor(bytes);
        this.expirationMs = expirationMs;
    }

    public String issueToken(Long guestUserId) {
        Date now = new Date();
        Date expiry = new Date(now.getTime() + expirationMs);
        return Jwts.builder()
                .subject(String.valueOf(guestUserId))
                .issuedAt(now)
                .expiration(expiry)
                .claim("tokenType", "GUEST_AUTH")
                .signWith(key)
                .compact();
    }

    public IssuedBookingHandoff issueBookingHandoff(Long guestUserId, Long companyId, Long locationId, String tenantCode) {
        if (guestUserId == null || companyId == null || locationId == null || tenantCode == null || tenantCode.isBlank()) {
            throw new IllegalArgumentException("Booking handoff scope is incomplete");
        }
        Date now = new Date();
        Date expiry = new Date(now.getTime() + BOOKING_HANDOFF_EXPIRATION_MS);
        String token = Jwts.builder()
                .subject(String.valueOf(guestUserId))
                .issuedAt(now)
                .expiration(expiry)
                .claim("tokenType", "GUEST_BOOKING_HANDOFF")
                .claim("companyId", companyId)
                .claim("locationId", locationId)
                .claim("tenantCode", tenantCode)
                .signWith(key)
                .compact();
        return new IssuedBookingHandoff(token, expiry.toInstant());
    }

    public BookingHandoffClaims parseBookingHandoff(String token) {
        Claims claims = Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
        String tokenType = claims.get("tokenType", String.class);
        if (!"GUEST_BOOKING_HANDOFF".equals(tokenType)) {
            throw new IllegalArgumentException("Invalid booking handoff token type");
        }
        Object companyIdRaw = claims.get("companyId");
        Object locationIdRaw = claims.get("locationId");
        String tenantCode = claims.get("tenantCode", String.class);
        if (!(companyIdRaw instanceof Number companyId)
                || !(locationIdRaw instanceof Number locationId)
                || tenantCode == null
                || tenantCode.isBlank()) {
            throw new IllegalArgumentException("Invalid booking handoff scope");
        }
        return new BookingHandoffClaims(
                Long.parseLong(claims.getSubject()),
                companyId.longValue(),
                locationId.longValue(),
                tenantCode
        );
    }

    public record IssuedBookingHandoff(String token, Instant expiresAt) {}

    public record BookingHandoffClaims(Long guestUserId, Long companyId, Long locationId, String tenantCode) {}

    public Long parseGuestUserId(String token) {
        Claims claims = Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
        String tokenType = claims.get("tokenType", String.class);
        if (!"GUEST_AUTH".equals(tokenType)) {
            throw new IllegalArgumentException("Invalid guest token type");
        }
        return Long.parseLong(claims.getSubject());
    }
}
