package com.example.app.client;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import com.example.app.guest.model.GuestEntitlementRepository;
import com.example.app.session.SessionBookingRepository;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ClientRemovalGuardTest {

    @Mock
    private SessionBookingRepository bookings;

    @Mock
    private GuestEntitlementRepository entitlements;

    @InjectMocks
    private ClientRemovalGuard guard;

    @Test
    void isRemovalBlocked_trueWhenUpcomingOrLiveBookingExists() {
        when(bookings.existsRemovalBlockingBooking(eq(1L), eq(10L), any())).thenReturn(true);
        assertTrue(guard.isRemovalBlocked(10L, 1L));
    }

    @Test
    void isRemovalBlocked_trueWhenUsableWalletEntitlementExists() {
        when(bookings.existsRemovalBlockingBooking(eq(1L), eq(10L), any())).thenReturn(false);
        when(entitlements.existsRemovalBlockingEntitlement(eq(1L), eq(10L), any(), any())).thenReturn(true);
        assertTrue(guard.isRemovalBlocked(10L, 1L));
    }

    @Test
    void isRemovalBlocked_falseWhenNoBookingAndNoEntitlement() {
        when(bookings.existsRemovalBlockingBooking(any(), any(), any())).thenReturn(false);
        when(entitlements.existsRemovalBlockingEntitlement(any(), any(), any(), any())).thenReturn(false);
        assertFalse(guard.isRemovalBlocked(10L, 1L));
    }

    @Test
    void clientIdsWithRemovalBlock_mergesBookingAndEntitlementHits() {
        List<Long> ids = List.of(1L, 2L);
        when(bookings.findClientIdsWithRemovalBlockingBookings(eq(1L), eq(ids), any())).thenReturn(List.of(1L));
        when(entitlements.findClientIdsWithRemovalBlockingEntitlements(eq(1L), eq(ids), any(), any())).thenReturn(List.of(2L));
        assertEquals(Set.of(1L, 2L), guard.clientIdsWithRemovalBlock(1L, ids));
    }

    @Test
    void clientIdsWithRemovalBlock_emptyInput_returnsEmpty() {
        assertTrue(guard.clientIdsWithRemovalBlock(1L, List.of()).isEmpty());
    }
}
