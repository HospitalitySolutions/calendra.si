package com.example.app.register;

import com.example.app.logging.LogSanitizer;
import jakarta.mail.internet.MimeMessage;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
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
public class RegisterContactEmailService {
    private static final Logger log = LoggerFactory.getLogger(RegisterContactEmailService.class);
    private static final String LOGO_CONTENT_ID = "calendraRegisterContactLogo";
    private static final String LOGO_CLASSPATH = "static/widget/calendra-transparent-logo.png";

    public record ContactSubmission(
            String name,
            String email,
            String phone,
            String message,
            String locale,
            String plan,
            String planName,
            String billing,
            BigDecimal estimatedMonthlyTotal
    ) {
    }

    private record ConfirmationCopy(
            String subject,
            String preview,
            String badge,
            String title,
            String greeting,
            String receivedText,
            String contactText,
            String signoff,
            String teamName,
            String summaryTitle,
            String nameLabel,
            String emailLabel,
            String phoneLabel,
            String messageLabel,
            String notProvided,
            String nextTitle,
            String nextText,
            String urgentText,
            String footer
    ) {
    }

    private final JavaMailSender mailSender;
    private final boolean mailConfigured;
    private final String fromAddress;
    private final List<String> platformAdminEmails;

    public RegisterContactEmailService(
            @Autowired(required = false) JavaMailSender mailSender,
            @Value("${spring.mail.host:}") String mailHost,
            @Value("${spring.mail.username:}") String mailUsername,
            @Value("${app.mail.from:}") String appMailFrom,
            @Value("${MAIL_FROM:}") String legacyMailFrom,
            @Value("${app.platform-admin-emails:}") String configuredAdminEmails,
            @Value("${app.platform-alert-emails:}") String platformAlertEmails
    ) {
        this.mailSender = mailSender;
        this.mailConfigured = mailSender != null && mailHost != null && !mailHost.isBlank();
        this.fromAddress = firstNonBlank(appMailFrom, legacyMailFrom, mailUsername, "info@calendra.si");
        String recipients = firstNonBlank(configuredAdminEmails, platformAlertEmails, "info@calendra.si");
        this.platformAdminEmails = Arrays.stream(recipients.split("[,;]"))
                .map(String::trim)
                .filter(value -> !value.isBlank())
                .distinct()
                .toList();
    }

    public void sendContactEmails(ContactSubmission rawSubmission) {
        if (!mailConfigured || mailSender == null) {
            log.warn("Register contact request could not be sent because mail is not configured.");
            throw unavailable(rawSubmission == null ? null : rawSubmission.locale());
        }
        if (platformAdminEmails.isEmpty()) {
            log.error("Register contact request could not be sent because no platform admin recipient is configured.");
            throw unavailable(rawSubmission == null ? null : rawSubmission.locale());
        }

        ContactSubmission submission = normalize(rawSubmission);
        try {
            sendPlatformAdminEmail(submission);
            sendConfirmationEmail(submission);
            log.info(
                    "Register contact emails sent. requester={}, adminRecipients={}",
                    LogSanitizer.emailHash(submission.email()),
                    platformAdminEmails.size()
            );
        } catch (Exception ex) {
            log.error(
                    "Failed to send register contact emails. requester={}, reason={}",
                    LogSanitizer.emailHash(submission.email()),
                    ex.getMessage()
            );
            throw unavailable(submission.locale());
        }
    }

    private void sendPlatformAdminEmail(ContactSubmission submission) throws Exception {
        String subjectName = cleanHeader(submission.name());
        String subject = "[Calendra] Novo povpraševanje po prilagoditvi – " + subjectName;
        String supportEmail = platformAdminEmails.getFirst();

        MimeMessage message = mailSender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(message, true, StandardCharsets.UTF_8.name());
        helper.setTo(platformAdminEmails.toArray(String[]::new));
        helper.setFrom(fromAddress, "Calendra platform");
        helper.setReplyTo(submission.email(), cleanHeader(submission.name()));
        helper.setSubject(subject);
        helper.setText(buildAdminPlainText(submission), buildAdminHtml(submission, supportEmail));
        helper.addInline(LOGO_CONTENT_ID, new ClassPathResource(LOGO_CLASSPATH), "image/png");
        mailSender.send(message);
    }

