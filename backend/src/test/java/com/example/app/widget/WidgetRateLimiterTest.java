package com.example.app.widget;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class WidgetRateLimiterTest {
    @Test
    void bookingHoldsDoNotConsumeFinalBookingAllowance() {
        WidgetSecurityProperties properties = new WidgetSecurityProperties();
        properties.setRateLimitBackend("memory");
        properties.setBookingsPerMinutePerIp(1);
        properties.setBookingsPerMinutePerTenant(10);
        properties.setBookingHoldsPerMinutePerIp(3);
        properties.setBookingHoldsPerMinutePerTenant(10);
        WidgetRateLimiter limiter = new WidgetRateLimiter(properties);

        assertDoesNotThrow(() -> limiter.check("3DAV", "203.0.113.10", true));
        assertDoesNotThrow(() -> limiter.checkBookingHold("3DAV", "203.0.113.10"));
        assertDoesNotThrow(() -> limiter.checkBookingHold("3DAV", "203.0.113.10"));

        ResponseStatusException blocked = assertThrows(
                ResponseStatusException.class,
                () -> limiter.check("3DAV", "203.0.113.10", true)
        );
        assertEquals(HttpStatus.TOO_MANY_REQUESTS, blocked.getStatusCode());
    }

    @Test
    void bookingHoldsKeepTheirOwnAbuseLimit() {
        WidgetSecurityProperties properties = new WidgetSecurityProperties();
        properties.setRateLimitBackend("memory");
        properties.setBookingHoldsPerMinutePerIp(2);
        properties.setBookingHoldsPerMinutePerTenant(10);
        WidgetRateLimiter limiter = new WidgetRateLimiter(properties);

        assertDoesNotThrow(() -> limiter.checkBookingHold("3DAV", "203.0.113.20"));
        assertDoesNotThrow(() -> limiter.checkBookingHold("3DAV", "203.0.113.20"));

        ResponseStatusException blocked = assertThrows(
                ResponseStatusException.class,
                () -> limiter.checkBookingHold("3DAV", "203.0.113.20")
        );
        assertEquals(HttpStatus.TOO_MANY_REQUESTS, blocked.getStatusCode());
    }
}
