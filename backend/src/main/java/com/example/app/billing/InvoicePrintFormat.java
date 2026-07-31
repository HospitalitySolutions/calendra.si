package com.example.app.billing;

import java.util.Locale;

/** Output format used when generating an invoice document for printing. */
public enum InvoicePrintFormat {
    A4,
    POS_58;

    public static InvoicePrintFormat from(String raw) {
        if (raw == null || raw.isBlank()) return A4;
        String normalized = raw.trim().toUpperCase(Locale.ROOT)
                .replace('-', '_')
                .replace(' ', '_');
        if (normalized.equals("POS58") || normalized.equals("58MM") || normalized.equals("POS_58MM")) {
            return POS_58;
        }
        try {
            return valueOf(normalized);
        } catch (IllegalArgumentException ignored) {
            return A4;
        }
    }
}
