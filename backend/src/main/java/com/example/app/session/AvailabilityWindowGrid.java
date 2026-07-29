package com.example.app.session;

import java.time.Duration;
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
    private static final long NANOS_PER_MINUTE = Duration.ofMinutes(1).toNanos();
    private static final int MINUTES_PER_DAY = 24 * 60;

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

        LocalDateTime first = date.atTime(windowStart);
        LocalDateTime end = date.atTime(windowEnd);
        long windowNanos = Duration.between(first, end).toNanos();
        if (requiredMinutes > MINUTES_PER_DAY) {
            return List.of();
        }

        long requiredNanos = requiredMinutes * NANOS_PER_MINUTE;
        if (windowNanos < requiredNanos) {
            return List.of();
        }

        // The window is always shorter than one day. If the step itself is longer than a day,
        // only the first start can fit. Avoid converting an arbitrary integer step to nanos.
        int count = 1;
        if (stepMinutes <= MINUTES_PER_DAY) {
            long stepNanos = stepMinutes * NANOS_PER_MINUTE;
            count += Math.toIntExact((windowNanos - requiredNanos) / stepNanos);
        }

        List<LocalDateTime> starts = new ArrayList<>(count);
        LocalDateTime cursor = first;
        for (int index = 0; index < count; index++) {
            starts.add(cursor);
            cursor = cursor.plusMinutes(stepMinutes);
        }
        return List.copyOf(starts);
    }
}
