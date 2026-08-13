package com.example.app.guest.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import org.junit.jupiter.api.Test;

class GuestTokenServiceBookingHandoffTest {
    private static final String SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    @Test
    void bookingHandoffIsShortLivedScopedAndCannotBeUsedAsNormalGuestToken() {
        GuestTokenService service = new GuestTokenService(SECRET, 86_400_000L);
        Instant before = Instant.now();

        GuestTokenService.IssuedBookingHandoff issued = service.issueBookingHandoff(11L, 7L, 31L, "3DAV");
        GuestTokenService.BookingHandoffClaims claims = service.parseBookingHandoff(issued.token());

        assertEquals(11L, claims.guestUserId());
        assertEquals(7L, claims.companyId());
        assertEquals(31L, claims.locationId());
        assertEquals("3DAV", claims.tenantCode());
        assertTrue(issued.expiresAt().isAfter(before.plusSeconds(80)));
        assertTrue(issued.expiresAt().isBefore(before.plusSeconds(100)));
        assertThrows(IllegalArgumentException.class, () -> service.parseGuestUserId(issued.token()));
    }

    @Test
    void normalGuestTokenCannotBeUsedAsBookingHandoff() {
        GuestTokenService service = new GuestTokenService(SECRET, 86_400_000L);
        String token = service.issueToken(11L);

        assertThrows(IllegalArgumentException.class, () -> service.parseBookingHandoff(token));
    }
}
