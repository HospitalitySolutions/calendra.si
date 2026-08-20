package com.example.app.admin;

import com.example.app.register.RegisterCatalogService;
import com.example.app.register.RegisterPriceCatalog;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.task.TaskExecutor;
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
            String billingStatus,
            Integer selectedUserCount,
            List<String> selectedFeatureKeys,
            List<String> selectedAddonKeys
    ) {
        public TenantCreatedDetails(
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
            this(
                    tenantId,
                    tenantName,
                    tenantCode,
                    companyType,
                    createdAt,
                    creationSource,
                    ownerName,
                    ownerEmail,
                    packageName,
                    billingInterval,
                    paymentMethod,
                    accessStatus,
                    billingStatus,
                    null,
                    List.of(),
                    List.of()
            );
        }
    }

    private final JavaMailSender mailSender;
    private final String configuredRecipients;
    private final String fromAddress;
    private final boolean mailConfigured;
    private final String frontendBaseUrl;
    private final ZoneId displayZone;

    @Autowired(required = false)
    @Qualifier("applicationTaskExecutor")
    private TaskExecutor applicationTaskExecutor;

    @Autowired(required = false)
    private RegisterCatalogService registerCatalogService;

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
     * Queues the notification only after the surrounding tenant-creation transaction commits.
     * Delivery is dispatched through the application task executor so SMTP does not hold up the request.
     */
    public void notifyAfterCommit(TenantCreatedDetails details) {
        if (details == null) return;
        if (TransactionSynchronizationManager.isActualTransactionActive()
                && TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    dispatch(details);
                }
            });
            return;
        }
        dispatch(details);
    }

    private void dispatch(TenantCreatedDetails details) {
        Runnable delivery = () -> sendSafely(details);
        TaskExecutor executor = applicationTaskExecutor;
        if (executor != null) {
            try {
                executor.execute(delivery);
                return;
            } catch (RuntimeException ex) {
                log.warn("Could not queue new-tenant admin email; sending it inline: {}", safeMessage(ex));
            }
        }
        delivery.run();
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
        String packageName = htmlValue(humanPackage(details.packageName(), details.billingStatus()));
        String billingInterval = htmlValue(humanInterval(details.billingInterval()));
        String paymentMethod = htmlValue(humanPaymentMethod(details.paymentMethod()));
        String accessStatus = htmlValue(details.accessStatus());
        String billingStatus = htmlValue(details.billingStatus());
        String selectedUserCount = details.selectedUserCount() == null
                ? "—"
                : String.valueOf(Math.max(1, details.selectedUserCount()));
        List<String> selectedOptions = selectedOptionLabels(details);
        boolean registrationSelectionAvailable = details.selectedUserCount() != null
                || (details.selectedFeatureKeys() != null && !details.selectedFeatureKeys().isEmpty())
                || (details.selectedAddonKeys() != null && !details.selectedAddonKeys().isEmpty());
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
        html.append("<p style=\"margin:0;color:#53627a;font-size:17px;line-height:1.65\">Na platformi Calendra je bil uspešno ustvarjen nov najemnik. Spodaj so osnovni podatki novega računa in izbire iz registracije.</p>");

        html.append("<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"margin-top:28px;border:1px solid #dfe8f5;border-radius:18px;border-collapse:separate;overflow:hidden\">");
        html.append("<tr><td colspan=\"2\" style=\"background:#f7faff;padding:18px 20px;border-bottom:1px solid #dfe8f5;font-size:18px;font-weight:800;color:#162033\">🏢 &nbsp;Podatki o najemniku</td></tr>");
        appendRow(html, "ID najemnika", tenantId, false);
        appendRow(html, "Ime podjetja", tenantName, false);
        appendRow(html, "Koda najemnika", tenantCode, false);
        appendRow(html, "Tip podjetja", companyType, false);
        if (details.selectedUserCount() != null) {
            appendRow(html, "Število uporabnikov", selectedUserCount, false);
        }
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

        if (registrationSelectionAvailable) {
            html.append("<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"margin-top:24px;background:#f7faff;border:1px solid #d9e6fa;border-radius:16px\"><tr><td style=\"padding:22px\">");
            html.append("<div style=\"font-size:18px;font-weight:800;color:#162033;margin-bottom:14px\">⚙️ &nbsp;Izbrane dodatne funkcionalnosti</div>");
            if (selectedOptions.isEmpty()) {
                html.append("<div style=\"font-size:15px;line-height:1.6;color:#596a84\">Med registracijo ni bilo izbranih dodatnih funkcionalnosti.</div>");
            } else {
                for (String option : selectedOptions) {
                    html.append("<div style=\"display:flex;align-items:flex-start;margin:0 0 10px;font-size:15px;line-height:1.45;color:#24324a;font-weight:700\"><span style=\"display:inline-block;color:#2468ee;margin-right:10px\">✓</span><span>")
                            .append(escapeHtml(option))
                            .append("</span></div>");
                }
                html.append("<div style=\"margin-top:14px;padding-top:14px;border-top:1px solid #e1e9f5;font-size:13px;line-height:1.55;color:#7b8aa1\">Izbire so zabeležene za pregled. Novi spletni najemnik je ustvarjen na Osnovnem trial paketu.</div>");
            }
            html.append("</td></tr></table>");
        }

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
                + (details.selectedUserCount() == null ? "" : "Število uporabnikov: " + Math.max(1, details.selectedUserCount()) + "\n")
                + "Ustvarjeno: " + formatCreatedAt(details.createdAt()) + "\n"
                + "Način ustvarjanja: " + textValue(details.creationSource()) + "\n"
                + "Lastnik: " + textValue(details.ownerName()) + "\n"
                + "Lastnik (e-pošta): " + textValue(details.ownerEmail()) + "\n"
                + "Izbrani paket: " + textValue(humanPackage(details.packageName(), details.billingStatus())) + "\n"
                + "Obdobje obračunavanja: " + textValue(humanInterval(details.billingInterval())) + "\n"
                + "Način plačila: " + textValue(humanPaymentMethod(details.paymentMethod())) + "\n"
                + "Status dostopa: " + textValue(details.accessStatus()) + "\n"
                + "Status obračuna: " + textValue(details.billingStatus()) + "\n\n"
                + (registrationSelectionAvailable(details) ? plainSelectedOptions(details) : "")
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
            case "salon", "hair_salon" -> "Frizerski salon";
            case "beauty_salon" -> "Kozmetični salon";
            case "massage" -> "Masaža";
            case "spa", "spa_sauna" -> "Spa & savna";
            case "tattooing_piercing" -> "Tetoviranje & piercing";
            case "gym", "personal_training", "fitness_personal_training" -> "Fitnes / osebno trenerstvo";
            case "therapy", "physical_therapy" -> "Fizioterapija";
            case "psychology_counselling" -> "Psihologija & svetovanje";
            case "yoga_pilates" -> "Joga / pilates";
            case "pet_services" -> "Storitve za hišne ljubljenčke";
            case "education_coaching" -> "Izobraževanje & coaching";
            case "other" -> "Drugo";
            default -> raw.trim();
        };
    }

    private static String humanPackage(String raw, String billingStatus) {
        if (raw == null || raw.isBlank()) return "Ni določeno";
        String label = switch (raw.trim().toUpperCase(Locale.ROOT).replace('-', '_').replace(' ', '_')) {
            case "BASIC", "TRIAL" -> "Osnovni";
            case "PRO", "PROFESSIONAL" -> "Poslovni";
            case "BUSINESS", "PREMIUM" -> "Premium";
            case "CUSTOM" -> "Po meri";
            default -> raw.trim();
        };
        if (("BASIC".equalsIgnoreCase(raw) || "TRIAL".equalsIgnoreCase(raw))
                && "TRIAL".equalsIgnoreCase(billingStatus)) {
            return label + " (Trial)";
        }
        return label;
    }

    private String plainSelectedOptions(TenantCreatedDetails details) {
        List<String> labels = selectedOptionLabels(details);
        StringBuilder out = new StringBuilder("Izbrane dodatne funkcionalnosti:\n");
        if (labels.isEmpty()) {
            out.append("- Ni izbranih dodatnih funkcionalnosti.\n\n");
            return out.toString();
        }
        for (String label : labels) {
            out.append("- ").append(label).append('\n');
        }
        out.append("\n");
        return out.toString();
    }

    private static boolean registrationSelectionAvailable(TenantCreatedDetails details) {
        return details != null && (details.selectedUserCount() != null
                || (details.selectedFeatureKeys() != null && !details.selectedFeatureKeys().isEmpty())
                || (details.selectedAddonKeys() != null && !details.selectedAddonKeys().isEmpty()));
    }

    private List<String> selectedOptionLabels(TenantCreatedDetails details) {
        LinkedHashSet<String> labels = new LinkedHashSet<>();
        RegisterPriceCatalog catalog = registrationCatalog();
        if (details.selectedFeatureKeys() != null) {
            for (String key : details.selectedFeatureKeys()) {
                String normalized = normalizeSelectionKey(key);
                if (!normalized.isBlank()) labels.add(featureLabel(catalog, normalized));
            }
        }
        if (details.selectedAddonKeys() != null) {
            for (String key : details.selectedAddonKeys()) {
                String normalized = normalizeSelectionKey(key);
                if (!normalized.isBlank()) labels.add(addonLabel(catalog, normalized));
            }
        }
        return List.copyOf(labels);
    }

    private RegisterPriceCatalog registrationCatalog() {
        if (registerCatalogService != null) {
            try {
                RegisterPriceCatalog catalog = registerCatalogService.mergedCatalog();
                if (catalog != null) return catalog;
            } catch (Exception ex) {
                log.debug("Could not resolve register catalog for tenant-created email: {}", safeMessage(ex));
            }
        }
        return RegisterPriceCatalog.defaults();
    }

    private static String featureLabel(RegisterPriceCatalog catalog, String key) {
        if (catalog != null && catalog.getFeatureItems() != null) {
            for (RegisterPriceCatalog.FeatureItem item : catalog.getFeatureItems()) {
                if (item == null || item.getKey() == null || !key.equals(normalizeSelectionKey(item.getKey()))) continue;
                return firstNonBlank(item.getNameSl(), item.getName(), humanSelectionKey(key));
            }
        }
        return humanSelectionKey(key);
    }

    private static String addonLabel(RegisterPriceCatalog catalog, String key) {
        if (catalog != null && catalog.getAddonItems() != null) {
            for (RegisterPriceCatalog.AddonItem item : catalog.getAddonItems()) {
                if (item == null || item.getKey() == null || !key.equals(normalizeSelectionKey(item.getKey()))) continue;
                return firstNonBlank(item.getNameSl(), item.getName(), humanSelectionKey(key));
            }
        }
        return humanSelectionKey(key);
    }

    private static String normalizeSelectionKey(String raw) {
        if (raw == null) return "";
        return raw.trim()
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-+|-+$", "");
    }

    private static String humanSelectionKey(String raw) {
        String normalized = normalizeSelectionKey(raw);
        if (normalized.isBlank()) return "Ni določeno";
        String[] words = normalized.split("-");
        StringBuilder label = new StringBuilder();
        for (String word : words) {
            if (word.isBlank()) continue;
            if (!label.isEmpty()) label.append(' ');
            label.append(Character.toUpperCase(word.charAt(0))).append(word.substring(1));
        }
        return label.toString();
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
