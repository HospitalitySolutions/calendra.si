package com.example.app.demobooking;

import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
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
public class DemoBookingEmailService {
    private static final Logger log = LoggerFactory.getLogger(DemoBookingEmailService.class);
    private static final String CALENDRA_LOGO_CONTENT_ID = "calendraDemoBookingLogo";
    private static final String CALENDRA_LOGO_CLASSPATH = "static/widget/calendra-transparent-logo.png";

    private final JavaMailSender mailSender;
    private final boolean configured;
    private final String fromAddress;
    private final String publicSiteBaseUrl;
    private final String managementBaseUrl;
    private final List<String> platformAdminRecipients;

    public DemoBookingEmailService(
            @Autowired(required = false) JavaMailSender mailSender,
            @Value("${spring.mail.host:}") String mailHost,
            @Value("${spring.mail.username:}") String mailUsername,
            @Value("${app.mail.from:}") String appMailFrom,
            @Value("${app.demo-booking-public-base-url:https://calendra.si}") String publicSiteBaseUrl,
            @Value("${app.demo-booking-management-base-url:${app.auth.frontend-url:https://app.calendra.si}}")
            String managementBaseUrl,
            @Value("${app.platform-admin-emails:info@calendra.si}") String configuredAdminRecipients) {
        this.mailSender = mailSender;
        this.configured = mailSender != null && mailHost != null && !mailHost.isBlank();
        this.fromAddress = firstNonBlank(appMailFrom, mailUsername, "info@calendra.si");
        this.publicSiteBaseUrl = trimTrailingSlash(firstNonBlank(publicSiteBaseUrl, "https://calendra.si"));
        this.managementBaseUrl = trimTrailingSlash(firstNonBlank(managementBaseUrl, "https://app.calendra.si"));
        this.platformAdminRecipients = parseRecipients(configuredAdminRecipients);
    }

    /**
     * Sends both booking-confirmation emails after the successful booking transaction commits:
     * one to the prospective client and one to the configured Calendra platform administrators.
     * The selected meeting host is also included in the internal notification recipients.
     */
    public void sendCreated(DemoBooking booking, String locale) {
        if (booking == null) return;
        Runnable delivery = () -> {
            sendCreatedGuest(booking, locale);
            sendCreatedAdmin(booking);
        };
        runAfterCommit(delivery);
    }

    public void sendRescheduled(DemoBooking booking, String locale) {
        sendGuest(booking, locale, "RESCHEDULED");
        sendHost(booking, "Predstavitev Calendre je prestavljena");
    }

    public void sendCancelled(DemoBooking booking, String locale) {
        sendGuest(booking, locale, "CANCELLED");
        sendHost(booking, "Predstavitev Calendre je preklicana");
    }

    public void sendReminder(DemoBooking booking, String locale, int hoursBefore) {
        sendGuest(booking, locale, hoursBefore <= 1 ? "REMINDER_1H" : "REMINDER_24H");
    }

