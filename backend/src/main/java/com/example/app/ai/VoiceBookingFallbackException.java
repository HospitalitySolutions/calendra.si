package com.example.app.ai;

import org.springframework.http.HttpStatus;

/**
 * Voice booking could not complete; client should open manual booking with the given times.
 */
public class VoiceBookingFallbackException extends RuntimeException {
    public enum Reason {
        /** Overlap with existing session (HTTP 409). */
        CONFLICT,
        /** BOOKABLE_ENABLED and time outside consultant availability (HTTP 400). */
        NOT_BOOKABLE
    }

    private final HttpStatus status;
    private final String startTime;
    private final String endTime;
    private final Long clientId;
    private final Reason reason;

    public VoiceBookingFallbackException(
            HttpStatus status,
            String message,
            String startTime,
            String endTime,
            Long clientId,
            Reason reason) {
        super(message);
        this.status = status;
        this.startTime = startTime;
        this.endTime = endTime;
        this.clientId = clientId;
        this.reason = reason;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getStartTime() {
        return startTime;
    }

    public String getEndTime() {
        return endTime;
    }

    public Long getClientId() {
        return clientId;
    }

    public Reason getReason() {
        return reason;
    }
}
