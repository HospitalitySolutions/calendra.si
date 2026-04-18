package com.example.app.reminder;

import com.example.app.client.Client;
import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingRepository;
import com.example.app.user.User;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

@Service
public class ReminderService {
    private static final Logger log = LoggerFactory.getLogger(ReminderService.class);
    private static final DateTimeFormatter DATE_TIME_FORMAT = DateTimeFormatter.ofPattern("EEEE, MMM d 'at' HH:mm");
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Locale NOTIFY_LOCALE = Locale.forLanguageTag("sl-SI");
    private static final DateTimeFormatter TAG_DATE = DateTimeFormatter.ofPattern("d. M. yyyy").withLocale(NOTIFY_LOCALE);
    private static final DateTimeFormatter TAG_TIME = DateTimeFormatter.ofPattern("HH:mm");
    private static final DateTimeFormatter TAG_DATETIME_FULL = DateTimeFormatter.ofPattern("EEEE, d. M. yyyy 'ob' HH:mm").withLocale(NOTIFY_LOCALE);

    private final JavaMailSender mailSender;
    private final RestTemplate restTemplate = new RestTemplate();
    private final String mailFrom;
    private final String infobipBaseUrl;
    private final String infobipApiKey;
    private final String infobipSender;
    private final boolean mailConfigured;
    private final boolean smsConfigured;
    private final AppSettingRepository appSettings;
    private final CompanyRepository companies;
    private final SessionBookingRepository sessionBookings;
    private final String frontendBaseUrl;

    public ReminderService(
            @Autowired(required = false) JavaMailSender mailSender,
            @Value("${app.mail.from:}") String mailFrom,
            @Value("${app.auth.frontend-url:}") String frontendBaseUrl,
            @Value("${app.infobip.base-url:}") String infobipBaseUrl,
            @Value("${app.infobip.api-key:}") String infobipApiKey,
            @Value("${app.infobip.sender:}") String infobipSender,
            @Value("${spring.mail.host:}") String mailHost,
            @Value("${spring.mail.username:}") String mailUsername,
            AppSettingRepository appSettings,
            CompanyRepository companies,
            SessionBookingRepository sessionBookings
    ) {
        this.mailSender = mailSender;
        this.mailFrom = mailFrom != null ? mailFrom : "";
        this.frontendBaseUrl = normalizeBaseUrl(frontendBaseUrl != null ? frontendBaseUrl : "");
        this.infobipBaseUrl = infobipBaseUrl != null ? infobipBaseUrl.strip().replaceAll("/$", "") : "";
        this.infobipApiKey = infobipApiKey != null ? infobipApiKey : "";
        this.infobipSender = infobipSender != null ? infobipSender : "";
        this.mailConfigured = mailSender != null
                && mailHost != null && !mailHost.isBlank()
                && mailUsername != null && !mailUsername.isBlank();
        this.smsConfigured = !this.infobipBaseUrl.isBlank() && !this.infobipApiKey.isBlank() && !this.infobipSender.isBlank();
        this.appSettings = appSettings;
        this.companies = companies;
        this.sessionBookings = sessionBookings;
    }

    /**
     * Sends "before session" / "after session" template email+SMS when their send time falls in the current window.
     * Uses NOTIFICATION_SETTINGS_JSON offsets (minutes/hours/days) per company.
     */
    public void sendScheduledSessionTemplateNotifications(LocalDateTime now) {
        List<AppSetting> rows = appSettings.findAllByKey(SettingKey.NOTIFICATION_SETTINGS_JSON);
        final int windowMinutes = 3;
        for (AppSetting row : rows) {
            if (row.getCompany() == null || row.getValue() == null || row.getValue().isBlank()) {
                continue;
            }
            Long companyId = row.getCompany().getId();
            JsonNode root;
            try {
                root = JSON.readTree(row.getValue());
            } catch (Exception e) {
                log.warn("Invalid NOTIFICATION_SETTINGS_JSON for company {}: {}", companyId, e.getMessage());
                continue;
            }

            if (wantsBeforeSession(root)) {
                int off = scheduleOffsetMinutes(root, "beforeSession");
                LocalDateTime startFrom = now.plusMinutes(off);
                LocalDateTime startTo = now.plusMinutes(off + windowMinutes);
                List<SessionBooking> beforeList = sessionBookings.findNeedingBeforeSessionNotification(companyId, startFrom, startTo);
                for (SessionBooking b : beforeList) {
                    if (b.getClient() != null && b.getClient().isAnonymized()) {
                        b.setNotificationBeforeSentAt(now);
                        sessionBookings.save(b);
                        continue;
                    }
                    sendBeforeAfterEmail(b, NotificationKind.BEFORE_SESSION, root, null, null);
                    sendBeforeAfterSms(b, NotificationKind.BEFORE_SESSION, root);
                    b.setNotificationBeforeSentAt(now);
                    sessionBookings.save(b);
                }
            }

            if (wantsAfterSession(root)) {
                int off = scheduleOffsetMinutes(root, "afterSession");
                LocalDateTime endTo = now.minusMinutes(off);
                LocalDateTime endFrom = now.minusMinutes(off + windowMinutes);
                List<SessionBooking> afterList = sessionBookings.findNeedingAfterSessionNotification(companyId, endFrom, endTo);
                for (SessionBooking b : afterList) {
                    if (b.getClient() != null && b.getClient().isAnonymized()) {
                        b.setNotificationAfterSentAt(now);
                        sessionBookings.save(b);
                        continue;
                    }
                    sendBeforeAfterEmail(b, NotificationKind.AFTER_SESSION, root, null, null);
                    sendBeforeAfterSms(b, NotificationKind.AFTER_SESSION, root);
                    b.setNotificationAfterSentAt(now);
                    sessionBookings.save(b);
                }
            }
        }
    }