    private void sendCreatedGuest(DemoBooking booking, String rawLocale) {
        boolean sl = !"en".equalsIgnoreCase(rawLocale);
        String meetingLabel = meetingLabel(booking);
        String subject = sl ? "Vaša predstavitev je potrjena" : "Your Calendra demo is confirmed";
        String firstName = firstName(booking.getGuestName());
        String greeting = sl ? "Pozdravljeni " + firstName + "," : "Hello " + firstName + ",";
        String when = formatForGuest(booking, sl ? "sl" : "en");
        String duration = Duration.between(booking.getStartAt(), booking.getEndAt()).toMinutes()
                + (sl ? " minut" : " minutes");
        String manageUrl = manageUrl(booking, sl);
        String calendarUrl = calendarUrl(booking, sl);

        StringBuilder content = new StringBuilder(12_000);
        content.append(badge(sl ? "Predstavitev rezervirana" : "Demo booked", true));
        content.append(title(sl ? "Vaša predstavitev je potrjena" : "Your demo is confirmed", "✓"));
        content.append(paragraph(escape(greeting), "0 0 12px"));
        content.append(paragraph(sl
                ? "Hvala za rezervacijo predstavitve Calendre. Vaš termin je uspešno potrjen."
                : "Thank you for booking a Calendra demo. Your appointment is confirmed.", "0 0 12px"));
        content.append(paragraph(sl
                ? "Za video klic uporabite spodnjo povezavo " + escape(meetingLabel) + ". Povezavo lahko odprete ob času sestanka ali jo shranite v svoj koledar."
                : "Use the " + escape(meetingLabel) + " link below for the video call. You can open it at the appointment time or save it to your calendar.", "0 0 24px"));

        if (hasText(booking.getMeetingJoinUrl())) {
            content.append(primaryButton(
                    booking.getMeetingJoinUrl(),
                    sl ? "Pridruži se " + meetingLabel + " klicu" : "Join the " + meetingLabel + " call",
                    "▸"));
        }

        content.append(sectionDivider());
        content.append(sectionTitle(sl ? "Podrobnosti rezervacije" : "Booking details"));
        List<DetailRow> rows = new ArrayList<>();
        rows.add(new DetailRow("▣", sl ? "Datum in ura" : "Date and time", escape(when)));
        rows.add(new DetailRow("◷", sl ? "Trajanje" : "Duration", escape(duration)));
        rows.add(new DetailRow("▹", sl ? "Platforma" : "Platform", escape(meetingLabel)));
        rows.add(new DetailRow("✉", sl ? "E-pošta" : "Email", mailtoValue(booking.getGuestEmail())));
        rows.add(new DetailRow("○", sl ? "Rezerviral/a" : "Booked by", escape(booking.getGuestName())));
        rows.add(new DetailRow("□", sl ? "Podjetje" : "Company", escape(booking.getCompanyName())));
        content.append(detailsTable(rows));
        content.append(secondaryButton(calendarUrl, sl ? "Dodaj v koledar" : "Add to calendar", "▣"));
        content.append(infoBox(
                sl ? "Pridružite se klicu nekaj minut prej." : "Join the call a few minutes early.",
                sl ? "Priporočamo, da se pridružite 2–3 minute pred začetkom, da zagotovimo nemoten začetek predstavitve."
                        : "We recommend joining 2–3 minutes before the start so the demo can begin smoothly."));
        content.append(paragraph(
                (sl ? "Termin lahko prestavite ali prekličete " : "You can reschedule or cancel the appointment ")
                        + "<a href=\"" + escape(manageUrl) + "\" style=\"color:#1769ea;text-decoration:none;font-weight:700\">"
                        + (sl ? "tukaj" : "here") + "</a>.",
                "24px 0 0"));

        String plain = subject + "\n\n" + greeting + "\n\n" + when + "\n" + duration + "\n" + meetingLabel
                + (hasText(booking.getMeetingJoinUrl()) ? "\n" + booking.getMeetingJoinUrl() : "")
                + "\n\n" + (sl ? "Upravljanje termina: " : "Manage appointment: ") + manageUrl;
        send(
                List.of(booking.getGuestEmail()),
                subject,
                plain,
                emailShell(content.toString(), subject),
                booking.getHostUser() == null ? null : booking.getHostUser().getEmail(),
                booking.getId(),
                "guest booking confirmation");
    }

