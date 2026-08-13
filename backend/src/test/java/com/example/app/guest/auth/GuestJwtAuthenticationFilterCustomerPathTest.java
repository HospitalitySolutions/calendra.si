package com.example.app.guest.auth;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

import com.example.app.guest.model.GuestUserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

class GuestJwtAuthenticationFilterCustomerPathTest {

    private final GuestJwtAuthenticationFilter filter = new GuestJwtAuthenticationFilter(
            mock(GuestTokenService.class),
            mock(GuestUserRepository.class)
    );

    @Test
    void customerV1IsAuthenticatedByGuestFilter() {
        assertFalse(filter.shouldNotFilter(new MockHttpServletRequest("GET", "/api/customer/v1/home")));
        assertFalse(filter.shouldNotFilter(new MockHttpServletRequest("GET", "/api/customer/v1/bookings")));
    }

    @Test
    void guestAdminAndUnrelatedRoutesRemainExcluded() {
        assertTrue(filter.shouldNotFilter(new MockHttpServletRequest("GET", "/api/guest/admin/products")));
        assertTrue(filter.shouldNotFilter(new MockHttpServletRequest("GET", "/api/settings")));
    }
}