    private boolean wantsBeforeSession(JsonNode root) {
        return root.path("email").path("beforeSession").path("enabled").asBoolean(false)
                || root.path("sms").path("beforeSession").path("enabled").asBoolean(false);
    }

    private boolean wantsAfterSession(JsonNode root) {
        return root.path("email").path("afterSession").path("enabled").asBoolean(false)
                || root.path("sms").path("afterSession").path("enabled").asBoolean(false);
    }

    private void sendBeforeAfterEmail(
            SessionBooking booking,
            NotificationKind kind,
            JsonNode root,
            LocalDateTime originalStart,
            LocalDateTime originalEnd
    ) {
        Client client = booking.getClient();
        if (client == null || client.isAnonymized()) return;
        if (client.getEmail() == null || client.getEmail().isBlank() || !mailConfigured || mailSender == null) return;

        JsonNode node = root.path("email").path(kind.getJsonKey());
        if (!node.path("enabled").asBoolean(false)) {
            return;
        }
        String subject = node.path("subject").asText("");
        String bodyHtml = node.path("bodyHtml").asText("");
        if (subject.isBlank() && bodyHtml.isBlank()) {
            return;
        }
        Map<String, String> tokens = buildTemplateTokens(booking, originalStart, originalEnd);
        try {
            sendHtmlMail(client.getEmail().trim(), replaceTokens(subject, tokens), replaceTokens(bodyHtml, tokens));
            log.info("Sent {} scheduled booking email to {}", kind, client.getEmail());
        } catch (Exception e) {
            log.warn("Failed to send {} scheduled booking email: {}", kind, e.getMessage());
        }
    }

    private void sendBeforeAfterSms(SessionBooking booking, NotificationKind kind, JsonNode root) {
        Client client = booking.getClient();
        if (client == null || client.isAnonymized()) return;
        if (client.getPhone() == null || client.getPhone().isBlank() || !smsConfigured) return;

        JsonNode node = root.path("sms").path(kind.getJsonKey());
        if (!node.path("enabled").asBoolean(false)) {
            return;
        }
        String body = node.path("body").asText("");
        if (body.isBlank()) {
            return;
        }
        Long companyId = booking.getCompany().getId();
        Map<String, String> tokens = buildTemplateTokens(booking, null, null);
        String text = replaceTokens(body, tokens);
        try {
            sendInfobipSmsText(client.getPhone(), text, companyId);
            log.info("Sent {} scheduled booking SMS", kind);
        } catch (Exception e) {
            log.warn("Failed to send {} scheduled booking SMS: {}", kind, e.getMessage());
        }
    }

    private int scheduleOffsetMinutes(JsonNode root, String jsonKind) {
        int fromEmail = parseOffsetMinutes(root.path("email").path(jsonKind));
        if (fromEmail > 0) {
            return fromEmail;
        }
        int fromSms = parseOffsetMinutes(root.path("sms").path(jsonKind));
        if (fromSms > 0) {
            return fromSms;
        }
        return 60;
    }

    private static int parseOffsetMinutes(JsonNode node) {
        if (node == null || node.isMissingNode()) {
            return 0;
        }
        int v = node.path("offsetValue").asInt(0);
        if (v <= 0) {
            v = 1;
        }
        String u = node.path("offsetUnit").asText("hours").toLowerCase();
        return switch (u) {
            case "days" -> Math.min(v * 24 * 60, 365 * 24 * 60);
            case "minutes" -> Math.min(v, 365 * 24 * 60);
            default -> Math.min(v * 60, 365 * 24 * 60);
        };
    }

