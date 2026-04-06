package com.example.app.inbox;

import com.example.app.client.Client;
import com.example.app.client.ClientRepository;
import com.example.app.company.Company;
import com.example.app.security.SecurityUtils;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.settings.SettingsCryptoService;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.mail.internet.MimeMessage;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Collectors;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ClientMessageService {
    private static final ZoneId SYSTEM_ZONE = ZoneId.systemDefault();
    private static final String META_GRAPH_BASE = "https://graph.facebook.com/v23.0";
    private static final String VIBER_BASE = "https://chatapi.viber.com/pa";

    private final ClientMessageRepository messages;
    private final ClientRepository clients;
    private final AppSettingRepository settings;
    private final UserRepository users;
    private final SettingsCryptoService crypto;
    private final JavaMailSender mailSender;
    private final boolean mailConfigured;
    private final String mailFrom;
    private final String fallbackFrom;
    private final ObjectMapper objectMapper;
    private final RestTemplate restTemplate = new RestTemplate();

    public ClientMessageService(
            ClientMessageRepository messages,
            ClientRepository clients,
            AppSettingRepository settings,
            UserRepository users,
            SettingsCryptoService crypto,
            @Autowired(required = false) JavaMailSender mailSender,
            @Value("${app.mail.from:}") String mailFrom,
            @Value("${spring.mail.host:}") String mailHost,
            @Value("${spring.mail.username:}") String mailUsername,
            ObjectMapper objectMapper
    ) {
        this.messages = messages;
        this.clients = clients;
        this.settings = settings;
        this.users = users;
        this.crypto = crypto;
        this.mailSender = mailSender;
        this.mailFrom = mailFrom == null ? "" : mailFrom.trim();
        this.fallbackFrom = mailUsername == null ? "" : mailUsername.trim();
        this.mailConfigured = mailSender != null && mailHost != null && !mailHost.isBlank();
        this.objectMapper = objectMapper;
    }

    public record ThreadFilter(
            String search,
            Long clientId,
            MessageChannel channel,
            MessageStatus status,
            LocalDate from,
            LocalDate to
    ) {}

    public record ThreadSummary(
            Long clientId,
            String clientFirstName,
            String clientLastName,
            String clientEmail,
            String clientPhone,
            MessageChannel lastChannel,
            MessageDirection lastDirection,
            MessageStatus lastStatus,
            String lastSubject,
            String lastPreview,
            String lastSenderName,
            String lastSenderPhone,
            Instant lastSentAt,
            long messageCount
    ) {}

    public record MessageView(
            Long id,
            Long clientId,
            String clientFirstName,
            String clientLastName,
            String recipient,
            MessageChannel channel,
            MessageDirection direction,
            MessageStatus status,
            String subject,
            String body,
            String externalMessageId,
            String errorMessage,
            String senderName,
            String senderPhone,
            Instant sentAt,
            Instant createdAt
    ) {}

    public record SendMessageRequest(Long clientId, MessageChannel channel, String subject, String body) {}

    @Transactional(readOnly = true)
    public List<ThreadSummary> listThreads(User me, ThreadFilter filter) {
        List<ClientMessage> visible = filterVisibleMessages(me);
        List<ClientMessage> filtered = visible.stream().filter(row -> matchesFilter(row, filter)).toList();
        Map<Long, List<ClientMessage>> grouped = filtered.stream()
                .collect(Collectors.groupingBy(row -> row.getClient().getId(), LinkedHashMap::new, Collectors.toList()));

        List<ThreadSummary> out = new ArrayList<>();
        for (List<ClientMessage> rows : grouped.values()) {
            ClientMessage latest = rows.stream().max(Comparator.comparing(ClientMessage::getCreatedAt)).orElse(null);
            if (latest == null) continue;
            Client client = latest.getClient();
            User latestSender = latest.getSenderUser();
            out.add(new ThreadSummary(
                    client.getId(),
                    client.getFirstName(),
                    client.getLastName(),
                    blankToNull(client.getEmail()),
                    blankToNull(preferredPhone(client)),
                    latest.getChannel(),
                    latest.getDirection(),
                    latest.getStatus(),
                    blankToNull(latest.getSubject()),
                    summarize(latest.getBody()),
                    displayUserName(latestSender),
                    blankToNull(latestSender != null ? latestSender.getPhone() : null),
                    latest.getSentAt() != null ? latest.getSentAt() : latest.getCreatedAt(),
                    rows.size()
            ));
        }
        out.sort(Comparator.comparing((ThreadSummary row) -> row.lastSentAt() != null ? row.lastSentAt() : Instant.EPOCH).reversed());
        return out;
    }

    @Transactional(readOnly = true)
    public List<MessageView> listClientMessages(User me, Long clientId, MessageChannel channel, Integer limit) {
        Client client = requireVisibleClient(me, clientId);
        List<ClientMessage> rows = messages.findAllByCompanyIdAndClientIdOrderByCreatedAtAsc(me.getCompany().getId(), client.getId());
        List<MessageView> out = rows.stream()
                .filter(row -> channel == null || row.getChannel() == channel)
                .map(this::toView)
                .toList();
        if (limit != null && limit > 0 && out.size() > limit) return out.subList(out.size() - limit, out.size());
        return out;
    }

    @Transactional
    public MessageView send(User me, SendMessageRequest request) {
        if (request == null || request.clientId() == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "clientId is required.");
        MessageChannel channel = request.channel() == null ? MessageChannel.EMAIL : request.channel();
        String body = normalizeBody(request.body());
        if (body.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Message body is required.");

        Client client = requireVisibleClient(me, request.clientId());
        ClientMessage row = new ClientMessage();
        row.setCompany(me.getCompany());
        row.setClient(client);
        row.setSenderUser(me);
        row.setDirection(MessageDirection.OUTBOUND);
        row.setChannel(channel);
        row.setStatus(MessageStatus.FAILED);
        row.setSubject(blankToNull(normalizeSubject(request.subject())));
        row.setBody(body);

        try {
            ChannelDeliveryResult result = switch (channel) {
                case EMAIL -> sendEmail(client, row.getSubject(), body, me);
                case WHATSAPP -> sendWhatsAppText(client, row.getSubject(), body, me);
                case VIBER -> sendViberText(client, body);
            };
            row.setRecipient(result.recipient());
            row.setExternalMessageId(result.externalMessageId());
            row.setStatus(MessageStatus.SENT);
            row.setSentAt(Instant.now());
            row.setErrorMessage(null);
        } catch (ResponseStatusException ex) {
            row.setRecipient(resolveRecipient(client, channel));
            row.setErrorMessage(trimToLength(ex.getReason(), 1800));
        } catch (Exception ex) {
            row.setRecipient(resolveRecipient(client, channel));
            row.setErrorMessage(trimToLength(ex.getMessage(), 1800));
        }

        ClientMessage saved = messages.save(row);
        if (saved.getStatus() == MessageStatus.FAILED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    saved.getErrorMessage() == null || saved.getErrorMessage().isBlank()
                            ? "Failed to send message."
                            : saved.getErrorMessage());
        }
        return toView(saved);
    }

    @Transactional
    public int ingestWhatsAppWebhook(Long companyId, JsonNode root, String signatureHeader, String rawPayload) {
        String appSecret = readSetting(companyId, SettingKey.INBOX_WHATSAPP_APP_SECRET);
        if (appSecret != null && !appSecret.isBlank() && !isValidMetaSignature(appSecret, rawPayload, signatureHeader)) return 0;
        int savedCount = 0;
        JsonNode entries = root.path("entry");
        if (!entries.isArray()) return 0;
        for (JsonNode entry : entries) {
            JsonNode changes = entry.path("changes");
            if (!changes.isArray()) continue;
            for (JsonNode change : changes) {
                JsonNode value = change.path("value");
                JsonNode metadata = value.path("metadata");
                String phoneNumberId = metadata.path("phone_number_id").asText("");
                String configuredPhoneNumberId = readSetting(companyId, SettingKey.INBOX_WHATSAPP_PHONE_NUMBER_ID);
                if (!phoneNumberId.isBlank()) {
                    boolean matchesCompanyDefault = configuredPhoneNumberId != null && !configuredPhoneNumberId.isBlank()
                            && configuredPhoneNumberId.trim().equals(phoneNumberId.trim());
                    if (configuredPhoneNumberId != null && !configuredPhoneNumberId.isBlank() && !matchesCompanyDefault) {
                        continue;
                    }
                }
                JsonNode messagesNode = value.path("messages");
                JsonNode contactsNode = value.path("contacts");
                if (!messagesNode.isArray()) continue;
                for (int i = 0; i < messagesNode.size(); i++) {
                    JsonNode message = messagesNode.get(i);
                    String externalId = blankToNull(message.path("id").asText(null));
                    if (externalId != null && messages.findFirstByCompanyIdAndExternalMessageId(companyId, externalId).isPresent()) continue;
                    String from = normalizeMsisdn(message.path("from").asText(null));
                    Client client = findWhatsAppClient(companyId, from);
                    if (client == null) continue;
                    String senderName = contactsNode.isArray() && contactsNode.size() > i
                            ? blankToNull(contactsNode.get(i).path("profile").path("name").asText(null))
                            : null;
                    String body = extractWhatsAppInboundBody(message, senderName);
                    if (body == null || body.isBlank()) continue;
                    persistInboundMessage(client.getCompany(), client, MessageChannel.WHATSAPP, from, blankToNull(senderName), body, externalId);
                    savedCount++;
                }
            }
        }
        return savedCount;
    }

    @Transactional
    public int ingestViberWebhook(Long companyId, JsonNode root) {
        String event = root.path("event").asText("");
        if (!List.of("message", "subscribed", "conversation_started").contains(event)) return 0;
        String senderId = blankToNull(root.path("sender").path("id").asText(null));
        if (senderId == null) return 0;
        Client client = clients.findFirstByCompanyIdAndViberUserIdOrderByIdAsc(companyId, senderId).orElse(null);
        if (client == null) return 0;
        if (!client.isViberConnected()) {
            client.setViberConnected(true);
            clients.save(client);
        }
        if (!"message".equals(event)) return 0;
        JsonNode message = root.path("message");
        String text = blankToNull(message.path("text").asText(null));
        if (text == null) text = "[" + blankToNull(message.path("type").asText("message")) + " received]";
        String externalId = blankToNull(root.path("message_token").asText(null));
        if (externalId != null && messages.findFirstByCompanyIdAndExternalMessageId(companyId, externalId).isPresent()) return 0;
        persistInboundMessage(client.getCompany(), client, MessageChannel.VIBER, senderId, blankToNull(root.path("sender").path("name").asText(null)), text, externalId);
        return 1;
    }

    @Transactional
    public void upsertClientMessagingLink(User me, Long clientId, String whatsappPhone, Boolean whatsappOptIn, String viberUserId, Boolean viberConnected) {
        Client client = requireVisibleClient(me, clientId);
        if (whatsappPhone != null) client.setWhatsappPhone(whatsappPhone);
        if (whatsappOptIn != null) client.setWhatsappOptIn(whatsappOptIn);
        if (viberUserId != null) client.setViberUserId(viberUserId);
        if (viberConnected != null) client.setViberConnected(viberConnected && client.getViberUserId() != null && !client.getViberUserId().isBlank());
        clients.save(client);
    }

    private void persistInboundMessage(Company company, Client client, MessageChannel channel, String recipient, String subject, String body, String externalId) {
        ClientMessage row = new ClientMessage();
        row.setCompany(company);
        row.setClient(client);
        row.setChannel(channel);
        row.setDirection(MessageDirection.INBOUND);
        row.setStatus(MessageStatus.RECEIVED);
        row.setRecipient(blankToNull(recipient) == null ? resolveRecipient(client, channel) : recipient);
        row.setSubject(blankToNull(subject));
        row.setBody(body);
        row.setExternalMessageId(externalId);
        row.setSentAt(Instant.now());
        messages.save(row);
    }

    private List<ClientMessage> filterVisibleMessages(User me) {
        List<ClientMessage> all = messages.findAllByCompanyIdOrderByCreatedAtDesc(me.getCompany().getId());
        if (SecurityUtils.isAdmin(me)) return all;
        return all.stream()
                .filter(row -> row.getClient() != null
                        && row.getClient().getAssignedTo() != null
                        && Objects.equals(row.getClient().getAssignedTo().getId(), me.getId()))
                .toList();
    }

    private boolean matchesFilter(ClientMessage row, ThreadFilter filter) {
        if (filter == null) return true;
        if (filter.clientId() != null && !Objects.equals(row.getClient().getId(), filter.clientId())) return false;
        if (filter.channel() != null && row.getChannel() != filter.channel()) return false;
        if (filter.status() != null && row.getStatus() != filter.status()) return false;
        if (filter.from() != null) {
            Instant fromInstant = filter.from().atStartOfDay(SYSTEM_ZONE).toInstant();
            if (row.getCreatedAt().isBefore(fromInstant)) return false;
        }
        if (filter.to() != null) {
            Instant toInstant = filter.to().plusDays(1).atStartOfDay(SYSTEM_ZONE).toInstant();
            if (!row.getCreatedAt().isBefore(toInstant)) return false;
        }
        String q = filter.search() == null ? "" : filter.search().trim().toLowerCase(Locale.ROOT);
        if (q.isBlank()) return true;
        return contains(row.getClient().getFirstName(), q)
                || contains(row.getClient().getLastName(), q)
                || contains(row.getClient().getEmail(), q)
                || contains(preferredPhone(row.getClient()), q)
                || contains(row.getSubject(), q)
                || contains(row.getBody(), q)
                || contains(row.getRecipient(), q)
                || contains(row.getChannel().name(), q)
                || contains(row.getStatus().name(), q);
    }

    private static boolean contains(String raw, String q) {
        return raw != null && raw.toLowerCase(Locale.ROOT).contains(q);
    }

    private MessageView toView(ClientMessage row) {
        Client client = row.getClient();
        User senderUser = row.getSenderUser();
        return new MessageView(
                row.getId(),
                client.getId(),
                client.getFirstName(),
                client.getLastName(),
                row.getRecipient(),
                row.getChannel(),
                row.getDirection(),
                row.getStatus(),
                blankToNull(row.getSubject()),
                row.getBody(),
                blankToNull(row.getExternalMessageId()),
                blankToNull(row.getErrorMessage()),
                displayUserName(senderUser),
                blankToNull(senderUser != null ? senderUser.getPhone() : null),
                row.getSentAt(),
                row.getCreatedAt()
        );
    }

    private Client requireVisibleClient(User me, Long clientId) {
        Client client = clients.findByIdAndCompanyId(clientId, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Client not found."));
        if (!SecurityUtils.isAdmin(me) && (client.getAssignedTo() == null || !Objects.equals(client.getAssignedTo().getId(), me.getId()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You are not allowed to message this client.");
        }
        return client;
    }

    private ChannelDeliveryResult sendEmail(Client client, String subject, String body, User me) {
        String to = blankToNull(client.getEmail());
        if (to == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Client does not have an email address.");
        if (!mailConfigured || mailSender == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Email is not configured on the server.");
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, false, StandardCharsets.UTF_8.name());
            helper.setFrom(resolveFromAddress());
            helper.setTo(to);
            helper.setSubject(subject == null || subject.isBlank() ? defaultSubject(client) : subject);
            helper.setText(body, false);
            String replyTo = readSetting(client.getCompany().getId(), SettingKey.COMPANY_EMAIL);
            if (replyTo != null && !replyTo.isBlank()) helper.setReplyTo(replyTo.trim());
            else if (me.getEmail() != null && !me.getEmail().isBlank()) helper.setReplyTo(me.getEmail().trim());
            mailSender.send(message);
            return new ChannelDeliveryResult(to, null);
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Failed to send email: " + safeMessage(ex));
        }
    }

    private ChannelDeliveryResult sendWhatsAppText(Client client, String subject, String body, User me) {
        String to = normalizeMsisdn(blankToNull(client.getPhone()));
        if (to == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Client does not have a phone number for WhatsApp.");
        if (!client.isWhatsappOptIn()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Client is not marked as WhatsApp opt-in.");
        Long companyId = client.getCompany().getId();
        String accessToken = readSetting(companyId, SettingKey.INBOX_WHATSAPP_ACCESS_TOKEN);
        String phoneNumberId = resolveWhatsAppPhoneNumberId(me, companyId);
        if (blankToNull(accessToken) == null || blankToNull(phoneNumberId) == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "WhatsApp Cloud API is not configured. Open Configuration → Notifications → Inbox channels.");
        }
        String url = META_GRAPH_BASE + "/" + phoneNumberId.trim() + "/messages";
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(accessToken.trim());
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setAccept(List.of(MediaType.APPLICATION_JSON));
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("messaging_product", "whatsapp");
        payload.put("to", to);
        payload.put("type", "text");
        payload.put("text", Map.of("preview_url", containsUrl(body), "body", body));
        try {
            ResponseEntity<String> response = restTemplate.postForEntity(url, new HttpEntity<>(payload, headers), String.class);
            if (!response.getStatusCode().is2xxSuccessful()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "WhatsApp returned " + response.getStatusCode().value() + ".");
            }
            return new ChannelDeliveryResult(to, extractMetaMessageId(response.getBody()));
        } catch (RestClientException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "WhatsApp send failed: " + safeMessage(ex));
        }
    }

    private String resolveWhatsAppPhoneNumberId(User me, Long companyId) {
        return readSetting(companyId, SettingKey.INBOX_WHATSAPP_PHONE_NUMBER_ID);
    }

    private ChannelDeliveryResult sendViberText(Client client, String body) {
        if (!client.isViberConnected() || blankToNull(client.getViberUserId()) == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Client is not connected on Viber yet.");
        }
        Long companyId = client.getCompany().getId();
        String token = readSetting(companyId, SettingKey.INBOX_VIBER_BOT_TOKEN);
        String botName = readSetting(companyId, SettingKey.INBOX_VIBER_BOT_NAME);
        String botAvatar = readSetting(companyId, SettingKey.INBOX_VIBER_BOT_AVATAR_URL);
        if (blankToNull(token) == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Viber bot is not configured. Open Configuration → Notifications → Inbox channels.");
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setAccept(List.of(MediaType.APPLICATION_JSON));
        headers.set("X-Viber-Auth-Token", token.trim());
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("receiver", client.getViberUserId().trim());
        payload.put("type", "text");
        payload.put("text", body);
        payload.put("sender", Map.of(
                "name", blankToNull(botName) == null ? "Calendra" : botName.trim(),
                "avatar", blankToNull(botAvatar) == null ? "" : botAvatar.trim()
        ));
        try {
            ResponseEntity<String> response = restTemplate.postForEntity(VIBER_BASE + "/send_message", new HttpEntity<>(payload, headers), String.class);
            if (!response.getStatusCode().is2xxSuccessful()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Viber returned " + response.getStatusCode().value() + ".");
            }
            return new ChannelDeliveryResult(client.getViberUserId().trim(), extractViberMessageToken(response.getBody()));
        } catch (RestClientException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Viber send failed: " + safeMessage(ex));
        }
    }

    private Client findWhatsAppClient(Long companyId, String from) {
        if (from == null) return null;
        for (Client client : clients.findAllByCompanyId(companyId)) {
            String wa = normalizeMsisdn(client.getWhatsappPhone());
            String phone = normalizeMsisdn(client.getPhone());
            if (from.equals(wa) || from.equals(phone)) return client;
        }
        return null;
    }

    private String extractWhatsAppInboundBody(JsonNode message, String senderName) {
        String type = message.path("type").asText("text");
        if ("text".equals(type)) return message.path("text").path("body").asText("");
        if ("button".equals(type)) return message.path("button").path("text").asText("[Button reply]");
        if ("interactive".equals(type)) {
            JsonNode interactive = message.path("interactive");
            String title = interactive.path("button_reply").path("title").asText("");
            if (title.isBlank()) title = interactive.path("list_reply").path("title").asText("");
            return title.isBlank() ? "[Interactive reply]" : title;
        }
        return "[" + type + " received" + (senderName != null ? " from " + senderName : "") + "]";
    }

    private String extractMetaMessageId(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            JsonNode root = objectMapper.readTree(raw);
            JsonNode messagesNode = root.path("messages");
            if (messagesNode.isArray() && !messagesNode.isEmpty()) {
                String id = messagesNode.get(0).path("id").asText(null);
                if (id != null && !id.isBlank()) return id;
            }
        } catch (Exception ignore) {
        }
        return null;
    }

    private String extractViberMessageToken(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            JsonNode root = objectMapper.readTree(raw);
            JsonNode token = root.path("message_token");
            if (!token.isMissingNode() && !token.isNull()) return token.asText();
        } catch (Exception ignore) {
        }
        return null;
    }

    private String readSetting(Long companyId, SettingKey key) {
        Optional<String> value = settings.findByCompanyIdAndKey(companyId, key).map(s -> s.getValue());
        if (value.isEmpty()) return null;
        String raw = value.get();
        if (raw == null) return null;
        return switch (key) {
            case INBOX_INFOBIP_API_KEY, INBOX_WHATSAPP_ACCESS_TOKEN, INBOX_WHATSAPP_APP_SECRET, INBOX_VIBER_BOT_TOKEN -> crypto.decryptIfEncrypted(raw);
            default -> raw;
        };
    }

    private boolean isValidMetaSignature(String appSecret, String rawPayload, String signatureHeader) {
        if (rawPayload == null || rawPayload.isBlank()) return false;
        if (signatureHeader == null || signatureHeader.isBlank()) return false;
        try {
            Mac sha256Hmac = Mac.getInstance("HmacSHA256");
            sha256Hmac.init(new SecretKeySpec(appSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] digest = sha256Hmac.doFinal(rawPayload.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder("sha256=");
            for (byte b : digest) sb.append(String.format("%02x", b));
            return sb.toString().equalsIgnoreCase(signatureHeader.trim());
        } catch (Exception ex) {
            return false;
        }
    }

    public boolean matchesWhatsAppVerifyToken(Long companyId, String verifyToken) {
        String configured = readSetting(companyId, SettingKey.INBOX_WHATSAPP_WEBHOOK_VERIFY_TOKEN);
        return configured != null && !configured.isBlank() && configured.trim().equals(verifyToken == null ? "" : verifyToken.trim());
    }

    private String resolveFromAddress() {
        if (!mailFrom.isBlank()) return mailFrom;
        if (!fallbackFrom.isBlank()) return fallbackFrom;
        return "noreply@localhost";
    }

    private String defaultSubject(Client client) {
        return "Message for " + (client.getFirstName() + " " + client.getLastName()).trim();
    }

    private String resolveRecipient(Client client, MessageChannel channel) {
        return switch (channel) {
            case EMAIL -> blankToNull(client.getEmail()) != null ? client.getEmail().trim() : "";
            case WHATSAPP -> blankToNull(client.getWhatsappPhone()) != null ? client.getWhatsappPhone().trim() : blankToNull(client.getPhone()) != null ? client.getPhone().trim() : "";
            case VIBER -> blankToNull(client.getViberUserId()) != null ? client.getViberUserId().trim() : "";
        };
    }

    private String preferredPhone(Client client) {
        return blankToNull(client.getWhatsappPhone()) != null ? client.getWhatsappPhone() : client.getPhone();
    }

    private String displayUserName(User user) {
        if (user == null) return null;
        String fullName = ((user.getFirstName() == null ? "" : user.getFirstName()) + " " + (user.getLastName() == null ? "" : user.getLastName())).trim();
        return blankToNull(fullName);
    }

    private static String normalizeBody(String value) {
        return value == null ? "" : value.replace("\r\n", "\n").trim();
    }

    private static String normalizeSubject(String value) {
        return value == null ? "" : value.trim();
    }

    private static String normalizeMsisdn(String value) {
        if (value == null) return null;
        String cleaned = value.replaceAll("[^0-9+]", "").trim();
        if (cleaned.isBlank()) return null;
        if (cleaned.startsWith("+")) cleaned = cleaned.substring(1);
        return cleaned.isBlank() ? null : cleaned;
    }

    private static String summarize(String value) {
        if (value == null) return null;
        String singleLine = value.replaceAll("\s+", " ").trim();
        return trimToLength(singleLine, 140);
    }

    private static String safeMessage(Exception ex) {
        if (ex == null || ex.getMessage() == null || ex.getMessage().isBlank()) return ex == null ? "Unknown error." : ex.getClass().getSimpleName();
        return trimToLength(ex.getMessage(), 500);
    }

    private static String trimToLength(String value, int max) {
        if (value == null) return null;
        if (value.length() <= max) return value;
        return value.substring(0, Math.max(0, max - 1)).trim() + "…";
    }

    private static String blankToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static boolean containsUrl(String body) {
        if (body == null) return false;
        String lower = body.toLowerCase(Locale.ROOT);
        return lower.contains("http://") || lower.contains("https://");
    }

    private record ChannelDeliveryResult(String recipient, String externalMessageId) {}
}
