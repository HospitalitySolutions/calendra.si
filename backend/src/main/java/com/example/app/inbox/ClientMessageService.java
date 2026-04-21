package com.example.app.inbox;

import com.example.app.client.Client;
import com.example.app.client.ClientRepository;
import com.example.app.company.Company;
import com.example.app.guest.model.GuestTenantLink;
import com.example.app.guest.model.GuestTenantLinkRepository;
import com.example.app.guest.model.GuestTenantLinkStatus;
import com.example.app.guest.model.GuestUser;
import com.example.app.guest.notifications.GuestNotificationService;
import com.example.app.guest.notifications.GuestPushService;
import com.example.app.files.ClientFile;
import com.example.app.files.ClientFileRepository;
import com.example.app.files.ClientFileUploadPolicy;
import com.example.app.files.StoredFileResponse;
import com.example.app.files.TenantFileS3Service;
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
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ClientMessageService {
    private static final ZoneId SYSTEM_ZONE = ZoneId.systemDefault();
    private static final String META_GRAPH_BASE = "https://graph.facebook.com/v23.0";
    private static final String VIBER_BASE = "https://chatapi.viber.com/pa";

    private final ClientMessageRepository messages;
    private final ClientRepository clients;
    private final GuestTenantLinkRepository guestTenantLinks;
    private final ClientFileRepository clientFiles;
    private final TenantFileS3Service fileStorage;
    private final ClientMessageAttachmentRepository messageAttachments;
    private final GuestNotificationService guestNotifications;
    private final GuestPushService guestPush;
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
            GuestTenantLinkRepository guestTenantLinks,
            ClientFileRepository clientFiles,
            TenantFileS3Service fileStorage,
            ClientMessageAttachmentRepository messageAttachments,
            GuestNotificationService guestNotifications,
            GuestPushService guestPush,
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
        this.guestTenantLinks = guestTenantLinks;
        this.clientFiles = clientFiles;
        this.fileStorage = fileStorage;
        this.messageAttachments = messageAttachments;
        this.guestNotifications = guestNotifications;
        this.guestPush = guestPush;
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
            long messageCount,
            long unreadCount
    ) {}

    public record GuestThreadSummary(
            Long clientId,
            String clientFirstName,
            String clientLastName,
            String lastPreview,
            String lastSenderName,
            Instant lastSentAt,
            long messageCount,
            long unreadCount
    ) {}

    public record MessageAttachmentView(
            Long id,
            Long clientFileId,
            String fileName,
            String contentType,
            long sizeBytes,
            Instant uploadedAt
    ) {}

    public record AttachmentDownload(
            String fileName,
            String contentType,
            byte[] bytes
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
            Instant createdAt,
            List<MessageAttachmentView> attachments
    ) {}

    public record SendMessageRequest(Long clientId, MessageChannel channel, String subject, String body, List<Long> attachmentFileIds) {}

    @Transactional(readOnly = true)
    public List<GuestThreadSummary> listGuestThreads(GuestUser guestUser, Long companyId) {
        GuestTenantLink link = requireActiveGuestLink(guestUser, companyId);
        List<ClientMessage> rows = messages.findAllByCompanyIdAndClientIdOrderByCreatedAtAsc(companyId, link.getClient().getId()).stream()
                .filter(row -> row.getChannel() == MessageChannel.GUEST_APP)
                .toList();
        if (rows.isEmpty()) return List.of();
        ClientMessage latest = rows.get(rows.size() - 1);
        Client client = link.getClient();
        return List.of(new GuestThreadSummary(
                client.getId(),
                client.getFirstName(),
                client.getLastName(),
                summarizeMessage(latest),
                messageDisplaySender(latest),
                latest.getSentAt() != null ? latest.getSentAt() : latest.getCreatedAt(),
                rows.size(),
                countGuestUnread(rows, link)
        ));
    }

    @Transactional
    public List<MessageView> listGuestMessages(GuestUser guestUser, Long companyId, Integer limit) {
        GuestTenantLink link = requireActiveGuestLink(guestUser, companyId);
        List<ClientMessage> rows = messages.findAllByCompanyIdAndClientIdOrderByCreatedAtAsc(companyId, link.getClient().getId()).stream()
                .filter(row -> row.getChannel() == MessageChannel.GUEST_APP)
                .toList();
        markGuestMessagesRead(link, rows);
        List<MessageView> out = rows.stream().map(this::toView).toList();
        if (limit != null && limit > 0 && out.size() > limit) return out.subList(out.size() - limit, out.size());
        return out;
    }

    @Transactional(noRollbackFor = ResponseStatusException.class)
    public MessageView sendGuestMessage(GuestUser guestUser, Long companyId, String body) {
        GuestTenantLink link = requireActiveGuestLink(guestUser, companyId);
        String normalizedBody = normalizeBody(body);
        if (normalizedBody.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Message body is required.");

        ClientMessage row = new ClientMessage();
        row.setCompany(link.getCompany());
        row.setClient(link.getClient());
        row.setGuestUser(guestUser);
        row.setDirection(MessageDirection.INBOUND);
        row.setChannel(MessageChannel.GUEST_APP);
        row.setStatus(MessageStatus.RECEIVED);
        row.setRecipient(blankToNull(guestUser.getEmail()) != null ? guestUser.getEmail().trim() : String.valueOf(guestUser.getId()));
        Instant sentAt = Instant.now();
        row.setBody(normalizedBody);
        row.setSentAt(sentAt);
        row.setErrorMessage(null);
        List<ClientMessage> existingRows = messages.findAllByCompanyIdAndClientIdOrderByCreatedAtAsc(companyId, link.getClient().getId()).stream()
                .filter(message -> message.getChannel() == MessageChannel.GUEST_APP)
                .toList();
        markGuestMessagesRead(link, existingRows, sentAt);
        ClientMessage saved = messages.save(row);
        return toView(saved);
    }

    @Transactional(readOnly = true)
    public AttachmentDownload downloadGuestAttachment(GuestUser guestUser, Long companyId, Long attachmentId) {
        GuestTenantLink link = requireActiveGuestLink(guestUser, companyId);
        ClientMessageAttachment attachment = messageAttachments
                .findByIdAndMessageCompanyIdAndMessageClientIdAndMessageChannel(attachmentId, companyId, link.getClient().getId(), MessageChannel.GUEST_APP)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Attachment not found."));
        ClientFile file = attachment.getClientFile();
        byte[] bytes = fileStorage.download(file.getS3ObjectKey());
        String contentType = blankToNull(file.getContentType()) == null ? MediaType.APPLICATION_OCTET_STREAM_VALUE : file.getContentType();
        return new AttachmentDownload(file.getOriginalFileName(), contentType, bytes);
    }

    @Transactional(readOnly = true)
    public List<ThreadSummary> listThreads(User me, ThreadFilter filter) {
        List<ClientMessage> visible = filterVisibleMessages(me);
        List<ClientMessage> filtered = visible.stream().filter(row -> matchesFilter(row, filter)).toList();
        Map<Long, GuestTenantLink> activeGuestLinksByClientId = guestTenantLinks.findAllByCompanyIdAndStatus(me.getCompany().getId(), GuestTenantLinkStatus.ACTIVE).stream()
                .collect(Collectors.toMap(link -> link.getClient().getId(), link -> link, (left, right) -> left, LinkedHashMap::new));
        Map<Long, List<ClientMessage>> grouped = filtered.stream()
                .collect(Collectors.groupingBy(row -> row.getClient().getId(), LinkedHashMap::new, Collectors.toList()));

        List<ThreadSummary> out = new ArrayList<>();
        for (List<ClientMessage> rows : grouped.values()) {
            ClientMessage latest = rows.stream().max(Comparator.comparing(ClientMessage::getCreatedAt)).orElse(null);
            if (latest == null) continue;
            Client client = latest.getClient();
            User latestSender = latest.getSenderUser();
            String inboundSenderName = latest.getDirection() == MessageDirection.INBOUND ? clientDisplayName(client) : null;
            String inboundSenderPhone = latest.getDirection() == MessageDirection.INBOUND ? blankToNull(preferredPhone(client)) : null;
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
                    summarizeMessage(latest),
                    displayUserName(latestSender) != null ? displayUserName(latestSender) : inboundSenderName,
                    blankToNull(latestSender != null ? latestSender.getPhone() : null) != null ? blankToNull(latestSender != null ? latestSender.getPhone() : null) : inboundSenderPhone,
                    latest.getSentAt() != null ? latest.getSentAt() : latest.getCreatedAt(),
                    rows.size(),
                    countStaffUnread(rows, activeGuestLinksByClientId.get(client.getId()))
            ));
        }
        out.sort(Comparator.comparing((ThreadSummary row) -> row.lastSentAt() != null ? row.lastSentAt() : Instant.EPOCH).reversed());
        return out;
    }

    @Transactional
    public List<MessageView> listClientMessages(User me, Long clientId, MessageChannel channel, Integer limit) {
        Client client = requireVisibleClient(me, clientId);
        List<ClientMessage> rows = messages.findAllByCompanyIdAndClientIdOrderByCreatedAtAsc(me.getCompany().getId(), client.getId());
        if (channel == null || channel == MessageChannel.GUEST_APP) markStaffMessagesRead(me.getCompany().getId(), client.getId(), rows);
        List<MessageView> out = rows.stream()
                .filter(row -> channel == null || row.getChannel() == channel)
                .map(this::toView)
                .toList();
        if (limit != null && limit > 0 && out.size() > limit) return out.subList(out.size() - limit, out.size());
        return out;
    }

    /**
     * Failed sends are persisted with {@link MessageStatus#FAILED} so the timeline shows the attempt.
     * We must not roll back on {@link ResponseStatusException} after save, otherwise the INSERT is lost.
     */
    @Transactional(noRollbackFor = ResponseStatusException.class)
    public MessageView send(User me, SendMessageRequest request) {
        if (request == null || request.clientId() == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "clientId is required.");
        Client client = requireVisibleClient(me, request.clientId());
        List<ClientFile> attachmentFiles = resolveAttachmentFiles(me, client, request.attachmentFileIds());
        return sendInternal(me, client, request, attachmentFiles);
    }

    @Transactional(noRollbackFor = ResponseStatusException.class)
    public MessageView sendWithAttachments(
            User me,
            Long clientId,
            MessageChannel channel,
            String subject,
            String body,
            List<MultipartFile> files
    ) {
        if (clientId == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "clientId is required.");
        Client client = requireVisibleClient(me, clientId);
        List<ClientFile> attachmentFiles = persistUploadedClientFiles(me, client, files);
        return sendInternal(me, client, new SendMessageRequest(clientId, channel, subject, body, null), attachmentFiles);
    }

    @Transactional
    public StoredFileResponse preuploadInboxAttachment(User me, Long clientId, MultipartFile file) {
        if (clientId == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "clientId is required.");
        if (file == null || file.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Attachment file is required.");
        Client client = requireVisibleClient(me, clientId);
        ClientFileUploadPolicy.validateInboxAttachments(List.of(file));
        var stored = fileStorage.uploadClientFile(me.getCompany(), client, file);
        ClientFile row = new ClientFile();
        row.setClient(client);
        row.setOwnerCompany(me.getCompany());
        row.setOriginalFileName(file.getOriginalFilename() == null || file.getOriginalFilename().isBlank() ? "file" : file.getOriginalFilename().trim());
        row.setContentType(stored.contentType());
        row.setSizeBytes(stored.sizeBytes());
        row.setS3ObjectKey(stored.objectKey());
        row.setUploadedByUserId(me.getId());
        row.setPendingInboxAttachment(true);
        return StoredFileResponse.from(clientFiles.save(row));
    }

    @Transactional
    public void discardPendingInboxAttachment(User me, Long clientId, Long fileId) {
        if (clientId == null || fileId == null) return;
        requireVisibleClient(me, clientId);
        var file = clientFiles.findByIdAndClientIdAndOwnerCompanyId(fileId, clientId, me.getCompany().getId()).orElse(null);
        if (file == null || !file.isPendingInboxAttachment()) return;
        if (messageAttachments.existsByClientFileId(file.getId())) {
            file.setPendingInboxAttachment(false);
            clientFiles.save(file);
            return;
        }
        fileStorage.deleteQuietly(file.getS3ObjectKey());
        clientFiles.delete(file);
    }

    @Transactional
    public void cleanupExpiredPendingInboxAttachments(Instant cutoff) {
        if (cutoff == null) return;
        List<ClientFile> staleFiles = clientFiles.findAllByPendingInboxAttachmentTrueAndCreatedAtBefore(cutoff);
        for (ClientFile file : staleFiles) {
            if (file == null) continue;
            if (messageAttachments.existsByClientFileId(file.getId())) {
                file.setPendingInboxAttachment(false);
                clientFiles.save(file);
                continue;
            }
            fileStorage.deleteQuietly(file.getS3ObjectKey());
            clientFiles.delete(file);
        }
    }

    private MessageView sendInternal(User me, Client client, SendMessageRequest request, List<ClientFile> attachmentFiles) {
        MessageChannel channel = request.channel() == null ? MessageChannel.EMAIL : request.channel();
        String body = normalizeBody(request.body());
        List<ClientFile> safeAttachments = attachmentFiles == null ? List.of() : attachmentFiles;
        if (body.isBlank() && safeAttachments.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Message body or at least one attachment is required.");
        if (!safeAttachments.isEmpty() && channel != MessageChannel.GUEST_APP) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Attachments are currently supported only for Guest App messages.");
        }

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
                case GUEST_APP -> sendGuestAppMessage(client, body, me, row, safeAttachments);
            };
            row.setRecipient(result.recipient());
            row.setExternalMessageId(result.externalMessageId());
            row.setStatus(result.status() == null ? MessageStatus.SENT : result.status());
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
        linkAttachments(saved, safeAttachments);
        finalizePendingInboxAttachments(safeAttachments);
        if (saved.getStatus() == MessageStatus.FAILED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    saved.getErrorMessage() == null || saved.getErrorMessage().isBlank()
                            ? "Failed to send message."
                            : saved.getErrorMessage());
        }
        if (saved.getChannel() == MessageChannel.GUEST_APP && saved.getSentAt() != null) {
            List<ClientMessage> guestAppRows = messages.findAllByCompanyIdAndClientIdOrderByCreatedAtAsc(saved.getCompany().getId(), saved.getClient().getId()).stream()
                    .filter(message -> message.getChannel() == MessageChannel.GUEST_APP)
                    .toList();
            markStaffMessagesRead(saved.getCompany().getId(), saved.getClient().getId(), guestAppRows, saved.getSentAt());
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
                if (messagesNode.isArray()) {
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
                JsonNode statusesNode = value.path("statuses");
                if (statusesNode.isArray()) {
                    for (JsonNode statusNode : statusesNode) {
                        if (applyWhatsAppStatusUpdate(companyId, statusNode)) savedCount++;
                    }
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


    private boolean applyWhatsAppStatusUpdate(Long companyId, JsonNode statusNode) {
        String externalId = blankToNull(statusNode.path("id").asText(null));
        if (externalId == null) return false;
        ClientMessage row = messages.findFirstByCompanyIdAndExternalMessageId(companyId, externalId).orElse(null);
        if (row == null || row.getDirection() != MessageDirection.OUTBOUND || row.getChannel() != MessageChannel.WHATSAPP) return false;

        MessageStatus nextStatus = mapWhatsAppStatus(statusNode.path("status").asText(null));
        if (nextStatus == null) return false;

        row.setStatus(nextStatus);
        if (nextStatus == MessageStatus.FAILED) {
            row.setErrorMessage(trimToLength(extractWhatsAppStatusError(statusNode), 1800));
        } else {
            row.setErrorMessage(null);
        }
        JsonNode timestampNode = statusNode.path("timestamp");
        if (!timestampNode.isMissingNode()) {
            Instant statusInstant = parseEpochSecond(timestampNode.asText(null));
            if (statusInstant != null) row.setSentAt(statusInstant);
        }
        messages.save(row);
        return true;
    }

    private MessageStatus mapWhatsAppStatus(String status) {
        if (status == null || status.isBlank()) return null;
        return switch (status.trim().toLowerCase(Locale.ROOT)) {
            case "sent" -> MessageStatus.SENT;
            case "delivered" -> MessageStatus.DELIVERED;
            case "read" -> MessageStatus.READ;
            case "failed" -> MessageStatus.FAILED;
            default -> null;
        };
    }

    private String extractWhatsAppStatusError(JsonNode statusNode) {
        JsonNode errorsNode = statusNode.path("errors");
        if (!errorsNode.isArray() || errorsNode.isEmpty()) return null;
        JsonNode errorNode = errorsNode.get(0);
        String title = blankToNull(errorNode.path("title").asText(null));
        String message = blankToNull(errorNode.path("message").asText(null));
        String code = blankToNull(errorNode.path("code").asText(null));
        String details = blankToNull(errorNode.path("error_data").path("details").asText(null));
        return List.of(title, message, details, code == null ? null : "code " + code).stream()
                .filter(Objects::nonNull)
                .collect(Collectors.joining(" · "));
    }

    private Instant parseEpochSecond(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return Instant.ofEpochSecond(Long.parseLong(raw.trim()));
        } catch (NumberFormatException ignored) {
            return null;
        }
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

    private String clientDisplayName(Client client) {
        if (client == null) return null;
        String label = List.of(blankToNull(client.getFirstName()), blankToNull(client.getLastName())).stream()
                .filter(Objects::nonNull)
                .collect(Collectors.joining(" "))
                .trim();
        return label.isBlank() ? null : label;
    }

    private GuestTenantLink requireActiveGuestLink(GuestUser guestUser, Long companyId) {
        return guestTenantLinks.findByGuestUserIdAndCompanyId(guestUser.getId(), companyId)
                .filter(link -> link.getStatus() == GuestTenantLinkStatus.ACTIVE)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tenant membership not found."));
    }

    private long countStaffUnread(List<ClientMessage> rows, GuestTenantLink guestLink) {
        Instant readAt = guestLink == null ? null : guestLink.getStaffInboxLastReadAt();
        return rows.stream()
                .filter(row -> row.getDirection() == MessageDirection.INBOUND)
                .filter(row -> {
                    if (row.getChannel() != MessageChannel.GUEST_APP) return row.getStatus() == MessageStatus.RECEIVED;
                    if (readAt == null) return row.getStatus() == MessageStatus.RECEIVED;
                    return messageInstant(row).isAfter(readAt);
                })
                .count();
    }

    private long countGuestUnread(List<ClientMessage> rows, GuestTenantLink guestLink) {
        Instant readAt = guestLink == null ? null : guestLink.getGuestInboxLastReadAt();
        return rows.stream()
                .filter(row -> row.getChannel() == MessageChannel.GUEST_APP)
                .filter(row -> row.getDirection() == MessageDirection.OUTBOUND)
                .filter(row -> row.getStatus() != MessageStatus.FAILED)
                .filter(row -> {
                    if (readAt == null) return row.getStatus() == MessageStatus.SENT || row.getStatus() == MessageStatus.DELIVERED;
                    return messageInstant(row).isAfter(readAt);
                })
                .count();
    }

    private void markStaffMessagesRead(Long companyId, Long clientId, List<ClientMessage> rows) {
        markStaffMessagesRead(companyId, clientId, rows, Instant.now());
    }

    private void markStaffMessagesRead(Long companyId, Long clientId, List<ClientMessage> rows, Instant readAt) {
        GuestTenantLink link = guestTenantLinks.findByCompanyIdAndClientIdAndStatus(companyId, clientId, GuestTenantLinkStatus.ACTIVE).orElse(null);
        if (link != null) {
            Instant existing = link.getStaffInboxLastReadAt();
            if (existing == null || readAt.isAfter(existing)) {
                link.setStaffInboxLastReadAt(readAt);
                guestTenantLinks.save(link);
            }
        }
        rows.stream()
                .filter(row -> row.getChannel() == MessageChannel.GUEST_APP)
                .filter(row -> row.getDirection() == MessageDirection.INBOUND)
                .filter(row -> row.getStatus() == MessageStatus.RECEIVED)
                .filter(row -> !messageInstant(row).isAfter(readAt))
                .forEach(row -> {
                    row.setStatus(MessageStatus.READ);
                    messages.save(row);
                });
    }

    private void markGuestMessagesRead(GuestTenantLink link, List<ClientMessage> rows) {
        markGuestMessagesRead(link, rows, Instant.now());
    }

    private void markGuestMessagesRead(GuestTenantLink link, List<ClientMessage> rows, Instant readAt) {
        Instant existing = link.getGuestInboxLastReadAt();
        if (existing == null || readAt.isAfter(existing)) {
            link.setGuestInboxLastReadAt(readAt);
            guestTenantLinks.save(link);
        }
        rows.stream()
                .filter(row -> row.getChannel() == MessageChannel.GUEST_APP)
                .filter(row -> row.getDirection() == MessageDirection.OUTBOUND)
                .filter(row -> row.getStatus() == MessageStatus.SENT || row.getStatus() == MessageStatus.DELIVERED)
                .filter(row -> !messageInstant(row).isAfter(readAt))
                .forEach(row -> {
                    row.setStatus(MessageStatus.READ);
                    messages.save(row);
                });
    }

    private Instant messageInstant(ClientMessage row) {
        return row.getSentAt() != null ? row.getSentAt() : row.getCreatedAt();
    }

    private String messageDisplaySender(ClientMessage row) {
        if (row == null) return null;
        if (row.getDirection() == MessageDirection.INBOUND) {
            return clientDisplayName(row.getClient());
        }
        String userName = displayUserName(row.getSenderUser());
        return userName != null ? userName : "Staff";
    }

    private List<ClientFile> resolveAttachmentFiles(User me, Client client, List<Long> attachmentFileIds) {
        if (attachmentFileIds == null || attachmentFileIds.isEmpty()) return List.of();
        List<Long> ids = attachmentFileIds.stream().filter(Objects::nonNull).distinct().toList();
        if (ids.isEmpty()) return List.of();
        List<ClientFile> files = clientFiles.findAllByIdInAndClientIdAndOwnerCompanyId(ids, client.getId(), me.getCompany().getId());
        if (files.size() != ids.size()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "One or more attachments could not be found for this client.");
        }
        Map<Long, ClientFile> byId = files.stream().collect(Collectors.toMap(ClientFile::getId, file -> file));
        return ids.stream().map(byId::get).filter(Objects::nonNull).toList();
    }

    private List<ClientFile> persistUploadedClientFiles(User me, Client client, List<MultipartFile> files) {
        if (files == null || files.isEmpty()) return List.of();
        List<MultipartFile> validFiles = files.stream()
                .filter(Objects::nonNull)
                .filter(file -> !file.isEmpty())
                .toList();
        if (validFiles.isEmpty()) return List.of();
        ClientFileUploadPolicy.validateInboxAttachments(validFiles);
        List<ClientFile> out = new ArrayList<>();
        for (MultipartFile file : validFiles) {
            var stored = fileStorage.uploadClientFile(me.getCompany(), client, file);
            ClientFile row = new ClientFile();
            row.setClient(client);
            row.setOwnerCompany(me.getCompany());
            row.setOriginalFileName(file.getOriginalFilename() == null || file.getOriginalFilename().isBlank() ? "file" : file.getOriginalFilename().trim());
            row.setContentType(stored.contentType());
            row.setSizeBytes(stored.sizeBytes());
            row.setS3ObjectKey(stored.objectKey());
            row.setUploadedByUserId(me.getId());
            out.add(clientFiles.save(row));
        }
        return out;
    }



    private void linkAttachments(ClientMessage message, List<ClientFile> files) {
        if (message == null || files == null || files.isEmpty()) return;
        for (ClientFile file : files) {
            ClientMessageAttachment attachment = new ClientMessageAttachment();
            attachment.setMessage(message);
            attachment.setClientFile(file);
            messageAttachments.save(attachment);
            message.getAttachments().add(attachment);
        }
    }

    private void finalizePendingInboxAttachments(List<ClientFile> files) {
        if (files == null || files.isEmpty()) return;
        for (ClientFile file : files) {
            if (file == null || !file.isPendingInboxAttachment()) continue;
            file.setPendingInboxAttachment(false);
            clientFiles.save(file);
        }
    }

    private List<MessageAttachmentView> toAttachmentViews(ClientMessage row) {
        if (row.getAttachments() == null || row.getAttachments().isEmpty()) return List.of();
        return row.getAttachments().stream()
                .filter(Objects::nonNull)
                .map(attachment -> {
                    ClientFile file = attachment.getClientFile();
                    return file == null ? null : new MessageAttachmentView(
                            attachment.getId(),
                            file.getId(),
                            file.getOriginalFileName(),
                            file.getContentType(),
                            file.getSizeBytes(),
                            file.getCreatedAt()
                    );
                })
                .filter(Objects::nonNull)
                .toList();
    }

    private String summarizeMessage(ClientMessage row) {
        String preview = summarize(row.getBody());
        if (preview != null && !preview.isBlank()) return preview;
        return attachmentSummary(toAttachmentViews(row));
    }

    private String messagePreview(String body, List<ClientFile> attachments) {
        String preview = summarize(body);
        if (preview != null && !preview.isBlank()) return preview;
        if (attachments == null || attachments.isEmpty()) return null;
        if (attachments.size() == 1) return "Attachment: " + attachments.get(0).getOriginalFileName();
        return attachments.size() + " attachments";
    }

    private String attachmentSummary(List<MessageAttachmentView> attachments) {
        if (attachments == null || attachments.isEmpty()) return null;
        if (attachments.size() == 1) return "Attachment: " + attachments.get(0).fileName();
        return attachments.size() + " attachments";
    }

    private MessageView toView(ClientMessage row) {
        Client client = row.getClient();
        User senderUser = row.getSenderUser();
        String inboundSenderName = row.getDirection() == MessageDirection.INBOUND ? clientDisplayName(client) : null;
        String inboundSenderPhone = row.getDirection() == MessageDirection.INBOUND ? blankToNull(preferredPhone(client)) : null;
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
                displayUserName(senderUser) != null ? displayUserName(senderUser) : inboundSenderName,
                blankToNull(senderUser != null ? senderUser.getPhone() : null) != null ? blankToNull(senderUser != null ? senderUser.getPhone() : null) : inboundSenderPhone,
                row.getSentAt(),
                row.getCreatedAt(),
                toAttachmentViews(row)
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

    private ChannelDeliveryResult sendGuestAppMessage(Client client, String body, User me, ClientMessage row, List<ClientFile> attachments) {
        GuestTenantLink link = guestTenantLinks.findByCompanyIdAndClientIdAndStatus(
                        client.getCompany().getId(),
                        client.getId(),
                        GuestTenantLinkStatus.ACTIVE
                )
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Client is not linked to the guest mobile app."));
        row.setGuestUser(link.getGuestUser());
        String recipient = blankToNull(link.getGuestUser().getEmail()) != null
                ? link.getGuestUser().getEmail().trim()
                : String.valueOf(link.getGuestUser().getId());
        String payloadJson = null;
        try {
            payloadJson = objectMapper.writeValueAsString(Map.of(
                    "type", "guest_chat_message",
                    "companyId", String.valueOf(client.getCompany().getId()),
                    "clientId", String.valueOf(client.getId()),
                    "channel", MessageChannel.GUEST_APP.name(),
                    "screen", "inbox",
                    "deeplink", "guest://inbox?companyId=" + client.getCompany().getId()
            ));
        } catch (Exception ignore) {
        }
        String title = "New message from " + (displayUserName(me) != null ? displayUserName(me) : client.getCompany().getName());
        String preview = messagePreview(body, attachments);
        guestNotifications.guestMessage(
                link.getGuestUser(),
                client.getCompany(),
                client,
                title,
                preview,
                payloadJson
        );
        GuestPushService.DeliveryResult delivery = guestPush.notifyGuestMessage(link.getGuestUser(), client.getCompany(), client, title, preview);
        return new ChannelDeliveryResult(recipient, null, delivery.delivered() ? MessageStatus.DELIVERED : MessageStatus.SENT);
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
            return new ChannelDeliveryResult(to, null, null);
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
            return new ChannelDeliveryResult(to, extractMetaMessageId(response.getBody()), null);
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
            return new ChannelDeliveryResult(client.getViberUserId().trim(), extractViberMessageToken(response.getBody()), null);
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
            case GUEST_APP -> blankToNull(client.getEmail()) != null ? client.getEmail().trim() : String.valueOf(client.getId());
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

    private record ChannelDeliveryResult(String recipient, String externalMessageId, MessageStatus status) {}
}
