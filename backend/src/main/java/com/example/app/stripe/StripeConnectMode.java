package com.example.app.stripe;

import java.util.Locale;

public enum StripeConnectMode {
    SANDBOX,
    PRODUCTION;

    public static StripeConnectMode fromRaw(String raw) {
        if (raw == null || raw.isBlank()) return SANDBOX;
        String value = raw.trim().toUpperCase(Locale.ROOT).replace('-', '_');
        if ("LIVE".equals(value) || "PROD".equals(value)) return PRODUCTION;
        if ("TEST".equals(value)) return SANDBOX;
        try {
            return StripeConnectMode.valueOf(value);
        } catch (Exception ignored) {
            return SANDBOX;
        }
    }

    public String apiValue() {
        return name().toLowerCase(Locale.ROOT);
    }

    public boolean liveMode() {
        return this == PRODUCTION;
    }
}
