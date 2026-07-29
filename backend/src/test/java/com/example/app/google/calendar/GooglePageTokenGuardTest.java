package com.example.app.google.calendar;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

class GooglePageTokenGuardTest {

    @Test
    void acceptsAValidFiniteTokenChain() {
        GooglePageTokenGuard guard = new GooglePageTokenGuard();

        String first = guard.next(null, "page-2");
        String second = guard.next(first, "page-3");

        assertEquals("page-2", first);
        assertEquals("page-3", second);
        assertNull(guard.next(second, null));
    }

    @Test
    void rejectsTheSameTokenReturnedAgain() {
        GooglePageTokenGuard guard = new GooglePageTokenGuard();
        String first = guard.next(null, "page-2");

        assertThrows(IllegalStateException.class, () -> guard.next(first, "page-2"));
    }

    @Test
    void rejectsAPreviouslySeenTokenCycle() {
        GooglePageTokenGuard guard = new GooglePageTokenGuard();
        String first = guard.next(null, "page-2");
        String second = guard.next(first, "page-3");

        assertThrows(IllegalStateException.class, () -> guard.next(second, "page-2"));
    }
}
