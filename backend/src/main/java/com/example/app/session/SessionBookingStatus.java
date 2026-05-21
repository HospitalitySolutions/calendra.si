package com.example.app.session;

import java.time.LocalDateTime;
import java.util.Set;

public final class SessionBookingStatus {
    public static final String RESERVED = "RESERVED";
    public static final String CANCELLED = "CANCELLED";
    public static final String NO_SHOW = "NO_SHOW";
    public static final String ONGOING = "ONGOING";
    public static final String CHECKED_OUT = "CHECKED_OUT";
    private static final String LEGACY_CONFIRMED = "CONFIRMED";
    private static final Set<String> STORED_STATUSES = Set.of(RESERVED, CANCELLED, NO_SHOW, CHECKED_OUT);

    private SessionBookingStatus() {
    }

    public static String normalizeStored(String rawStatus) {
        if (rawStatus == null || rawStatus.isBlank()) {
            return RESERVED;
        }
        String normalized = rawStatus.trim().toUpperCase();
        if (LEGACY_CONFIRMED.equals(normalized)) {
            return RESERVED;
        }
        if (STORED_STATUSES.contains(normalized)) {
            return normalized;
        }
        return RESERVED;
    }

    public static String normalizeRequestedStored(String rawStatus) {
        if (rawStatus == null || rawStatus.isBlank()) {
            return null;
        }
        String normalized = rawStatus.trim().toUpperCase();
        if (LEGACY_CONFIRMED.equals(normalized)) {
            return RESERVED;
        }
        if (STORED_STATUSES.contains(normalized)) {
            return normalized;
        }
        throw new IllegalArgumentException("Unsupported booking status.");
    }

    public static boolean isAvailabilityBlocking(String rawStatus) {
        String normalized = normalizeStored(rawStatus);
        return !CANCELLED.equals(normalized) && !NO_SHOW.equals(normalized);
    }

    public static boolean isCancelledBucketStatus(String rawStatus) {
        String normalized = normalizeStored(rawStatus);
        return CANCELLED.equals(normalized) || NO_SHOW.equals(normalized);
    }

    public static boolean isPastBillingEligible(String rawStatus) {
        return !CANCELLED.equals(normalizeStored(rawStatus));
    }

    public static String deriveLifecycleStatus(
            LocalDateTime startTime,
            LocalDateTime endTime,
            String rawStoredStatus,
            LocalDateTime now
    ) {
        String storedStatus = normalizeStored(rawStoredStatus);
        if (CANCELLED.equals(storedStatus) || NO_SHOW.equals(storedStatus)) {
            return storedStatus;
        }
        if (CHECKED_OUT.equals(storedStatus)) {
            return CHECKED_OUT;
        }
        if (now.isBefore(startTime)) {
            return RESERVED;
        }
        if (now.isBefore(endTime)) {
            return ONGOING;
        }
        return CHECKED_OUT;
    }

    /**
     * Whether a booking update may persist {@code targetStoredStatus} given the effective session window.
     * Allows persisting CHECKED_OUT when lifecycle is already time-derived as CHECKED_OUT but stored flag lags.
     */
    public static boolean allowsStoredStatusUpdate(
            LocalDateTime startTime,
            LocalDateTime endTime,
            String rawStoredStatus,
            String targetStoredStatus,
            LocalDateTime now
    ) {
        if (startTime == null || endTime == null || targetStoredStatus == null || now == null) {
            return false;
        }
        String existingStored = normalizeStored(rawStoredStatus);
        if (CHECKED_OUT.equals(targetStoredStatus)) {
            if (CANCELLED.equals(existingStored) || NO_SHOW.equals(existingStored)) {
                return false;
            }
            if (CHECKED_OUT.equals(existingStored)) {
                return true;
            }
            // Manual checkout once the session has started (including before scheduled end).
            if (!now.isBefore(startTime)) {
                return true;
            }
            return false;
        }
        String derived = deriveLifecycleStatus(startTime, endTime, rawStoredStatus, now);
        return canTransition(derived, targetStoredStatus);
    }

    public static boolean canTransition(String derivedCurrentStatus, String targetStoredStatus) {
        if (derivedCurrentStatus == null || targetStoredStatus == null) {
            return false;
        }
        return switch (derivedCurrentStatus) {
            case CANCELLED, NO_SHOW -> derivedCurrentStatus.equals(targetStoredStatus);
            case RESERVED ->
                    RESERVED.equals(targetStoredStatus)
                            || CANCELLED.equals(targetStoredStatus)
                            || NO_SHOW.equals(targetStoredStatus);
            case ONGOING ->
                    RESERVED.equals(targetStoredStatus)
                            || CHECKED_OUT.equals(targetStoredStatus)
                            || CANCELLED.equals(targetStoredStatus)
                            || NO_SHOW.equals(targetStoredStatus);
            case CHECKED_OUT ->
                    CANCELLED.equals(targetStoredStatus)
                            || NO_SHOW.equals(targetStoredStatus);
            default -> false;
        };
    }
}
