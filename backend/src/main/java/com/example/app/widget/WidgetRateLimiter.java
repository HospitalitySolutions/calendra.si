package com.example.app.widget;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@Component
public class WidgetRateLimiter {
    private final WidgetSecurityProperties properties;
    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    public WidgetRateLimiter(WidgetSecurityProperties properties) {
        this.properties = properties;
    }

    public void check(String tenantCode, String clientIp, boolean bookingRequest) {
        long now = Instant.now().toEpochMilli();
        long windowMs = 60_000L;
        int ipLimit = bookingRequest ? properties.getBookingsPerMinutePerIp() : properties.getGeneralRequestsPerMinutePerIp();
        int tenantLimit = bookingRequest ? properties.getBookingsPerMinutePerTenant() : properties.getGeneralRequestsPerMinutePerTenant();
        consume("ip:" + (clientIp == null ? "unknown" : clientIp), ipLimit, now, windowMs);
        consume("tenant:" + (tenantCode == null ? "unknown" : tenantCode.toLowerCase()), tenantLimit, now, windowMs);
    }

    private void consume(String key, int limit, long now, long windowMs) {
        if (limit <= 0) return;
        Bucket bucket = buckets.compute(key, (ignored, existing) -> {
            if (existing == null || now - existing.windowStartMs >= windowMs) {
                return new Bucket(now, 1);
            }
            existing.count++;
            return existing;
        });
        if (bucket.count > limit) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many widget requests. Please try again shortly.");
        }
    }

    private static final class Bucket {
        long windowStartMs;
        int count;
        Bucket(long windowStartMs, int count) { this.windowStartMs = windowStartMs; this.count = count; }
    }
}