    public void sendReminders(SessionBooking booking) {
        Client client = booking.getClient();
        if (client == null || client.isAnonymized()) {
            return;
        }
        User consultant = booking.getConsultant();
        String clientName = (client.getFirstName() + " " + client.getLastName()).trim();
        String consultantName = consultant == null
                ? "Unassigned"
                : (consultant.getFirstName() + " " + consultant.getLastName()).trim();
        String startFormatted = booking.getStartTime().format(DATE_TIME_FORMAT);
        String typeName = booking.getType() != null ? booking.getType().getName() : "Session";

        if (client.getEmail() != null && !client.getEmail().isBlank() && mailConfigured) {
            try {
                sendEmail(client.getEmail(), clientName, consultantName, startFormatted, typeName);
            } catch (Exception e) {
                log.warn("Failed to send reminder email to {}: {}", client.getEmail(), e.getMessage());
            }
        }

        if (client.getPhone() != null && !client.getPhone().isBlank() && smsConfigured) {
            try {
                Long companyId = booking.getCompany() != null ? booking.getCompany().getId() : null;
                sendSms(client.getPhone(), clientName, consultantName, startFormatted, typeName, companyId);
            } catch (Exception e) {
                log.warn("Failed to send reminder SMS to {}: {}", client.getPhone(), e.getMessage());
            }
        } else if (client.getPhone() != null && !client.getPhone().isBlank() && !smsConfigured) {
            log.warn("SMS reminder skipped: Infobip not configured (set INFOBIP_BASE_URL, INFOBIP_API_KEY, INFOBIP_SENDER)");
        }
    }

    /** Sends new-session email only when the "New session" template is enabled in settings. */
    public void sendBookingConfirmation(SessionBooking booking) {
        sendBookingTemplateEmail(booking, NotificationKind.NEW_SESSION, null, null);
    }

    /** Sends change-session email when the template is enabled and the client has email. */
    public void sendSessionRescheduled(SessionBooking booking, LocalDateTime previousStart, LocalDateTime previousEnd) {
        sendBookingTemplateEmail(booking, NotificationKind.CHANGE_SESSION, previousStart, previousEnd);
    }

    /** Sends cancel-session email when the template is enabled (call before deleting the booking entity). */
    public void sendSessionCancelled(SessionBooking booking) {
        sendBookingTemplateEmail(booking, NotificationKind.CANCEL_SESSION, null, null);
    }

    private void sendBookingTemplateEmail(SessionBooking booking, NotificationKind kind,
            LocalDateTime originalStart, LocalDateTime originalEnd) {
        Client client = booking.getClient();
        if (client == null || client.isAnonymized()) {
            return;
        }
        if (client.getEmail() == null || client.getEmail().isBlank() || !mailConfigured || mailSender == null) {
            return;
        }

        Long companyId = booking.getCompany().getId();
        Optional<NotificationEmailTemplate> templateOpt = loadNotificationEmailTemplate(companyId, kind);
        if (templateOpt.isEmpty()) {
            log.debug("Skipping {} booking email for company {}: template disabled or not configured", kind, companyId);
            return;
        }
        NotificationEmailTemplate template = templateOpt.get();
        if (template.subject().isBlank() && template.bodyHtml().isBlank()) {
            log.debug("Skipping {} booking email for company {}: empty subject and body", kind, companyId);
            return;
        }

        Map<String, String> tokens = buildTemplateTokens(booking, originalStart, originalEnd);
        String subject = replaceTokens(template.subject(), tokens);
        String bodyHtml = replaceTokens(template.bodyHtml(), tokens);

        try {
            sendHtmlMail(client.getEmail().trim(), subject, bodyHtml);
            log.info("Sent {} booking email to {}", kind, client.getEmail());
        } catch (Exception e) {
            log.warn("Failed to send {} booking email to {}: {}", kind, client.getEmail(), e.getMessage());
        }
    }

    private Optional<NotificationEmailTemplate> loadNotificationEmailTemplate(Long companyId, NotificationKind kind) {
        String raw = appSettings.findByCompanyIdAndKey(companyId, SettingKey.NOTIFICATION_SETTINGS_JSON)
                .map(AppSetting::getValue)
                .orElse(null);
        if (raw == null || raw.isBlank()) {
            return Optional.empty();
        }
        try {
            JsonNode root = JSON.readTree(raw);
            JsonNode node = root.path("email").path(kind.getJsonKey());
            if (!node.path("enabled").asBoolean(false)) {
                return Optional.empty();
            }
            String subject = node.path("subject").asText("");
            String bodyHtml = node.path("bodyHtml").asText("");
            return Optional.of(new NotificationEmailTemplate(subject, bodyHtml));
        } catch (Exception e) {
            log.warn("Invalid NOTIFICATION_SETTINGS_JSON for company {}: {}", companyId, e.getMessage());
            return Optional.empty();
        }
    }