    private void sendCreatedAdmin(DemoBooking booking) {
        Set<String> recipients = new LinkedHashSet<>(platformAdminRecipients);
        if (booking.getHostUser() != null && hasText(booking.getHostUser().getEmail())) {
            recipients.add(booking.getHostUser().getEmail().trim());
        }
        if (recipients.isEmpty()) {
            log.warn("Demo-booking platform-admin email skipped because no recipients are configured. bookingId={}", booking.getId());
            return;
        }

        String subject = "Nova predstavitev je rezervirana";
        String meetingLabel = meetingLabel(booking);
        String when = formatForHostLong(booking);
        String duration = Duration.between(booking.getStartAt(), booking.getEndAt()).toMinutes() + " minut";
        String calendarUrl = calendarUrl(booking, true);
        String bookingSource = publicSiteBaseUrl + "/predstavitev";

        StringBuilder content = new StringBuilder(12_000);
        content.append(badge("Nova rezervacija predstavitve", false));
        content.append(title("Nova predstavitev je rezervirana", "▣"));
        content.append(paragraph("Pozdravljeni,", "0 0 12px"));
        content.append(paragraph("Prospektivna stranka je rezervirala " + escape(duration)
                + " dolgo predstavitev Calendre. Ustvarjena povezava " + escape(meetingLabel)
                + " je na voljo spodaj.", "0 0 24px"));

        if (hasText(booking.getMeetingJoinUrl())) {
            content.append(primaryButton(booking.getMeetingJoinUrl(), "Odpri " + meetingLabel + " povezavo", "▸"));
        }

        content.append(sectionDivider());
        content.append(sectionTitle("Podrobnosti rezervacije"));
        List<DetailRow> rows = new ArrayList<>();
        rows.add(new DetailRow("▣", "Datum in ura", escape(when)));
        rows.add(new DetailRow("◷", "Trajanje", escape(duration)));
        rows.add(new DetailRow("▹", "Platforma", escape(meetingLabel)));
        rows.add(new DetailRow("○", "Ime kontakta", escape(booking.getGuestName())));
        rows.add(new DetailRow("✉", "E-pošta", mailtoValue(booking.getGuestEmail())));
        rows.add(new DetailRow("□", "Podjetje", escape(booking.getCompanyName())));
        if (hasText(booking.getGuestPhone())) {
            rows.add(new DetailRow("☎", "Telefon", telValue(booking.getGuestPhone())));
        }
        rows.add(new DetailRow("◇", "Vrsta srečanja", escape(Duration.between(booking.getStartAt(), booking.getEndAt()).toMinutes() + "-minutna predstavitev")));
        rows.add(new DetailRow("↗", "Vir", linkedValue(bookingSource, bookingSource)));
        if (hasText(booking.getGuestNote())) {
            rows.add(new DetailRow("…", "Vprašanje / opomba", escape(booking.getGuestNote())));
        }
        content.append(detailsTable(rows));
        content.append(secondaryButton(calendarUrl, "Dodaj v koledar", "▣"));
        content.append(infoBox(
                "Priporočilo: preverite prisotnost nekaj minut pred začetkom klica.",
                "Po potrebi pred klicem pripravite predstavitvene materiale in beležke."));

        String plain = subject + "\n\n" + when + "\n" + duration + "\n" + meetingLabel
                + "\n" + booking.getGuestName() + "\n" + booking.getGuestEmail() + "\n" + booking.getCompanyName()
                + (hasText(booking.getGuestPhone()) ? "\n" + booking.getGuestPhone() : "")
                + (hasText(booking.getGuestNote()) ? "\n\nOpomba: " + booking.getGuestNote() : "")
                + (hasText(booking.getMeetingJoinUrl()) ? "\n\n" + booking.getMeetingJoinUrl() : "");
        send(
                recipients,
                subject,
                plain,
                emailShell(content.toString(), subject),
                booking.getGuestEmail(),
                booking.getId(),
                "platform-admin booking notification");
    }

