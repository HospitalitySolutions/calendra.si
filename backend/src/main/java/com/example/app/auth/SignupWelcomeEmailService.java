package com.example.app.auth;

import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import java.text.NumberFormat;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

@Service
public class SignupWelcomeEmailService {
    private static final Logger log = LoggerFactory.getLogger(SignupWelcomeEmailService.class);

    public record PricingSummaryRequest(
            Integer totalUsers,
            Integer additionalSms,
            Boolean fiscalCashRegister,
            Boolean websiteCreation,
            Boolean businessPremises,
            java.math.BigDecimal monthlyTotal,
            java.math.BigDecimal oneTimeTotal,
            java.math.BigDecimal firstInvoiceEstimate
    ) {
    }

    private final JavaMailSender mailSender;
    private final boolean mailConfigured;
    private final String fallbackFrom;
    private final String frontendBaseUrl;

    public SignupWelcomeEmailService(
            @Autowired(required = false) JavaMailSender mailSender,
            @Value("${spring.mail.host:}") String mailHost,
            @Value("${spring.mail.username:}") String mailUsername,
            @Value("${MAIL_FROM:}") String configuredFrom,
            @Value("${app.auth.frontend-url:http://localhost:3000}") String frontendBaseUrl
    ) {
        this.mailSender = mailSender;
        this.mailConfigured = mailSender != null && mailHost != null && !mailHost.isBlank();
        String candidateFrom = configuredFrom != null && !configuredFrom.isBlank()
                ? configuredFrom.trim()
                : (mailUsername != null ? mailUsername.trim() : "");
        this.fallbackFrom = candidateFrom;
        this.frontendBaseUrl = sanitizeBase(frontendBaseUrl);
    }

