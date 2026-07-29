package com.example.app.session;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;

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
    private static final DateTimeFormatter TIME_FORMAT = DateTimeFormatter.ofPattern("HH:mm:ss");
    private static final int MAX_EXPANDED_DAYS = 3700;

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

    /** Serializes recurrence metadata in the same format used by the calendar frontend. */
    public static String notes(Metadata metadata) {
        if (metadata == null) {
            throw new IllegalArgumentException("Availability metadata is required.");
        }
        return "Availability blocked\n" + PREFIX
                + "dayOfWeek=" + metadata.dayOfWeek()
                + ";startTime=" + metadata.startTime().format(TIME_FORMAT)
                + ";endTime=" + metadata.endTime().format(TIME_FORMAT)
                + ";indefinite=" + metadata.indefinite()
                + ";startDate=" + (metadata.startDate() == null ? "" : metadata.startDate())
                + ";endDate=" + (metadata.indefinite() || metadata.endDate() == null ? "" : metadata.endDate());
    }

    /**
     * Removes an opened-availability recurrence from a blocked-availability recurrence.
     *
     * <p>Weekly timed recurrences are split into before/overlap/after date ranges and up to two
     * remaining time segments. Finite multi-day all-day blocks are daily by design, so they are
     * expanded per date when a partial-day exception is introduced.</p>
     */
    public static List<Metadata> subtract(Metadata blocked, Metadata opened) {
        if (!isValid(blocked) || !isValid(opened)) {
            return blocked == null ? List.of() : List.of(blocked);
        }
        if (!timesOverlap(blocked.startTime(), blocked.endTime(), opened.startTime(), opened.endTime())) {
            return List.of(blocked);
        }
        if (isFiniteDailyAllDayRange(blocked)) {
            return subtractFromFiniteDailyRange(blocked, opened);
        }

        boolean openedDaily = isFiniteDailyAllDayRange(opened);
        if (!openedDaily && blocked.dayOfWeek() != opened.dayOfWeek()) {
            return List.of(blocked);
        }

        LocalDate overlapStart = later(blocked.startDate(), opened.startDate());
        LocalDate overlapEnd = earlier(endDateOrNull(blocked), endDateOrNull(opened));
        if (overlapStart == null || (overlapEnd != null && overlapEnd.isBefore(overlapStart))
                || !hasOccurrence(blocked.dayOfWeek(), overlapStart, overlapEnd)) {
            return List.of(blocked);
        }

        List<Metadata> result = new ArrayList<>();
        LocalDate beforeEnd = overlapStart.minusDays(1);
        addIfHasOccurrence(result, copyRange(blocked, blocked.startDate(), beforeEnd, false));

        for (TimeSegment segment : subtractTimes(
                blocked.startTime(), blocked.endTime(), opened.startTime(), opened.endTime())) {
            addIfHasOccurrence(result, new Metadata(
                    blocked.dayOfWeek(),
                    segment.start(),
                    segment.end(),
                    overlapEnd == null,
                    overlapStart,
                    overlapEnd
            ));
        }

        LocalDate blockedEnd = endDateOrNull(blocked);
        if (overlapEnd != null && (blockedEnd == null || blockedEnd.isAfter(overlapEnd))) {
            addIfHasOccurrence(result, new Metadata(
                    blocked.dayOfWeek(),
                    blocked.startTime(),
                    blocked.endTime(),
                    blockedEnd == null,
                    overlapEnd.plusDays(1),
                    blockedEnd
            ));
        }
        return List.copyOf(result);
    }

    private static List<Metadata> subtractFromFiniteDailyRange(Metadata blocked, Metadata opened) {
        long days = java.time.temporal.ChronoUnit.DAYS.between(blocked.startDate(), blocked.endDate()) + 1;
        if (days > MAX_EXPANDED_DAYS) {
            throw new IllegalArgumentException("Availability range is too large to split safely.");
        }

        Map<LocalDate, List<TimeSegment>> segmentsByDate = new TreeMap<>();
        for (LocalDate date = blocked.startDate(); !date.isAfter(blocked.endDate()); date = date.plusDays(1)) {
            List<TimeSegment> segments = occursOn(opened, date)
                    ? subtractTimes(blocked.startTime(), blocked.endTime(), opened.startTime(), opened.endTime())
                    : List.of(new TimeSegment(blocked.startTime(), blocked.endTime()));
            if (!segments.isEmpty()) {
                segmentsByDate.put(date, segments);
            }
        }

        List<Metadata> result = new ArrayList<>();
        LocalDate fullDayRunStart = null;
        LocalDate fullDayRunEnd = null;
        for (Map.Entry<LocalDate, List<TimeSegment>> entry : segmentsByDate.entrySet()) {
            LocalDate date = entry.getKey();
            List<TimeSegment> segments = entry.getValue();
            boolean fullDay = segments.size() == 1
                    && LocalTime.MIDNIGHT.equals(segments.get(0).start())
                    && LocalTime.of(23, 59, 59).equals(segments.get(0).end());
            if (fullDay) {
                if (fullDayRunStart == null) {
                    fullDayRunStart = date;
                    fullDayRunEnd = date;
                } else if (date.equals(fullDayRunEnd.plusDays(1))) {
                    fullDayRunEnd = date;
                } else {
                    addDailyRun(result, fullDayRunStart, fullDayRunEnd);
                    fullDayRunStart = date;
                    fullDayRunEnd = date;
                }
                continue;
            }

            if (fullDayRunStart != null) {
                addDailyRun(result, fullDayRunStart, fullDayRunEnd);
                fullDayRunStart = null;
                fullDayRunEnd = null;
            }
            for (TimeSegment segment : segments) {
                result.add(new Metadata(
                        date.getDayOfWeek(), segment.start(), segment.end(), false, date, date));
            }
        }
        if (fullDayRunStart != null) {
            addDailyRun(result, fullDayRunStart, fullDayRunEnd);
        }
        return List.copyOf(result);
    }

    private static void addDailyRun(List<Metadata> result, LocalDate start, LocalDate end) {
        if (start == null || end == null || end.isBefore(start)) return;
        result.add(new Metadata(
                start.getDayOfWeek(), LocalTime.MIDNIGHT, LocalTime.of(23, 59, 59), false, start, end));
    }

    private static List<TimeSegment> subtractTimes(
            LocalTime blockedStart,
            LocalTime blockedEnd,
            LocalTime openedStart,
            LocalTime openedEnd
    ) {
        if (!timesOverlap(blockedStart, blockedEnd, openedStart, openedEnd)) {
            return List.of(new TimeSegment(blockedStart, blockedEnd));
        }
        List<TimeSegment> result = new ArrayList<>(2);
        if (openedStart.isAfter(blockedStart)) {
            LocalTime leftEnd = openedStart.isBefore(blockedEnd) ? openedStart : blockedEnd;
            if (leftEnd.isAfter(blockedStart)) {
                result.add(new TimeSegment(blockedStart, leftEnd));
            }
        }
        if (openedEnd.isBefore(blockedEnd)) {
            LocalTime rightStart = openedEnd.isAfter(blockedStart) ? openedEnd : blockedStart;
            if (blockedEnd.isAfter(rightStart)) {
                result.add(new TimeSegment(rightStart, blockedEnd));
            }
        }
        return result;
    }

    private static boolean timesOverlap(LocalTime aStart, LocalTime aEnd, LocalTime bStart, LocalTime bEnd) {
        return aStart != null && aEnd != null && bStart != null && bEnd != null
                && aEnd.isAfter(aStart) && bEnd.isAfter(bStart)
                && aStart.isBefore(bEnd) && aEnd.isAfter(bStart);
    }

    private static boolean isValid(Metadata metadata) {
        return metadata != null
                && metadata.dayOfWeek() != null
                && metadata.startTime() != null
                && metadata.endTime() != null
                && metadata.endTime().isAfter(metadata.startTime())
                && metadata.startDate() != null
                && (metadata.indefinite()
                    || (metadata.endDate() != null && !metadata.endDate().isBefore(metadata.startDate())));
    }

    private static boolean isFiniteDailyAllDayRange(Metadata metadata) {
        return metadata != null
                && !metadata.indefinite()
                && metadata.startDate() != null
                && metadata.endDate() != null
                && metadata.endDate().isAfter(metadata.startDate())
                && LocalTime.MIDNIGHT.equals(metadata.startTime())
                && LocalTime.of(23, 59, 59).equals(metadata.endTime());
    }

    private static Metadata copyRange(Metadata source, LocalDate start, LocalDate end, boolean indefinite) {
        return new Metadata(
                source.dayOfWeek(), source.startTime(), source.endTime(), indefinite, start, indefinite ? null : end);
    }

    private static void addIfHasOccurrence(List<Metadata> target, Metadata metadata) {
        if (metadata == null || metadata.startDate() == null) return;
        LocalDate end = endDateOrNull(metadata);
        if (end != null && end.isBefore(metadata.startDate())) return;
        if (hasOccurrence(metadata.dayOfWeek(), metadata.startDate(), end)) {
            target.add(metadata);
        }
    }

    private static boolean hasOccurrence(DayOfWeek dayOfWeek, LocalDate start, LocalDate end) {
        if (dayOfWeek == null || start == null) return false;
        LocalDate first = start.with(TemporalAdjusters.nextOrSame(dayOfWeek));
        return end == null || !first.isAfter(end);
    }

    private static LocalDate endDateOrNull(Metadata metadata) {
        return metadata.indefinite() ? null : metadata.endDate();
    }

    private static LocalDate later(LocalDate a, LocalDate b) {
        if (a == null) return b;
        if (b == null) return a;
        return a.isAfter(b) ? a : b;
    }

    private static LocalDate earlier(LocalDate a, LocalDate b) {
        if (a == null) return b;
        if (b == null) return a;
        return a.isBefore(b) ? a : b;
    }

    private record TimeSegment(LocalTime start, LocalTime end) {}

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
        if (date == null || meta.dayOfWeek() == null) {
            return false;
        }
        if (meta.startDate() != null && date.isBefore(meta.startDate())) return false;
        if (!meta.indefinite() && meta.endDate() != null && date.isAfter(meta.endDate())) return false;
        // Older frontend versions stored a finite multi-day all-day selection as a
        // weekly marker anchored to the first date. Such a selection semantically
        // covers every date in the chosen range, so expand it daily. Keep indefinite
        // all-day markers weekly, matching the recurrence control's original meaning.
        boolean finiteMultiDayAllDayRange =
                !meta.indefinite()
                && meta.startDate() != null
                && meta.endDate() != null
                && meta.endDate().isAfter(meta.startDate())
                && LocalTime.MIDNIGHT.equals(meta.startTime())
                && LocalTime.of(23, 59, 59).equals(meta.endTime());
        if (!finiteMultiDayAllDayRange && date.getDayOfWeek() != meta.dayOfWeek()) return false;
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