    private void sendGuest(DemoBooking booking, String rawLocale, String kind) {
        if (booking == null) return;
        boolean sl = !"en".equalsIgnoreCase(rawLocale);
        String subject = switch (kind) {
            case "RESCHEDULED" -> sl ? "Vaša predstavitev Calendre je prestavljena" : "Your Calendra demo has been rescheduled";
            case "CANCELLED" -> sl ? "Vaša predstavitev Calendre je preklicana" : "Your Calendra demo has been cancelled";
            case "REMINDER_1H" -> sl ? "Opomnik: predstavitev Calendre čez 1 uro" : "Reminder: your Calendra demo starts in 1 hour";
            case "REMINDER_24H" -> sl ? "Opomnik: predstavitev Calendre jutri" : "Reminder: your Calendra demo is tomorrow";
            default -> sl ? "Vaša predstavitev Calendre je rezervirana" : "Your Calendra demo is booked";
        };
        String when = formatForGuest(booking, sl ? "sl" : "en");
        String manageUrl = manageUrl(booking, sl);
        String intro = switch (kind) {
            case "RESCHEDULED" -> sl ? "Termin predstavitve je bil uspešno prestavljen." : "Your demo has been successfully rescheduled.";
            case "CANCELLED" -> sl ? "Termin predstavitve je bil preklican." : "Your demo has been cancelled.";
            case "REMINDER_1H", "REMINDER_24H" -> sl ? "To je prijazen opomnik za vašo predstavitev Calendre." : "This is a friendly reminder about your Calendra demo.";
            default -> sl ? "Hvala za rezervacijo. Veselimo se pogovora z vami." : "Thank you for booking. We look forward to speaking with you.";
        };
        String joinButton = !"CANCELLED".equals(kind) && hasText(booking.getMeetingJoinUrl())
                ? primaryButton(booking.getMeetingJoinUrl(), sl ? "Pridruži se klicu" : "Join the call", "▸")
                : "";
        String manageButton = !"CANCELLED".equals(kind)
                ? secondaryButton(manageUrl, sl ? "Prestavi ali prekliči termin" : "Reschedule or cancel", "")
                : "";
        String html = emailShell(
                title(subject, "")
                        + paragraph(escape(intro), "0 0 22px")
                        + legacyDetailCard(sl ? "Podrobnosti klica" : "Call details", when, booking)
                        + joinButton + manageButton
                        + paragraph(sl
                        ? "Klic traja " + Duration.between(booking.getStartAt(), booking.getEndAt()).toMinutes() + " minut. Povezava za video klic je namenjena samo udeležencem tega termina."
                        : "The call lasts " + Duration.between(booking.getStartAt(), booking.getEndAt()).toMinutes() + " minutes. The video link is intended only for participants of this appointment.", "24px 0 0"),
                subject);
        String plain = subject + "\n\n" + intro + "\n\n" + when
                + (hasText(booking.getMeetingJoinUrl()) ? "\n" + booking.getMeetingJoinUrl() : "")
                + (!"CANCELLED".equals(kind) ? "\n\n" + manageUrl : "");
        send(List.of(booking.getGuestEmail()), subject, plain, html,
                booking.getHostUser() == null ? null : booking.getHostUser().getEmail(),
                booking.getId(), "guest booking update");
    }

    private void sendHost(DemoBooking booking, String subject) {
        if (booking == null || booking.getHostUser() == null || !hasText(booking.getHostUser().getEmail())) return;
        String when = formatForHost(booking);
        String html = emailShell(
                title(subject, "")
                        + legacyDetailCard("Podrobnosti", when, booking)
                        + (hasText(booking.getMeetingJoinUrl())
                        ? primaryButton(booking.getMeetingJoinUrl(), "Odpri video klic", "▸") : ""),
                subject);
        String plain = subject + "\n\n" + when + "\n" + booking.getGuestName() + "\n" + booking.getGuestEmail()
                + "\n" + booking.getCompanyName() + (hasText(booking.getMeetingJoinUrl()) ? "\n" + booking.getMeetingJoinUrl() : "");
        send(List.of(booking.getHostUser().getEmail()), subject, plain, html, booking.getGuestEmail(), booking.getId(), "host booking update");
    }

