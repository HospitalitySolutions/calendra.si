package com.example.app.security.ratelimit;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public class AuthRateLimiter {
    private static final Logger log = LoggerFactory.getLogger(AuthRateLimiter.class);

    private final AuthRateLimitProperties properties;
    private final StringRedisTemplate redis;
    private final MeterRegistry meterRegistry;
    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();
    private final AtomicLong lastCleanupMs = new AtomicLong(0);
    private final AtomicLong lastRedisWarningMs = new AtomicLong(0);

    @Autowired
    public AuthRateLimiter(AuthRateLimitProperties properties, ObjectProvider<StringRedisTemplate> redisProvider, MeterRegistry meterRegistry) {
        this.properties = properties;
        this.redis = redisProvider == null ? null : redisProvider.getIfAvailable();
        this.meterRegistry = meterRegistry;
    }

    AuthRateLimiter(AuthRateLimitProperties properties) {
        this.properties = properties;
        this.redis = null;
        this.meterRegistry = new SimpleMeterRegistry();
    }

    public void checkStaffLogin(HttpServletRequest request, String email) {
        check("staff-login", request, email, properties.getStaffLoginPerIp(), properties.getStaffLoginPerIdentity());
    }

    public void checkStaffSignup(HttpServletRequest request, String email) {
        check("staff-signup", request, email, properties.getStaffSignupPerIp(), properties.getStaffSignupPerIdentity());
    }

    public void checkPasswordReset(HttpServletRequest request, String email) {
        check("password-reset", request, email, properties.getPasswordResetPerIp(), properties.getPasswordResetPerIdentity());
    }

    public void checkGuestLogin(HttpServletRequest request, String email) {
        check("guest-login", request, email, properties.getGuestLoginPerIp(), properties.getGuestLoginPerIdentity());
    }

    public void checkGuestSignup(HttpServletRequest request, String email) {
        check("guest-signup", request, email, properties.getGuestSignupPerIp(), properties.getGuestSignupPerIdentity());
    }

    public void checkGuestSocialLogin(HttpServletRequest request) {
        check("guest-social-login", request, null, properties.getGuestSocialLoginPerIp(), 0);
    }

    private void check(String action, HttpServletRequest request, String identity, int perIpLimit, int perIdentityLimit) {
        if (!properties.isEnabled()) {
            return;
        }
        long now = Instant.now().toEpochMilli();
        long windowMs = Math.max(1, properties.getWindowSeconds()) * 1_000L;
        cleanupExpiredBuckets(now, windowMs);

        String ip = clientIp(request);
        consume(action + ":ip:" + ip, perIpLimit, now, windowMs);

        String normalizedIdentity = normalizeIdentity(identity);
        if (normalizedIdentity != null) {
            consume(action + ":identity:" + normalizedIdentity, perIdentityLimit, now, windowMs);
        }
    }

    private void consume(String key, int limit, long now, long windowMs) {
        if (limit <= 0) {
            return;
        }
        if (shouldUseRedis()) {
            try {
                long count = consumeRedis(key, windowMs);
                if (count > limit) {
                    recordBlocked(key);
                    throw tooManyAttempts();
                }
                return;
            } catch (ResponseStatusException ex) {
                throw ex;
            } catch (Exception ex) {
                if (redisRequired()) {
                    throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Rate limit service is unavailable.");
                }
                warnRedisFallback(ex);
            }
        }

        Bucket bucket = buckets.compute(key, (ignored, existing) -> {
            if (existing == null || now - existing.windowStartMs >= windowMs) {
                return new Bucket(now, 1);
            }
            existing.count++;
            return existing;
        });
        if (bucket.count > limit) {
            recordBlocked(key);
            throw tooManyAttempts();
        }
    }

    private long consumeRedis(String key, long windowMs) {
        String redisKey = cleanPrefix(properties.getRedisKeyPrefix()) + ":" + key;
        Long count = redis.opsForValue().increment(redisKey);
        if (count != null && count == 1L) {
            redis.expire(redisKey, Duration.ofMillis(windowMs));
        }
        return count == null ? 1L : count;
    }

    private boolean shouldUseRedis() {
        String backend = normalizedBackend();
        return redis != null && ("redis".equals(backend) || "auto".equals(backend));
    }

    private boolean redisRequired() {
        return "redis".equals(normalizedBackend());
    }

    private String normalizedBackend() {
        String value = properties.getBackend();
        if (value == null || value.isBlank()) {
            return "auto";
        }
        return value.trim().toLowerCase(Locale.ROOT);
    }

    private static String cleanPrefix(String prefix) {
        if (prefix == null || prefix.isBlank()) {
            return "calendra:rate-limit:auth";
        }
        return prefix.replaceAll(":+$", "");
    }

    private void recordBlocked(String key) {
        String action = key == null ? "unknown" : key.split(":", 2)[0];
        meterRegistry.counter("auth_rate_limit_blocked", "action", action).increment();
    }

    private ResponseStatusException tooManyAttempts() {
        return new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many attempts. Please try again shortly.");
    }

    private void warnRedisFallback(Exception ex) {
        long now = System.currentTimeMillis();
        long previous = lastRedisWarningMs.get();
        if (now - previous > 60_000L && lastRedisWarningMs.compareAndSet(previous, now)) {
            log.warn("Redis rate limiting unavailable; falling back to in-memory auth limiter: {}", ex.getMessage());
        }
    }

    private void cleanupExpiredBuckets(long now, long windowMs) {
        long previousCleanup = lastCleanupMs.get();
        if (now - previousCleanup < windowMs) {
            return;
        }
        if (!lastCleanupMs.compareAndSet(previousCleanup, now)) {
            return;
        }
        if (buckets.size() <= properties.getMaxTrackedKeys()) {
            buckets.entrySet().removeIf(entry -> now - entry.getValue().windowStartMs >= windowMs);
            return;
        }
        buckets.clear();
    }

    private static String normalizeIdentity(String identity) {
        if (identity == null) {
            return null;
        }
        String normalized = identity.trim().toLowerCase(Locale.ROOT);
        return normalized.isBlank() ? null : normalized;
    }

    private static String clientIp(HttpServletRequest request) {
        if (request == null) {
            return "unknown";
        }
        String forwardedFor = request.getHeader("X-Forwarded-For");
        if (forwardedFor != null && !forwardedFor.isBlank()) {
            return forwardedFor.split(",")[0].trim();
        }
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }
        String remote = request.getRemoteAddr();
        return remote == null || remote.isBlank() ? "unknown" : remote;
    }

    private static final class Bucket {
        private final long windowStartMs;
        private int count;

        private Bucket(long windowStartMs, int count) {
            this.windowStartMs = windowStartMs;
            this.count = count;
        }
    }
}
