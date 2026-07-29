package com.example.app.session;

import org.junit.jupiter.api.Test;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
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
    @Test
    void openingPartOfSingleDayAllDayBlockLeavesTwoTimedBlocks() {
        AvailabilityBlockMetadata.Metadata blocked = new AvailabilityBlockMetadata.Metadata(
                DayOfWeek.SATURDAY,
                LocalTime.MIDNIGHT,
                LocalTime.of(23, 59, 59),
                false,
                LocalDate.of(2026, 8, 22),
                LocalDate.of(2026, 8, 22)
        );
        AvailabilityBlockMetadata.Metadata opened = new AvailabilityBlockMetadata.Metadata(
                DayOfWeek.SATURDAY,
                LocalTime.of(10, 0),
                LocalTime.of(12, 0),
                false,
                LocalDate.of(2026, 8, 22),
                LocalDate.of(2026, 8, 22)
        );

        var remaining = AvailabilityBlockMetadata.subtract(blocked, opened);

        assertEquals(2, remaining.size());
        assertEquals(LocalTime.MIDNIGHT, remaining.get(0).startTime());
        assertEquals(LocalTime.of(10, 0), remaining.get(0).endTime());
        assertEquals(LocalTime.of(12, 0), remaining.get(1).startTime());
        assertEquals(LocalTime.of(23, 59, 59), remaining.get(1).endTime());
    }

    @Test
    void openingOneFullDayInsideIndefiniteWeeklyBlockSplitsDateRecurrence() {
        AvailabilityBlockMetadata.Metadata blocked = new AvailabilityBlockMetadata.Metadata(
                DayOfWeek.SATURDAY,
                LocalTime.MIDNIGHT,
                LocalTime.of(23, 59, 59),
                true,
                LocalDate.of(2026, 8, 1),
                null
        );
        AvailabilityBlockMetadata.Metadata opened = new AvailabilityBlockMetadata.Metadata(
                DayOfWeek.SATURDAY,
                LocalTime.MIDNIGHT,
                LocalTime.of(23, 59, 59),
                false,
                LocalDate.of(2026, 8, 22),
                LocalDate.of(2026, 8, 22)
        );

        var remaining = AvailabilityBlockMetadata.subtract(blocked, opened);

        assertEquals(2, remaining.size());
        assertFalse(remaining.get(0).indefinite());
        assertEquals(LocalDate.of(2026, 8, 21), remaining.get(0).endDate());
        assertTrue(remaining.get(1).indefinite());
        assertEquals(LocalDate.of(2026, 8, 23), remaining.get(1).startDate());
        assertFalse(AvailabilityBlockMetadata.overlaps(
                remaining.get(0),
                LocalDateTime.of(2026, 8, 22, 10, 0),
                LocalDateTime.of(2026, 8, 22, 11, 0)
        ));
        assertFalse(AvailabilityBlockMetadata.overlaps(
                remaining.get(1),
                LocalDateTime.of(2026, 8, 22, 10, 0),
                LocalDateTime.of(2026, 8, 22, 11, 0)
        ));
        assertTrue(AvailabilityBlockMetadata.overlaps(
                remaining.get(1),
                LocalDateTime.of(2026, 8, 29, 10, 0),
                LocalDateTime.of(2026, 8, 29, 11, 0)
        ));
    }

    @Test
    void partialOpeningInsideFiniteDailyAllDayRangeOnlyChangesSelectedDate() {
        AvailabilityBlockMetadata.Metadata blocked = new AvailabilityBlockMetadata.Metadata(
                DayOfWeek.FRIDAY,
                LocalTime.MIDNIGHT,
                LocalTime.of(23, 59, 59),
                false,
                LocalDate.of(2026, 8, 21),
                LocalDate.of(2026, 8, 23)
        );
        AvailabilityBlockMetadata.Metadata opened = new AvailabilityBlockMetadata.Metadata(
                DayOfWeek.SATURDAY,
                LocalTime.of(10, 0),
                LocalTime.of(12, 0),
                false,
                LocalDate.of(2026, 8, 22),
                LocalDate.of(2026, 8, 22)
        );

        var remaining = AvailabilityBlockMetadata.subtract(blocked, opened);

        assertTrue(remaining.stream().anyMatch(meta -> AvailabilityBlockMetadata.overlaps(
                meta,
                LocalDateTime.of(2026, 8, 21, 10, 0),
                LocalDateTime.of(2026, 8, 21, 11, 0)
        )));
        assertFalse(remaining.stream().anyMatch(meta -> AvailabilityBlockMetadata.overlaps(
                meta,
                LocalDateTime.of(2026, 8, 22, 10, 0),
                LocalDateTime.of(2026, 8, 22, 11, 0)
        )));
        assertTrue(remaining.stream().anyMatch(meta -> AvailabilityBlockMetadata.overlaps(
                meta,
                LocalDateTime.of(2026, 8, 22, 12, 0),
                LocalDateTime.of(2026, 8, 22, 13, 0)
        )));
        assertTrue(remaining.stream().anyMatch(meta -> AvailabilityBlockMetadata.overlaps(
                meta,
                LocalDateTime.of(2026, 8, 23, 10, 0),
                LocalDateTime.of(2026, 8, 23, 11, 0)
        )));
    }

}
