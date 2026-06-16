package com.example.app.widget;

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
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@Component
public class WidgetRateLimiter {
    private static final Logger log = LoggerFactory.getLogger(WidgetRateLimiter.class);

    private final WidgetSecurityProperties properties;
    private final StringRedisTemplate redis;
    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();
    private final AtomicLong lastRedisWarningMs = new AtomicLong(0);

    @Autowired
    public WidgetRateLimiter(WidgetSecurityProperties properties, ObjectProvider<StringRedisTemplate> redisProvider) {
        this.properties = properties;
        this.redis = redisProvider == null ? null : redisProvider.getIfAvailable();
    }

    WidgetRateLimiter(WidgetSecurityProperties properties) {
        this.properties = properties;
        this.redis = null;
    }

    public void check(String tenantCode, String clientIp, boolean bookingRequest) {
        long now = Instant.now().toEpochMilli();
        long windowMs = 60_000L;
        int ipLimit = bookingRequest ? properties.getBookingsPerMinutePerIp() : properties.getGeneralRequestsPerMinutePerIp();
        int tenantLimit = bookingRequest ? properties.getBookingsPerMinutePerTenant() : properties.getGeneralRequestsPerMinutePerTenant();
        String bucketGroup = bookingRequest ? "booking" : "general";

        // Keep general widget browsing traffic (config/services/availability) separate from
        // real booking attempts. Otherwise a normal widget flow can use several general
        // requests before POST /orders and then trip the much lower booking limit.
        consume(bucketGroup + ":ip:" + (clientIp == null ? "unknown" : clientIp), ipLimit, now, windowMs);
        consume(bucketGroup + ":tenant:" + (tenantCode == null ? "unknown" : tenantCode.toLowerCase(Locale.ROOT)), tenantLimit, now, windowMs);
    }

    private void consume(String key, int limit, long now, long windowMs) {
        if (limit <= 0) return;
        if (shouldUseRedis()) {
            try {
                long count = consumeRedis(key, windowMs);
                if (count > limit) {
                    throw tooManyWidgetRequests();
                }
                return;
            } catch (ResponseStatusException ex) {
                throw ex;
            } catch (Exception ex) {
                if (redisRequired()) {
                    throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Widget rate limit service is unavailable.");
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
            throw tooManyWidgetRequests();
        }
    }

    private long consumeRedis(String key, long windowMs) {
        String redisKey = cleanPrefix(properties.getRateLimitRedisKeyPrefix()) + ":" + key;
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
        String value = properties.getRateLimitBackend();
        if (value == null || value.isBlank()) {
            return "auto";
        }
        return value.trim().toLowerCase(Locale.ROOT);
    }

    private static String cleanPrefix(String prefix) {
        if (prefix == null || prefix.isBlank()) {
            return "calendra:rate-limit:widget";
        }
        return prefix.replaceAll(":+$", "");
    }

    private ResponseStatusException tooManyWidgetRequests() {
        return new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many widget requests. Please try again shortly.");
    }

    private void warnRedisFallback(Exception ex) {
        long now = System.currentTimeMillis();
        long previous = lastRedisWarningMs.get();
        if (now - previous > 60_000L && lastRedisWarningMs.compareAndSet(previous, now)) {
            log.warn("Redis rate limiting unavailable; falling back to in-memory widget limiter: {}", ex.getMessage());
        }
    }

    private static final class Bucket {
        long windowStartMs;
        int count;
        Bucket(long windowStartMs, int count) { this.windowStartMs = windowStartMs; this.count = count; }
    }
}
