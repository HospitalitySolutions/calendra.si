package com.example.app.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.Map;

@Service
public class JwtService {

    public record MfaTokenPayload(Long userId, String flow, String requestJson) {}

    private static final long MFA_TOKEN_TTL_MS = 5 * 60 * 1000L;

    private final SecretKey key;
    private final long expirationMs;

    public JwtService(
            @Value("${app.jwt.secret}") String secret,
            @Value("${app.jwt.expiration-ms}") long expirationMs
    ) {
        if (secret == null || secret.isBlank()) {
            throw new IllegalStateException("app.jwt.secret (APP_JWT_SECRET) must be set and non-empty.");
        }
        byte[] secretBytes = secret.getBytes(StandardCharsets.UTF_8);
        if (secretBytes.length < 32) {
            throw new IllegalStateException(
                    "app.jwt.secret (APP_JWT_SECRET) must be at least 32 bytes (UTF-8) for HS256.");
        }
        this.key = Keys.hmacShaKeyFor(secretBytes);
        this.expirationMs = expirationMs;
    }

    /** Generates a token with user ID as subject (stable across email changes). */
    public String generateToken(Long userId) {
        Date now = new Date();
        Date expiry = new Date(now.getTime() + expirationMs);

        return Jwts.builder()
                .subject(String.valueOf(userId))
                .issuedAt(now)
                .expiration(expiry)
                .signWith(key)
                .compact();
    }


    public String generateMfaToken(Long userId, String flow, String requestJson) {
        Date now = new Date();
        Date expiry = new Date(now.getTime() + MFA_TOKEN_TTL_MS);

        return Jwts.builder()
                .subject("mfa")
                .issuedAt(now)
                .expiration(expiry)
                .claims(Map.of(
                        "tokenType", "MFA",
                        "userId", userId,
                        "flow", flow,
                        "requestJson", requestJson
                ))
                .signWith(key)
                .compact();
    }

    public MfaTokenPayload parseMfaToken(String token) {
        Claims claims = extractAllClaims(token);
        if (!"MFA".equals(String.valueOf(claims.get("tokenType")))) {
            throw new IllegalArgumentException("Invalid MFA token type.");
        }
        Object userIdClaim = claims.get("userId");
        Long userId = userIdClaim instanceof Number n ? n.longValue() : Long.parseLong(String.valueOf(userIdClaim));
        String flow = String.valueOf(claims.get("flow"));
        String requestJson = String.valueOf(claims.get("requestJson"));
        return new MfaTokenPayload(userId, flow, requestJson);
    }

    public Long extractUserId(String token) {
        String sub = extractAllClaims(token).getSubject();
        return sub != null ? Long.parseLong(sub) : null;
    }

    public boolean isTokenValid(String token, Long userId) {
        Long extracted = extractUserId(token);
        return extracted != null && extracted.equals(userId) && !isTokenExpired(token);
    }

    private boolean isTokenExpired(String token) {
        return extractAllClaims(token).getExpiration().before(new Date());
    }

    private Claims extractAllClaims(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}