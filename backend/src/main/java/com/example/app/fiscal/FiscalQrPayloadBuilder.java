package com.example.app.fiscal;

import java.math.BigInteger;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Locale;

/**
 * Builds the 60-digit Slovenian fiscal QR data record from the ZOI.
 *
 * <p>Structure:</p>
 * <ul>
 *     <li>ZOI converted from hexadecimal to decimal, left padded to 39 digits</li>
 *     <li>seller tax number, 8 digits</li>
 *     <li>invoice issue date/time in yyMMddHHmmss format, 12 digits</li>
 *     <li>control digit: sum of the previous 59 digits modulo 10</li>
 * </ul>
 */
public final class FiscalQrPayloadBuilder {
    private static final int ZOI_DECIMAL_LENGTH = 39;
    private static final int TAX_NUMBER_LENGTH = 8;
    private static final DateTimeFormatter FURS_QR_DATE_TIME = DateTimeFormatter.ofPattern("yyMMddHHmmss");

    private FiscalQrPayloadBuilder() {}

    public static String build(String protectedIdZoi, String taxNumber, String issueDateTime) {
        String payloadWithoutControl = decimalZoi(protectedIdZoi)
                + normalizedTaxNumber(taxNumber)
                + formattedIssueDateTime(issueDateTime);
        return payloadWithoutControl + controlDigit(payloadWithoutControl);
    }

    private static String decimalZoi(String protectedIdZoi) {
        String hex = protectedIdZoi == null ? "" : protectedIdZoi.trim().toLowerCase(Locale.ROOT);
        if (!hex.matches("[0-9a-f]{32}")) {
            throw new IllegalArgumentException("Fiscal ZOI must be a 32-character hexadecimal value.");
        }
        String decimal = new BigInteger(hex, 16).toString(10);
        if (decimal.length() > ZOI_DECIMAL_LENGTH) {
            throw new IllegalArgumentException("Fiscal ZOI decimal value is longer than 39 digits.");
        }
        return "0".repeat(ZOI_DECIMAL_LENGTH - decimal.length()) + decimal;
    }

    private static String normalizedTaxNumber(String taxNumber) {
        String digits = taxNumber == null ? "" : taxNumber.replaceAll("\\D", "");
        if (digits.length() != TAX_NUMBER_LENGTH) {
            throw new IllegalArgumentException("Fiscal QR tax number must contain exactly 8 digits.");
        }
        return digits;
    }

    private static String formattedIssueDateTime(String issueDateTime) {
        if (issueDateTime == null || issueDateTime.isBlank()) {
            throw new IllegalArgumentException("Fiscal QR issue date/time is required.");
        }
        String raw = issueDateTime.trim();
        try {
            return OffsetDateTime.parse(raw).toLocalDateTime().format(FURS_QR_DATE_TIME);
        } catch (DateTimeParseException ignored) {
            // Continue with other common ISO representations below.
        }
        try {
            return Instant.parse(raw).atOffset(ZoneOffset.UTC).toLocalDateTime().format(FURS_QR_DATE_TIME);
        } catch (DateTimeParseException ignored) {
            // Continue with a local timestamp without offset.
        }
        try {
            return LocalDateTime.parse(raw).format(FURS_QR_DATE_TIME);
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException("Fiscal QR issue date/time must be an ISO date-time value.", e);
        }
    }

    private static int controlDigit(String digits) {
        int sum = 0;
        for (int i = 0; i < digits.length(); i++) {
            char c = digits.charAt(i);
            if (c < '0' || c > '9') {
                throw new IllegalArgumentException("Fiscal QR payload must be numeric before control digit.");
            }
            sum += c - '0';
        }
        return sum % 10;
    }
}
