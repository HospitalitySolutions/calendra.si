package com.example.app.waitlist;

import com.example.app.client.Client;
import com.example.app.company.Company;
import com.example.app.delivery.MessageDeliveryChannel;
import com.example.app.delivery.MessageDeliveryLogService;
import com.example.app.email.TenantEmailSenderResolver;
import com.example.app.guest.model.GuestNotification;
import com.example.app.guest.model.GuestNotificationType;
import com.example.app.guest.notifications.GuestNotificationService;
import com.example.app.guest.notifications.GuestPushService;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.settings.TenantSmsQuotaService;
import com.example.app.session.SessionBooking;
import com.example.app.sms.SmsGateway;
import com.example.app.user.User;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Sends the guest-facing waitlist templates configured in Notifications -> Waitlist.
 * The event is published inside the waitlist transaction and delivered only after that transaction commits.
 */
@Service
public class WaitlistGuestNotificationService {
    private static final Logger log = LoggerFactory.getLogger(WaitlistGuestNotificationService.class);
    private static final ZoneId ZONE = ZoneId.of("Europe/Ljubljana");
    private static final Locale SLOVENIAN = Locale.forLanguageTag("sl-SI");
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("d. M. yyyy", SLOVENIAN);
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm", SLOVENIAN);
    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("d. M. yyyy 'ob' HH:mm", SLOVENIAN);

    public enum EventKind {
        JOINED("waitlistJoined"),
        UPDATED("waitlistUpdated"),
        SLOT_AVAILABLE("waitlistSlotAvailable"),
        OFFER_EXPIRING("waitlistOfferExpiring"),
        OFFER_EXPIRED("waitlistOfferExpired"),
        BOOKED("waitlistBooked"),
        CANCELLED("waitlistCancelled");

        private final String jsonKey;

        EventKind(String jsonKey) {
            this.jsonKey = jsonKey;
        }

        public String jsonKey() {
            return jsonKey;
        }
    }

    public record WaitlistNotificationEvent(Long companyId, Long requestId, Long offerId, EventKind kind) {}

    private final ApplicationEventPublisher events;
    private final WaitlistRequestRepository requests;
    private final WaitlistOfferRepository offers;
    private final WaitlistRequestWindowRepository windows;
    private final AppSettingRepository settings;
    private final ObjectMapper objectMapper;
    private final JavaMailSender mailSender;
    private final boolean mailConfigured;
    private final String fallbackFrom;
    private final SmsGateway smsGateway;
    private final TenantSmsQuotaService smsQuota;
    private final GuestNotificationService guestNotifications;
    private final GuestPushService guestPush;
    private final TenantEmailSenderResolver emailSenderResolver;
    private final MessageDeliveryLogService deliveryLogs;
    private final String frontendBaseUrl;

    public WaitlistGuestNotificationService(
            ApplicationEventPublisher events,
            WaitlistRequestRepository requests,
            WaitlistOfferRepository offers,
            WaitlistRequestWindowRepository windows,
            AppSettingRepository settings,
            ObjectMapper objectMapper,
            @Autowired(required = false) JavaMailSender mailSender,
            @Value("${spring.mail.host:}") String mailHost,
            @Value("${spring.mail.username:}") String mailUsername,
            @Value("${app.mail.from:}") String configuredFrom,
            @Value("${app.auth.frontend-url:}") String frontendBaseUrl,
            @Autowired(required = false) SmsGateway smsGateway,
            TenantSmsQuotaService smsQuota,
            GuestNotificationService guestNotifications,
            GuestPushService guestPush,
            @Autowired(required = false) TenantEmailSenderResolver emailSenderResolver,
            @Autowired(required = false) MessageDeliveryLogService deliveryLogs
    ) {
        this.events = events;
        this.requests = requests;
        this.offers = offers;
        this.windows = windows;
        this.settings = settings;
        this.objectMapper = objectMapper;
        this.mailSender = mailSender;
        this.mailConfigured = mailSender != null && mailHost != null && !mailHost.isBlank();
        this.fallbackFrom = firstNonBlank(configuredFrom, mailUsername, "no-reply@calendra.si");
        this.smsGateway = smsGateway;
        this.smsQuota = smsQuota;
        this.guestNotifications = guestNotifications;
        this.guestPush = guestPush;
        this.emailSenderResolver = emailSenderResolver;
        this.deliveryLogs = deliveryLogs;
        this.frontendBaseUrl = normalizeBaseUrl(frontendBaseUrl);
    }

