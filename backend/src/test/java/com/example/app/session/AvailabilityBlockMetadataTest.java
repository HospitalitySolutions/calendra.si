package com.example.app.session;

import org.junit.jupiter.api.Test;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AvailabilityBlockMetadataTest {

    @Test
    void limitedMultiDayAllDayRangeCoversEverySelectedDate() {
        AvailabilityBlockMetadata.Metadata metadata = new AvailabilityBlockMetadata.Metadata(
                DayOfWeek.MONDAY,
                LocalTime.MIDNIGHT,
                LocalTime.of(23, 59, 59),
                false,
                LocalDate.of(2026, 8, 3),
                LocalDate.of(2026, 8, 6)
        );

        assertTrue(AvailabilityBlockMetadata.overlaps(
                metadata,
                LocalDateTime.of(2026, 8, 4, 10, 0),
                LocalDateTime.of(2026, 8, 4, 11, 0)
        ));
        assertTrue(AvailabilityBlockMetadata.overlaps(
                metadata,
                LocalDateTime.of(2026, 8, 6, 10, 0),
                LocalDateTime.of(2026, 8, 6, 11, 0)
        ));
        assertFalse(AvailabilityBlockMetadata.overlaps(
                metadata,
                LocalDateTime.of(2026, 8, 7, 10, 0),
                LocalDateTime.of(2026, 8, 7, 11, 0)
        ));
    }

    @Test
    void limitedTimedRangeKeepsWeeklyRecurrence() {
        AvailabilityBlockMetadata.Metadata metadata = new AvailabilityBlockMetadata.Metadata(
                DayOfWeek.MONDAY,
                LocalTime.of(9, 0),
                LocalTime.of(17, 0),
                false,
                LocalDate.of(2026, 8, 3),
                LocalDate.of(2026, 8, 10)
        );

        assertFalse(AvailabilityBlockMetadata.overlaps(
                metadata,
                LocalDateTime.of(2026, 8, 4, 10, 0),
                LocalDateTime.of(2026, 8, 4, 11, 0)
        ));
        assertTrue(AvailabilityBlockMetadata.overlaps(
                metadata,
                LocalDateTime.of(2026, 8, 10, 10, 0),
                LocalDateTime.of(2026, 8, 10, 11, 0)
        ));
    }
}
