package com.example.app.fiscal;

public enum FiscalEnvironment {
    TEST,
    PROD;

    public static FiscalEnvironment fromRaw(String raw) {
        if (raw == null || raw.isBlank()) {
            return TEST;
        }
        try {
            return FiscalEnvironment.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException ignored) {
            return TEST;
        }
    }
}
