package com.example.app.admin;

import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
public class TenantCreatedAdminEmailService {
    private static final Logger log = LoggerFactory.getLogger(TenantCreatedAdminEmailService.class);
    private static final String CALENDRA_LOGO_CONTENT_ID = "calendraTenantCreatedAdminLogo";
    private static final String CALENDRA_LOGO_CLASSPATH = "static/widget/calendra-transparent-logo.png";
    private static final DateTimeFormatter CREATED_AT_FORMAT = DateTimeFormatter
            .ofPattern("d. MMMM yyyy 'ob' HH:mm", Locale.forLanguageTag("sl-SI"));

    public record TenantCreatedDetails(
            Long tenantId,
            String tenantName,
            String tenantCode,
            String companyType,
            Instant createdAt,
            String creationSource,
            String ownerName,
            String ownerEmail,
            String packageName,
            String billingInterval,
            String paymentMethod,
            String accessStatus,
            String billingStatus
    ) {
    }

    private final JavaMailSender mailSender;
    private final String configuredRecipients;
    private final String fromAddress;
    private final boolean mailConfigured;
    private final String frontendBaseUrl;
    private final ZoneId displayZone;

    public TenantCreatedAdminEmailService(
            @Autowired(required = false) JavaMailSender mailSender,
            @Value("${app.platform-admin-emails:info@calendra.si}") String configuredRecipients,
            @Value("${app.mail.from:}") String appMailFrom,
            @Value("${spring.mail.username:}") String mailUsername,
            @Value("${spring.mail.host:}") String mailHost,
            @Value("${app.auth.frontend-url:http://localhost:3000}") String frontendBaseUrl,
            @Value("${app.platform-admin-time-zone:Europe/Ljubljana}") String timeZone
    ) {
        this.mailSender = mailSender;
        this.configuredRecipients = configuredRecipients == null ? "" : configuredRecipients.trim();
        this.fromAddress = firstNonBlank(appMailFrom, mailUsername);
        this.mailConfigured = mailSender != null && mailHost != null && !mailHost.isBlank();
        this.frontendBaseUrl = sanitizeBase(frontendBaseUrl);
        this.displayZone = resolveZone(timeZone);
    }

