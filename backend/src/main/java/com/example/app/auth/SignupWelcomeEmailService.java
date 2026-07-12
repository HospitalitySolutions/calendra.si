package com.example.app.auth;

import com.example.app.logging.LogSanitizer;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.text.NumberFormat;
import java.util.ArrayList;
import java.util.Currency;
import java.util.List;
import java.util.Locale;

@Service
public class SignupWelcomeEmailService {
    private static final Logger log = LoggerFactory.getLogger(SignupWelcomeEmailService.class);
    private static final String CALENDRA_LOGO_CONTENT_ID = "calendraSignupLogo";
    private static final String CALENDRA_LOGO_CLASSPATH = "static/widget/calendra-transparent-logo.png";

    public record PricingSummaryRequest(
            Integer totalUsers,
            Integer additionalSms,
            Boolean fiscalCashRegister,
            Boolean websiteCreation,
            Boolean businessPremises,
            BigDecimal monthlyTotal,
            BigDecimal oneTimeTotal,
            BigDecimal firstInvoiceEstimate
    ) {
    }

    private record WelcomeCopy(
            String subject,
            String previewText,
            String badge,
            String title,
            String greetingPrefix,
            String greetingFallback,
            String readyTextPrefix,
            String manualReadyTextPrefix,
            String introText,
            String accountDetailsTitle,
            String companyLabel,
            String emailLabel,
            String packageLabel,
            String languageLabel,
            String nextStepsTitle,
            String companyStepTitle,
            String companyStepText,
            String servicesStepTitle,
            String servicesStepText,
            String notificationsStepTitle,
            String notificationsStepText,
            String guestBookingStepTitle,
            String guestBookingStepText,
            String loginButtonLabel,
            String setupButtonLabel,
            String unexpectedText,
            String systemFooter,
            String fallbackCompany,
            String fallbackLanguage
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
            @Value("${app.mail.from:}") String appMailFrom,
            @Value("${MAIL_FROM:}") String legacyConfiguredFrom,
            @Value("${app.auth.frontend-url:http://app.calendra.si}") String frontendBaseUrl
    ) {
        this.mailSender = mailSender;
        this.mailConfigured = mailSender != null && mailHost != null && !mailHost.isBlank();
        String candidateFrom = firstNonBlank(appMailFrom, legacyConfiguredFrom, mailUsername);
        this.fallbackFrom = candidateFrom == null ? "" : candidateFrom.trim();
        this.frontendBaseUrl = sanitizeBase(frontendBaseUrl);
    }

    /**
     * Backwards-compatible entry point kept for older signup code/tests. It now sends the
     * same tenant-owner welcome email used by the register flow, with a regular login CTA.
     */
    public void sendWelcomeEmail(
            String recipientEmail,
            String firstName,
            String companyName,
            String packageType,
            String localeCode,
            PricingSummaryRequest summary
    ) {
        sendTenantWelcomeEmail(
                recipientEmail,
                firstName,
                companyName,
                packageType,
                localeCode,
                frontendBaseUrl + "/login",
                false,
                summary
        );
    }

    public void sendRegisteredTenantWelcomeEmail(
            String recipientEmail,
            String firstName,
            String companyName,
            String packageType,
            String localeCode
    ) {
        sendTenantWelcomeEmail(
                recipientEmail,
                firstName,
                companyName,
                packageType,
                localeCode,
                frontendBaseUrl + "/login",
                false,
                null
        );
    }

    public void sendManualTenantWelcomeEmail(
            String recipientEmail,
            String firstName,
            String companyName,
            String packageType,
            String localeCode,
            String setupUrl
    ) {
        sendTenantWelcomeEmail(
                recipientEmail,
                firstName,
                companyName,
                packageType,
                localeCode,
                setupUrl == null || setupUrl.isBlank() ? frontendBaseUrl + "/login" : setupUrl,
                true,
                null
        );
    }

