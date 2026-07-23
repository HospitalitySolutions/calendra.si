package com.example.app.session;

import java.util.Locale;

/**
 * User-facing origin of a session booking.
 *
 * This is intentionally separate from sourceChannel, which is used internally for
 * operational flows such as waitlist, Google Calendar sync, orders and reminders.
 */
public enum BookingSource {
    MANUAL,
    MOBILE_APP,
    WEBSITE_WIDGET,
    PUBLIC_BOOKING_PAGE;

    public static BookingSource resolve(BookingSource explicitSource, String sourceChannel) {
        return explicitSource != null ? explicitSource : fromSourceChannel(sourceChannel);
    }

    public static BookingSource fromSourceChannel(String sourceChannel) {
        String normalized = sourceChannel == null
                ? ""
                : sourceChannel.trim().toUpperCase(Locale.ROOT);
        return switch (normalized) {
            case "GUEST_APP", "MOBILE_APP" -> MOBILE_APP;
            case "WEBSITE_WIDGET" -> WEBSITE_WIDGET;
            case "PUBLIC_BOOKING_PAGE" -> PUBLIC_BOOKING_PAGE;
            default -> MANUAL;
        };
    }

    public static BookingSource parse(String raw, BookingSource fallback) {
        if (raw == null || raw.isBlank()) return fallback;
        try {
            return valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ignored) {
            return fallback;
        }
    }
}
