package com.example.app.guest.auth;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import javax.crypto.SecretKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class GuestTokenService {
    private final SecretKey key;
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

    public Long parseGuestUserId(String token) {
        Claims claims = Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
        String tokenType = claims.get("tokenType", String.class);
        if (!"GUEST_AUTH".equals(tokenType)) {
            throw new IllegalArgumentException("Invalid guest token type");
        }
        return Long.parseLong(claims.getSubject());
    }
}
