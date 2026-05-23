package com.example.app.google.calendar;

/** Raised when Google rejects an incremental sync token and a new full sync is required. */
public class GoogleCalendarSyncTokenExpiredException extends RuntimeException {
    public GoogleCalendarSyncTokenExpiredException(String message) {
        super(message);
    }
}
