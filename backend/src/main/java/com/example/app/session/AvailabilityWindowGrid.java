package com.example.app.session;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Generates fixed-grid starts inside a same-day availability window.
 *
 * <p>The calculation intentionally uses {@link LocalDateTime} rather than repeatedly adding
 * minutes to {@link LocalTime}. LocalTime wraps at midnight, which can otherwise turn an
 * all-day window ending at 23:59:59 into an endless loop once the cursor reaches 23:30.</p>
 */
public final class AvailabilityWindowGrid {
    private AvailabilityWindowGrid() {}

    public static List<LocalDateTime> starts(
            LocalDate date,
            LocalTime windowStart,
            LocalTime windowEnd,
            int requiredMinutes,
            int stepMinutes
    ) {
        if (date == null || windowStart == null || windowEnd == null
                || requiredMinutes <= 0 || stepMinutes <= 0 || !windowEnd.isAfter(windowStart)) {
            return List.of();
        }

        LocalDateTime cursor = date.atTime(windowStart);
        LocalDateTime end = date.atTime(windowEnd);
        List<LocalDateTime> starts = new ArrayList<>();
        while (!cursor.plusMinutes(requiredMinutes).isAfter(end)) {
            starts.add(cursor);
            cursor = cursor.plusMinutes(stepMinutes);
        }
        return List.copyOf(starts);
    }
}
