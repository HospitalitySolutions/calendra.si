package com.example.app.session;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AvailabilityWindowGridTest {

    @Test
    void allDayWindowStopsBeforeMidnightWithoutWrapping() {
        LocalDate date = LocalDate.of(2026, 8, 22);

        List<LocalDateTime> starts = AvailabilityWindowGrid.starts(
                date,
                LocalTime.MIDNIGHT,
                LocalTime.of(23, 59, 59),
                30,
                30
        );

        assertEquals(47, starts.size());
        assertEquals(LocalDateTime.of(2026, 8, 22, 0, 0), starts.get(0));
        assertEquals(LocalDateTime.of(2026, 8, 22, 23, 0), starts.get(starts.size() - 1));
        assertTrue(starts.stream().allMatch(start -> start.toLocalDate().equals(date)));
    }

    @Test
    void ordinaryWindowKeepsExpectedGrid() {
        List<LocalDateTime> starts = AvailabilityWindowGrid.starts(
                LocalDate.of(2026, 8, 22),
                LocalTime.of(9, 0),
                LocalTime.of(11, 0),
                30,
                30
        );

        assertEquals(List.of(
                LocalDateTime.of(2026, 8, 22, 9, 0),
                LocalDateTime.of(2026, 8, 22, 9, 30),
                LocalDateTime.of(2026, 8, 22, 10, 0),
                LocalDateTime.of(2026, 8, 22, 10, 30)
        ), starts);
    }

    @Test
    void subMinuteWindowBoundaryMatchesThePreviousLoopSemantics() {
        List<LocalDateTime> starts = AvailabilityWindowGrid.starts(
                LocalDate.of(2026, 8, 22),
                LocalTime.of(9, 0, 30),
                LocalTime.of(11, 0, 20),
                30,
                30
        );

        assertEquals(List.of(
                LocalDateTime.of(2026, 8, 22, 9, 0, 30),
                LocalDateTime.of(2026, 8, 22, 9, 30, 30),
                LocalDateTime.of(2026, 8, 22, 10, 0, 30)
        ), starts);
    }

    @Test
    void oversizedStepStillReturnsTheFirstValidStartOnly() {
        List<LocalDateTime> starts = AvailabilityWindowGrid.starts(
                LocalDate.of(2026, 8, 22),
                LocalTime.of(9, 0),
                LocalTime.of(11, 0),
                30,
                Integer.MAX_VALUE
        );

        assertEquals(List.of(LocalDateTime.of(2026, 8, 22, 9, 0)), starts);
    }

}