    public void publish(WaitlistRequest request, WaitlistOffer offer, EventKind kind) {
        if (request == null || request.getId() == null || request.getCompany() == null || request.getCompany().getId() == null || kind == null) {
            return;
        }
        events.publishEvent(new WaitlistNotificationEvent(
                request.getCompany().getId(),
                request.getId(),
                offer == null ? null : offer.getId(),
                kind
        ));
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void deliver(WaitlistNotificationEvent event) {
        if (event == null || event.companyId() == null || event.requestId() == null || event.kind() == null) return;
        try {
            WaitlistRequest request = requests.findDetailedByIdAndCompanyId(event.requestId(), event.companyId()).orElse(null);
            if (request == null) return;
            WaitlistOffer offer = event.offerId() == null
                    ? null
                    : offers.findById(event.offerId())
                    .filter(row -> row.getCompany() != null
                            && event.companyId().equals(row.getCompany().getId())
                            && row.getRequest() != null
                            && event.requestId().equals(row.getRequest().getId()))
                    .orElse(null);
            Client client = request.getClient();
            if (client == null || client.isAnonymized()) return;

            JsonNode root = notificationRoot(event.companyId());
            List<WaitlistRequestWindow> requestWindows = windows.findAllByRequestIdOrderByDateAscDayOfWeekAscTimeFromAsc(request.getId());
            Map<String, String> tokens = tokens(request, offer, requestWindows);
            deliverEmail(root, request, client, event.kind(), tokens);
            deliverSms(root, request, client, event.kind(), tokens);
            deliverGuestApp(root, request, offer, client, event.kind(), tokens);
        } catch (Exception ex) {
            log.warn("Waitlist guest notification delivery failed companyId={} requestId={} kind={}: {}",
                    event.companyId(), event.requestId(), event.kind(), ex.getMessage());
        }
    }

    private void deliverEmail(JsonNode root, WaitlistRequest request, Client client,
                              EventKind kind, Map<String, String> tokens) {
        Long companyId = request.getCompany().getId();
        if (!channelEnabled(companyId, SettingKey.NOTIFICATIONS_EMAIL_ALERTS_ENABLED, true)) return;
        JsonNode node = root.path("email").path(kind.jsonKey());
        if (!node.path("enabled").asBoolean(false)) return;
        if (!mailConfigured || client.getEmail() == null || client.getEmail().isBlank()) return;

        String subject = replaceTokens(node.path("subject").asText(""), tokens).trim();
        String body = replaceTokens(node.path("bodyHtml").asText(""), tokens).trim();
        if (subject.isBlank() && body.isBlank()) return;
        if (subject.isBlank()) subject = " ";
        String html = normalizeEmailHtml(body);
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, StandardCharsets.UTF_8.name());
            applySender(helper, request.getCompany());
            helper.setTo(client.getEmail().trim());
            helper.setSubject(subject);
            helper.setText(html, true);
            mailSender.send(message);
            deliverySent(request, client, MessageDeliveryChannel.EMAIL, kind, client.getEmail(), subject, html);
        } catch (Exception ex) {
            deliveryFailed(request, client, MessageDeliveryChannel.EMAIL, kind, client.getEmail(), subject, ex.getMessage());
            log.warn("Failed to send waitlist email companyId={} requestId={} kind={}: {}",
                    companyId, request.getId(), kind, ex.getMessage());
        }
    }

    private void deliverSms(JsonNode root, WaitlistRequest request, Client client,
                            EventKind kind, Map<String, String> tokens) {
        Long companyId = request.getCompany().getId();
        if (!channelEnabled(companyId, SettingKey.NOTIFICATIONS_SMS_ALERTS_ENABLED, false)) return;
        JsonNode node = root.path("sms").path(kind.jsonKey());
        if (!node.path("enabled").asBoolean(false)) return;
        if (smsGateway == null || !smsGateway.isConfigured() || client.getPhone() == null || client.getPhone().isBlank()) return;

        String body = replaceTokens(node.path("body").asText(""), tokens).trim();
        String title = replaceTokens(node.path("title").asText(""), tokens).trim();
        if (body.isBlank()) return;
        try {
            int estimatedParts = estimateSmsParts(body);
            smsQuota.assertCanSend(companyId, estimatedParts);
            SmsGateway.SmsSendResult result = smsGateway.send(new SmsGateway.SmsSendRequest(
                    companyId,
                    client.getPhone().trim(),
                    body,
                    customId(request, kind)
            ));
            if (result == null || !result.success()) {
                throw new IllegalStateException(result == null ? "SMS provider returned no result" : firstNonBlank(result.error(), "SMS provider rejected the message"));
            }
            smsQuota.increment(companyId, Math.max(1, result.parts()));
            deliverySent(request, client, MessageDeliveryChannel.SMS, kind, client.getPhone(), title, body);
        } catch (Exception ex) {
            deliveryFailed(request, client, MessageDeliveryChannel.SMS, kind, client.getPhone(), title, ex.getMessage());
            log.warn("Failed to send waitlist SMS companyId={} requestId={} kind={}: {}",
                    companyId, request.getId(), kind, ex.getMessage());
        }
    }

    private void deliverGuestApp(JsonNode root, WaitlistRequest request, WaitlistOffer offer, Client client,
                                 EventKind kind, Map<String, String> tokens) {
        Long companyId = request.getCompany().getId();
        if (!channelEnabled(companyId, SettingKey.NOTIFICATIONS_GUEST_APP_ALERTS_ENABLED, true)) return;
        JsonNode node = root.path("guestApp").path(kind.jsonKey());
        if (!node.path("enabled").asBoolean(false)) return;

        String title = plainText(replaceTokens(node.path("title").asText(""), tokens));
        String body = plainText(replaceTokens(node.path("body").asText(""), tokens));
        if (title.isBlank() && body.isBlank()) return;
        try {
            String payload = objectMapper.writeValueAsString(Map.of(
                    "event", kind.jsonKey(),
                    "waitlistRequestId", String.valueOf(request.getId()),
                    "waitlistOfferId", offer == null || offer.getId() == null ? "" : String.valueOf(offer.getId()),
                    "screen", "waitlist"
            ));
            GuestNotification created = guestNotifications.createForClient(
                    request.getCompany(),
                    client,
                    GuestNotificationType.GUEST_MESSAGE,
                    title,
                    body,
                    payload
            );
            if (created != null && created.getGuestUser() != null && guestPush != null) {
                Map<String, String> extra = new LinkedHashMap<>();
                extra.put("event", kind.jsonKey());
                extra.put("screen", "waitlist");
                extra.put("waitlistRequestId", String.valueOf(request.getId()));
                if (offer != null && offer.getId() != null) extra.put("waitlistOfferId", String.valueOf(offer.getId()));
                guestPush.notifyGuestReminder(created.getGuestUser(), request.getCompany(), client, title, body, extra);
            }
        } catch (Exception ex) {
            deliveryFailed(request, client, MessageDeliveryChannel.GUEST_APP, kind, null, title, ex.getMessage());
            log.warn("Failed to send waitlist guest-app notification companyId={} requestId={} kind={}: {}",
                    companyId, request.getId(), kind, ex.getMessage());
        }
    }

    private JsonNode notificationRoot(Long companyId) {
        String raw = settings.findByCompanyIdAndKey(companyId, SettingKey.NOTIFICATION_SETTINGS_JSON)
                .map(AppSetting::getValue)
                .orElse("");
        if (raw == null || raw.isBlank()) return objectMapper.createObjectNode();
        try {
            return objectMapper.readTree(raw);
        } catch (Exception ex) {
            log.warn("Invalid NOTIFICATION_SETTINGS_JSON for waitlist notifications companyId={}: {}", companyId, ex.getMessage());
            return objectMapper.createObjectNode();
        }
    }

    private boolean channelEnabled(Long companyId, SettingKey channelKey, boolean fallback) {
        return booleanSetting(companyId, SettingKey.NOTIFICATIONS_ENABLED, true)
                && booleanSetting(companyId, channelKey, fallback);
    }

    private boolean booleanSetting(Long companyId, SettingKey key, boolean fallback) {
        return settings.findByCompanyIdAndKey(companyId, key)
                .map(AppSetting::getValue)
                .map(String::trim)
                .map(value -> {
                    if (value.equalsIgnoreCase("true")) return true;
                    if (value.equalsIgnoreCase("false")) return false;
                    return fallback;
                })
                .orElse(fallback);
    }

    private Map<String, String> tokens(
            WaitlistRequest request,
            WaitlistOffer offer,
            List<WaitlistRequestWindow> requestWindows
    ) {
        Map<String, String> values = new LinkedHashMap<>();
        Company company = request.getCompany();
        Client client = request.getClient();

        // A completed booking is authoritative. Otherwise use the active offer,
        // then an exact target session, and finally the request's preferred window.
        SessionBooking booked = request.getBookedBooking();
        SessionBooking targetSession = request.getTargetSession();
        LocalDateTime start = booked != null
                ? booked.getStartTime()
                : offer != null
                ? offer.getSlotStart()
                : targetSession == null ? null : targetSession.getStartTime();
        LocalDateTime end = booked != null
                ? booked.getEndTime()
                : offer != null
                ? offer.getSlotEnd()
                : targetSession == null ? null : targetSession.getEndTime();
        User employee = booked != null
                ? booked.getConsultant()
                : offer != null && offer.getEmployee() != null
                ? offer.getEmployee()
                : request.getSpecificEmployee();

        WaitlistRequestWindow preferredWindow = requestWindows == null
                ? null
                : requestWindows.stream()
                .filter(window -> !window.isAllDay() && window.getTimeFrom() != null)
                .findFirst()
                .orElse(null);
        LocalTime requestedStartTime = preferredWindow == null ? null : preferredWindow.getTimeFrom();
        LocalTime requestedEndTime = preferredWindow == null ? null : preferredWindow.getTimeTo();

        String manageUrl = waitlistUrl(request.getId());
        String acceptUrl = offer == null ? manageUrl : publicOfferUrl(offer.getId(), "accept");
        String declineUrl = offer == null ? manageUrl : publicOfferUrl(offer.getId(), "decline");
        String companyName = settings.findByCompanyIdAndKey(company.getId(), SettingKey.COMPANY_NAME)
                .map(AppSetting::getValue)
                .filter(value -> value != null && !value.isBlank())
                .orElse(company.getName() == null ? "" : company.getName());

        values.put("{{clientFirstName}}", client == null ? "" : safe(client.getFirstName()));
        values.put("{{clientLastName}}", client == null ? "" : safe(client.getLastName()));
        values.put("{{clientName}}", client == null ? "" : fullName(client.getFirstName(), client.getLastName()));
        values.put("{{serviceName}}", request.getService() == null ? "" : safe(request.getService().getName()));
        values.put("{{employeeName}}", employee == null ? "" : fullName(employee.getFirstName(), employee.getLastName()));
        values.put("{{date}}", start == null ? dateRange(request) : DATE.format(start));
        values.put("{{startTime}}", start != null ? TIME.format(start) : requestedStartTime == null ? "" : TIME.format(requestedStartTime));
        values.put("{{endTime}}", end != null ? TIME.format(end) : requestedEndTime == null ? "" : TIME.format(requestedEndTime));
        values.put("{{offerExpiresAt}}", offer == null || offer.getExpiresAt() == null ? "" : DATE_TIME.format(LocalDateTime.ofInstant(offer.getExpiresAt(), ZONE)));
        values.put("{{acceptUrl}}", acceptUrl);
        values.put("{{declineUrl}}", declineUrl);
        values.put("{{manageWaitlistUrl}}", manageUrl);
        values.put("{{companyName}}", safe(companyName));
        return values;
    }

    private String publicOfferUrl(Long offerId, String action) {
        String path = "/public-waitlist/offer/" + offerId + "?action=" + (action == null || action.isBlank() ? "accept" : action.trim());
        return frontendBaseUrl.isBlank() ? path : frontendBaseUrl + path;
    }

    private String waitlistUrl(Long requestId) {
        String path = "/appointments?tab=waitlist&requestId=" + requestId;
        return frontendBaseUrl.isBlank() ? path : frontendBaseUrl + path;
    }

    private void applySender(MimeMessageHelper helper, Company company) throws MessagingException {
        if (emailSenderResolver != null) {
            emailSenderResolver.applyFrom(helper, company, TenantEmailSenderResolver.EmailPurpose.CLIENT_NOTIFICATION);
            emailSenderResolver.applyReplyTo(helper, company, TenantEmailSenderResolver.EmailPurpose.CLIENT_NOTIFICATION);
            return;
        }
        helper.setFrom(fallbackFrom);
    }

    private void deliverySent(WaitlistRequest request, Client client, MessageDeliveryChannel channel, EventKind kind,
                              String recipient, String subject, String preview) {
        if (deliveryLogs == null) return;
        deliveryLogs.sent(request.getCompany(), client, null, channel, "WAITLIST_" + kind.name(), recipient,
                subject, preview, "waitlist_request", request.getId());
    }

    private void deliveryFailed(WaitlistRequest request, Client client, MessageDeliveryChannel channel, EventKind kind,
                                String recipient, String subject, String reason) {
        if (deliveryLogs == null) return;
        deliveryLogs.failed(request.getCompany(), client, null, channel, "WAITLIST_" + kind.name(), recipient,
                subject, null, "waitlist_request", request.getId(), reason);
    }

    private static int estimateSmsParts(String text) {
        int length = text == null ? 0 : text.length();
        return Math.max(1, (length + 152) / 153);
    }

    private static String customId(WaitlistRequest request, EventKind kind) {
        String value = "w" + request.getId() + "-" + kind.name().toLowerCase(Locale.ROOT);
        return value.length() <= 36 ? value : value.substring(0, 36);
    }

    private static String replaceTokens(String input, Map<String, String> tokens) {
        String output = input == null ? "" : input;
        for (Map.Entry<String, String> entry : tokens.entrySet()) {
            output = output.replace(entry.getKey(), entry.getValue() == null ? "" : entry.getValue());
        }
        return output;
    }

    private static String normalizeEmailHtml(String value) {
        if (value == null || value.isBlank()) return " ";
        String normalized = value.replace("\r\n", "\n").replace('\r', '\n').trim();
        if (normalized.matches("(?s).*<[^>]+>.*")) return normalized;
        return "<div style=\"font-family:Arial,sans-serif;color:#111827;line-height:1.55\">"
                + escapeHtml(normalized).replace("\n\n", "</p><p style=\"margin:0 0 12px\">").replace("\n", "<br>")
                .replaceFirst("^", "<p style=\"margin:0 0 12px\">")
                + "</p></div>";
    }

    private static String plainText(String value) {
        if (value == null) return "";
        return value.replaceAll("(?is)<br\\s*/?>", "\n")
                .replaceAll("(?is)<[^>]+>", " ")
                .replace("&nbsp;", " ")
                .replaceAll("[ \\t]+", " ")
                .replaceAll("\\n{3,}", "\n\n")
                .trim();
    }

    private static String escapeHtml(String value) {
        return value.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }

    private static String dateRange(WaitlistRequest request) {
        if (request.getDateFrom() == null) return "";
        if (request.getDateTo() == null || request.getDateTo().equals(request.getDateFrom())) return DATE.format(request.getDateFrom());
        return DATE.format(request.getDateFrom()) + " – " + DATE.format(request.getDateTo());
    }

    private static String fullName(String firstName, String lastName) {
        return (safe(firstName) + " " + safe(lastName)).trim();
    }

    private static String safe(String value) {
        return value == null ? "" : value.trim();
    }

    private static String firstNonBlank(String... values) {
        if (values == null) return "";
        for (String value : values) {
            if (value != null && !value.isBlank()) return value.trim();
        }
        return "";
    }

    private static String normalizeBaseUrl(String value) {
        String normalized = value == null ? "" : value.trim();
        while (normalized.endsWith("/")) normalized = normalized.substring(0, normalized.length() - 1);
        return normalized;
    }
}