    private Map<String, String> buildTemplateTokens(SessionBooking booking,
            LocalDateTime originalStart, LocalDateTime originalEnd) {
        Map<String, String> m = new LinkedHashMap<>();
        Company company = booking.getCompany();
        Long companyId = company.getId();

        Client client = booking.getClient();
        m.put("{{companyName}}", settingOr(companyId, SettingKey.COMPANY_NAME, company.getName()));
        m.put("{{clientFirstName}}", nz(client.getFirstName()));
        m.put("{{clientLastName}}", nz(client.getLastName()));
        m.put("{{serviceName}}", booking.getType() != null ? nz(booking.getType().getName()) : "");
        m.put("{{serviceCategories}}", "");

        LocalDateTime start = booking.getStartTime();
        LocalDateTime end = booking.getEndTime();
        m.put("{{date}}", start.format(TAG_DATE));
        m.put("{{dayName}}", start.format(DateTimeFormatter.ofPattern("EEEE", NOTIFY_LOCALE)));
        m.put("{{year}}", String.valueOf(start.getYear()));
        m.put("{{time}}", start.format(TAG_TIME) + "–" + end.format(TAG_TIME));

        m.put("{{locationName}}", booking.getSpace() != null ? nz(booking.getSpace().getName()) : "");
        m.put("{{locationAddress}}", formatCompanyAddress(companyId));
        m.put("{{locationPhone}}", settingOr(companyId, SettingKey.COMPANY_TELEPHONE, ""));

        User consultant = booking.getConsultant();
        m.put("{{consultantName}}", consultant == null
                ? ""
                : (nz(consultant.getFirstName()) + " " + nz(consultant.getLastName())).trim());
        m.put("{{consultantPhone}}", consultant != null && consultant.getPhone() != null ? consultant.getPhone().trim() : "");

        m.put("{{rescheduleLink}}", buildRescheduleLink(company));

        if (originalStart != null) {
            LocalDateTime oEnd = originalEnd != null ? originalEnd : originalStart;
            m.put("{{originalAppointmentDateTime}}",
                    originalStart.format(TAG_DATETIME_FULL) + " – " + oEnd.format(TAG_TIME));
        } else {
            m.put("{{originalAppointmentDateTime}}", "");
        }

        return m;
    }

    private String formatCompanyAddress(Long companyId) {
        String line1 = settingOr(companyId, SettingKey.COMPANY_ADDRESS, "").strip();
        String pc = settingOr(companyId, SettingKey.COMPANY_POSTAL_CODE, "").strip();
        String city = settingOr(companyId, SettingKey.COMPANY_CITY, "").strip();
        StringBuilder sb = new StringBuilder();
        if (!line1.isEmpty()) {
            sb.append(line1);
        }
        if (!pc.isEmpty() || !city.isEmpty()) {
            if (sb.length() > 0) sb.append(", ");
            sb.append(pc);
            if (!pc.isEmpty() && !city.isEmpty()) sb.append(" ");
            sb.append(city);
        }
        return sb.toString();
    }

    private String buildRescheduleLink(Company company) {
        String code = company.getTenantCode();
        if (code == null || code.isBlank() || frontendBaseUrl.isBlank()) {
            return "";
        }
        return frontendBaseUrl + "/widget/" + code.strip();
    }

    private String settingOr(Long companyId, SettingKey key, String fallback) {
        return appSettings.findByCompanyIdAndKey(companyId, key)
                .map(AppSetting::getValue)
                .map(String::strip)
                .filter(s -> !s.isEmpty())
                .orElse(fallback != null ? fallback : "");
    }

    private static String nz(String s) {
        return s == null ? "" : s.strip();
    }

    private static String replaceTokens(String input, Map<String, String> tokens) {
        if (input == null || input.isEmpty()) {
            return "";
        }
        String out = input;
        for (Map.Entry<String, String> e : tokens.entrySet()) {
            out = out.replace(e.getKey(), e.getValue() != null ? e.getValue() : "");
        }
        return out;
    }