    private void sendTenantWelcomeEmail(
            String recipientEmail,
            String firstName,
            String companyName,
            String packageType,
            String localeCode,
            String ctaUrl,
            boolean passwordSetupRequired,
            PricingSummaryRequest summary
    ) {
        if (recipientEmail == null || recipientEmail.isBlank()) return;
        if (!mailConfigured || mailSender == null) {
            log.info("Welcome email not sent to {} because mail is not configured.", LogSanitizer.emailHash(recipientEmail));
            return;
        }

        String locale = normalizeSupportedLocale(localeCode);
        WelcomeCopy copy = welcomeCopy(locale);
        String safeFirstName = firstName == null || firstName.isBlank() ? copy.greetingFallback() : escapeHtml(firstName.trim());
        String safeCompanyName = companyName == null || companyName.isBlank() ? copy.fallbackCompany() : escapeHtml(companyName.trim());
        String safeRecipientEmail = escapeHtml(recipientEmail.trim().toLowerCase(Locale.ROOT));
        String normalizedPackageType = normalizePackageType(packageType);
        String safePackageLabel = escapeHtml(packageLabel(normalizedPackageType, locale));
        String safeCtaUrl = escapeHtml(ctaUrl == null || ctaUrl.isBlank() ? frontendBaseUrl + "/login" : ctaUrl.trim());
        String ctaLabel = passwordSetupRequired ? copy.setupButtonLabel() : copy.loginButtonLabel();

        String html = buildHtml(
                copy,
                safeFirstName,
                safeCompanyName,
                safeRecipientEmail,
                safePackageLabel,
                safeCtaUrl,
                ctaLabel,
                passwordSetupRequired,
                summary,
                locale
        );
        String plainText = buildPlainText(
                copy,
                safePlain(firstName, copy.greetingFallback()),
                safePlain(companyName, copy.fallbackCompany()),
                recipientEmail.trim().toLowerCase(Locale.ROOT),
                packageLabel(normalizedPackageType, locale),
                ctaUrl == null || ctaUrl.isBlank() ? frontendBaseUrl + "/login" : ctaUrl.trim(),
                ctaLabel,
                passwordSetupRequired,
                summary,
                locale
        );

        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, StandardCharsets.UTF_8.name());
            helper.setTo(recipientEmail.trim());
            if (!fallbackFrom.isBlank()) {
                helper.setFrom(fallbackFrom);
            }
            helper.setSubject(copy.subject());
            helper.setText(plainText, html);
            helper.addInline(
                    CALENDRA_LOGO_CONTENT_ID,
                    new ClassPathResource(CALENDRA_LOGO_CLASSPATH),
                    "image/png"
            );
            mailSender.send(message);
            log.info("Welcome email sent to {}", LogSanitizer.emailHash(recipientEmail));
        } catch (Exception ex) {
            log.warn("Failed to send welcome email to {}: {}", LogSanitizer.emailHash(recipientEmail), ex.getMessage());
        }
    }

    private String buildHtml(
            WelcomeCopy copy,
            String firstName,
            String companyName,
            String recipientEmail,
            String packageLabel,
            String ctaUrl,
            String ctaLabel,
            boolean passwordSetupRequired,
            PricingSummaryRequest summary,
            String locale
    ) {
        String readyPrefix = passwordSetupRequired ? copy.manualReadyTextPrefix() : copy.readyTextPrefix();
        String pricingSummaryBlock = buildPricingSummaryHtml(summary, locale);
        StringBuilder html = new StringBuilder();
        html.append("<!doctype html>");
        html.append("<html><head>");
        html.append("<meta charset=\"UTF-8\">");
        html.append("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">");
        html.append("<meta name=\"color-scheme\" content=\"light\">");
        html.append("<meta name=\"supported-color-schemes\" content=\"light\">");
        html.append("<style>");
        html.append("@media only screen and (max-width: 640px) {");
        html.append("  .email-shell{padding:18px 10px !important;}");
        html.append("  .email-card{border-radius:18px !important;}");
        html.append("  .email-content{padding:26px 20px 22px !important;}");
        html.append("  .email-logo{width:170px !important;max-width:75% !important;}");
        html.append("  .email-title{font-size:28px !important;line-height:1.2 !important;}");
        html.append("  .details-row{display:block !important;padding:12px 14px !important;}");
        html.append("  .details-label,.details-value{display:block !important;width:100% !important;text-align:left !important;}");
        html.append("  .details-value{padding-top:4px !important;}");
        html.append("  .step-arrow{display:none !important;}");
        html.append("}");
        html.append("</style>");
        html.append("</head><body style=\"margin:0;padding:0;background:#f4f7fb;font-family:Arial,'Helvetica Neue',sans-serif;color:#0f172a;-webkit-font-smoothing:antialiased;\">");
        html.append("<div style=\"display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;\">")
                .append(escapeHtml(copy.previewText()))
                .append("</div>");
        html.append("<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"width:100%;background:#f4f7fb;border-collapse:collapse;\">");
        html.append("<tr><td align=\"center\" class=\"email-shell\" style=\"padding:34px 16px;\">");
        html.append("<table role=\"presentation\" width=\"640\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" class=\"email-card\" style=\"width:100%;max-width:640px;background:#ffffff;border:1px solid #e6edf6;border-radius:24px;border-collapse:separate;box-shadow:0 18px 44px rgba(15,23,42,0.08);overflow:hidden;\">");
        html.append("<tr><td class=\"email-content\" style=\"padding:32px 34px 28px;\">");
        html.append("<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"width:100%;border-collapse:collapse;\">");
        html.append("<tr><td style=\"padding:0 0 18px;\"><img src=\"cid:")
                .append(CALENDRA_LOGO_CONTENT_ID)
                .append("\" width=\"190\" alt=\"Calendra\" class=\"email-logo\" style=\"display:block;width:190px;max-width:65%;height:auto;border:0;outline:none;text-decoration:none;\"></td></tr>");
        html.append("<tr><td style=\"padding:0 0 16px;\"><span style=\"display:inline-block;background:#eef5ff;color:#1f68e5;border-radius:999px;padding:7px 12px;font-size:12px;line-height:16px;font-weight:700;\">")
                .append(escapeHtml(copy.badge()))
                .append("</span></td></tr>");
        html.append("<tr><td style=\"padding:0;\">");
        html.append("<h1 class=\"email-title\" style=\"margin:0 0 14px;font-size:30px;line-height:1.18;letter-spacing:-0.4px;color:#101828;font-weight:800;\">")
                .append(escapeHtml(copy.title()))
                .append("</h1>");
        html.append("<p style=\"margin:0 0 8px;font-size:15px;line-height:1.7;color:#475467;\">")
                .append(escapeHtml(copy.greetingPrefix()))
                .append(" ")
                .append(firstName)
                .append(",</p>");
        html.append("<p style=\"margin:0 0 12px;font-size:15px;line-height:1.72;color:#475467;\">")
                .append(escapeHtml(readyPrefix))
                .append(" <strong style=\"color:#101828;\">")
                .append(companyName)
                .append("</strong>.")
                .append("</p>");
        html.append("<p style=\"margin:0 0 24px;font-size:15px;line-height:1.72;color:#475467;\">")
                .append(escapeHtml(copy.introText()))
                .append("</p>");
        html.append("</td></tr>");
        html.append("<tr><td style=\"padding:0 0 22px;\">");
        html.append("<table role=\"presentation\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"border-collapse:separate;\"><tr>");
        html.append("<td align=\"center\" bgcolor=\"#2563eb\" style=\"border-radius:14px;background:#2563eb;box-shadow:0 8px 18px rgba(37,99,235,0.24);\">");
        html.append("<a href=\"")
                .append(ctaUrl)
                .append("\" style=\"display:inline-block;padding:14px 24px;color:#ffffff;font-size:14px;line-height:18px;font-weight:700;text-decoration:none;border-radius:14px;\">")
                .append(escapeHtml(ctaLabel))
                .append(" &#8250;</a>");
        html.append("</td></tr></table>");
        html.append("</td></tr>");

        html.append("<tr><td style=\"border-top:1px solid #edf1f6;padding:22px 0 12px;\">");
        html.append("<h2 style=\"margin:0;font-size:18px;line-height:24px;color:#101828;font-weight:700;\">")
                .append(escapeHtml(copy.accountDetailsTitle()))
                .append("</h2></td></tr>");
        html.append("<tr><td style=\"padding:0 0 4px;\">");
        html.append("<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"width:100%;background:#ffffff;border:1px solid #e7edf4;border-radius:16px;border-collapse:separate;overflow:hidden;\">");
        html.append(accountDetailRowHtml("&#9993;", copy.emailLabel(), recipientEmail, true, false));
        html.append(accountDetailRowHtml("&#9671;", copy.packageLabel(), packageLabel, false, true));
        html.append("</table></td></tr>");

        if (!pricingSummaryBlock.isBlank()) {
            html.append("<tr><td style=\"padding:16px 0 0;\">")
                    .append(pricingSummaryBlock)
                    .append("</td></tr>");
        }

        html.append("<tr><td style=\"padding:18px 0 12px;\">");
        html.append("<h2 style=\"margin:0;font-size:18px;line-height:24px;color:#101828;font-weight:700;\">")
                .append(escapeHtml(copy.nextStepsTitle()))
                .append("</h2></td></tr>");
        html.append("<tr><td style=\"padding:0;\">");
        html.append(buildStepCardHtml("1", "&#127970;", copy.companyStepTitle(), copy.companyStepText()));
        html.append(buildStepCardHtml("2", "&#128101;", copy.servicesStepTitle(), copy.servicesStepText()));
        html.append(buildStepCardHtml("3", "&#128276;", copy.notificationsStepTitle(), copy.notificationsStepText()));
        html.append(buildStepCardHtml("4", "&#128197;", copy.guestBookingStepTitle(), copy.guestBookingStepText()));
        html.append("</td></tr>");

        html.append("<tr><td style=\"padding:18px 0 0;\">");
        html.append("<p style=\"margin:0;font-size:13px;line-height:20px;color:#667085;\">")
                .append(escapeHtml(copy.unexpectedText()))
                .append("</p>");
        html.append("<p style=\"margin:14px 0 0;padding-top:16px;border-top:1px solid #edf1f6;font-size:12px;line-height:18px;color:#98a2b3;\">")
                .append(escapeHtml(copy.systemFooter()))
                .append("</p>");
        html.append("</td></tr>");

        html.append("</table></td></tr></table></td></tr></table></body></html>");
        return html.toString();
    }

    private String buildPlainText(
            WelcomeCopy copy,
            String firstName,
            String companyName,
            String recipientEmail,
            String packageLabel,
            String ctaUrl,
            String ctaLabel,
            boolean passwordSetupRequired,
            PricingSummaryRequest summary,
            String locale
    ) {
        String readyPrefix = passwordSetupRequired ? copy.manualReadyTextPrefix() : copy.readyTextPrefix();
        StringBuilder text = new StringBuilder();
        text.append(copy.title()).append("\n\n");
        text.append(copy.greetingPrefix()).append(" ").append(firstName).append(",\n\n");
        text.append(readyPrefix).append(" ").append(companyName).append(".\n");
        text.append(copy.introText()).append("\n\n");
        text.append(ctaLabel).append(": ").append(ctaUrl).append("\n\n");
        text.append(copy.accountDetailsTitle()).append("\n");
        text.append(copy.emailLabel()).append(": ").append(recipientEmail).append("\n");
        text.append(copy.packageLabel()).append(": ").append(packageLabel).append("\n");
        appendPricingSummaryText(text, summary, locale);
        text.append("\n");
        text.append(copy.nextStepsTitle()).append("\n");
        text.append("1. ").append(copy.companyStepTitle()).append(" - ").append(copy.companyStepText()).append("\n");
        text.append("2. ").append(copy.servicesStepTitle()).append(" - ").append(copy.servicesStepText()).append("\n");
        text.append("3. ").append(copy.notificationsStepTitle()).append(" - ").append(copy.notificationsStepText()).append("\n");
        text.append("4. ").append(copy.guestBookingStepTitle()).append(" - ").append(copy.guestBookingStepText()).append("\n\n");
        text.append(copy.unexpectedText()).append("\n\n");
        text.append(copy.systemFooter());
        return text.toString();
    }

    private String buildPricingSummaryHtml(PricingSummaryRequest summary, String locale) {
        List<String> rows = pricingSummaryRows(summary, locale);
        if (rows.isEmpty()) return "";
        StringBuilder html = new StringBuilder();
        html.append("<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"width:100%;background:#f8fbff;border:1px solid #dbe8fb;border-radius:14px;border-collapse:separate;overflow:hidden;\">");
        for (int i = 0; i < rows.size(); i++) {
            if (i > 0) {
                html.append("<tr><td style=\"border-top:1px solid #e7eef8;font-size:0;line-height:0;\">&nbsp;</td></tr>");
            }
            html.append("<tr><td style=\"padding:12px 14px;font-size:13px;line-height:18px;color:#475467;\">• ")
                    .append(escapeHtml(rows.get(i)))
                    .append("</td></tr>");
        }
        html.append("</table>");
        return html.toString();
    }

    private void appendPricingSummaryText(StringBuilder text, PricingSummaryRequest summary, String locale) {
        List<String> rows = pricingSummaryRows(summary, locale);
        if (rows.isEmpty()) return;
        for (String row : rows) {
            text.append("- ").append(row).append("\n");
        }
    }

    private List<String> pricingSummaryRows(PricingSummaryRequest summary, String locale) {
        List<String> rows = orderedItems(summary, "sl".equals(locale));
        if (summary == null) return rows;
        NumberFormat currency = NumberFormat.getCurrencyInstance("sl".equals(locale) ? Locale.forLanguageTag("sl-SI") : Locale.US);
        currency.setCurrency(Currency.getInstance("EUR"));
        currency.setMinimumFractionDigits(2);
        currency.setMaximumFractionDigits(2);
        if (summary.monthlyTotal() != null) rows.add(("sl".equals(locale) ? "Mesečno skupaj" : ("sr".equals(locale) ? "Mesečno ukupno" : "Monthly total")) + ": " + currency.format(summary.monthlyTotal()));
        if (summary.oneTimeTotal() != null) rows.add(("sl".equals(locale) ? "Enkratni strošek" : ("sr".equals(locale) ? "Jednokratni trošak" : "One-time cost")) + ": " + currency.format(summary.oneTimeTotal()));
        if (summary.firstInvoiceEstimate() != null) rows.add(("sl".equals(locale) ? "Predviden prvi račun" : ("sr".equals(locale) ? "Procenjeni prvi račun" : "Estimated first invoice")) + ": " + currency.format(summary.firstInvoiceEstimate()));
        return rows;
    }

    private static String accountDetailRowHtml(String icon, String label, String value, boolean valueIsLink, boolean addTopBorder) {
        String renderedValue = valueIsLink
                ? "<a href=\"mailto:" + value + "\" style=\"color:#2563eb;text-decoration:none;font-weight:700;\">" + value + "</a>"
                : value;
        return "<tr>"
                + "<td class=\"details-row\" style=\"padding:14px 16px;" + (addTopBorder ? "border-top:1px solid #edf1f6;" : "") + "\">"
                + "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"width:100%;border-collapse:collapse;\">"
                + "<tr>"
                + "<td class=\"details-label\" style=\"font-size:14px;line-height:20px;color:#475467;font-weight:600;\"><span style=\"display:inline-block;width:22px;color:#2563eb;\">" + icon + "</span> " + escapeHtml(label) + "</td>"
                + "<td class=\"details-value\" style=\"font-size:14px;line-height:20px;color:#101828;font-weight:700;text-align:right;\">" + renderedValue + "</td>"
                + "</tr></table></td></tr>";
    }

    private static String buildStepCardHtml(String number, String icon, String title, String text) {
        return "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"width:100%;border:1px solid #e7edf5;border-radius:16px;border-collapse:separate;background:#ffffff;margin:0 0 10px;overflow:hidden;\">"
                + "<tr>"
                + "<td width=\"48\" valign=\"top\" style=\"padding:14px 0 14px 14px;\">"
                + "<div style=\"width:32px;height:32px;line-height:32px;text-align:center;border-radius:50%;background:#eef5ff;color:#2563eb;font-size:16px;font-weight:700;\">" + icon + "</div>"
                + "</td>"
                + "<td valign=\"top\" style=\"padding:14px 10px 14px 2px;\">"
                + "<div style=\"font-size:14px;line-height:20px;color:#2563eb;font-weight:800;margin:0 0 4px;\">" + escapeHtml(number) + ". " + escapeHtml(title) + "</div>"
                + "<div style=\"font-size:13px;line-height:19px;color:#667085;\">" + escapeHtml(text) + "</div>"
                + "</td>"
                + "<td width=\"26\" class=\"step-arrow\" valign=\"middle\" align=\"center\" style=\"padding:14px 14px 14px 4px;font-size:20px;line-height:20px;color:#98a2b3;\">&#8250;</td>"
                + "</tr></table>";
    }

    private static WelcomeCopy welcomeCopy(String localeCode) {
        return switch (normalizeSupportedLocale(localeCode)) {
            case "sl" -> new WelcomeCopy(
                    "Dobrodošli v Calendra",
                    "Vaš račun je pripravljen. Začnite z nastavitvijo podjetja, storitev in rezervacij.",
                    "Nov račun",
                    "Dobrodošli v Calendro 👋",
                    "Pozdravljeni",
                    "pozdravljeni",
                    "Vaš račun za podjetje je bil uspešno ustvarjen za",
                    "Za vas smo ustvarili račun v Calendri za",
                    "Calendra vam omogoča enostavno upravljanje terminov, storitev, strank, obvestil in poslovnih nastavitev na enem mestu.",
                    "Podatki računa",
                    "Podjetje",
                    "E-pošta",
                    "Paket",
                    "Jezik računa",
                    "Kaj lahko uredite najprej?",
                    "Podatki podjetja",
                    "Preverite naziv podjetja, kontaktne podatke, naslov in podatke za račune.",
                    "Storitve in zaposleni",
                    "Dodajte storitve, zaposlene, urnike in pravila rezervacij.",
                    "Obvestila",
                    "Nastavite e-poštna obvestila, SMS obvestila in predloge za goste.",
                    "Rezervacije gostov",
                    "Po želji vključite Guest aplikacijo ali spletni vtičnik za spletne rezervacije.",
                    "Vstopi v Calendro",
                    "Nastavite geslo",
                    "Če računa niste ustvarili vi, lahko to sporočilo prezrete ali nas kontaktirate.",
                    "To je informativno sporočilo platforme Calendra.",
                    "vaše podjetje",
                    "Slovenščina"
            );
            case "sr" -> new WelcomeCopy(
                    "Dobro došli u Calendra",
                    "Vaš nalog je spreman. Započnite sa podešavanjem kompanije, usluga i rezervacija.",
                    "Novi nalog",
                    "Dobro došli u Calendro 👋",
                    "Zdravo",
                    "zdravo",
                    "Vaš nalog za kompaniju je uspešno kreiran za",
                    "Za vas smo kreirali nalog u Calendri za",
                    "Calendra vam omogućava jednostavno upravljanje terminima, uslugama, klijentima, obaveštenjima i poslovnim podešavanjima na jednom mestu.",
                    "Podaci naloga",
                    "Kompanija",
                    "E-pošta",
                    "Paket",
                    "Jezik naloga",
                    "Šta možete prvo podesiti?",
                    "Podaci kompanije",
                    "Proverite naziv kompanije, kontakt podatke, adresu i podatke za račune.",
                    "Usluge i zaposleni",
                    "Dodajte usluge, zaposlene, rasporede i pravila rezervacije.",
                    "Obaveštenja",
                    "Podesite e-mail obaveštenja, SMS obaveštenja i predloške za goste.",
                    "Rezervacije gostiju",
                    "Po želji uključite Guest aplikaciju ili veb dodatak za online rezervacije.",
                    "Uđi u Calendro",
                    "Podesite lozinku",
                    "Ako niste kreirali ovaj nalog, možete ignorisati ovu e-poštu ili nas kontaktirati.",
                    "Ovo je informativna poruka platforme Calendra.",
                    "vašu kompaniju",
                    "Srpski"
            );
            default -> new WelcomeCopy(
                    "Welcome to Calendra",
                    "Your account is ready. Start setting up your company, services, and bookings.",
                    "New account",
                    "Welcome to Calendra 👋",
                    "Hi",
                    "there",
                    "Your account has been successfully created for",
                    "We created a Calendra account for",
                    "Calendra helps you manage appointments, services, clients, notifications, and business settings in one place.",
                    "Account details",
                    "Company",
                    "Email",
                    "Package",
                    "Account language",
                    "What can you set up first?",
                    "Company details",
                    "Check your company name, contact details, address, and invoice details.",
                    "Services and employees",
                    "Add services, employees, schedules, and booking rules.",
                    "Notifications",
                    "Set up email notifications, SMS notifications, and guest templates.",
                    "Guest bookings",
                    "Enable the Guest app or website widget for online bookings when needed.",
                    "Enter Calendra",
                    "Set your password",
                    "If you did not create this account, you can ignore this email or contact us.",
                    "This is an informational message from the Calendra platform.",
                    "your company",
                    "English"
            );
        };
    }

    private static String languageLabel(String locale, WelcomeCopy copy) {
        return switch (normalizeSupportedLocale(locale)) {
            case "sl" -> "Slovenščina";
            case "sr" -> "Srpski";
            default -> copy.fallbackLanguage();
        };
    }

    private static String normalizeSupportedLocale(String localeCode) {
        if (localeCode == null || localeCode.isBlank()) return "en";
        String normalized = localeCode.trim().toLowerCase(Locale.ROOT);
        if (normalized.startsWith("sl") || normalized.equals("si")) return "sl";
        if (normalized.startsWith("sr") || normalized.equals("rs")) return "sr";
        return "en";
    }

    private static String normalizePackageType(String raw) {
        if (raw == null || raw.isBlank()) return "PROFESSIONAL";
        String normalized = raw.trim().toUpperCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
        if ("PRO".equals(normalized)) return "PROFESSIONAL";
        if ("BUSINESS".equals(normalized)) return "PREMIUM";
        return normalized;
    }

    private static String packageLabel(String packageType, String locale) {
        boolean sl = "sl".equals(normalizeSupportedLocale(locale));
        boolean sr = "sr".equals(normalizeSupportedLocale(locale));
        return switch (normalizePackageType(packageType)) {
            case "TRIAL" -> sl ? "Preizkus" : (sr ? "Probni paket" : "Trial");
            case "BASIC" -> sl ? "Osnovni" : (sr ? "Osnovni" : "Basic");
            case "PROFESSIONAL" -> sl ? "Profesionalni" : (sr ? "Profesionalni" : "Professional");
            case "PREMIUM" -> "Premium";
            case "CUSTOM" -> sl ? "Paket po meri" : (sr ? "Paket po meri" : "Custom");
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

    private static String sanitizeBase(String raw) {
        String value = raw == null || raw.isBlank() ? "http://localhost:3000" : raw.trim();
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }

    private static String firstNonBlank(String... values) {
        if (values == null) return "";
        for (String value : values) {
            if (value != null && !value.isBlank()) return value;
        }
        return "";
    }

    private static String safePlain(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
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
}