    public void sendWelcomeEmail(
            String recipientEmail,
            String firstName,
            String companyName,
            String packageType,
            String localeCode,
            PricingSummaryRequest summary
    ) {
        if (recipientEmail == null || recipientEmail.isBlank()) return;
        if (!mailConfigured || mailSender == null) {
            log.info("Welcome email not sent to {} because mail is not configured.", recipientEmail);
            return;
        }

        boolean sl = localeCode != null && localeCode.trim().toLowerCase(Locale.ROOT).startsWith("sl");
        String safeFirstName = firstName == null || firstName.isBlank() ? (sl ? "pozdravljeni" : "there") : escapeHtml(firstName.trim());
        String safeCompanyName = companyName == null || companyName.isBlank() ? escapeHtml(recipientEmail) : escapeHtml(companyName.trim());
        String normalizedPackageType = normalizePackageType(packageType);
        String subject = sl ? "Dobrodošli v Calendra" : "Welcome to Calendra";
        String loginUrl = frontendBaseUrl + "/login";

        List<String> accessTabs = accessTabs(normalizedPackageType, sl);
        List<String> orderedItems = orderedItems(summary, sl);
        NumberFormat currency = NumberFormat.getCurrencyInstance(sl ? Locale.forLanguageTag("sl-SI") : Locale.US);
        currency.setCurrency(java.util.Currency.getInstance("EUR"));
        currency.setMinimumFractionDigits(2);
        currency.setMaximumFractionDigits(2);

        StringBuilder html = new StringBuilder();
        html.append("<div style=\"font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;max-width:640px;margin:0 auto;padding:24px;\">");
        html.append("<h2 style=\"margin:0 0 12px;\">")
                .append(sl ? "Dobrodošli v Calendra" : "Welcome to Calendra")
                .append("</h2>");
        html.append("<p style=\"margin:0 0 16px;\">")
                .append(sl ? "Pozdravljeni " : "Hi ")
                .append(safeFirstName)
                .append(sl ? ", vaš račun za podjetje <strong>" : ", your account for <strong>")
                .append(safeCompanyName)
                .append("</strong>")
                .append(sl ? " je pripravljen." : " is ready.")
                .append("</p>");

        html.append(sectionTitle(sl ? "Povzetek naročila" : "Order summary"));
        html.append("<ul style=\"padding-left:18px;margin:8px 0 18px;\">");
        html.append(listItem((sl ? "Paket" : "Package") + ": <strong>" + escapeHtml(packageLabel(normalizedPackageType, sl)) + "</strong>"));
        if ("TRIAL".equals(normalizedPackageType)) {
            html.append(listItem(sl ? "Vključuje 7-dnevni preizkus." : "Includes a 7-day trial."));
        }
        for (String item : orderedItems) {
            html.append(listItem(escapeHtml(item)));
        }
        if (summary != null) {
            if (summary.monthlyTotal() != null) {
                html.append(listItem((sl ? "Mesečno skupaj" : "Monthly total") + ": <strong>" + currency.format(summary.monthlyTotal()) + "</strong>"));
            }
            if (summary.oneTimeTotal() != null) {
                html.append(listItem((sl ? "Enkratni strošek" : "One-time cost") + ": <strong>" + currency.format(summary.oneTimeTotal()) + "</strong>"));
            }
            if (summary.firstInvoiceEstimate() != null) {
                html.append(listItem((sl ? "Predviden prvi račun" : "Estimated first invoice") + ": <strong>" + currency.format(summary.firstInvoiceEstimate()) + "</strong>"));
            }
        }
        html.append("</ul>");

        html.append(sectionTitle(sl ? "Dostopni zavihki" : "Included tabs"));
        html.append("<ul style=\"padding-left:18px;margin:8px 0 18px;\">");
        for (String accessTab : accessTabs) {
            html.append(listItem(escapeHtml(accessTab)));
        }
        html.append("</ul>");

        html.append("<p style=\"margin:18px 0 0;\">")
                .append(sl ? "Prijava v aplikacijo: " : "Sign in to the app: ")
                .append("<a href=\"")
                .append(escapeHtml(loginUrl))
                .append("\">")
                .append(escapeHtml(loginUrl))
                .append("</a>")
                .append("</p>");
        html.append("</div>");

        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, false, java.nio.charset.StandardCharsets.UTF_8.name());
            helper.setTo(recipientEmail.trim());
            if (!fallbackFrom.isBlank()) {
                helper.setFrom(fallbackFrom);
            }
            helper.setSubject(subject);
            helper.setText(html.toString(), true);
            mailSender.send(message);
            log.info("Welcome email sent to {}", recipientEmail);
        } catch (Exception ex) {
            log.warn("Failed to send welcome email to {}: {}", recipientEmail, ex.getMessage());
        }
    }

    private static String sectionTitle(String title) {
        return "<h3 style=\"margin:18px 0 8px;font-size:16px;\">" + escapeHtml(title) + "</h3>";
    }

    private static String listItem(String value) {
        return "<li style=\"margin:0 0 6px;\">" + value + "</li>";
    }

    private static String sanitizeBase(String raw) {
        String value = raw == null || raw.isBlank() ? "http://localhost:3000" : raw.trim();
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }

    private static String normalizePackageType(String raw) {
        if (raw == null || raw.isBlank()) return "PROFESSIONAL";
        String normalized = raw.trim().toUpperCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
        if ("PRO".equals(normalized)) return "PROFESSIONAL";
        return normalized;
    }

    private static String packageLabel(String packageType, boolean sl) {
        return switch (packageType) {
            case "TRIAL" -> sl ? "Preizkus" : "Trial";
            case "BASIC" -> sl ? "Osnovni" : "Basic";
            case "PROFESSIONAL" -> sl ? "Profesionalni" : "Professional";
            case "PREMIUM" -> "Premium";
            default -> packageType;
        };
    }

    private static List<String> orderedItems(PricingSummaryRequest summary, boolean sl) {
        List<String> items = new ArrayList<>();
        if (summary == null) return items;
        if (summary.totalUsers() != null && summary.totalUsers() > 1) {
            items.add((sl ? "Uporabniki" : "Users") + ": " + summary.totalUsers());
        }
        if (summary.additionalSms() != null && summary.additionalSms() > 0) {
            items.add((sl ? "SMS sporočila" : "SMS messages") + ": " + summary.additionalSms());
        }
        if (Boolean.TRUE.equals(summary.fiscalCashRegister())) {
            items.add(sl ? "Davčna blagajna" : "Fiscal cash register");
        }
        if (Boolean.TRUE.equals(summary.websiteCreation())) {
            items.add(sl ? "Izdelava spletne strani" : "Website creation");
        }
        if (Boolean.TRUE.equals(summary.businessPremises())) {
            items.add(sl ? "Poslovni prostor" : "Business premises");
        }
        return items;
    }

    private static List<String> accessTabs(String packageType, boolean sl) {
        List<String> items = new ArrayList<>();
        items.add(sl ? "Koledar" : "Calendar");
        items.add(sl ? "Stranke" : "Clients");
        items.add(sl ? "Analitika" : "Analytics");
        if ("PROFESSIONAL".equals(packageType) || "PREMIUM".equals(packageType) || "CUSTOM".equals(packageType)) {
            items.add("Billing");
        }
        if ("PREMIUM".equals(packageType) || "CUSTOM".equals(packageType)) {
            items.add("Inbox");
        }
        return items;
    }

    private static String escapeHtml(String value) {
        return value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }
}
