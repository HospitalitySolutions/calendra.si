package com.example.app.session;

import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SessionBookingStatusTest {

    @Test
    void deriveLifecycleStatus_honorsStoredCheckedOutBeforeScheduledEnd() {
        LocalDateTime start = LocalDateTime.now().minusMinutes(30);
        LocalDateTime end = LocalDateTime.now().plusMinutes(30);
        LocalDateTime now = LocalDateTime.now();

        assertEquals(
                SessionBookingStatus.CHECKED_OUT,
                SessionBookingStatus.deriveLifecycleStatus(start, end, SessionBookingStatus.CHECKED_OUT, now)
        );
    }

    @Test
    void canTransition_allowsOngoingToCheckedOut() {
        assertTrue(SessionBookingStatus.canTransition(
                SessionBookingStatus.ONGOING,
                SessionBookingStatus.CHECKED_OUT
        ));
    }

    @Test
    void canTransition_allowsOngoingToReserved() {
        assertTrue(SessionBookingStatus.canTransition(
                SessionBookingStatus.ONGOING,
                SessionBookingStatus.RESERVED
        ));
    }

    @Test
    void allowsStoredStatusUpdate_allowsEarlyCheckoutWhileSessionStillRunning() {
        LocalDateTime start = LocalDateTime.now().minusMinutes(15);
        LocalDateTime end = LocalDateTime.now().plusMinutes(45);
        LocalDateTime now = LocalDateTime.now();

        assertTrue(SessionBookingStatus.allowsStoredStatusUpdate(
                start,
                end,
                SessionBookingStatus.RESERVED,
                SessionBookingStatus.CHECKED_OUT,
                now
        ));
    }

    @Test
    void allowsStoredStatusUpdate_allowsCatchUpCheckedOutWhenEndElapsedButStoredReserved() {
        LocalDateTime start = LocalDateTime.now().minusHours(2);
        LocalDateTime end = LocalDateTime.now().minusMinutes(10);
        LocalDateTime now = LocalDateTime.now();

        assertTrue(SessionBookingStatus.allowsStoredStatusUpdate(
                start,
                end,
                SessionBookingStatus.RESERVED,
                SessionBookingStatus.CHECKED_OUT,
                now
        ));
    }

    @Test
    void allowsStoredStatusUpdate_usesExtendedEndFromRequestForOngoingEarlyCheckout() {
        LocalDateTime start = LocalDateTime.now().minusHours(1);
        LocalDateTime dbEnd = LocalDateTime.now().minusMinutes(5);
        LocalDateTime requestEnd = LocalDateTime.now().plusHours(1);
        LocalDateTime now = LocalDateTime.now();

        assertTrue(SessionBookingStatus.allowsStoredStatusUpdate(
                start,
                dbEnd,
                SessionBookingStatus.RESERVED,
                SessionBookingStatus.CHECKED_OUT,
                now
        ));
        assertTrue(SessionBookingStatus.allowsStoredStatusUpdate(
                start,
                requestEnd,
                SessionBookingStatus.RESERVED,
                SessionBookingStatus.CHECKED_OUT,
                now
        ));
        assertEquals(
                SessionBookingStatus.ONGOING,
                SessionBookingStatus.deriveLifecycleStatus(start, requestEnd, SessionBookingStatus.RESERVED, now)
        );
    }

    @Test
    void allowsStoredStatusUpdate_rejectsCheckoutBeforeSessionStarts() {
        LocalDateTime start = LocalDateTime.now().plusHours(1);
        LocalDateTime end = LocalDateTime.now().plusHours(2);
        LocalDateTime now = LocalDateTime.now();

        assertFalse(SessionBookingStatus.allowsStoredStatusUpdate(
                start,
                end,
                SessionBookingStatus.RESERVED,
                SessionBookingStatus.CHECKED_OUT,
                now
        ));
    }

    @Test
    void allowsStoredStatusUpdate_rejectsCheckoutFromCancelled() {
        LocalDateTime start = LocalDateTime.now().minusHours(1);
        LocalDateTime end = LocalDateTime.now().plusHours(1);
        LocalDateTime now = LocalDateTime.now();

        assertFalse(SessionBookingStatus.allowsStoredStatusUpdate(
                start,
                end,
                SessionBookingStatus.CANCELLED,
                SessionBookingStatus.CHECKED_OUT,
                now
        ));
    }
}
