package com.example.app.reminder;

import com.example.app.client.Client;
import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.delivery.MessageDeliveryChannel;
import com.example.app.delivery.MessageDeliveryLogService;
import com.example.app.guest.model.GuestNotification;
import com.example.app.guest.model.GuestNotificationType;
import com.example.app.guest.notifications.GuestNotificationService;
import com.example.app.guest.notifications.GuestPushService;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingRepository;
import com.example.app.sms.SmsGateway;
import com.example.app.user.User;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

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
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Locale NOTIFY_LOCALE = Locale.forLanguageTag("sl-SI");
    private static final DateTimeFormatter TAG_DATE = DateTimeFormatter.ofPattern("d. M. yyyy").withLocale(NOTIFY_LOCALE);
    private static final DateTimeFormatter TAG_TIME = DateTimeFormatter.ofPattern("HH:mm");
    private static final DateTimeFormatter TAG_DATETIME_FULL = DateTimeFormatter.ofPattern("EEEE, d. M. yyyy 'ob' HH:mm").withLocale(NOTIFY_LOCALE);

    private final JavaMailSender mailSender;
    private final String mailFrom;
    private final boolean mailConfigured;
    private final boolean smsConfigured;
    private final SmsGateway smsGateway;
    private final AppSettingRepository appSettings;
    private final CompanyRepository companies;
    private final SessionBookingRepository sessionBookings;
    private final GuestNotificationService guestNotifications;
    private final GuestPushService guestPushService;
    private final String frontendBaseUrl;

    @Autowired(required = false)
    private MessageDeliveryLogService deliveryLogs;

    public ReminderService(
            @Autowired(required = false) JavaMailSender mailSender,
            @Value("${app.mail.from:}") String mailFrom,
            @Value("${app.auth.frontend-url:}") String frontendBaseUrl,
            @Value("${spring.mail.host:}") String mailHost,
            @Value("${spring.mail.username:}") String mailUsername,
            AppSettingRepository appSettings,
            CompanyRepository companies,
            SessionBookingRepository sessionBookings,
            SmsGateway smsGateway,
            GuestNotificationService guestNotifications,
            GuestPushService guestPushService
    ) {
        this.mailSender = mailSender;
        this.mailFrom = mailFrom != null ? mailFrom : "";
        this.frontendBaseUrl = normalizeBaseUrl(frontendBaseUrl != null ? frontendBaseUrl : "");
        this.mailConfigured = mailSender != null
                && mailHost != null && !mailHost.isBlank()
                && mailUsername != null && !mailUsername.isBlank();
        this.smsGateway = smsGateway;
        this.smsConfigured = smsGateway != null && smsGateway.isConfigured();
        this.appSettings = appSettings;
        this.companies = companies;
        this.sessionBookings = sessionBookings;
        this.guestNotifications = guestNotifications;
        this.guestPushService = guestPushService;
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

            if (wantsBeforeSession(companyId, root)) {
                int off = scheduleOffsetMinutes(companyId, root, "beforeSession");
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
                    sendBeforeAfterGuestApp(b, NotificationKind.BEFORE_SESSION, root);
                    b.setNotificationBeforeSentAt(now);
                    sessionBookings.save(b);
                }
            }

            if (wantsAfterSession(companyId, root)) {
                int off = scheduleOffsetMinutes(companyId, root, "afterSession");
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
                    sendBeforeAfterGuestApp(b, NotificationKind.AFTER_SESSION, root);
                    b.setNotificationAfterSentAt(now);
                    sessionBookings.save(b);
                }
            }
        }
    }

    private boolean wantsBeforeSession(Long companyId, JsonNode root) {
        return channelTemplateEnabled(companyId, root, "email", "beforeSession")
                || channelTemplateEnabled(companyId, root, "sms", "beforeSession")
                || channelTemplateEnabled(companyId, root, "guestApp", "beforeSession");
    }

    private boolean wantsAfterSession(Long companyId, JsonNode root) {
        return channelTemplateEnabled(companyId, root, "email", "afterSession")
                || channelTemplateEnabled(companyId, root, "sms", "afterSession")
                || channelTemplateEnabled(companyId, root, "guestApp", "afterSession");
    }

    private boolean channelTemplateEnabled(Long companyId, JsonNode root, String channel, String jsonKind) {
        boolean channelEnabled = switch (channel) {
            case "email" -> isEmailChannelEnabled(companyId);
            case "sms" -> isSmsChannelEnabled(companyId);
            case "guestApp" -> isGuestAppChannelEnabled(companyId);
            default -> false;
        };
        return channelEnabled && root.path(channel).path(jsonKind).path("enabled").asBoolean(false);
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
        Long companyId = booking.getCompany() == null ? null : booking.getCompany().getId();
        if (!isEmailChannelEnabled(companyId)) return;
        if (client.getEmail() == null || client.getEmail().isBlank() || !mailConfigured || mailSender == null) return;

        JsonNode node = notificationNode(root, "email", kind);
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
            String renderedSubject = replaceTokens(subject, tokens);
            String renderedBody = replaceTokens(bodyHtml, tokens);
            sendHtmlMail(client.getEmail().trim(), renderedSubject, renderedBody);
            logBookingDeliverySent(booking, client, MessageDeliveryChannel.EMAIL, kind, client.getEmail(), renderedSubject, renderedBody);
            log.info("Sent {} scheduled booking email to {}", kind, client.getEmail());
        } catch (Exception e) {
            logBookingDeliveryFailed(booking, client, MessageDeliveryChannel.EMAIL, kind, client.getEmail(), subject, e.getMessage());
            log.warn("Failed to send {} scheduled booking email: {}", kind, e.getMessage());
        }
    }

    private void sendBeforeAfterSms(SessionBooking booking, NotificationKind kind, JsonNode root) {
        Client client = booking.getClient();
        if (client == null || client.isAnonymized()) return;
        Long companyId = booking.getCompany() == null ? null : booking.getCompany().getId();
        if (!isSmsChannelEnabled(companyId)) return;
        if (client.getPhone() == null || client.getPhone().isBlank() || !smsConfigured) return;

        JsonNode node = notificationNode(root, "sms", kind);
        if (!node.path("enabled").asBoolean(false)) {
            return;
        }
        String body = node.path("body").asText("");
        if (body.isBlank()) {
            return;
        }
        Map<String, String> tokens = buildTemplateTokens(booking, null, null);
        String text = replaceTokens(body, tokens);
        try {
            sendSmsViaGateway(client.getPhone(), text, companyId, buildCustomId(booking, kind));
            logBookingDeliverySent(booking, client, MessageDeliveryChannel.SMS, kind, client.getPhone(), smsSubject(kind), text);
            log.info("Sent {} scheduled booking SMS", kind);
        } catch (Exception e) {
            logBookingDeliveryFailed(booking, client, MessageDeliveryChannel.SMS, kind, client.getPhone(), smsSubject(kind), e.getMessage());
            log.warn("Failed to send {} scheduled booking SMS: {}", kind, e.getMessage());
        }
    }

    private int scheduleOffsetMinutes(Long companyId, JsonNode root, String jsonKind) {
        int fromEmail = isEmailChannelEnabled(companyId)
                ? parseOffsetMinutes(root.path("email").path(jsonKind))
                : 0;
        if (fromEmail > 0) {
            return fromEmail;
        }
        int fromSms = isSmsChannelEnabled(companyId)
                ? parseOffsetMinutes(root.path("sms").path(jsonKind))
                : 0;
        if (fromSms > 0) {
            return fromSms;
        }
        int fromGuestApp = isGuestAppChannelEnabled(companyId)
                ? parseOffsetMinutes(root.path("guestApp").path(jsonKind))
                : 0;
        if (fromGuestApp > 0) {
            return fromGuestApp;
        }
        return 60;
    }

    private void sendBeforeAfterGuestApp(SessionBooking booking, NotificationKind kind, JsonNode root) {
        Client client = booking.getClient();
        if (client == null || client.isAnonymized()) return;
        Long companyId = booking.getCompany() == null ? null : booking.getCompany().getId();
        if (!isGuestAppChannelEnabled(companyId)) return;
        JsonNode node = notificationNode(root, "guestApp", kind);
        if (!node.path("enabled").asBoolean(false)) {
            return;
        }
        String title = node.path("title").asText("");
        String body = node.path("body").asText("");
        if (title.isBlank() && body.isBlank()) {
            return;
        }
        Map<String, String> tokens = buildTemplateTokens(booking, null, null);
        String renderedTitle = plainTextForPush(replaceTokens(title, tokens));
        String renderedBody = plainTextForPush(replaceTokens(body, tokens));
        try {
            GuestNotification created = guestNotifications.createForClient(
                    booking.getCompany(),
                    client,
                    mapKindToType(kind),
                    renderedTitle,
                    renderedBody,
                    buildPayloadJson(booking)
            );
            if (created == null) {
                logBookingDeliverySkipped(booking, client, MessageDeliveryChannel.GUEST_APP, kind, null, renderedTitle, "Client is not linked to a guest app user");
            }
            log.info("Sent {} scheduled guest app notification for company {}", kind, booking.getCompany().getId());
            sendReminderPush(created, booking, renderedTitle, renderedBody, kind);
        } catch (Exception e) {
            logBookingDeliveryFailed(booking, client, MessageDeliveryChannel.GUEST_APP, kind, null, title, e.getMessage());
            log.warn("Failed to send {} scheduled guest app notification: {}", kind, e.getMessage());
        }
    }

    private void sendImmediateTemplateGuestApp(SessionBooking booking, Client client, Long companyId, NotificationKind kind, Map<String, String> tokens) {
        if (!isStaffWebBookingSource(booking) || !isGuestAppChannelEnabled(companyId)) {
            return;
        }
        try {
            JsonNode node = notificationNode(loadNotificationSettingsRoot(companyId), "guestApp", kind);
            boolean templateEnabled = node.path("enabled").asBoolean(false);
            if (!templateEnabled) {
                log.debug("Skipping {} guest app notification for company {}: template disabled", kind, companyId);
                return;
            }
            String title = node.path("title").asText("");
            String body = node.path("body").asText("");
            if (title.isBlank() && body.isBlank()) {
                log.debug("Skipping {} guest app notification for company {}: empty title and body", kind, companyId);
                return;
            }
            String renderedTitle = plainTextForPush(replaceTokens(title, tokens));
            String renderedBody = plainTextForPush(replaceTokens(body, tokens));
            GuestNotification created = guestNotifications.createForClient(
                    booking.getCompany(),
                    client,
                    mapKindToType(kind),
                    renderedTitle,
                    renderedBody,
                    buildPayloadJson(booking)
            );
            if (created == null) {
                logBookingDeliverySkipped(booking, client, MessageDeliveryChannel.GUEST_APP, kind, null, renderedTitle, "Client is not linked to a guest app user");
            }
            log.info("Recorded {} guest app bell notification for company {}", kind, companyId);
            sendReminderPush(created, booking, renderedTitle, renderedBody, kind);
        } catch (Exception e) {
            logBookingDeliveryFailed(booking, client, MessageDeliveryChannel.GUEST_APP, kind, null, null, e.getMessage());
            log.warn("Failed to record {} guest app notification for company {}: {}", kind, companyId, e.getMessage());
        }
    }

    private void sendReminderPush(GuestNotification notification, SessionBooking booking, String title, String body, NotificationKind kind) {
        if (notification == null || notification.getGuestUser() == null) return;
        title = plainTextForPush(title);
        body = plainTextForPush(body);
        if (title == null || title.isBlank()) title = defaultPushTitle(kind);
        if (body == null || body.isBlank()) body = defaultPushBody(kind);
        try {
            Map<String, String> extra = new LinkedHashMap<>();
            extra.put("reminderKind", kind.name());
            if (booking != null && booking.getId() != null) {
                extra.put("bookingId", String.valueOf(booking.getId()));
            }
            guestPushService.notifyGuestReminder(
                    notification.getGuestUser(),
                    notification.getCompany(),
                    notification.getClient(),
                    title,
                    body,
                    extra
            );
        } catch (Exception e) {
            log.warn("Failed to send {} reminder push: {}", kind, e.getMessage());
        }
    }

    private static String defaultPushTitle(NotificationKind kind) {
        return switch (kind) {
            case NEW_SESSION -> "Booking confirmed";
            case CHANGE_SESSION -> "Booking rescheduled";
            case CANCEL_SESSION -> "Booking cancelled";
            case BEFORE_SESSION -> "Upcoming session";
            case AFTER_SESSION -> "Session follow-up";
        };
    }

    private static String defaultPushBody(NotificationKind kind) {
        return switch (kind) {
            case NEW_SESSION -> "Your booking has been confirmed.";
            case CHANGE_SESSION -> "Your booking has been rescheduled.";
            case CANCEL_SESSION -> "Your booking has been cancelled.";
            case BEFORE_SESSION -> "You have an upcoming session.";
            case AFTER_SESSION -> "Thanks for attending your session.";
        };
    }

    private GuestNotificationType mapKindToType(NotificationKind kind) {
        return switch (kind) {
            case NEW_SESSION -> GuestNotificationType.BOOKING_CONFIRMED;
            case CHANGE_SESSION -> GuestNotificationType.BOOKING_RESCHEDULED;
            case CANCEL_SESSION -> GuestNotificationType.BOOKING_CANCELLED;
            case BEFORE_SESSION -> GuestNotificationType.BOOKING_REMINDER;
            case AFTER_SESSION -> GuestNotificationType.BOOKING_FOLLOW_UP;
        };
    }

    private JsonNode notificationNode(JsonNode root, String channel, NotificationKind kind) {
        JsonNode channelNode = root == null ? JSON.createObjectNode() : root.path(channel);
        JsonNode node = channelNode.path(kind.getJsonKey());
        if (!node.isMissingNode()) {
            return node;
        }
        return switch (kind) {
            case CHANGE_SESSION -> channelNode.path("sessionChanged");
            case CANCEL_SESSION -> channelNode.path("sessionCancelled");
            default -> node;
        };
    }

    private boolean isEmailChannelEnabled(Long companyId) {
        if (companyId == null) return false;
        return booleanSetting(companyId, SettingKey.NOTIFICATIONS_ENABLED, true)
                && booleanSetting(companyId, SettingKey.NOTIFICATIONS_EMAIL_ALERTS_ENABLED, true);
    }

    private boolean isSmsChannelEnabled(Long companyId) {
        if (companyId == null) return false;
        return booleanSetting(companyId, SettingKey.NOTIFICATIONS_ENABLED, true)
                && booleanSetting(companyId, SettingKey.NOTIFICATIONS_SMS_ALERTS_ENABLED, false);
    }

    private boolean isGuestAppChannelEnabled(Long companyId) {
        if (companyId == null) return false;
        return booleanSetting(companyId, SettingKey.NOTIFICATIONS_ENABLED, true)
                && booleanSetting(companyId, SettingKey.NOTIFICATIONS_GUEST_APP_ALERTS_ENABLED, true);
    }

    private boolean booleanSetting(Long companyId, SettingKey key, boolean fallback) {
        return appSettings.findByCompanyIdAndKey(companyId, key)
                .map(AppSetting::getValue)
                .map(String::trim)
                .map(value -> {
                    if (value.equalsIgnoreCase("true")) return true;
                    if (value.equalsIgnoreCase("false")) return false;
                    return fallback;
                })
                .orElse(fallback);
    }

    private static String plainTextForPush(String input) {
        if (input == null || input.isBlank()) return "";
        return input
                .replaceAll("(?i)<br\\s*/?>", "\n")
                .replaceAll("(?i)</(p|div|h1|h2|h3|h4|h5|h6|blockquote|li)>", "\n")
                .replaceAll("(?i)<li>", "• ")
                .replaceAll("<[^>]+>", "")
                .replace("&nbsp;", " ")
                .replace("&amp;", "&")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&quot;", "\"")
                .replace("&#39;", "'")
                .lines()
                .map(String::trim)
                .filter(line -> !line.isEmpty())
                .collect(java.util.stream.Collectors.joining("\n"));
    }

    private String buildPayloadJson(SessionBooking booking) {
        if (booking == null || booking.getId() == null) return null;
        ObjectNode n = JSON.createObjectNode();
        n.put("bookingId", String.valueOf(booking.getId()));
        return n.toString();
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

    /** Sends new-session notifications using configured channel templates. */
    public void sendBookingConfirmation(SessionBooking booking) {
        sendBookingTemplateNotificationsAfterCommit(booking, NotificationKind.NEW_SESSION, null, null);
    }

    /** Sends change-session notifications using configured channel templates. */
    public void sendSessionRescheduled(SessionBooking booking, LocalDateTime previousStart, LocalDateTime previousEnd) {
        sendBookingTemplateNotificationsAfterCommit(booking, NotificationKind.CHANGE_SESSION, previousStart, previousEnd);
    }

    /** Sends cancel-session notifications using configured channel templates. */
    public void sendSessionCancelled(SessionBooking booking) {
        sendBookingTemplateNotificationsAfterCommit(booking, NotificationKind.CANCEL_SESSION, null, null);
    }

    /** Sends the configured guest-app change template for tenant-staff edits that are not reschedules/cancellations. */
    public void recordStaffBookingModified(SessionBooking booking) {
        if (!isStaffWebBookingSource(booking) || booking == null || booking.getClient() == null || booking.getClient().isAnonymized()) {
            return;
        }
        Runnable task = () -> {
            try {
                Long companyId = booking.getCompany() == null ? null : booking.getCompany().getId();
                sendImmediateTemplateGuestApp(
                        booking,
                        booking.getClient(),
                        companyId,
                        NotificationKind.CHANGE_SESSION,
                        buildTemplateTokens(booking, null, null)
                );
            } catch (Exception e) {
                log.warn("Failed to record booking-updated guest app notification: {}", e.getMessage());
            }
        };
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    task.run();
                }
            });
            return;
        }
        task.run();
    }

    private void sendBookingTemplateNotificationsAfterCommit(SessionBooking booking, NotificationKind kind,
            LocalDateTime originalStart, LocalDateTime originalEnd) {
        if (booking == null) {
            return;
        }
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    sendBookingTemplateNotifications(booking, kind, originalStart, originalEnd);
                }
            });
            return;
        }
        sendBookingTemplateNotifications(booking, kind, originalStart, originalEnd);
    }

    private void sendBookingTemplateNotifications(SessionBooking booking, NotificationKind kind,
            LocalDateTime originalStart, LocalDateTime originalEnd) {
        Client client = booking.getClient();
        if (client == null || client.isAnonymized()) {
            return;
        }

        Long companyId = booking.getCompany().getId();
        Map<String, String> tokens = buildTemplateTokens(booking, originalStart, originalEnd);
        sendImmediateTemplateEmail(booking, client, companyId, kind, tokens);
        sendImmediateTemplateSms(booking, client, companyId, kind, tokens);
        sendImmediateTemplateGuestApp(booking, client, companyId, kind, tokens);
    }

    private static boolean isStaffWebBookingSource(SessionBooking booking) {
        if (booking == null) return false;
        String sourceChannel = booking.getSourceChannel();
        return sourceChannel == null || sourceChannel.isBlank() || "STAFF".equalsIgnoreCase(sourceChannel.trim());
    }

    private void sendImmediateTemplateEmail(SessionBooking booking, Client client, Long companyId, NotificationKind kind, Map<String, String> tokens) {
        if (!isEmailChannelEnabled(companyId)) {
            return;
        }
        if (client.getEmail() == null || client.getEmail().isBlank() || !mailConfigured || mailSender == null) {
            logBookingDeliverySkipped(booking, client, MessageDeliveryChannel.EMAIL, kind, client == null ? null : client.getEmail(), null, "Missing recipient email or mail is not configured");
            return;
        }

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

        String subject = replaceTokens(template.subject(), tokens);
        String bodyHtml = replaceTokens(template.bodyHtml(), tokens);

        try {
            sendHtmlMail(client.getEmail().trim(), subject, bodyHtml);
            logBookingDeliverySent(booking, client, MessageDeliveryChannel.EMAIL, kind, client.getEmail(), subject, bodyHtml);
            log.info("Sent {} booking email to {}", kind, client.getEmail());
        } catch (Exception e) {
            logBookingDeliveryFailed(booking, client, MessageDeliveryChannel.EMAIL, kind, client.getEmail(), subject, e.getMessage());
            log.warn("Failed to send {} booking email to {}: {}", kind, client.getEmail(), e.getMessage());
        }
    }

    private void sendImmediateTemplateSms(SessionBooking booking, Client client, Long companyId, NotificationKind kind, Map<String, String> tokens) {
        if (!isSmsChannelEnabled(companyId)) {
            return;
        }
        if (client.getPhone() == null || client.getPhone().isBlank() || !smsConfigured) {
            logBookingDeliverySkipped(booking, client, MessageDeliveryChannel.SMS, kind, client == null ? null : client.getPhone(), smsSubject(kind), "Missing recipient phone or SMS gateway is not configured");
            return;
        }

        Optional<NotificationSmsTemplate> templateOpt = loadNotificationSmsTemplate(companyId, kind);
        if (templateOpt.isEmpty()) {
            log.debug("Skipping {} booking SMS for company {}: template disabled or not configured", kind, companyId);
            return;
        }
        String body = replaceTokens(templateOpt.get().body(), tokens);
        if (body.isBlank()) {
            log.debug("Skipping {} booking SMS for company {}: empty body", kind, companyId);
            return;
        }
        try {
            sendSmsViaGateway(client.getPhone(), body, companyId, buildCustomId(booking, kind));
            logBookingDeliverySent(booking, client, MessageDeliveryChannel.SMS, kind, client.getPhone(), smsSubject(kind), body);
            log.info("Sent {} booking SMS to {}", kind, client.getPhone());
        } catch (Exception e) {
            logBookingDeliveryFailed(booking, client, MessageDeliveryChannel.SMS, kind, client.getPhone(), smsSubject(kind), e.getMessage());
            log.warn("Failed to send {} booking SMS to {}: {}", kind, client.getPhone(), e.getMessage());
        }
    }


    private void logBookingDeliverySent(SessionBooking booking, Client client, MessageDeliveryChannel channel, NotificationKind kind, String recipient, String subject, String preview) {
        if (deliveryLogs == null) return;
        Company company = booking != null ? booking.getCompany() : client != null ? client.getCompany() : null;
        deliveryLogs.sent(company, client, null, channel, bookingMessageType(kind), recipient, subject, preview, "booking", booking == null ? null : booking.getId());
    }

    private void logBookingDeliveryFailed(SessionBooking booking, Client client, MessageDeliveryChannel channel, NotificationKind kind, String recipient, String subject, String reason) {
        if (deliveryLogs == null) return;
        Company company = booking != null ? booking.getCompany() : client != null ? client.getCompany() : null;
        deliveryLogs.failed(company, client, null, channel, bookingMessageType(kind), recipient, subject, null, "booking", booking == null ? null : booking.getId(), reason);
    }

    private void logBookingDeliverySkipped(SessionBooking booking, Client client, MessageDeliveryChannel channel, NotificationKind kind, String recipient, String subject, String reason) {
        if (deliveryLogs == null) return;
        Company company = booking != null ? booking.getCompany() : client != null ? client.getCompany() : null;
        deliveryLogs.skipped(company, client, null, channel, bookingMessageType(kind), recipient, subject, null, "booking", booking == null ? null : booking.getId(), reason);
    }

    private static String bookingMessageType(NotificationKind kind) {
        return kind == null ? "BOOKING_NOTIFICATION" : "BOOKING_" + kind.name();
    }

    private static String smsSubject(NotificationKind kind) {
        return kind == null ? "SMS notification" : "SMS " + kind.name().replace('_', ' ').toLowerCase(Locale.ROOT);
    }

    private Optional<NotificationEmailTemplate> loadNotificationEmailTemplate(Long companyId, NotificationKind kind) {
        if (!isEmailChannelEnabled(companyId)) {
            return Optional.empty();
        }
        try {
            JsonNode node = notificationNode(loadNotificationSettingsRoot(companyId), "email", kind);
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

    private Optional<NotificationSmsTemplate> loadNotificationSmsTemplate(Long companyId, NotificationKind kind) {
        if (!isSmsChannelEnabled(companyId)) {
            return Optional.empty();
        }
        try {
            JsonNode node = notificationNode(loadNotificationSettingsRoot(companyId), "sms", kind);
            if (!node.path("enabled").asBoolean(false)) {
                return Optional.empty();
            }
            String body = node.path("body").asText("");
            return Optional.of(new NotificationSmsTemplate(body));
        } catch (Exception e) {
            log.warn("Invalid NOTIFICATION_SETTINGS_JSON for company {}: {}", companyId, e.getMessage());
            return Optional.empty();
        }
    }

    private JsonNode loadNotificationSettingsRoot(Long companyId) throws Exception {
        String raw = appSettings.findByCompanyIdAndKey(companyId, SettingKey.NOTIFICATION_SETTINGS_JSON)
                .map(AppSetting::getValue)
                .orElse(null);
        if (raw == null || raw.isBlank()) {
            return JSON.createObjectNode();
        }
        return JSON.readTree(raw);
    }

    private Map<String, String> buildTemplateTokens(SessionBooking booking,
            LocalDateTime originalStart, LocalDateTime originalEnd) {
        Map<String, String> m = new LinkedHashMap<>();
        Company company = booking.getCompany();
        Long companyId = company.getId();

        Client client = booking.getClient();
        String companyName = settingOr(companyId, SettingKey.COMPANY_NAME, company.getName());
        String clientFirstName = nz(client.getFirstName());
        String clientLastName = nz(client.getLastName());
        String serviceName = booking.getType() != null ? nz(booking.getType().getName()) : "";
        String serviceCategories = "";

        LocalDateTime start = booking.getStartTime();
        LocalDateTime end = booking.getEndTime();
        String date = start.format(TAG_DATE);
        String dayName = start.format(DateTimeFormatter.ofPattern("EEEE", NOTIFY_LOCALE));
        String year = String.valueOf(start.getYear());
        String time = start.format(TAG_TIME) + "–" + end.format(TAG_TIME);

        String locationName = booking.getSpace() != null ? nz(booking.getSpace().getName()) : "";
        String locationAddress = formatCompanyAddress(companyId);
        String locationPhone = settingOr(companyId, SettingKey.COMPANY_TELEPHONE, "");

        User consultant = booking.getConsultant();
        String consultantName = consultant == null
                ? ""
                : (nz(consultant.getFirstName()) + " " + nz(consultant.getLastName())).trim();
        String consultantPhone = consultant != null && consultant.getPhone() != null ? consultant.getPhone().trim() : "";
        String rescheduleLink = buildRescheduleLink(company);
        String originalAppointmentDateTime;
        if (originalStart != null) {
            LocalDateTime oEnd = originalEnd != null ? originalEnd : originalStart;
            originalAppointmentDateTime = originalStart.format(TAG_DATETIME_FULL) + " – " + oEnd.format(TAG_TIME);
        } else {
            originalAppointmentDateTime = "";
        }

        m.put("{{companyName}}", companyName);
        m.put("{{clientFirstName}}", clientFirstName);
        m.put("{{clientLastName}}", clientLastName);
        m.put("{{serviceName}}", serviceName);
        m.put("{{serviceCategories}}", serviceCategories);
        m.put("{{date}}", date);
        m.put("{{dayName}}", dayName);
        m.put("{{year}}", year);
        m.put("{{time}}", time);
        m.put("{{locationName}}", locationName);
        m.put("{{locationAddress}}", locationAddress);
        m.put("{{locationPhone}}", locationPhone);
        m.put("{{consultantName}}", consultantName);
        m.put("{{consultantPhone}}", consultantPhone);
        m.put("{{rescheduleLink}}", rescheduleLink);
        m.put("{{originalAppointmentDateTime}}", originalAppointmentDateTime);

        // Slovenian aliases used by Configuration -> Notifications template tags.
        m.put("{{ime_podjetja}}", companyName);
        m.put("{{ime_stranke}}", clientFirstName);
        m.put("{{priimek_stranke}}", clientLastName);
        m.put("{{ime_storitve}}", serviceName);
        m.put("{{datum}}", date);
        m.put("{{cas}}", time);
        m.put("{{naslov_lokacije}}", locationAddress);
        m.put("{{ime_lokacije}}", locationName);
        m.put("{{telefon_lokacije}}", locationPhone);
        m.put("{{povezava_za_prenarocanje}}", rescheduleLink);
        m.put("{{kategorija_storitve}}", serviceCategories);
        m.put("{{ime_izvajalca}}", consultantName);
        m.put("{{telefon_izvajalca}}", consultantPhone);
        m.put("{{prvotni_termin}}", originalAppointmentDateTime);

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
        NEW_SESSION("newSession", "new"),
        CHANGE_SESSION("changeSession", "change"),
        CANCEL_SESSION("cancelSession", "cancel"),
        BEFORE_SESSION("beforeSession", "before"),
        AFTER_SESSION("afterSession", "after");

        private final String jsonKey;
        private final String customIdSuffix;

        NotificationKind(String jsonKey, String customIdSuffix) {
            this.jsonKey = jsonKey;
            this.customIdSuffix = customIdSuffix;
        }

        String getJsonKey() {
            return jsonKey;
        }

        String getCustomIdSuffix() {
            return customIdSuffix;
        }
    }

    private record NotificationEmailTemplate(String subject, String bodyHtml) {}

    private record NotificationSmsTemplate(String body) {}

    private void sendSmsViaGateway(String to, String body, Long companyId, String customId) {
        if (!smsConfigured || smsGateway == null) {
            return;
        }
        SmsGateway.SmsSendResult result = smsGateway.send(new SmsGateway.SmsSendRequest(companyId, to, body, customId));
        log.info("Sent A1 SMS to {} (messageId={}, customId={}, parts={}, companyId={})",
                to, result.messageId(), result.customId(), result.parts(), companyId);
        if (companyId != null) {
            incrementTenantSmsSentCount(companyId, result.parts());
        }
    }

    private String buildCustomId(SessionBooking booking, NotificationKind kind) {
        String suffix = kind == null ? "sms" : kind.getCustomIdSuffix();
        String bookingPart = booking != null && booking.getId() != null ? String.valueOf(booking.getId()) : "x";
        String base = "b" + bookingPart + "-" + suffix;
        return base.length() <= 36 ? base : base.substring(0, 36);
    }

    private void incrementTenantSmsSentCount(Long companyId, int parts) {
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
            s.setValue(String.valueOf(n + Math.max(1, parts)));
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
