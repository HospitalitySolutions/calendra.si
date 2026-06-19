package com.example.app.logging;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Locale;

/**
 * Helpers for keeping operational logs useful without writing full PII such as
 * email addresses, phone numbers or bearer/reset tokens into application logs.
 */
public final class LogSanitizer {
    private LogSanitizer() {
    }

    public static String emailHash(String value) {
        String normalized = normalizeEmail(value);
        return normalized == null ? "none" : "emailHash:" + sha256Prefix(normalized);
    }

    public static String maskedEmail(String value) {
        String normalized = normalizeEmail(value);
        if (normalized == null) return "none";
        int at = normalized.indexOf('@');
        if (at <= 0 || at == normalized.length() - 1) return "emailHash:" + sha256Prefix(normalized);
        String local = normalized.substring(0, at);
        String domain = normalized.substring(at + 1);
        String localMasked = local.length() <= 2
                ? local.charAt(0) + "***"
                : local.substring(0, 1) + "***" + local.substring(local.length() - 1);
        return localMasked + "@" + domain;
    }

    public static String maskedPhone(String value) {
        if (value == null || value.isBlank()) return "none";
        String digits = value.replaceAll("\\D", "");
        if (digits.isBlank()) return "phoneHash:" + sha256Prefix(value.trim());
        String suffix = digits.length() <= 4 ? digits : digits.substring(digits.length() - 4);
        return "phoneSuffix:" + suffix;
    }

    public static String tokenSuffix(String value) {
        if (value == null || value.isBlank()) return "none";
        String trimmed = value.trim();
        String suffix = trimmed.length() <= 6 ? trimmed : trimmed.substring(trimmed.length() - 6);
        return "tokenSuffix:" + suffix;
    }

    private static String normalizeEmail(String value) {
        if (value == null || value.isBlank()) return null;
        return value.trim().toLowerCase(Locale.ROOT);
    }

    private static String sha256Prefix(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest, 0, 8);
        } catch (NoSuchAlgorithmException ex) {
            return Integer.toHexString(value.hashCode());
        }
    }
}
