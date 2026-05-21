package com.example.app.security.ratelimit;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.server.ResponseStatusException;

class AuthRateLimiterTest {
    @Test
    void limitsRepeatedStaffLoginAttemptsByIdentity() {
        AuthRateLimitProperties properties = new AuthRateLimitProperties();
        properties.setStaffLoginPerIp(100);
        properties.setStaffLoginPerIdentity(1);
        AuthRateLimiter limiter = new AuthRateLimiter(properties);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr("203.0.113.10");

        assertDoesNotThrow(() -> limiter.checkStaffLogin(request, "owner@example.com"));
        assertThrows(ResponseStatusException.class, () -> limiter.checkStaffLogin(request, "OWNER@example.com"));
        assertDoesNotThrow(() -> limiter.checkStaffLogin(request, "other@example.com"));
    }

    @Test
    void limitsGuestSignupAttemptsByIp() {
        AuthRateLimitProperties properties = new AuthRateLimitProperties();
        properties.setGuestSignupPerIp(1);
        properties.setGuestSignupPerIdentity(100);
        AuthRateLimiter limiter = new AuthRateLimiter(properties);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr("203.0.113.20");

        assertDoesNotThrow(() -> limiter.checkGuestSignup(request, "first@example.com"));
        assertThrows(ResponseStatusException.class, () -> limiter.checkGuestSignup(request, "second@example.com"));
    }
}
