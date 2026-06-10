package com.example.app.session;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * Metadata helper for Calendar -> Availability -> Block markers.
 *
 * A block is still stored as a hidden PersonalCalendarBlock for backwards compatibility,
 * but notes may contain a compact recurrence payload so a single marker can block the
 * same weekday/time across a limited range or indefinitely.
 */
public final class AvailabilityBlockMetadata {
    public static final String TASK = "__availability_block__";
    public static final String PREFIX = "CALENDRA_AVAILABILITY_BLOCK_V1:";

    private AvailabilityBlockMetadata() {}

    public record Metadata(
            DayOfWeek dayOfWeek,
            LocalTime startTime,
            LocalTime endTime,
            boolean indefinite,
            LocalDate startDate,
            LocalDate endDate
    ) {}

    public record Occurrence(LocalDateTime startTime, LocalDateTime endTime) {}

    public static boolean isAvailabilityBlock(PersonalCalendarBlock block) {
        return block != null && TASK.equalsIgnoreCase(safeTrim(block.getTask()));
    }

    public static boolean isRecurringAvailabilityBlock(PersonalCalendarBlock block) {
        return isAvailabilityBlock(block) && parse(block).isPresent();
    }

    public static Optional<Metadata> parse(PersonalCalendarBlock block) {
        if (!isAvailabilityBlock(block)) {
            return Optional.empty();
        }
        return parse(block.getNotes(), block.getStartTime(), block.getEndTime());
    }

    public static Optional<Metadata> parse(String notes, LocalDateTime fallbackStart, LocalDateTime fallbackEnd) {
        if (notes == null) {
            return Optional.empty();
        }
        int prefixIndex = notes.indexOf(PREFIX);
        if (prefixIndex < 0) {
            return Optional.empty();
        }
        int dataStart = prefixIndex + PREFIX.length();
        int dataEnd = notes.indexOf('\n', dataStart);
        String payload = dataEnd >= 0 ? notes.substring(dataStart, dataEnd) : notes.substring(dataStart);
        Map<String, String> values = new HashMap<>();
        for (String part : payload.split(";")) {
            int idx = part.indexOf('=');
            if (idx <= 0) continue;
            String key = part.substring(0, idx).trim();
            String value = part.substring(idx + 1).trim();
            if (!key.isEmpty()) {
                values.put(key, value);
            }
        }
        try {
            DayOfWeek dayOfWeek = parseDay(values.get("dayOfWeek"));
            LocalTime startTime = parseTime(values.get("startTime"));
            LocalTime endTime = parseTime(values.get("endTime"));
            boolean indefinite = Boolean.parseBoolean(values.getOrDefault("indefinite", "false"));
            LocalDate startDate = parseDateOrNull(values.get("startDate"));
            LocalDate endDate = parseDateOrNull(values.get("endDate"));

            if (dayOfWeek == null && fallbackStart != null) dayOfWeek = fallbackStart.getDayOfWeek();
            if (startTime == null && fallbackStart != null) startTime = fallbackStart.toLocalTime();
            if (endTime == null && fallbackEnd != null) endTime = fallbackEnd.toLocalTime();
            if (startDate == null && fallbackStart != null) startDate = fallbackStart.toLocalDate();
            if (!indefinite && endDate == null && fallbackEnd != null) endDate = fallbackEnd.toLocalDate();
            if (dayOfWeek == null || startTime == null || endTime == null) {
                return Optional.empty();
            }
            if (!indefinite && (startDate == null || endDate == null || endDate.isBefore(startDate))) {
                return Optional.empty();
            }
            return Optional.of(new Metadata(dayOfWeek, startTime, endTime, indefinite, startDate, endDate));
        } catch (Exception ignored) {
            return Optional.empty();
        }
    }

    public static boolean overlaps(PersonalCalendarBlock block, LocalDateTime rangeStart, LocalDateTime rangeEnd) {
        return parse(block)
                .map(meta -> overlaps(meta, rangeStart, rangeEnd))
                .orElse(false);
    }

    public static boolean overlaps(Metadata meta, LocalDateTime rangeStart, LocalDateTime rangeEnd) {
        if (meta == null || rangeStart == null || rangeEnd == null || !rangeEnd.isAfter(rangeStart)) {
            return false;
        }
        LocalDate cursor = rangeStart.toLocalDate();
        LocalDate last = rangeEnd.minusNanos(1).toLocalDate();
        long guard = 0;
        while (!cursor.isAfter(last) && guard++ < 3700) {
            if (occursOn(meta, cursor)) {
                LocalDateTime occurrenceStart = cursor.atTime(meta.startTime());
                LocalDateTime occurrenceEnd = cursor.atTime(meta.endTime());
                if (!occurrenceEnd.isAfter(occurrenceStart)) {
                    occurrenceEnd = occurrenceEnd.plusDays(1);
                }
                if (rangeStart.isBefore(occurrenceEnd) && rangeEnd.isAfter(occurrenceStart)) {
                    return true;
                }
            }
            cursor = cursor.plusDays(1);
        }
        return false;
    }

    public static List<Occurrence> expand(PersonalCalendarBlock block, LocalDate from, LocalDate to) {
        Optional<Metadata> parsed = parse(block);
        if (parsed.isEmpty() || from == null || to == null || to.isBefore(from)) {
            return List.of();
        }
        Metadata meta = parsed.get();
        LocalDate cursor = from;
        if (meta.startDate() != null && cursor.isBefore(meta.startDate())) {
            cursor = meta.startDate();
        }
        LocalDate last = to;
        if (!meta.indefinite() && meta.endDate() != null && last.isAfter(meta.endDate())) {
            last = meta.endDate();
        }
        List<Occurrence> out = new ArrayList<>();
        long guard = 0;
        while (!cursor.isAfter(last) && guard++ < 3700) {
            if (occursOn(meta, cursor)) {
                LocalDateTime start = cursor.atTime(meta.startTime());
                LocalDateTime end = cursor.atTime(meta.endTime());
                if (!end.isAfter(start)) {
                    end = end.plusDays(1);
                }
                out.add(new Occurrence(start, end));
            }
            cursor = cursor.plusDays(1);
        }
        return out;
    }

    private static boolean occursOn(Metadata meta, LocalDate date) {
        if (date == null || meta.dayOfWeek() == null || date.getDayOfWeek() != meta.dayOfWeek()) {
            return false;
        }
        if (meta.startDate() != null && date.isBefore(meta.startDate())) return false;
        if (!meta.indefinite() && meta.endDate() != null && date.isAfter(meta.endDate())) return false;
        return true;
    }

    private static DayOfWeek parseDay(String raw) {
        if (raw == null || raw.isBlank()) return null;
        return DayOfWeek.valueOf(raw.trim().toUpperCase(Locale.ROOT));
    }

    private static LocalTime parseTime(String raw) {
        if (raw == null || raw.isBlank()) return null;
        return LocalTime.parse(raw.trim());
    }

    private static LocalDate parseDateOrNull(String raw) {
        if (raw == null || raw.isBlank() || "null".equalsIgnoreCase(raw.trim())) return null;
        return LocalDate.parse(raw.trim());
    }

    private static String safeTrim(String value) {
        return value == null ? "" : value.trim();
    }
}
