package com.example.app.auth;

import com.example.app.logging.LogSanitizer;

import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.text.NumberFormat;
import java.util.ArrayList;
import java.util.Currency;
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
        String safeLanguageLabel = escapeHtml(languageLabel(locale, copy));
        String safeCtaUrl = escapeHtml(ctaUrl == null || ctaUrl.isBlank() ? frontendBaseUrl + "/login" : ctaUrl.trim());
        String ctaLabel = passwordSetupRequired ? copy.setupButtonLabel() : copy.loginButtonLabel();

        String html = buildHtml(
                copy,
                safeFirstName,
                safeCompanyName,
                safeRecipientEmail,
                safePackageLabel,
                safeLanguageLabel,
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
                languageLabel(locale, copy),
                ctaUrl == null || ctaUrl.isBlank() ? frontendBaseUrl + "/login" : ctaUrl.trim(),
                ctaLabel,
                passwordSetupRequired
        );

        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, java.nio.charset.StandardCharsets.UTF_8.name());
            helper.setTo(recipientEmail.trim());
            if (!fallbackFrom.isBlank()) {
                helper.setFrom(fallbackFrom);
            }
            helper.setSubject(copy.subject());
            helper.setText(plainText, html);
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
            String languageLabel,
            String ctaUrl,
            String ctaLabel,
            boolean passwordSetupRequired,
            PricingSummaryRequest summary,
            String locale
    ) {
        String readyPrefix = passwordSetupRequired ? copy.manualReadyTextPrefix() : copy.readyTextPrefix();
        StringBuilder html = new StringBuilder();
        html.append("<!doctype html>");
        html.append("<html><body style=\"margin:0;background:#f3f6fb;font-family:Arial,sans-serif;color:#0f172a;\">");
        html.append("<div style=\"display:none;max-height:0;overflow:hidden;color:transparent;opacity:0;\">")
                .append(escapeHtml(copy.previewText()))
                .append("</div>");
        html.append("<div style=\"max-width:680px;margin:32px auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:24px;padding:32px;box-shadow:0 18px 45px rgba(15,23,42,.08);\">");
        html.append("<div style=\"font-size:26px;font-weight:800;letter-spacing:-.03em;color:#0f172a;margin-bottom:28px;\">Calendra</div>");
        html.append("<div style=\"display:inline-block;background:#eff6ff;color:#1d4ed8;border-radius:999px;padding:8px 14px;font-size:13px;font-weight:700;margin-bottom:20px;\">")
                .append(escapeHtml(copy.badge()))
                .append("</div>");
        html.append("<h1 style=\"font-size:30px;line-height:1.15;margin:0 0 18px;\">")
                .append(escapeHtml(copy.title()))
                .append("</h1>");
        html.append("<p style=\"font-size:16px;line-height:1.65;margin:0 0 14px;\">")
                .append(escapeHtml(copy.greetingPrefix()))
                .append(" ")
                .append(firstName)
                .append(",</p>");
        html.append("<p style=\"font-size:16px;line-height:1.65;margin:0 0 14px;color:#334155;\">")
                .append(escapeHtml(readyPrefix))
                .append(" <strong>")
                .append(companyName)
                .append("</strong>.")
                .append("</p>");
        html.append("<p style=\"font-size:16px;line-height:1.65;margin:0 0 24px;color:#334155;\">")
                .append(escapeHtml(copy.introText()))
                .append("</p>");
        html.append("<a href=\"")
                .append(ctaUrl)
                .append("\" style=\"display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;border-radius:14px;padding:16px 24px;margin-bottom:26px;\">")
                .append(escapeHtml(ctaLabel))
                .append("</a>");
        html.append("<h2 style=\"font-size:18px;margin:0 0 14px;\">")
                .append(escapeHtml(copy.accountDetailsTitle()))
                .append("</h2>");
        html.append("<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"border-collapse:separate;border-spacing:0 10px;margin-bottom:22px;\">");
        html.append(accountDetailRow(copy.companyLabel(), companyName));
        html.append(accountDetailRow(copy.emailLabel(), recipientEmail));
        html.append(accountDetailRow(copy.packageLabel(), packageLabel));
        html.append(accountDetailRow(copy.languageLabel(), languageLabel));
        html.append("</table>");
        appendPricingSummary(html, summary, locale);
        html.append("<h2 style=\"font-size:18px;margin:0 0 14px;\">")
                .append(escapeHtml(copy.nextStepsTitle()))
                .append("</h2>");
        html.append("<div style=\"display:grid;gap:12px;\">");
        appendStep(html, "1", copy.companyStepTitle(), copy.companyStepText());
        appendStep(html, "2", copy.servicesStepTitle(), copy.servicesStepText());
        appendStep(html, "3", copy.notificationsStepTitle(), copy.notificationsStepText());
        appendStep(html, "4", copy.guestBookingStepTitle(), copy.guestBookingStepText());
        html.append("</div>");
        html.append("<p style=\"font-size:14px;line-height:1.6;color:#64748b;margin:24px 0 0;\">")
                .append(escapeHtml(copy.unexpectedText()))
                .append("</p>");
        html.append("<p style=\"font-size:13px;line-height:1.6;color:#94a3b8;margin:18px 0 0;border-top:1px solid #e2e8f0;padding-top:18px;\">")
                .append(escapeHtml(copy.systemFooter()))
                .append("</p>");
        html.append("</div></body></html>");
        return html.toString();
    }

    private String buildPlainText(
            WelcomeCopy copy,
            String firstName,
            String companyName,
            String recipientEmail,
            String packageLabel,
            String languageLabel,
            String ctaUrl,
            String ctaLabel,
            boolean passwordSetupRequired
    ) {
        String readyPrefix = passwordSetupRequired ? copy.manualReadyTextPrefix() : copy.readyTextPrefix();
        return """
                %s

                %s %s,

                %s %s.
                %s

                %s: %s

                %s
                %s: %s
                %s: %s
                %s: %s
                %s: %s

                %s
                1. %s - %s
                2. %s - %s
                3. %s - %s
                4. %s - %s

                %s

                %s
                """.formatted(
                copy.title(),
                copy.greetingPrefix(),
                firstName,
                readyPrefix,
                companyName,
                copy.introText(),
                ctaLabel,
                ctaUrl,
                copy.accountDetailsTitle(),
                copy.companyLabel(),
                companyName,
                copy.emailLabel(),
                recipientEmail,
                copy.packageLabel(),
                packageLabel,
                copy.languageLabel(),
                languageLabel,
                copy.nextStepsTitle(),
                copy.companyStepTitle(),
                copy.companyStepText(),
                copy.servicesStepTitle(),
                copy.servicesStepText(),
                copy.notificationsStepTitle(),
                copy.notificationsStepText(),
                copy.guestBookingStepTitle(),
                copy.guestBookingStepText(),
                copy.unexpectedText(),
                copy.systemFooter()
        );
    }

    private void appendPricingSummary(StringBuilder html, PricingSummaryRequest summary, String locale) {
        if (summary == null) return;
        List<String> rows = orderedItems(summary, "sl".equals(locale));
        NumberFormat currency = NumberFormat.getCurrencyInstance("sl".equals(locale) ? Locale.forLanguageTag("sl-SI") : Locale.US);
        currency.setCurrency(Currency.getInstance("EUR"));
        currency.setMinimumFractionDigits(2);
        currency.setMaximumFractionDigits(2);
        if (summary.monthlyTotal() != null) rows.add(("sl".equals(locale) ? "Mesečno skupaj" : "Monthly total") + ": " + currency.format(summary.monthlyTotal()));
        if (summary.oneTimeTotal() != null) rows.add(("sl".equals(locale) ? "Enkratni strošek" : "One-time cost") + ": " + currency.format(summary.oneTimeTotal()));
        if (summary.firstInvoiceEstimate() != null) rows.add(("sl".equals(locale) ? "Predviden prvi račun" : "Estimated first invoice") + ": " + currency.format(summary.firstInvoiceEstimate()));
        if (rows.isEmpty()) return;
        html.append("<div style=\"background:#f8fafc;border:1px solid #e2e8f0;border-radius:18px;padding:18px 20px;margin:0 0 24px;\"><ul style=\"margin:0;padding-left:18px;color:#334155;\">");
        for (String row : rows) {
            html.append("<li style=\"margin:0 0 6px;\">").append(escapeHtml(row)).append("</li>");
        }
        html.append("</ul></div>");
    }

    private static String accountDetailRow(String label, String value) {
        return "<tr>"
                + "<td style=\"background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:14px 16px;color:#64748b;font-weight:700;\">" + escapeHtml(label) + "</td>"
                + "<td style=\"background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:14px 16px;text-align:right;font-weight:700;\">" + value + "</td>"
                + "</tr>";
    }

    private static void appendStep(StringBuilder html, String number, String title, String text) {
        html.append("<div style=\"border:1px solid #e2e8f0;border-radius:18px;padding:16px 18px;background:#ffffff;\">");
        html.append("<div style=\"font-size:14px;color:#2563eb;font-weight:800;margin-bottom:6px;\">")
                .append(escapeHtml(number))
                .append(". ")
                .append(escapeHtml(title))
                .append("</div>");
        html.append("<div style=\"font-size:14px;line-height:1.6;color:#475569;\">")
                .append(escapeHtml(text))
                .append("</div>");
        html.append("</div>");
    }

    private static WelcomeCopy welcomeCopy(String localeCode) {
        return switch (normalizeSupportedLocale(localeCode)) {
            case "sl" -> new WelcomeCopy(
                    "Dobrodošli v Calendra",
                    "Vaš račun je pripravljen. Začnite z nastavitvijo podjetja, storitev in rezervacij.",
                    "Nov račun",
                    "Dobrodošli v Calendra 👋",
                    "Pozdravljeni",
                    "pozdravljeni",
                    "Vaš račun za podjetje je bil uspešno ustvarjen za",
                    "Za vas smo ustvarili račun v Calendra za",
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
                    "Prijava v Calendra",
                    "Nastavite geslo",
                    "Če računa niste ustvarili vi, lahko to sporočilo prezrete ali nas kontaktirate.",
                    "To je sistemsko sporočilo platforme Calendra.",
                    "vaše podjetje",
                    "Slovenščina"
            );
            case "sr" -> new WelcomeCopy(
                    "Dobro došli u Calendra",
                    "Vaš nalog je spreman. Počnite sa podešavanjem kompanije, usluga i rezervacija.",
                    "Novi nalog",
                    "Dobro došli u Calendra 👋",
                    "Zdravo",
                    "zdravo",
                    "Vaš nalog za kompaniju je uspešno kreiran za",
                    "Za vas smo kreirali nalog u Calendra za",
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
                    "Prijava u Calendra",
                    "Podesite lozinku",
                    "Ako niste kreirali ovaj nalog, možete ignorisati ovu e-poštu ili nas kontaktirati.",
                    "Ovo je sistemska poruka platforme Calendra.",
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
                    "Your account has been created for",
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
                    "Sign in to Calendra",
                    "Set your password",
                    "If you did not create this account, you can ignore this email or contact us.",
                    "This is a system message from the Calendra platform.",
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