    private void sendConfirmationEmail(ContactSubmission submission) throws Exception {
        ConfirmationCopy copy = confirmationCopy(submission.locale());
        String supportEmail = platformAdminEmails.getFirst();

        MimeMessage message = mailSender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(message, true, StandardCharsets.UTF_8.name());
        helper.setTo(submission.email());
        helper.setFrom(fromAddress, copy.teamName());
        helper.setSubject(copy.subject());
        helper.setText(
                buildConfirmationPlainText(submission, copy, supportEmail),
                buildConfirmationHtml(submission, copy, supportEmail)
        );
        helper.addInline(LOGO_CONTENT_ID, new ClassPathResource(LOGO_CLASSPATH), "image/png");
        mailSender.send(message);
    }

    private static ContactSubmission normalize(ContactSubmission raw) {
        if (raw == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing contact request.");
        }
        String locale = "sl".equalsIgnoreCase(raw.locale()) ? "sl" : "en";
        return new ContactSubmission(
                cleanValue(raw.name()),
                cleanValue(raw.email()).toLowerCase(Locale.ROOT),
                cleanOptional(raw.phone()),
                normalizeLineBreaks(raw.message()).trim(),
                locale,
                cleanOptional(raw.plan()),
                cleanOptional(raw.planName()),
                cleanOptional(raw.billing()),
                raw.estimatedMonthlyTotal() == null
                        ? null
                        : raw.estimatedMonthlyTotal().max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP)
        );
    }

    private String buildAdminHtml(ContactSubmission submission, String supportEmail) {
        String planContext = planContext(submission, "sl");
        String preview = "Novo povpraševanje s strani za izbiro paketa Calendra.";
        String rows = detailRow("👤", "Ime", submission.name(), false)
                + detailRow("✉", "E-pošta", submission.email(), true)
                + detailRow("☎", "Telefon", displayPhone(submission, "sl"), false)
                + detailRow("💬", "Sporočilo", submission.message(), false)
                + detailRow("📦", "Izbrani paket", planContext, false)
                + detailRow("🌐", "Jezik obrazca", "sl".equals(submission.locale()) ? "Slovenščina" : "English", false);

        return emailDocument(
                preview,
                "<span style=\"display:inline-block;background:#eaf2ff;color:#2463eb;border-radius:999px;padding:7px 13px;font-size:13px;font-weight:700;\">Novo povpraševanje</span>"
                        + "<h1 style=\"margin:24px 0 14px;color:#111827;font-size:32px;line-height:1.2;\">Nova zahteva za prilagoditev</h1>"
                        + "<p style=\"margin:0 0 10px;color:#52627a;font-size:16px;line-height:1.65;\">Uporabnik je prek registracijske strani poslal novo povpraševanje.</p>"
                        + "<p style=\"margin:0 0 26px;color:#52627a;font-size:16px;line-height:1.65;\">Odgovor lahko pošljete neposredno na <a href=\"mailto:" + escapeHtml(submission.email()) + "\" style=\"color:#2563eb;text-decoration:none;font-weight:700;\">" + escapeHtml(submission.email()) + "</a>.</p>"
                        + detailsCard("Podatki povpraševanja", rows)
                        + "<div style=\"margin-top:28px;border:1px solid #d9e5f7;background:#f7faff;border-radius:16px;padding:20px 22px;\">"
                        + "<div style=\"font-size:17px;font-weight:800;color:#172033;margin-bottom:8px;\">Naslednji korak</div>"
                        + "<div style=\"font-size:15px;line-height:1.6;color:#52627a;\">Preglejte potrebe uporabnika in se mu oglasite v najkrajšem možnem času. Potrdilo o prejemu je bilo samodejno poslano tudi uporabniku.</div>"
                        + "</div>"
                        + "<div style=\"border-top:1px solid #e5eaf2;margin-top:30px;padding-top:20px;color:#8a97ab;font-size:13px;line-height:1.6;\">Samodejno obvestilo platforme Calendra · " + escapeHtml(supportEmail) + "</div>"
        );
    }

    private String buildConfirmationHtml(ContactSubmission submission, ConfirmationCopy copy, String supportEmail) {
        String rows = detailRow("👤", copy.nameLabel(), submission.name(), false)
                + detailRow("✉", copy.emailLabel(), submission.email(), true)
                + detailRow("☎", copy.phoneLabel(), displayPhone(submission, submission.locale()), false)
                + detailRow("💬", copy.messageLabel(), submission.message(), false);

        String body = "<span style=\"display:inline-block;background:#eaf2ff;color:#2463eb;border-radius:999px;padding:7px 13px;font-size:13px;font-weight:700;\">" + escapeHtml(copy.badge()) + "</span>"
                + "<h1 style=\"margin:24px 0 14px;color:#111827;font-size:34px;line-height:1.2;\">" + escapeHtml(copy.title()) + "</h1>"
                + "<p style=\"margin:0 0 22px;color:#52627a;font-size:16px;line-height:1.65;\">" + escapeHtml(copy.greeting()) + " " + escapeHtml(submission.name()) + ",</p>"
                + "<p style=\"margin:0 0 8px;color:#52627a;font-size:16px;line-height:1.65;\">" + escapeHtml(copy.receivedText()) + "</p>"
                + "<p style=\"margin:0 0 20px;color:#52627a;font-size:16px;line-height:1.65;\">" + escapeHtml(copy.contactText()) + "</p>"
                + "<p style=\"margin:0 0 30px;color:#52627a;font-size:16px;line-height:1.65;\">" + escapeHtml(copy.signoff()) + "<br><strong style=\"color:#172033;\">" + escapeHtml(copy.teamName()) + "</strong></p>"
                + detailsCard(copy.summaryTitle(), rows)
                + "<div style=\"margin-top:28px;border:1px solid #d9e5f7;background:#f7faff;border-radius:16px;padding:20px 22px;\">"
                + "<div style=\"font-size:17px;font-weight:800;color:#172033;margin-bottom:8px;\">↻&nbsp; " + escapeHtml(copy.nextTitle()) + "</div>"
                + "<div style=\"font-size:15px;line-height:1.65;color:#52627a;\">" + escapeHtml(copy.nextText()) + "<br>"
                + escapeHtml(copy.urgentText()) + " <a href=\"mailto:" + escapeHtml(supportEmail) + "\" style=\"color:#2563eb;text-decoration:none;font-weight:700;\">" + escapeHtml(supportEmail) + "</a>.</div>"
                + "</div>"
                + "<div style=\"border-top:1px solid #e5eaf2;margin-top:30px;padding-top:20px;color:#8a97ab;font-size:13px;line-height:1.6;\">" + escapeHtml(copy.footer()) + "</div>";

        return emailDocument(copy.preview(), body);
    }

    private static String emailDocument(String preview, String content) {
        return "<!doctype html><html><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
                + "<meta name=\"color-scheme\" content=\"light\"><style>"
                + "@media(max-width:640px){.shell{padding:12px!important}.card{border-radius:18px!important}.content{padding:28px 20px!important}.logo{width:170px!important}.detail-row{display:block!important}.detail-label,.detail-value{display:block!important;width:100%!important;text-align:left!important}.detail-value{padding-top:5px!important}}"
                + "</style></head><body style=\"margin:0;background:#f3f7fc;font-family:Arial,Helvetica,sans-serif;\">"
                + "<div style=\"display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;\">" + escapeHtml(preview) + "</div>"
                + "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\"><tr><td class=\"shell\" align=\"center\" style=\"padding:28px 14px;\">"
                + "<table role=\"presentation\" class=\"card\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"max-width:720px;background:#fff;border:1px solid #dfe7f2;border-radius:24px;box-shadow:0 12px 38px rgba(31,64,120,.08);\">"
                + "<tr><td class=\"content\" style=\"padding:40px 44px 34px;\">"
                + "<img class=\"logo\" src=\"cid:" + LOGO_CONTENT_ID + "\" width=\"190\" alt=\"Calendra\" style=\"display:block;width:190px;max-width:72%;height:auto;margin:0 0 28px;\">"
                + content
                + "</td></tr></table></td></tr></table></body></html>";
    }

    private static String detailsCard(String title, String rows) {
        return "<div style=\"border:1px solid #dfe7f2;border-radius:18px;overflow:hidden;\">"
                + "<div style=\"padding:18px 20px;background:#f8fbff;border-bottom:1px solid #dfe7f2;font-size:18px;font-weight:800;color:#172033;\">✉&nbsp; " + escapeHtml(title) + "</div>"
                + rows
                + "</div>";
    }

    private static String detailRow(String icon, String label, String value, boolean mailLink) {
        String safeValue = multilineHtml(value);
        if (mailLink) {
            safeValue = "<a href=\"mailto:" + escapeHtml(value) + "\" style=\"color:#2563eb;text-decoration:none;font-weight:700;\">" + escapeHtml(value) + "</a>";
        }
        return "<div class=\"detail-row\" style=\"display:table;width:100%;box-sizing:border-box;padding:15px 18px;border-bottom:1px solid #edf1f6;\">"
                + "<div class=\"detail-label\" style=\"display:table-cell;width:42%;vertical-align:top;color:#52627a;font-size:15px;font-weight:700;\"><span style=\"display:inline-block;width:26px;color:#2563eb;\">" + icon + "</span>" + escapeHtml(label) + "</div>"
                + "<div class=\"detail-value\" style=\"display:table-cell;width:58%;vertical-align:top;text-align:right;color:#172033;font-size:15px;font-weight:700;line-height:1.55;word-break:break-word;\">" + safeValue + "</div>"
                + "</div>";
    }

    private static String buildAdminPlainText(ContactSubmission submission) {
        return "Novo povpraševanje po prilagoditvi\n\n"
                + "Ime: " + submission.name() + "\n"
                + "E-pošta: " + submission.email() + "\n"
                + "Telefon: " + displayPhone(submission, "sl") + "\n"
                + "Izbrani paket: " + planContext(submission, "sl") + "\n"
                + "Jezik obrazca: " + ("sl".equals(submission.locale()) ? "Slovenščina" : "English") + "\n\n"
                + "Sporočilo:\n" + submission.message() + "\n";
    }

    private static String buildConfirmationPlainText(ContactSubmission submission, ConfirmationCopy copy, String supportEmail) {
        return copy.title() + "\n\n"
                + copy.greeting() + " " + submission.name() + ",\n\n"
                + copy.receivedText() + "\n"
                + copy.contactText() + "\n\n"
                + copy.summaryTitle() + "\n"
                + copy.nameLabel() + ": " + submission.name() + "\n"
                + copy.emailLabel() + ": " + submission.email() + "\n"
                + copy.phoneLabel() + ": " + displayPhone(submission, submission.locale()) + "\n"
                + copy.messageLabel() + ":\n" + submission.message() + "\n\n"
                + copy.nextTitle() + "\n" + copy.nextText() + "\n"
                + copy.urgentText() + " " + supportEmail + ".\n\n"
                + copy.signoff() + "\n" + copy.teamName() + "\n";
    }

    private static ConfirmationCopy confirmationCopy(String locale) {
        if ("sl".equals(locale)) {
            return new ConfirmationCopy(
                    "Prejeli smo vaše sporočilo | Calendra",
                    "Hvala, ker ste nas kontaktirali. Oglasili se vam bomo v najkrajšem možnem času.",
                    "Sporočilo prejeto",
                    "Hvala za vaše sporočilo! 👋",
                    "Pozdravljeni",
                    "Vaše sporočilo smo uspešno prejeli in ga bomo pregledali v najkrajšem možnem času.",
                    "V kratkem vas bomo kontaktirali.",
                    "Lep pozdrav,",
                    "Calendra ekipa",
                    "Povzetek vašega sporočila",
                    "Ime",
                    "E-pošta",
                    "Telefon",
                    "Sporočilo",
                    "Ni navedeno",
                    "Kaj sledi?",
                    "Naša ekipa bo pregledala vaše sporočilo in se vam oglasila v najkrajšem možnem času, običajno v 1 delovnem dnevu.",
                    "Če je vaše vprašanje nujno, nas lahko kontaktirate na",
                    "To je informativno sporočilo platforme Calendra. Prosimo, ne odgovarjajte na to e-pošto."
            );
        }
        return new ConfirmationCopy(
                "We received your message | Calendra",
                "Thank you for contacting us. We will get back to you as soon as possible.",
                "Message received",
                "Thank you for your message! 👋",
                "Hello",
                "We have successfully received your message and will review it as soon as possible.",
                "We will be in touch shortly.",
                "Kind regards,",
                "Calendra team",
                "Summary of your message",
                "Name",
                "Email",
                "Phone",
                "Message",
                "Not provided",
                "What happens next?",
                "Our team will review your message and get back to you as soon as possible, usually within 1 business day.",
                "For urgent questions, you can contact us at",
                "This is an informational message from the Calendra platform. Please do not reply to this email."
        );
    }

    private static String planContext(ContactSubmission submission, String locale) {
        String plan = submission.planName();
        if (plan == null || plan.isBlank()) {
            plan = switch (submission.plan() == null ? "" : submission.plan().toLowerCase(Locale.ROOT)) {
                case "basic" -> "sl".equals(locale) ? "Osnovno" : "Basic";
                case "pro" -> "sl".equals(locale) ? "Profesionalno" : "Professional";
                case "business" -> "Premium";
                default -> "sl".equals(locale) ? "Ni navedeno" : "Not provided";
            };
        }
        String billing = switch (submission.billing() == null ? "" : submission.billing().toLowerCase(Locale.ROOT)) {
            case "annual" -> "sl".equals(locale) ? "letno obračunavanje" : "annual billing";
            case "monthly" -> "sl".equals(locale) ? "mesečno obračunavanje" : "monthly billing";
            default -> null;
        };
        String result = billing == null ? plan : plan + " · " + billing;
        if (submission.estimatedMonthlyTotal() != null) {
            result += " · €" + submission.estimatedMonthlyTotal().toPlainString() + ("sl".equals(locale) ? "/mes." : "/mo");
        }
        return result;
    }

    private static String displayPhone(ContactSubmission submission, String locale) {
        if (submission.phone() == null || submission.phone().isBlank()) {
            return "sl".equals(locale) ? "Ni navedeno" : "Not provided";
        }
        return submission.phone();
    }

    private static ResponseStatusException unavailable(String locale) {
        String message = "sl".equalsIgnoreCase(locale)
                ? "Sporočila trenutno ni mogoče poslati. Poskusite znova čez nekaj trenutkov."
                : "Your message could not be sent right now. Please try again in a moment.";
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, message);
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) return value.trim();
        }
        return "";
    }

    private static String cleanValue(String value) {
        return value == null ? "" : normalizeLineBreaks(value).trim();
    }

    private static String cleanOptional(String value) {
        String cleaned = cleanValue(value);
        return cleaned.isBlank() ? null : cleaned;
    }

    private static String cleanHeader(String value) {
        return cleanValue(value).replace('\r', ' ').replace('\n', ' ');
    }

    private static String normalizeLineBreaks(String value) {
        return value == null ? "" : value.replace("\r\n", "\n").replace('\r', '\n');
    }

    private static String multilineHtml(String value) {
        return escapeHtml(value == null ? "" : value).replace("\n", "<br>");
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