    private void send(
            Collection<String> rawRecipients,
            String subject,
            String plain,
            String html,
            String replyTo,
            Long bookingId,
            String emailType) {
        List<String> recipients = normalizeRecipients(rawRecipients);
        if (recipients.isEmpty()) {
            log.warn("Demo-booking {} skipped because no valid recipients were provided. bookingId={}", emailType, bookingId);
            return;
        }
        if (!configured || mailSender == null) {
            log.warn("Demo-booking {} skipped because mail is not configured. bookingId={}", emailType, bookingId);
            return;
        }
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, StandardCharsets.UTF_8.name());
            helper.setTo(recipients.toArray(String[]::new));
            helper.setFrom(new InternetAddress(fromAddress, "Calendra", StandardCharsets.UTF_8.name()));
            if (hasText(replyTo)) helper.setReplyTo(replyTo.trim());
            helper.setSubject(sanitizeSubject(subject));
            helper.setText(plain, html);
            helper.addInline(
                    CALENDRA_LOGO_CONTENT_ID,
                    new ClassPathResource(CALENDRA_LOGO_CLASSPATH),
                    "image/png");
            mailSender.send(message);
            log.info("Demo-booking {} sent to {} recipient(s). bookingId={}", emailType, recipients.size(), bookingId);
        } catch (Exception ex) {
            log.error("Could not send demo-booking {}. bookingId={}, recipients={}, error={}",
                    emailType, bookingId, recipients.size(), ex.getMessage());
        }
    }

    private static void runAfterCommit(Runnable delivery) {
        if (TransactionSynchronizationManager.isActualTransactionActive()
                && TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    delivery.run();
                }
            });
            return;
        }
        delivery.run();
    }

    private static String formatForGuest(DemoBooking booking, String locale) {
        ZoneId zone = safeZone(booking.getGuestTimeZone(), safeZone(booking.getProfile().getTimeZone(), ZoneId.of("Europe/Ljubljana")));
        ZonedDateTime start = booking.getStartAt().atZone(zone);
        ZonedDateTime end = booking.getEndAt().atZone(zone);
        Locale fmtLocale = "sl".equals(locale) ? Locale.forLanguageTag("sl-SI") : Locale.ENGLISH;
        DateTimeFormatter date = DateTimeFormatter.ofPattern("EEEE, d. MMMM yyyy", fmtLocale);
        DateTimeFormatter time = DateTimeFormatter.ofPattern("HH:mm", fmtLocale);
        return start.format(date) + ("sl".equals(locale) ? " ob " : ", ") + start.format(time) + "–" + end.format(time) + " (" + zone.getId() + ")";
    }

    private static String formatForHost(DemoBooking booking) {
        ZoneId zone = safeZone(booking.getProfile().getTimeZone(), ZoneId.of("Europe/Ljubljana"));
        ZonedDateTime start = booking.getStartAt().atZone(zone);
        ZonedDateTime end = booking.getEndAt().atZone(zone);
        return start.format(DateTimeFormatter.ofPattern("dd. MM. yyyy HH:mm")) + "–"
                + end.format(DateTimeFormatter.ofPattern("HH:mm")) + " (" + zone.getId() + ")";
    }

    private static String formatForHostLong(DemoBooking booking) {
        ZoneId zone = safeZone(booking.getProfile().getTimeZone(), ZoneId.of("Europe/Ljubljana"));
        ZonedDateTime start = booking.getStartAt().atZone(zone);
        Locale locale = Locale.forLanguageTag("sl-SI");
        return start.format(DateTimeFormatter.ofPattern("EEEE, d. MMMM yyyy 'ob' HH:mm", locale))
                + " (" + zone.getId() + ")";
    }

    private String manageUrl(DemoBooking booking, boolean sl) {
        return managementBaseUrl
                + (sl ? "/predstavitev/upravljanje/" : "/en/demo/manage/")
                + booking.getManageToken();
    }

    private static String calendarUrl(DemoBooking booking, boolean sl) {
        String title = sl ? "Predstavitev Calendre" : "Calendra demo";
        String meetingLabel = meetingLabel(booking);
        String details = (sl ? "Rezervirana predstavitev Calendre" : "Booked Calendra demo")
                + "\n" + booking.getGuestName() + " · " + booking.getCompanyName()
                + (hasText(booking.getMeetingJoinUrl()) ? "\n" + meetingLabel + ": " + booking.getMeetingJoinUrl() : "");
        String start = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'")
                .withZone(ZoneOffset.UTC).format(booking.getStartAt());
        String end = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'")
                .withZone(ZoneOffset.UTC).format(booking.getEndAt());
        return "https://calendar.google.com/calendar/render?action=TEMPLATE"
                + "&text=" + urlEncode(title)
                + "&dates=" + start + "/" + end
                + "&details=" + urlEncode(details)
                + (hasText(booking.getMeetingJoinUrl()) ? "&location=" + urlEncode(booking.getMeetingJoinUrl()) : "");
    }

    private static String legacyDetailCard(String title, String when, DemoBooking booking) {
        return "<div style=\"margin:0 0 22px;padding:20px;border:1px solid #dfe7f2;border-radius:16px;background:#f8fbff\">"
                + "<div style=\"font-weight:800;color:#17243b;margin-bottom:12px\">" + escape(title) + "</div>"
                + legacyRow("Datum in čas", when)
                + legacyRow("Ime", booking.getGuestName())
                + legacyRow("Podjetje", booking.getCompanyName())
                + legacyRow("E-pošta", booking.getGuestEmail())
                + (!hasText(booking.getGuestPhone()) ? "" : legacyRow("Telefon", booking.getGuestPhone()))
                + (!hasText(booking.getGuestNote()) ? "" : legacyRow("Vprašanje", booking.getGuestNote()))
                + "</div>";
    }

    private static String legacyRow(String label, String value) {
        return "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"border-collapse:collapse;margin-top:8px\"><tr>"
                + "<td style=\"width:120px;color:#7b8798;font-size:14px;line-height:1.5\">" + escape(label) + "</td>"
                + "<td style=\"color:#26364d;font-size:14px;line-height:1.5;font-weight:700\">" + escape(value) + "</td>"
                + "</tr></table>";
    }

    private static String emailShell(String content, String previewText) {
        return "<!doctype html><html><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1.0\">"
                + "<meta name=\"color-scheme\" content=\"light\"><meta name=\"supported-color-schemes\" content=\"light\">"
                + "<style>@media only screen and (max-width:640px){.email-shell{padding:14px 8px!important}.email-card{border-radius:18px!important}.email-content{padding:26px 20px!important}.email-logo{width:170px!important;max-width:75%!important}.email-title{font-size:28px!important}.detail-label,.detail-value{display:block!important;width:100%!important;text-align:left!important}.detail-value{padding-top:5px!important}.detail-icon{vertical-align:top!important}}</style>"
                + "</head><body style=\"margin:0;padding:0;background:#f4f7fb;font-family:Arial,'Helvetica Neue',sans-serif;color:#0f172a;-webkit-font-smoothing:antialiased\">"
                + "<div style=\"display:none;max-height:0;overflow:hidden;opacity:0;color:transparent\">" + escape(previewText) + "</div>"
                + "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"width:100%;background:#f4f7fb;border-collapse:collapse\"><tr><td align=\"center\" class=\"email-shell\" style=\"padding:34px 16px\">"
                + "<table role=\"presentation\" width=\"640\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" class=\"email-card\" style=\"width:100%;max-width:640px;background:#fff;border:1px solid #e3eaf4;border-radius:24px;border-collapse:separate;box-shadow:0 18px 44px rgba(15,23,42,.08);overflow:hidden\">"
                + "<tr><td class=\"email-content\" style=\"padding:34px 34px 28px\">"
                + "<img src=\"cid:" + CALENDRA_LOGO_CONTENT_ID + "\" width=\"190\" alt=\"Calendra\" class=\"email-logo\" style=\"display:block;width:190px;max-width:65%;height:auto;border:0;margin:0 0 20px\">"
                + content
                + "<div style=\"height:1px;background:#e8eef6;margin:28px 0 18px\"></div>"
                + "<p style=\"margin:0;color:#9aa6b8;font-size:12px;line-height:1.6\">To je informativno sporočilo platforme Calendra.</p>"
                + "</td></tr></table></td></tr></table></body></html>";
    }

    private static String badge(String text, boolean success) {
        String background = success ? "#e8f8f0" : "#eef5ff";
        String color = success ? "#159a66" : "#1769ea";
        return "<div style=\"margin:0 0 16px\"><span style=\"display:inline-block;background:" + background
                + ";color:" + color + ";border-radius:999px;padding:7px 12px;font-size:12px;line-height:16px;font-weight:800\">"
                + escape(text) + "</span></div>";
    }

    private static String title(String text, String icon) {
        return "<h1 class=\"email-title\" style=\"margin:0 0 18px;font-size:34px;line-height:1.18;letter-spacing:-.6px;color:#0f172a;font-weight:800\">"
                + escape(text) + (hasText(icon) ? " <span style=\"color:#1769ea;white-space:nowrap\">" + escape(icon) + "</span>" : "")
                + "</h1>";
    }

    private static String paragraph(String html, String margin) {
        return "<p style=\"margin:" + margin + ";color:#58677e;font-size:16px;line-height:1.65\">" + html + "</p>";
    }

    private static String primaryButton(String href, String label, String icon) {
        return "<table role=\"presentation\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"margin:0 0 8px\"><tr><td style=\"border-radius:14px;background:#1769ea;box-shadow:0 8px 18px rgba(23,105,234,.20)\">"
                + "<a href=\"" + escape(href) + "\" style=\"display:inline-block;padding:15px 22px;color:#fff;text-decoration:none;font-size:16px;line-height:20px;font-weight:800\">"
                + (hasText(icon) ? "<span style=\"padding-right:9px\">" + escape(icon) + "</span>" : "") + escape(label) + " &rsaquo;</a>"
                + "</td></tr></table>";
    }

    private static String secondaryButton(String href, String label, String icon) {
        return "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"margin:18px 0 0\"><tr><td align=\"center\" style=\"border:1px solid #2b78f3;border-radius:13px\">"
                + "<a href=\"" + escape(href) + "\" style=\"display:block;padding:13px 18px;color:#1769ea;text-decoration:none;font-size:15px;line-height:20px;font-weight:800\">"
                + (hasText(icon) ? "<span style=\"padding-right:8px\">" + escape(icon) + "</span>" : "") + escape(label) + "</a>"
                + "</td></tr></table>";
    }

    private static String sectionDivider() {
        return "<div style=\"height:1px;background:#e8eef6;margin:28px 0 24px\"></div>";
    }

    private static String sectionTitle(String text) {
        return "<h2 style=\"margin:0 0 14px;color:#111827;font-size:20px;line-height:1.3;font-weight:800\">" + escape(text) + "</h2>";
    }

    private static String detailsTable(List<DetailRow> rows) {
        StringBuilder html = new StringBuilder(5_000);
        html.append("<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"width:100%;border:1px solid #dfe7f2;border-radius:16px;border-collapse:separate;overflow:hidden\">");
        for (int index = 0; index < rows.size(); index++) {
            DetailRow row = rows.get(index);
            String border = index == 0 ? "" : "border-top:1px solid #e7edf5;";
            html.append("<tr><td class=\"detail-icon\" width=\"42\" style=\"").append(border)
                    .append("padding:13px 0 13px 14px;color:#1769ea;font-size:17px;vertical-align:middle\">")
                    .append(escape(row.icon())).append("</td>")
                    .append("<td class=\"detail-label\" width=\"43%\" style=\"").append(border)
                    .append("padding:13px 12px;color:#4d5c73;font-size:14px;line-height:1.45;font-weight:700;vertical-align:middle\">")
                    .append(escape(row.label())).append("</td>")
                    .append("<td class=\"detail-value\" align=\"right\" style=\"").append(border)
                    .append("padding:13px 16px 13px 8px;color:#101827;font-size:14px;line-height:1.45;font-weight:800;vertical-align:middle;word-break:break-word\">")
                    .append(row.valueHtml()).append("</td></tr>");
        }
        html.append("</table>");
        return html.toString();
    }

    private static String infoBox(String title, String text) {
        return "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"width:100%;margin:20px 0 0;background:#f0f6ff;border-radius:14px;border-collapse:separate\"><tr>"
                + "<td width=\"46\" style=\"padding:16px 0 16px 16px;color:#1769ea;font-size:22px;vertical-align:top\">ⓘ</td>"
                + "<td style=\"padding:16px 16px 16px 8px;color:#5c6b81;font-size:14px;line-height:1.55\"><strong style=\"display:block;color:#1e293b;margin-bottom:2px\">"
                + escape(title) + "</strong>" + escape(text) + "</td></tr></table>";
    }

    private static String mailtoValue(String email) {
        String safe = escape(email);
        return "<a href=\"mailto:" + safe + "\" style=\"color:#1769ea;text-decoration:none\">" + safe + "</a>";
    }

    private static String telValue(String phone) {
        String safe = escape(phone);
        return "<a href=\"tel:" + safe + "\" style=\"color:#1769ea;text-decoration:none\">" + safe + "</a>";
    }

    private static String linkedValue(String href, String label) {
        return "<a href=\"" + escape(href) + "\" style=\"color:#1769ea;text-decoration:none\">" + escape(label) + "</a>";
    }

    private static String meetingLabel(DemoBooking booking) {
        return "ZOOM".equalsIgnoreCase(booking.getMeetingProvider()) ? "Zoom" : "Google Meet";
    }

    private static String firstName(String fullName) {
        String value = fullName == null ? "" : fullName.trim();
        if (value.isBlank()) return "";
        int separator = value.indexOf(' ');
        return separator < 0 ? value : value.substring(0, separator);
    }

    private static String sanitizeSubject(String subject) {
        return String.valueOf(subject == null ? "" : subject).replaceAll("[\\r\\n]+", " ").trim();
    }

    private static List<String> parseRecipients(String raw) {
        if (!hasText(raw)) return List.of();
        String[] parts = raw.split("[,;\\s]+");
        Set<String> unique = new LinkedHashSet<>();
        for (String part : parts) {
            if (hasText(part)) unique.add(part.trim());
        }
        return List.copyOf(unique);
    }

    private static List<String> normalizeRecipients(Collection<String> recipients) {
        if (recipients == null || recipients.isEmpty()) return List.of();
        Set<String> normalized = new LinkedHashSet<>();
        for (String recipient : recipients) {
            if (!hasText(recipient)) continue;
            String value = recipient.trim();
            try {
                InternetAddress address = new InternetAddress(value);
                address.validate();
                normalized.add(value);
            } catch (Exception ignored) {
                // Invalid recipient is skipped; the remaining valid recipients are still sent.
            }
        }
        return List.copyOf(normalized);
    }

    private static String urlEncode(String value) {
        return URLEncoder.encode(String.valueOf(value == null ? "" : value), StandardCharsets.UTF_8);
    }

    private static ZoneId safeZone(String raw, ZoneId fallback) {
        try {
            return raw == null || raw.isBlank() ? fallback : ZoneId.of(raw);
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private static String escape(String value) {
        return String.valueOf(value == null ? "" : value)
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;");
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) return value.trim();
        }
        return "";
    }

    private static String trimTrailingSlash(String value) {
        return value.replaceAll("/+$", "");
    }

    private record DetailRow(String icon, String label, String valueHtml) {
    }
}
