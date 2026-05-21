package com.example.app.billing;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.Normalizer;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;

@Component
public class UpnQrPayloadBuilder {
    private static final DateTimeFormatter UPN_DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy");

    public String build(UpnQrRequest req) {
        List<String> fields = new ArrayList<>(20);
        fields.add("UPNQR");
        fields.add("");
        fields.add("");
        fields.add("");
        fields.add("");
        fields.add(fix(clean(req.payerName()), 33));
        fields.add(fix(clean(req.payerStreet()), 33));
        fields.add(fix(clean(req.payerCity()), 33));
        fields.add(formatAmount(req.amount()));
        fields.add("");
        fields.add("");
        String purposeCode = clean(req.purposeCode()).toUpperCase();
        fields.add(fix(purposeCode.isBlank() ? "OTHR" : purposeCode, 4));
        String purpose = clean(req.purpose());
        fields.add(fix(purpose.isBlank() ? "PLACILO FOLIA" : purpose, 42));
        fields.add(req.dueDate() == null ? "" : req.dueDate().format(UPN_DATE));
        fields.add(fix(compact(req.recipientIban()), 34));
        fields.add(fix(compact(req.recipientReference()).toUpperCase(), 26));
        fields.add(fix(clean(req.recipientName()), 33));
        fields.add(fix(clean(req.recipientStreet()), 33));
        fields.add(fix(clean(req.recipientCity()), 33));

        int control = fields.stream().mapToInt(String::length).sum() + 19;
        fields.add(String.format("%03d", control));
        return String.join("\n", fields) + "\n";
    }

    public static String toRfReference(String raw) {
        String body = compact(raw).toUpperCase().replaceAll("[^A-Z0-9]", "");
        if (body.isBlank()) body = "FOLIO";
        if (body.length() > 21) body = body.substring(0, 21);
        String provisional = body + "RF00";
        StringBuilder numeric = new StringBuilder();
        for (char ch : provisional.toCharArray()) {
            if (Character.isDigit(ch)) {
                numeric.append(ch);
            } else if (ch >= 'A' && ch <= 'Z') {
                numeric.append((int) ch - 55);
            }
        }
        int mod = 0;
        for (int i = 0; i < numeric.length(); i++) {
            mod = (mod * 10 + (numeric.charAt(i) - '0')) % 97;
        }
        int check = 98 - mod;
        return "RF" + String.format("%02d", check) + body;
    }

    private String formatAmount(BigDecimal amount) {
        BigDecimal safe = amount == null ? BigDecimal.ZERO : amount.max(BigDecimal.ZERO);
        String digits = safe.movePointRight(2)
                .setScale(0, RoundingMode.HALF_UP)
                .toPlainString();
        if (digits.length() >= 11) return digits.substring(digits.length() - 11);
        return "0".repeat(11 - digits.length()) + digits;
    }

    private static String compact(String value) {
        return clean(value).replace(" ", "");
    }

    private static String clean(String value) {
        if (value == null) return "";
        String s = value.replace("\r", " ").replace("\n", " ").trim();
        s = Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
        s = s.replaceAll("[^A-Za-z0-9 .,\\/\\-+&()]", " ");
        s = s.replaceAll("\\s+", " ").trim();
        return s;
    }

    private static String fix(String value, int max) {
        if (value == null) return "";
        return value.length() <= max ? value : value.substring(0, max);
    }

    public record UpnQrRequest(
            String payerName,
            String payerStreet,
            String payerCity,
            BigDecimal amount,
            String purposeCode,
            String purpose,
            LocalDate dueDate,
            String recipientIban,
            String recipientReference,
            String recipientName,
            String recipientStreet,
            String recipientCity
    ) {
    }
}