    private void sendHtmlMail(String to, String subject, String html) throws MessagingException {
        String safeSubject = subject == null || subject.isBlank() ? " " : subject;
        String safeBody = html == null || html.isBlank() ? " " : html;
        MimeMessage message = mailSender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(message, StandardCharsets.UTF_8.name());
        helper.setFrom(mailFrom);
        helper.setTo(to);
        helper.setSubject(safeSubject);
        helper.setText(safeBody, true);
        mailSender.send(message);
    }

    private static String normalizeBaseUrl(String url) {
        if (url == null || url.isBlank()) {
            return "";
        }
        String u = url.strip();
        while (u.endsWith("/")) {
            u = u.substring(0, u.length() - 1);
        }
        return u;
    }

    private enum NotificationKind {
        NEW_SESSION("newSession"),
        CHANGE_SESSION("changeSession"),
        CANCEL_SESSION("cancelSession"),
        BEFORE_SESSION("beforeSession"),
        AFTER_SESSION("afterSession");

        private final String jsonKey;

        NotificationKind(String jsonKey) {
            this.jsonKey = jsonKey;
        }

        String getJsonKey() {
            return jsonKey;
        }
    }

    private record NotificationEmailTemplate(String subject, String bodyHtml) {}

    private void sendEmail(String to, String clientName, String consultantName, String startFormatted, String typeName) throws MessagingException {
        if (mailSender == null) return;
        String subject = "Reminder: Your session is in 1 hour";
        String body = String.format("""
            Hello %s,

            This is a reminder that your %s session with %s is scheduled for %s.

            See you soon!
            """, clientName, typeName, consultantName, startFormatted);

        MimeMessage message = mailSender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(message, StandardCharsets.UTF_8.name());
        helper.setFrom(mailFrom);
        helper.setTo(to);
        helper.setSubject(subject);
        helper.setText(body, false);
        mailSender.send(message);
        log.info("Sent reminder email to {}", to);
    }

    private void sendSms(String to, String clientName, String consultantName, String startFormatted, String typeName, Long companyId) {
        String body = String.format("Reminder: Your %s session with %s is at %s. See you soon!", typeName, consultantName, startFormatted);
        if (body.length() > 160) {
            body = String.format("Reminder: Your session with %s is at %s.", consultantName, startFormatted);
        }
        sendInfobipSmsText(to, body, companyId);
    }

    /**
     * Normalizes MSISDN, posts to Infobip SMS API, and counts tenant SMS usage on success.
     */
    private void sendInfobipSmsText(String to, String body, Long companyId) {
        if (!smsConfigured) {
            return;
        }
        String text = body != null ? body : "";
        String toNormalized = to != null ? to.replaceAll("\\s+", "").replaceAll("^\\+", "") : "";
        if (toNormalized.isBlank()) {
            return;
        }

        String url = infobipBaseUrl + "/sms/3/messages";

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("Authorization", "App " + infobipApiKey);
        headers.set("Accept", "application/json");

        Map<String, Object> message = Map.of(
                "destinations", List.of(Map.of("to", toNormalized)),
                "sender", infobipSender,
                "content", Map.of("text", text)
        );
        Map<String, Object> payload = Map.of("messages", List.of(message));

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(payload, headers);
        ResponseEntity<String> response = restTemplate.postForEntity(url, entity, String.class);
        if (response.getStatusCode().is2xxSuccessful()) {
            log.info("Sent SMS to {}", toNormalized);
            if (companyId != null) {
                incrementTenantSmsSentCount(companyId);
            }
        } else {
            throw new RuntimeException("Infobip API returned " + response.getStatusCode());
        }
    }

    private void incrementTenantSmsSentCount(Long companyId) {
        try {
            Company company = companies.findById(companyId).orElse(null);
            if (company == null) {
                return;
            }
            AppSetting s = appSettings.findByCompanyIdAndKey(companyId, SettingKey.TENANCY_SMS_SENT_COUNT).orElseGet(() -> {
                AppSetting ns = new AppSetting();
                ns.setCompany(company);
                ns.setKey(SettingKey.TENANCY_SMS_SENT_COUNT.name());
                ns.setValue("0");
                return appSettings.save(ns);
            });
            String raw = s.getValue() == null ? "0" : s.getValue().trim();
            int n = Integer.parseInt(raw.isEmpty() ? "0" : raw);
            s.setValue(String.valueOf(n + 1));
            appSettings.save(s);
        } catch (Exception e) {
            log.warn("Failed to increment SMS sent count for company {}: {}", companyId, e.getMessage());
        }
    }

    public boolean isMailConfigured() {
        return mailConfigured;
    }

    public boolean isSmsConfigured() {
        return smsConfigured;
    }
}
