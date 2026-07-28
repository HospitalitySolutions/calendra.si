package com.example.app.admin;

import com.example.app.logging.LogSanitizer;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TrialFollowUpEmailService {
    private static final Logger log = LoggerFactory.getLogger(TrialFollowUpEmailService.class);
    private static final String LOGO_CONTENT_ID = "calendraTrialFollowUpLogo";
    private static final String LOGO_CLASSPATH = "static/widget/calendra-transparent-logo.png";

    public record SendResult(String recipient, String language, String subject) {}

    private record Copy(
            String subject,
            String preview,
            String title,
            String greeting,
            String intro,
            String optionsTitle,
            String replyOption,
            String phoneOption,
            String bookingOption,
            String cta,
            String closing,
            String footer,
            String senderName) {}

    private final JavaMailSender mailSender;
    private final boolean mailConfigured;
    private final String fromAddress;
    private final String replyToAddress;
    private final String bookingUrl;
    private final String phoneNumber;

    public TrialFollowUpEmailService(
            @Autowired(required = false) JavaMailSender mailSender,
            @Value("${spring.mail.host:}") String mailHost,
            @Value("${spring.mail.username:}") String mailUsername,
            @Value("${app.mail.from:}") String appMailFrom,
            @Value("${MAIL_FROM:}") String legacyMailFrom,
            @Value("${app.trial-follow-up.reply-to:info@calendra.si}") String replyToAddress,
            @Value("${app.trial-follow-up.booking-url:https://calendra.si/predstavitev}") String bookingUrl,
            @Value("${app.trial-follow-up.phone:040 641 644}") String phoneNumber) {
        this.mailSender = mailSender;
        this.mailConfigured = mailSender != null && mailHost != null && !mailHost.isBlank();
        this.fromAddress = firstNonBlank(appMailFrom, legacyMailFrom, mailUsername, "info@calendra.si");
        this.replyToAddress = firstNonBlank(replyToAddress, this.fromAddress, "info@calendra.si");
        this.bookingUrl = firstNonBlank(bookingUrl, "https://calendra.si/predstavitev");
        this.phoneNumber = firstNonBlank(phoneNumber, "040 641 644");
    }

    public SendResult send(
            String recipientEmail,
            String recipientName,
            String companyName,
            String requestedLanguage) {
        String recipient = normalizeEmail(recipientEmail);
        String language = normalizeLanguage(requestedLanguage);
        Copy copy = copy(language);

        if (!mailConfigured || mailSender == null) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Email sending is not configured on this environment.");
        }

        String displayName = cleanValue(recipientName);
        String company = cleanValue(companyName);
        String html = buildHtml(copy, displayName, company);
        String plainText = buildPlainText(copy, displayName, company);

        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, StandardCharsets.UTF_8.name());
            helper.setTo(recipient);
            helper.setFrom(fromAddress, copy.senderName());
            helper.setReplyTo(replyToAddress, copy.senderName());
            helper.setSubject(copy.subject());
            helper.setText(plainText, html);
            helper.addInline(LOGO_CONTENT_ID, new ClassPathResource(LOGO_CLASSPATH), "image/png");
            mailSender.send(message);
            log.info(
                    "Trial follow-up email sent to {} in language {}",
                    LogSanitizer.emailHash(recipient),
                    language);
            return new SendResult(recipient, language, copy.subject());
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            log.warn(
                    "Failed to send trial follow-up email to {}: {}",
                    LogSanitizer.emailHash(recipient),
                    ex.getMessage());
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "Could not send the trial follow-up email.",
                    ex);
        }
    }

    private String buildHtml(Copy copy, String recipientName, String companyName) {
        String greeting = personalizedGreeting(copy.greeting(), recipientName);
        String companyContext = companyName.isBlank()
                ? ""
                : "<div style=\"margin:0 0 18px;color:#7b89a2;font-size:14px;line-height:1.5;\">"
                        + escapeHtml(companyName)
                        + "</div>";

        return "<!doctype html>"
                + "<html><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
                + "<meta name=\"color-scheme\" content=\"light\"><meta name=\"supported-color-schemes\" content=\"light\">"
                + "<style>@media only screen and (max-width:640px){.email-shell{padding:14px 8px!important}.email-card{padding:28px 22px!important;border-radius:22px!important}.email-title{font-size:34px!important}.option-cell{padding-left:10px!important}.cta{display:block!important;width:auto!important}}</style>"
                + "</head><body style=\"margin:0;background:#f3f7fc;color:#111827;font-family:Arial,Helvetica,sans-serif;\">"
                + "<div style=\"display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;\">"
                + escapeHtml(copy.preview())
                + "</div>"
                + "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" class=\"email-shell\" style=\"width:100%;background:#f3f7fc;padding:28px 14px;\"><tr><td align=\"center\">"
                + "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" class=\"email-card\" style=\"width:100%;max-width:720px;background:#ffffff;border:1px solid #dce6f4;border-radius:30px;padding:42px 44px;box-shadow:0 14px 40px rgba(34,72,130,.07);\">"
                + "<tr><td>"
                + "<img src=\"cid:"
                + LOGO_CONTENT_ID
                + "\" width=\"205\" alt=\"Calendra\" style=\"display:block;width:205px;max-width:58%;height:auto;margin:0 0 28px;\">"
                + "<h1 class=\"email-title\" style=\"margin:0 0 24px;color:#101827;font-size:46px;line-height:1.08;letter-spacing:-1.8px;font-weight:800;\">"
                + escapeHtml(copy.title())
                + "</h1>"
                + (greeting.isBlank()
                        ? ""
                        : "<p style=\"margin:0 0 10px;color:#50627e;font-size:18px;line-height:1.65;font-weight:700;\">"
                                + escapeHtml(greeting)
                                + "</p>")
                + companyContext
                + "<p style=\"margin:0 0 30px;color:#5b6d88;font-size:18px;line-height:1.72;\">"
                + escapeHtml(copy.intro())
                + "</p>"
                + "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"width:100%;border:1px solid #d8e4f5;background:#f8fbff;border-radius:20px;border-collapse:separate;\">"
                + "<tr><td colspan=\"2\" style=\"padding:24px 26px 12px;color:#172033;font-size:17px;font-weight:800;\">"
                + escapeHtml(copy.optionsTitle())
                + "</td></tr>"
                + optionRow("✉", copy.replyOption(), false)
                + optionRow("☎", copy.phoneOption() + " " + phoneNumber, true)
                + optionRow("📅", copy.bookingOption(), false)
                + "<tr><td colspan=\"2\" style=\"height:18px;line-height:18px;\">&nbsp;</td></tr></table>"
                + "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"width:100%;margin-top:24px;\"><tr><td align=\"center\" bgcolor=\"#1468ed\" style=\"border-radius:16px;background:#1468ed;\">"
                + "<a class=\"cta\" href=\""
                + escapeHtml(bookingUrl)
                + "\" target=\"_blank\" style=\"display:block;padding:18px 24px;color:#ffffff;text-decoration:none;font-size:18px;line-height:1.2;font-weight:800;text-align:center;border-radius:16px;\">📅&nbsp;&nbsp;"
                + escapeHtml(copy.cta())
                + "</a></td></tr></table>"
                + "<p style=\"margin:30px 0 0;color:#5b6d88;font-size:16px;line-height:1.7;\">"
                + escapeHtml(copy.closing())
                + "</p>"
                + "<div style=\"border-top:1px solid #e3e9f2;margin-top:30px;padding-top:20px;color:#93a1b7;font-size:13px;line-height:1.6;\">"
                + escapeHtml(copy.footer())
                + "</div>"
                + "</td></tr></table></td></tr></table></body></html>";
    }

    private String optionRow(String icon, String text, boolean emphasizeTail) {
        String safeText = escapeHtml(text);
        if (emphasizeTail) {
            int separator = safeText.indexOf(':');
            if (separator >= 0 && separator + 1 < safeText.length()) {
                safeText = safeText.substring(0, separator + 1)
                        + " <strong style=\"color:#263752;\">"
                        + safeText.substring(separator + 1).trim()
                        + "</strong>";
            }
        }
        return "<tr><td width=\"62\" valign=\"middle\" style=\"padding:10px 0 10px 26px;\">"
                + "<div style=\"width:42px;height:42px;line-height:42px;text-align:center;border-radius:50%;background:#e9f2ff;color:#1468ed;font-size:19px;font-weight:800;\">"
                + icon
                + "</div></td><td valign=\"middle\" class=\"option-cell\" style=\"padding:10px 26px 10px 14px;color:#5b6d88;font-size:16px;line-height:1.45;\">"
                + safeText
                + "</td></tr>";
    }

    private String buildPlainText(Copy copy, String recipientName, String companyName) {
        StringBuilder text = new StringBuilder();
        text.append(copy.title()).append("\n\n");
        String greeting = personalizedGreeting(copy.greeting(), recipientName);
        if (!greeting.isBlank()) text.append(greeting).append("\n");
        if (!companyName.isBlank()) text.append(companyName).append("\n");
        if (!greeting.isBlank() || !companyName.isBlank()) text.append("\n");
        text.append(copy.intro()).append("\n\n");
        text.append(copy.optionsTitle()).append("\n");
        text.append("- ").append(copy.replyOption()).append("\n");
        text.append("- ").append(copy.phoneOption()).append(" ").append(phoneNumber).append("\n");
        text.append("- ").append(copy.bookingOption()).append("\n\n");
        text.append(copy.cta()).append(": ").append(bookingUrl).append("\n\n");
        text.append(copy.closing()).append("\n\n");
        text.append(copy.footer());
        return text.toString();
    }

    private static String personalizedGreeting(String greeting, String recipientName) {
        if (recipientName == null || recipientName.isBlank()) return greeting;
        String firstName = recipientName.trim().split("\\s+")[0];
        if (firstName.isBlank()) return greeting;
        return greeting + " " + firstName + ",";
    }

    private static Copy copy(String language) {
        return switch (language) {
            case "sr" -> new Copy(
                    "Hvala vam što ste izabrali probnu verziju Calendre",
                    "Rezervišite 30-minutni prezentacioni poziv i upoznajte sve mogućnosti Calendre.",
                    "Hvala vam što ste izabrali probnu verziju Calendre",
                    "Poštovani",
                    "Drago nam je što ste izabrali probnu verziju Calendre. Pošto je probna verzija ograničena, preporučujemo da zakažete 30-minutni prezentacioni poziv, tokom kojeg ćemo vam predstaviti rad platforme i odgovoriti na vaša pitanja.",
                    "Mogućnosti za dogovor",
                    "Odgovorite na ovaj e-mail",
                    "Pozovite nas:",
                    "Ili sami rezervišite termin prezentacije",
                    "Rezervišite termin prezentacije",
                    "Za više informacija možete nas kontaktirati direktno putem e-maila ili telefona. Rado ćemo vam pomoći pri prvim koracima korišćenja Calendre.",
                    "Ovo je informativna poruka platforme Calendra.",
                    "Calendra tim");
            case "en" -> new Copy(
                    "Thank you for choosing the Calendra trial",
                    "Book a 30-minute presentation call and discover the full Calendra platform.",
                    "Thank you for choosing the Calendra trial",
                    "Hello",
                    "We’re glad you chose the Calendra trial. Because the trial version is limited, we recommend booking a 30-minute presentation call, where we can show you how the platform works and answer your questions.",
                    "Ways to get in touch",
                    "Reply to this email",
                    "Call us:",
                    "Or book a presentation time yourself",
                    "Book a presentation call",
                    "For more information, you can also contact us directly by email or phone. We’ll be happy to help you take your first steps with Calendra.",
                    "This is an informational message from the Calendra platform.",
                    "Calendra team");
            default -> new Copy(
                    "Hvala, ker ste izbrali preizkusno različico Calendre",
                    "Rezervirajte 30-minutni predstavitveni klic in spoznajte vse možnosti Calendre.",
                    "Hvala, ker ste izbrali preizkusno različico Calendre",
                    "Pozdravljeni",
                    "Veseli nas, da ste izbrali preizkusno različico Calendre. Ker je preizkusna različica omejena, vam priporočamo, da si rezervirate 30-minutni predstavitveni klic, kjer vam predstavimo delovanje platforme in odgovorimo na vaša vprašanja.",
                    "Možnosti za dogovor",
                    "Odgovorite na ta e-mail",
                    "Pokličite nas:",
                    "Ali si sami rezervirajte termin predstavitve",
                    "Rezervirajte termin predstavitve",
                    "Za več informacij nas lahko kontaktirate tudi neposredno po e-pošti ali telefonu. Z veseljem vam pomagamo pri prvih korakih uporabe Calendre.",
                    "To je informativno sporočilo platforme Calendra.",
                    "Calendra ekipa");
        };
    }

    private static String normalizeLanguage(String raw) {
        String value = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
        if (value.startsWith("sr")) return "sr";
        if (value.startsWith("en")) return "en";
        return "sl";
    }

    private static String normalizeEmail(String raw) {
        String email = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
        if (email.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The selected tenant has no owner email address.");
        }
        try {
            InternetAddress parsed = new InternetAddress(email, true);
            parsed.validate();
            return email;
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The selected tenant owner email address is invalid.");
        }
    }

    private static String cleanValue(String value) {
        return value == null ? "" : value.trim().replaceAll("[\\r\\n]+", " ");
    }

    private static String escapeHtml(String value) {
        if (value == null) return "";
        return value.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }

    private static String firstNonBlank(String... values) {
        if (values == null) return "";
        for (String value : values) {
            if (value != null && !value.isBlank()) return value.trim();
        }
        return "";
    }
}