    /**
     * Queues the notification for delivery only after the surrounding tenant-creation
     * transaction commits successfully. If no transaction is active, it sends immediately.
     */
    public void notifyAfterCommit(TenantCreatedDetails details) {
        if (details == null) return;
        if (TransactionSynchronizationManager.isActualTransactionActive()
                && TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    sendSafely(details);
                }
            });
            return;
        }
        sendSafely(details);
    }

    private void sendSafely(TenantCreatedDetails details) {
        try {
            send(details);
        } catch (Exception ex) {
            log.warn("Failed to send new-tenant notification for tenant {}: {}",
                    details.tenantId(), safeMessage(ex));
        }
    }

    private void send(TenantCreatedDetails details) throws Exception {
        List<String> recipients = recipients();
        if (recipients.isEmpty()) {
            log.warn("New-tenant admin email skipped: APP_PLATFORM_ADMIN_EMAILS / app.platform-admin-emails is not configured.");
            return;
        }
        if (!mailConfigured || mailSender == null) {
            log.warn("New-tenant admin email skipped: mail sender is not configured.");
            return;
        }

        MimeMessage message = mailSender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(message, true, StandardCharsets.UTF_8.name());
        helper.setTo(recipients.toArray(String[]::new));
        if (fromAddress != null && !fromAddress.isBlank()) {
            helper.setFrom(new InternetAddress(fromAddress, "Calendra ekipa", StandardCharsets.UTF_8.name()));
        }
        String tenantLabel = firstNonBlank(details.tenantName(), details.tenantCode(), "Nov najemnik");
        helper.setSubject("Nov najemnik: " + tenantLabel);
        helper.setText(buildPlainText(details), buildHtml(details));
        helper.addInline(
                CALENDRA_LOGO_CONTENT_ID,
                new ClassPathResource(CALENDRA_LOGO_CLASSPATH),
                "image/png"
        );
        mailSender.send(message);
        log.info("New-tenant admin email sent for tenant {} to {} recipient(s).", details.tenantId(), recipients.size());
    }

    private String buildHtml(TenantCreatedDetails details) {
        String tenantName = htmlValue(details.tenantName());
        String tenantCode = htmlValue(details.tenantCode());
        String tenantId = details.tenantId() == null ? "—" : String.valueOf(details.tenantId());
        String companyType = htmlValue(humanCompanyType(details.companyType()));
        String createdAt = htmlValue(formatCreatedAt(details.createdAt()));
        String source = htmlValue(details.creationSource());
        String ownerName = htmlValue(details.ownerName());
        String ownerEmail = htmlValue(details.ownerEmail());
        String packageName = htmlValue(humanPackage(details.packageName()));
        String billingInterval = htmlValue(humanInterval(details.billingInterval()));
        String paymentMethod = htmlValue(humanPaymentMethod(details.paymentMethod()));
        String accessStatus = htmlValue(details.accessStatus());
        String billingStatus = htmlValue(details.billingStatus());
        String platformUrl = escapeHtml(frontendBaseUrl + "/platform-admin");

        StringBuilder html = new StringBuilder(12_000);
        html.append("<!doctype html><html><head><meta charset=\"UTF-8\">");
        html.append("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">");
        html.append("<meta name=\"color-scheme\" content=\"light\"><meta name=\"supported-color-schemes\" content=\"light\">");
        html.append("<style>@media only screen and (max-width:640px){.shell{padding:12px!important}.card{border-radius:18px!important}.content{padding:26px 20px!important}.title{font-size:29px!important}.row td{display:block!important;width:auto!important;text-align:left!important}.value{padding-top:4px!important}.cta{display:block!important;text-align:center!important}}</style>");
        html.append("</head><body style=\"margin:0;background:#f3f7fd;color:#111827;font-family:Arial,Helvetica,sans-serif\">");
        html.append("<div style=\"display:none;max-height:0;overflow:hidden;opacity:0\">Na platformi Calendra je bil ustvarjen nov najemnik.</div>");
        html.append("<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" class=\"shell\" style=\"background:#f3f7fd;padding:32px 12px\"><tr><td align=\"center\">");
        html.append("<table role=\"presentation\" width=\"680\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" class=\"card\" style=\"width:100%;max-width:680px;background:#ffffff;border:1px solid #dfe8f5;border-radius:24px;box-shadow:0 18px 50px rgba(37,82,150,.08)\"><tr><td class=\"content\" style=\"padding:38px 40px 34px\">");
        html.append("<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\"><tr><td><img src=\"cid:").append(CALENDRA_LOGO_CONTENT_ID).append("\" width=\"190\" alt=\"Calendra\" style=\"display:block;width:190px;max-width:70%;height:auto;border:0\"></td><td align=\"right\" valign=\"top\"><span style=\"display:inline-block;background:#edf4ff;color:#1761e8;border:1px solid #d9e7ff;border-radius:12px;padding:8px 13px;font-size:13px;font-weight:700\">🔔 Nov najemnik</span></td></tr></table>");
        html.append("<h1 class=\"title\" style=\"margin:34px 0 12px;font-size:36px;line-height:1.16;letter-spacing:-.7px;color:#101827\">Nov najemnik je bil ustvarjen 🎉</h1>");
        html.append("<p style=\"margin:0 0 12px;color:#53627a;font-size:17px;line-height:1.65\">Pozdravljeni,</p>");
        html.append("<p style=\"margin:0;color:#53627a;font-size:17px;line-height:1.65\">Na platformi Calendra je bil uspešno ustvarjen nov najemnik. Spodaj so osnovni podatki novega računa.</p>");

        html.append("<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"margin-top:28px;border:1px solid #dfe8f5;border-radius:18px;border-collapse:separate;overflow:hidden\">");
        html.append("<tr><td colspan=\"2\" style=\"background:#f7faff;padding:18px 20px;border-bottom:1px solid #dfe8f5;font-size:18px;font-weight:800;color:#162033\">🏢 &nbsp;Podatki o najemniku</td></tr>");
        appendRow(html, "ID najemnika", tenantId, false);
        appendRow(html, "Ime podjetja", tenantName, false);
        appendRow(html, "Koda najemnika", tenantCode, false);
        appendRow(html, "Tip podjetja", companyType, false);
        appendRow(html, "Ustvarjeno", createdAt, false);
        appendRow(html, "Način ustvarjanja", source, false);
        appendRow(html, "Lastnik", ownerName, false);
        appendRow(html, "Lastnik (e-pošta)", ownerEmail, true);
        appendRow(html, "Izbrani paket", packageName, false);
        appendRow(html, "Obdobje obračunavanja", billingInterval, false);
        appendRow(html, "Način plačila", paymentMethod, false);
        appendStatusRow(html, "Status dostopa", accessStatus, "ACTIVE".equalsIgnoreCase(details.accessStatus()));
        appendStatusRow(html, "Status obračuna", billingStatus, "PAID".equalsIgnoreCase(details.billingStatus()));
        html.append("</table>");

        html.append("<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"margin-top:24px;background:#f7faff;border:1px solid #d9e6fa;border-radius:16px\"><tr><td style=\"padding:22px\">");
        html.append("<div style=\"font-size:18px;font-weight:800;color:#162033;margin-bottom:8px\">ⓘ &nbsp;Naslednji koraki</div>");
        html.append("<div style=\"font-size:15px;line-height:1.6;color:#596a84;margin-bottom:18px\">Preverite podatke najemnika, paket in status plačila. Račun lahko odprete v administraciji platforme.</div>");
        html.append("<a class=\"cta\" href=\"").append(platformUrl).append("\" style=\"display:inline-block;background:#2468ee;color:#ffffff;text-decoration:none;font-size:15px;font-weight:800;border-radius:10px;padding:14px 20px\">Odpri platformo Calendra ›</a>");
        html.append("</td></tr></table>");

        html.append("<div style=\"margin-top:28px;padding-top:24px;border-top:1px solid #e5ebf4;color:#5d6d85;font-size:14px;line-height:1.65\">Lep pozdrav,<br><strong>Calendra ekipa</strong></div>");
        html.append("<div style=\"margin-top:24px;padding-top:20px;border-top:1px solid #e5ebf4;color:#92a0b4;font-size:12px;line-height:1.5\">To je avtomatsko obvestilo platforme Calendra. Prosimo, ne odgovarjajte na ta e-poštni naslov.</div>");
        html.append("</td></tr></table></td></tr></table></body></html>");
        return html.toString();
    }

    private String buildPlainText(TenantCreatedDetails details) {
        return "Nov najemnik je bil ustvarjen\n\n"
                + "Na platformi Calendra je bil uspešno ustvarjen nov najemnik.\n\n"
                + "ID najemnika: " + textValue(details.tenantId()) + "\n"
                + "Ime podjetja: " + textValue(details.tenantName()) + "\n"
                + "Koda najemnika: " + textValue(details.tenantCode()) + "\n"
                + "Tip podjetja: " + textValue(humanCompanyType(details.companyType())) + "\n"
                + "Ustvarjeno: " + formatCreatedAt(details.createdAt()) + "\n"
                + "Način ustvarjanja: " + textValue(details.creationSource()) + "\n"
                + "Lastnik: " + textValue(details.ownerName()) + "\n"
                + "Lastnik (e-pošta): " + textValue(details.ownerEmail()) + "\n"
                + "Izbrani paket: " + textValue(humanPackage(details.packageName())) + "\n"
                + "Obdobje obračunavanja: " + textValue(humanInterval(details.billingInterval())) + "\n"
                + "Način plačila: " + textValue(humanPaymentMethod(details.paymentMethod())) + "\n"
                + "Status dostopa: " + textValue(details.accessStatus()) + "\n"
                + "Status obračuna: " + textValue(details.billingStatus()) + "\n\n"
                + "Odpri platformo Calendra: " + frontendBaseUrl + "/platform-admin\n\n"
                + "Lep pozdrav,\nCalendra ekipa";
    }

    private static void appendRow(StringBuilder html, String label, String value, boolean email) {
        html.append("<tr class=\"row\"><td style=\"width:43%;padding:14px 18px;border-bottom:1px solid #e5ebf4;color:#687892;font-size:14px;font-weight:700\">")
                .append(escapeHtml(label))
                .append("</td><td class=\"value\" style=\"padding:14px 18px;border-bottom:1px solid #e5ebf4;color:")
                .append(email ? "#1761e8" : "#182236")
                .append(";font-size:14px;font-weight:800;word-break:break-word\">")
                .append(value)
                .append("</td></tr>");
    }

    private static void appendStatusRow(StringBuilder html, String label, String value, boolean positive) {
        String background = positive ? "#e7f8ee" : "#edf4ff";
        String color = positive ? "#149354" : "#1761e8";
        html.append("<tr class=\"row\"><td style=\"width:43%;padding:14px 18px;border-bottom:1px solid #e5ebf4;color:#687892;font-size:14px;font-weight:700\">")
                .append(escapeHtml(label))
                .append("</td><td class=\"value\" style=\"padding:14px 18px;border-bottom:1px solid #e5ebf4\"><span style=\"display:inline-block;background:")
                .append(background)
                .append(";color:")
                .append(color)
                .append(";border-radius:999px;padding:5px 10px;font-size:12px;font-weight:800\">")
                .append(value)
                .append("</span></td></tr>");
    }

    private List<String> recipients() {
        if (configuredRecipients.isBlank()) return List.of();
        return Arrays.stream(configuredRecipients.split("[,;]"))
                .map(String::trim)
                .filter(value -> !value.isBlank())
                .distinct()
                .toList();
    }

    private String formatCreatedAt(Instant createdAt) {
        Instant value = createdAt == null ? Instant.now() : createdAt;
        return CREATED_AT_FORMAT.format(value.atZone(displayZone));
    }

    private static String humanCompanyType(String raw) {
        if (raw == null || raw.isBlank()) return "Ni določeno";
        return switch (raw.trim().toLowerCase(Locale.ROOT).replace('-', '_').replace(' ', '_')) {
            case "salon" -> "Salon / storitveno podjetje";
            case "gym" -> "Fitnes";
            case "therapy" -> "Svetovanje / terapija";
            case "spa" -> "Spa / wellness";
            case "personal_training" -> "Osebno trenerstvo";
            default -> raw.trim();
        };
    }

    private static String humanPackage(String raw) {
        if (raw == null || raw.isBlank()) return "Ni določeno";
        return switch (raw.trim().toUpperCase(Locale.ROOT).replace('-', '_').replace(' ', '_')) {
            case "BASIC", "TRIAL" -> "Osnovni";
            case "PRO", "PROFESSIONAL" -> "Poslovni";
            case "BUSINESS", "PREMIUM" -> "Premium";
            case "CUSTOM" -> "Po meri";
            default -> raw.trim();
        };
    }

    private static String humanInterval(String raw) {
        if (raw == null || raw.isBlank()) return "Ni določeno";
        return "YEARLY".equalsIgnoreCase(raw) || "ANNUAL".equalsIgnoreCase(raw) ? "Letno" : "Mesečno";
    }

    private static String humanPaymentMethod(String raw) {
        if (raw == null || raw.isBlank()) return "Še ni izbrano";
        return switch (raw.trim().toUpperCase(Locale.ROOT).replace('-', '_').replace(' ', '_')) {
            case "BANK_TRANSFER" -> "Bančno nakazilo";
            case "CARD", "STRIPE", "CREDIT_CARD" -> "Plačilna kartica";
            default -> raw.trim();
        };
    }

    private static String htmlValue(Object value) {
        return escapeHtml(textValue(value));
    }

    private static String textValue(Object value) {
        if (value == null) return "—";
        String text = String.valueOf(value).trim();
        return text.isBlank() ? "—" : text.replaceAll("[\\r\\n\\t]+", " ");
    }

    private static String escapeHtml(String value) {
        if (value == null) return "";
        return value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }

    private static String sanitizeBase(String value) {
        String base = value == null || value.isBlank() ? "http://localhost:3000" : value.trim();
        while (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        return base;
    }

    private static ZoneId resolveZone(String value) {
        try {
            return ZoneId.of(value == null || value.isBlank() ? "Europe/Ljubljana" : value.trim());
        } catch (Exception ignored) {
            return ZoneId.of("Europe/Ljubljana");
        }
    }

    private static String firstNonBlank(String... values) {
        if (values == null) return "";
        for (String value : values) {
            if (value != null && !value.isBlank()) return value.trim();
        }
        return "";
    }

    private static String safeMessage(Exception ex) {
        if (ex == null) return "Unknown error";
        String message = ex.getMessage();
        if (message == null || message.isBlank()) message = ex.getClass().getSimpleName();
        return message.replaceAll("[\\r\\n\\t]+", " ");
    }
}
