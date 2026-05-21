package com.example.app.session;

/**
 * Controls how the linked transaction-service price is applied when a session is billed.
 */
public enum SessionPriceCalculationMode {
    /** Charge the configured price for every client row added to the session. */
    PER_CLIENT,
    /** Charge the configured price once for the whole logical session/group. */
    TOTAL
}
