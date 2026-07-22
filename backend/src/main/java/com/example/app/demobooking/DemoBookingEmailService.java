package com.example.app.demobooking;

import jakarta.mail.internet.MimeMessage;
import java.nio.charset.StandardCharsets;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

@Service
public class DemoBookingEmailService {
    private static final Logger log = LoggerFactory.getLogger(DemoBookingEmailService.class);

    private final JavaMailSender mailSender;
    private final boolean configured;
    private final String fromAddress;
    private final String publicSiteBaseUrl;

    public DemoBookingEmailService(
            @Autowired(required = false) JavaMailSender mailSender,
            @Value("${spring.mail.host:}") String mailHost,
            @Value("${spring.mail.username:}") String mailUsername,
            @Value("${app.mail.from:}") String appMailFrom,
            @Value("${app.demo-booking-public-base-url:https://calendra.si}") String publicSiteBaseUrl) {
        this.mailSender = mailSender;
        this.configured = mailSender != null && mailHost != null && !mailHost.isBlank();
        this.fromAddress = firstNonBlank(appMailFrom, mailUsername, "info@calendra.si");
        this.publicSiteBaseUrl = trimTrailingSlash(firstNonBlank(publicSiteBaseUrl, "https://calendra.si"));
    }

    public void sendCreated(DemoBooking booking, String locale) {
        sendGuest(booking, locale, "CREATED");
        sendHost(booking, "Nova rezervacija predstavitve Calendre");
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

    private void sendGuest(DemoBooking booking, String rawLocale, String kind) {
        if (!configured || mailSender == null) {
            log.warn("Demo-booking email skipped because mail is not configured. bookingId={}", booking.getId());
            return;
        }
        boolean sl = !"en".equalsIgnoreCase(rawLocale);
        String subject = switch (kind) {
            case "RESCHEDULED" -> sl ? "Vaša predstavitev Calendre je prestavljena" : "Your Calendra demo has been rescheduled";
            case "CANCELLED" -> sl ? "Vaša predstavitev Calendre je preklicana" : "Your Calendra demo has been cancelled";
            case "REMINDER_1H" -> sl ? "Opomnik: predstavitev Calendre čez 1 uro" : "Reminder: your Calendra demo starts in 1 hour";
            case "REMINDER_24H" -> sl ? "Opomnik: predstavitev Calendre jutri" : "Reminder: your Calendra demo is tomorrow";
            default -> sl ? "Vaša predstavitev Calendre je rezervirana" : "Your Calendra demo is booked";
        };
        String when = formatForGuest(booking, sl ? "sl" : "en");
        String manageUrl = publicSiteBaseUrl + (sl ? "/predstavitev/upravljanje/" : "/en/demo/manage/") + booking.getManageToken();
        String intro = switch (kind) {
            case "RESCHEDULED" -> sl ? "Termin predstavitve je bil uspešno prestavljen." : "Your demo has been successfully rescheduled.";
            case "CANCELLED" -> sl ? "Termin predstavitve je bil preklican." : "Your demo has been cancelled.";
            case "REMINDER_1H", "REMINDER_24H" -> sl ? "To je prijazen opomnik za vašo predstavitev Calendre." : "This is a friendly reminder about your Calendra demo.";
            default -> sl ? "Hvala za rezervacijo. Veselimo se pogovora z vami." : "Thank you for booking. We look forward to speaking with you.";
        };
        String joinButton = !"CANCELLED".equals(kind) && booking.getMeetingJoinUrl() != null && !booking.getMeetingJoinUrl().isBlank()
                ? button(booking.getMeetingJoinUrl(), sl ? "Pridruži se klicu" : "Join the call")
                : "";
        String manageButton = !"CANCELLED".equals(kind) ? button(manageUrl, sl ? "Prestavi ali prekliči termin" : "Reschedule or cancel") : "";
        String html = emailShell(
                "<h1 style=\"margin:0 0 14px;font-size:28px;color:#14213a\">" + escape(subject) + "</h1>"
                        + "<p style=\"margin:0 0 22px;color:#5f6d82;font-size:16px;line-height:1.6\">" + escape(intro) + "</p>"
                        + detailCard(sl ? "Podrobnosti klica" : "Call details", when, booking)
                        + joinButton + manageButton
                        + "<p style=\"margin:24px 0 0;color:#7b8798;font-size:13px;line-height:1.6\">" + (sl
                        ? "Klic traja " + java.time.Duration.between(booking.getStartAt(), booking.getEndAt()).toMinutes() + " minut. Povezava za video klic je namenjena samo udeležencem tega termina."
                        : "The call lasts " + java.time.Duration.between(booking.getStartAt(), booking.getEndAt()).toMinutes() + " minutes. The video link is intended only for participants of this appointment.") + "</p>");
        String plain = subject + "\n\n" + intro + "\n\n" + when
                + (booking.getMeetingJoinUrl() == null ? "" : "\n" + booking.getMeetingJoinUrl())
                + (!"CANCELLED".equals(kind) ? "\n\n" + manageUrl : "");
        send(booking.getGuestEmail(), subject, plain, html, booking.getHostUser().getEmail());
    }

    private void sendHost(DemoBooking booking, String subject) {
        if (!configured || mailSender == null || booking.getHostUser() == null) return;
        String when = formatForHost(booking);
        String html = emailShell(
                "<h1 style=\"margin:0 0 14px;font-size:28px;color:#14213a\">" + escape(subject) + "</h1>"
                        + detailCard("Podrobnosti", when, booking)
                        + (booking.getMeetingJoinUrl() == null ? "" : button(booking.getMeetingJoinUrl(), "Odpri video klic")));
        String plain = subject + "\n\n" + when + "\n" + booking.getGuestName() + "\n" + booking.getGuestEmail()
                + "\n" + booking.getCompanyName() + (booking.getMeetingJoinUrl() == null ? "" : "\n" + booking.getMeetingJoinUrl());
        send(booking.getHostUser().getEmail(), subject, plain, html, booking.getGuestEmail());
    }

    private void send(String to, String subject, String plain, String html, String replyTo) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, false, StandardCharsets.UTF_8.name());
            helper.setTo(to);
            helper.setFrom(fromAddress, "Calendra");
            if (replyTo != null && !replyTo.isBlank()) helper.setReplyTo(replyTo);
            helper.setSubject(subject.replaceAll("[\\r\\n]+", " "));
            helper.setText(plain, html);
            mailSender.send(message);
        } catch (Exception ex) {
            log.error("Could not send demo-booking email to {}: {}", to, ex.getMessage());
        }
    }

    private static String formatForGuest(DemoBooking booking, String locale) {
        ZoneId zone = safeZone(booking.getGuestTimeZone(), safeZone(booking.getProfile().getTimeZone(), ZoneId.of("Europe/Ljubljana")));
        ZonedDateTime start = booking.getStartAt().atZone(zone);
        ZonedDateTime end = booking.getEndAt().atZone(zone);
        Locale fmtLocale = "sl".equals(locale) ? Locale.forLanguageTag("sl-SI") : Locale.ENGLISH;
        DateTimeFormatter date = DateTimeFormatter.ofPattern("EEEE, d. MMMM yyyy", fmtLocale);
        DateTimeFormatter time = DateTimeFormatter.ofPattern("HH:mm", fmtLocale);
        return start.format(date) + ", " + start.format(time) + "–" + end.format(time) + " (" + zone.getId() + ")";
    }

    private static String formatForHost(DemoBooking booking) {
        ZoneId zone = safeZone(booking.getProfile().getTimeZone(), ZoneId.of("Europe/Ljubljana"));
        ZonedDateTime start = booking.getStartAt().atZone(zone);
        ZonedDateTime end = booking.getEndAt().atZone(zone);
        return start.format(DateTimeFormatter.ofPattern("dd. MM. yyyy HH:mm")) + "–" + end.format(DateTimeFormatter.ofPattern("HH:mm")) + " (" + zone.getId() + ")";
    }

    private static String detailCard(String title, String when, DemoBooking booking) {
        return "<div style=\"margin:0 0 22px;padding:20px;border:1px solid #dfe7f2;border-radius:16px;background:#f8fbff\">"
                + "<div style=\"font-weight:800;color:#17243b;margin-bottom:12px\">" + escape(title) + "</div>"
                + row("Datum in čas", when)
                + row("Ime", booking.getGuestName())
                + row("Podjetje", booking.getCompanyName())
                + row("E-pošta", booking.getGuestEmail())
                + (booking.getGuestPhone() == null || booking.getGuestPhone().isBlank() ? "" : row("Telefon", booking.getGuestPhone()))
                + (booking.getGuestNote() == null || booking.getGuestNote().isBlank() ? "" : row("Vprašanje", booking.getGuestNote()))
                + "</div>";
    }

    private static String row(String label, String value) {
        return "<div style=\"display:flex;gap:14px;margin-top:8px;font-size:14px;line-height:1.5\"><span style=\"min-width:100px;color:#7b8798\">"
                + escape(label) + "</span><strong style=\"color:#26364d\">" + escape(value) + "</strong></div>";
    }

    private static String button(String href, String label) {
        return "<p style=\"margin:14px 0 0\"><a href=\"" + escape(href) + "\" style=\"display:inline-block;padding:13px 20px;border-radius:12px;background:#1463df;color:#fff;text-decoration:none;font-weight:800\">" + escape(label) + "</a></p>";
    }

    private static String emailShell(String content) {
        return "<!doctype html><html><body style=\"margin:0;background:#f4f7fb;font-family:Arial,sans-serif\"><div style=\"max-width:640px;margin:0 auto;padding:28px 16px\"><div style=\"padding:28px;border:1px solid #e1e8f2;border-radius:20px;background:#fff\">"
                + content + "</div><p style=\"text-align:center;color:#99a4b5;font-size:12px\">Calendra · info@calendra.si</p></div></body></html>";
    }

    private static ZoneId safeZone(String raw, ZoneId fallback) {
        try { return raw == null || raw.isBlank() ? fallback : ZoneId.of(raw); }
        catch (Exception ignored) { return fallback; }
    }

    private static String escape(String value) {
        return String.valueOf(value == null ? "" : value)
                .replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) if (value != null && !value.isBlank()) return value.trim();
        return "";
    }

    private static String trimTrailingSlash(String value) { return value.replaceAll("/+$", ""); }
}
