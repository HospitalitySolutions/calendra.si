package com.example.app.inbox;

import com.example.app.client.Client;
import com.example.app.client.ClientRepository;
import com.example.app.company.Company;
import com.example.app.delivery.MessageDeliveryChannel;
import com.example.app.delivery.MessageDeliveryLogService;
import com.example.app.email.TenantEmailSenderResolver;
import com.example.app.guest.common.GuestSettingsService;
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
import com.example.app.user.Role;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.GlobalMessagingProviderService;
import com.example.app.settings.SettingKey;
import com.example.app.settings.SettingsCryptoService;
import com.example.app.settings.TenantSmsQuotaService;
import com.example.app.sms.SmsGateway;
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
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestClientException;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ClientMessageService {
    private static final ZoneId SYSTEM_ZONE = ZoneId.systemDefault();
    private static final String META_GRAPH_BASE = "https://graph.facebook.com/v23.0";
    private static final String VIBER_BASE = "https://chatapi.viber.com/pa";
    private static final String LEGACY_CONVERSATION_PREFIX = "legacy-client-";

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
    private final SmsGateway smsGateway;
    private final JavaMailSender mailSender;
    private final boolean mailConfigured;
    private final boolean smsConfigured;
    private final String mailFrom;
    private final String fallbackFrom;
    private final TenantEmailSenderResolver emailSenderResolver;
    private final ObjectMapper objectMapper;
    private final GlobalMessagingProviderService globalMessagingProviders;
    private final GuestSettingsService guestSettingsService;
    private final ScheduledMessageRepository scheduledMessages;
    private final TenantSmsQuotaService smsQuotaService;
    private final com.example.app.common.TimeService timeService;
    private final TransactionTemplate transactionTemplate;
    private final int scheduledDispatchBatchSize;
    private final RestTemplate restTemplate = new RestTemplate();

    @Autowired(required = false)
    private MessageDeliveryLogService deliveryLogs;

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
            GlobalMessagingProviderService globalMessagingProviders,
            GuestSettingsService guestSettingsService,
            ScheduledMessageRepository scheduledMessages,
            com.example.app.common.TimeService timeService,
            PlatformTransactionManager transactionManager,
            @Value("${app.inbox.scheduled-dispatch-batch-size:100}") int scheduledDispatchBatchSize,
            TenantSmsQuotaService smsQuotaService,
            SmsGateway smsGateway,
            @Autowired(required = false) JavaMailSender mailSender,
            @Value("${app.mail.from:}") String mailFrom,
            @Value("${spring.mail.host:}") String mailHost,
            @Value("${spring.mail.username:}") String mailUsername,
            ObjectMapper objectMapper,
            @Autowired(required = false) TenantEmailSenderResolver emailSenderResolver
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
        this.globalMessagingProviders = globalMessagingProviders;
        this.guestSettingsService = guestSettingsService;
        this.scheduledMessages = scheduledMessages;
        this.timeService = timeService;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
        this.scheduledDispatchBatchSize = Math.max(10, Math.min(1000, scheduledDispatchBatchSize));
        this.smsQuotaService = smsQuotaService;
        this.smsGateway = smsGateway;
        this.smsConfigured = smsGateway != null && smsGateway.isConfigured();
        this.mailSender = mailSender;
        this.mailFrom = mailFrom == null ? "" : mailFrom.trim();
        this.fallbackFrom = mailUsername == null ? "" : mailUsername.trim();
        this.mailConfigured = mailSender != null && mailHost != null && !mailHost.isBlank();
        this.emailSenderResolver = emailSenderResolver;
        this.objectMapper = objectMapper;
    }

    public record ThreadFilter(
            String search,
            Long clientId,
            MessageChannel channel,
            MessageStatus status,
            LocalDate from,
            LocalDate to,
            Long assignedUserId
    ) {}

    public record ThreadSummary(
            Long clientId,
            String threadKey,
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
            long unreadCount,
            Long assignedToId,
            String assignedToName,
            boolean starred,
            boolean closed
    ) {}

    public record GuestThreadSummary(
            Long clientId,
            String threadKey,
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
            String threadKey,
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
            List<MessageAttachmentView> attachments,
            boolean internalNote
    ) {}

    public record SendMessageRequest(Long clientId, MessageChannel channel, String subject, String body, List<Long> attachmentFileIds) {}

    public record ScheduleRequest(
            Long clientId,
            MessageChannel channel,
            String subject,
            String body,
            Instant scheduledFor,
            MessageRecurrence recurrence
    ) {}

    public record ScheduledMessageView(
            Long id,
            Long clientId,
            String clientName,
            MessageChannel channel,
            String subject,
            String body,
            Instant scheduledFor,
            MessageRecurrence recurrence,
            ScheduledMessageStatus status
    ) {}

    public record InternalNoteRequest(String body) {}

    public record AssigneeRequest(Long userId) {}

    public record AssigneeView(Long clientId, Long assignedToId, String assignedToName) {}

    public record StarRequest(Boolean starred) {}

    public record StatusRequest(Boolean closed) {}

    public record ThreadFlagsView(Long clientId, String threadKey, boolean starred, boolean closed) {}

    @Transactional(readOnly = true)
    public List<GuestThreadSummary> listGuestThreads(GuestUser guestUser, Long companyId) {
        return listGuestThreads(guestUser, companyId, 0, 100);
    }

    @Transactional(readOnly = true)
    public List<GuestThreadSummary> listGuestThreads(GuestUser guestUser, Long companyId, int page, int size) {
        GuestTenantLink link = requireActiveGuestLink(guestUser, companyId);
        requireGuestInboxEnabled(companyId);
        List<ClientMessage> rows = messages.findPageByCompanyIdAndClientIdOrderByCreatedAtDesc(
                        companyId,
                        link.getClient().getId(),
                        PageRequest.of(safePage(page), safeSize(size, 100, 500))
                ).stream()
                .filter(row -> row.getChannel() == MessageChannel.GUEST_APP)
                .toList();
        if (rows.isEmpty()) return List.of();
        Client client = link.getClient();
        return groupByConversationKey(rows).entrySet().stream()
                .map(entry -> {
                    List<ClientMessage> conversationRows = entry.getValue();
                    ClientMessage latest = latestDisplayMessage(conversationRows);
                    if (latest == null) return null;
                    return new GuestThreadSummary(
                            client.getId(),
                            entry.getKey(),
                            client.getFirstName(),
                            client.getLastName(),
                            summarizeMessage(latest),
                            messageDisplaySender(latest),
                            latest.getSentAt() != null ? latest.getSentAt() : latest.getCreatedAt(),
                            conversationRows.size(),
                            countGuestUnread(conversationRows, link)
                    );
                })
                .filter(Objects::nonNull)
                .sorted(Comparator.comparing((GuestThreadSummary row) -> row.lastSentAt() != null ? row.lastSentAt() : Instant.EPOCH).reversed())
                .toList();
    }

    @Transactional
    public List<MessageView> listGuestMessages(GuestUser guestUser, Long companyId, Integer limit) {
        return listGuestMessages(guestUser, companyId, limit, 0, limit == null || limit <= 0 ? 100 : limit);
    }

    @Transactional
    public List<MessageView> listGuestMessages(GuestUser guestUser, Long companyId, Integer limit, int page, int size) {
        GuestTenantLink link = requireActiveGuestLink(guestUser, companyId);
        requireGuestInboxEnabled(companyId);
        int effectiveSize = limit != null && limit > 0 ? Math.min(limit, safeSize(size, 100, 500)) : safeSize(size, 100, 500);
        List<ClientMessage> rows = messages.findPageByCompanyIdAndClientIdOrderByCreatedAtDesc(
                        companyId,
                        link.getClient().getId(),
                        PageRequest.of(safePage(page), effectiveSize)
                ).stream()
                .filter(row -> row.getChannel() == MessageChannel.GUEST_APP)
                .toList();
        String latestKey = latestConversationKey(rows);
        List<ClientMessage> selectedRows = latestKey == null ? rows : rows.stream()
                .filter(row -> Objects.equals(conversationKey(row), latestKey))
                .toList();
        List<ClientMessage> chronological = new ArrayList<>(selectedRows);
        chronological.sort(Comparator.comparing(ClientMessage::getCreatedAt).thenComparing(ClientMessage::getId));
        markGuestMessagesRead(link, chronological);
        return chronological.stream().map(this::toView).toList();
    }

    @Transactional(noRollbackFor = ResponseStatusException.class)
    public MessageView sendGuestMessage(GuestUser guestUser, Long companyId, String body, List<Long> attachmentFileIds) {
        GuestTenantLink link = requireActiveGuestLink(guestUser, companyId);
        requireGuestInboxEnabled(companyId);
        String normalizedBody = normalizeBody(body);
        List<ClientFile> attachmentFiles = resolveGuestAttachmentFiles(link, attachmentFileIds);
        if (normalizedBody.isBlank() && attachmentFiles.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Message body or at least one attachment is required.");
        }

        String conversationKey = resolveOpenConversationKey(
                link.getClient(),
                messages.findFirstByCompanyIdAndClientIdAndChannelAndConversationClosedFalseOrderByCreatedAtDescIdDesc(
                        companyId, link.getClient().getId(), MessageChannel.GUEST_APP)
        );

        ClientMessage row = new ClientMessage();
        row.setCompany(link.getCompany());
        row.setClient(link.getClient());
        row.setGuestUser(guestUser);
        row.setConversationKey(conversationKey);
        row.setConversationClosed(false);
        row.setConversationStarred(false);
        row.setDirection(MessageDirection.INBOUND);
        row.setChannel(MessageChannel.GUEST_APP);
        row.setStatus(MessageStatus.RECEIVED);
        row.setRecipient(blankToNull(guestUser.getEmail()) != null ? guestUser.getEmail().trim() : String.valueOf(guestUser.getId()));
        Instant sentAt = Instant.now();
        row.setBody(normalizedBody);
        row.setSentAt(sentAt);
        row.setErrorMessage(null);
        markGuestMessagesRead(link, existingRows, sentAt);
        ClientMessage saved = messages.save(row);
        linkAttachments(saved, attachmentFiles);
        finalizePendingInboxAttachments(attachmentFiles);
        return toView(saved);
    }

    @Transactional
    public StoredFileResponse preuploadGuestInboxAttachment(GuestUser guestUser, Long companyId, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Attachment file is required.");
        }
        GuestTenantLink link = requireActiveGuestLink(guestUser, companyId);
        requireGuestInboxEnabled(companyId);
        ClientFileUploadPolicy.validateInboxAttachments(List.of(file));
        Client client = link.getClient();
        Company tenant = link.getCompany();
        var stored = fileStorage.uploadClientFile(tenant, client, file);
        ClientFile row = new ClientFile();
        row.setClient(client);
        row.setOwnerCompany(tenant);
        row.setOriginalFileName(file.getOriginalFilename() == null || file.getOriginalFilename().isBlank() ? "file" : file.getOriginalFilename().trim());
        row.setContentType(stored.contentType());
        row.setSizeBytes(stored.sizeBytes());
        row.setS3ObjectKey(stored.objectKey());
        row.setUploadedByGuestUserId(guestUser.getId());
        row.setPendingInboxAttachment(true);
        return StoredFileResponse.from(clientFiles.save(row));
    }

    @Transactional
    public void discardGuestPendingInboxAttachment(GuestUser guestUser, Long companyId, Long fileId) {
        if (fileId == null) return;
        GuestTenantLink link = requireActiveGuestLink(guestUser, companyId);
        requireGuestInboxEnabled(companyId);
        var file = clientFiles.findByIdAndClientIdAndOwnerCompanyId(fileId, link.getClient().getId(), link.getCompany().getId()).orElse(null);
        if (file == null || !file.isPendingInboxAttachment()) return;
        if (messageAttachments.existsByClientFileId(file.getId())) {
            file.setPendingInboxAttachment(false);
            clientFiles.save(file);
            return;
        }
        fileStorage.deleteQuietly(file.getS3ObjectKey());
        clientFiles.delete(file);
    }

    private List<ClientFile> resolveGuestAttachmentFiles(GuestTenantLink link, List<Long> attachmentFileIds) {
        if (attachmentFileIds == null || attachmentFileIds.isEmpty()) return List.of();
        List<Long> ids = attachmentFileIds.stream().filter(Objects::nonNull).distinct().toList();
        if (ids.isEmpty()) return List.of();
        List<ClientFile> files = clientFiles.findAllByIdInAndClientIdAndOwnerCompanyId(ids, link.getClient().getId(), link.getCompany().getId());
        if (files.size() != ids.size()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "One or more attachments could not be found.");
        }
        Map<Long, ClientFile> byId = files.stream().collect(Collectors.toMap(ClientFile::getId, file -> file));
        return ids.stream().map(byId::get).filter(Objects::nonNull).toList();
    }

    @Transactional(readOnly = true)
    public AttachmentDownload downloadGuestAttachment(GuestUser guestUser, Long companyId, Long attachmentId) {
        GuestTenantLink link = requireActiveGuestLink(guestUser, companyId);
        requireGuestInboxEnabled(companyId);
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
        return listThreads(me, filter, 0, 100);
    }

    @Transactional(readOnly = true)
    public List<ThreadSummary> listThreads(User me, ThreadFilter filter, int page, int size) {
        List<ClientMessage> visible = filterVisibleMessages(me, page, size);
        List<ClientMessage> filtered = visible.stream().filter(row -> matchesFilter(row, filter)).toList();
        Set<Long> visibleClientIds = filtered.stream()
                .map(ClientMessage::getClient)
                .filter(Objects::nonNull)
                .map(Client::getId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<Long, GuestTenantLink> activeGuestLinksByClientId = (visibleClientIds.isEmpty()
                ? List.<GuestTenantLink>of()
                : guestTenantLinks.findAllByCompanyIdAndStatusAndClientIdIn(me.getCompany().getId(), GuestTenantLinkStatus.ACTIVE, visibleClientIds)).stream()
                .collect(Collectors.toMap(link -> link.getClient().getId(), link -> link, (left, right) -> left, LinkedHashMap::new));
        Map<String, List<ClientMessage>> grouped = groupByConversationKey(filtered);

        List<ThreadSummary> out = new ArrayList<>();
        for (Map.Entry<String, List<ClientMessage>> entry : grouped.entrySet()) {
            List<ClientMessage> rows = entry.getValue();
            ClientMessage latest = latestDisplayMessage(rows);
            if (latest == null) continue;
            Client client = latest.getClient();
            User assignee = client.getAssignedTo();
            User latestSender = latest.getSenderUser();
            String inboundSenderName = latest.getDirection() == MessageDirection.INBOUND ? clientDisplayName(client) : null;
            String inboundSenderPhone = latest.getDirection() == MessageDirection.INBOUND ? blankToNull(preferredPhone(client)) : null;
            out.add(new ThreadSummary(
                    client.getId(),
                    entry.getKey(),
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
                    countStaffUnread(rows, activeGuestLinksByClientId.get(client.getId())),
                    assignee != null ? assignee.getId() : null,
                    displayUserName(assignee),
                    conversationStarred(rows),
                    conversationClosed(rows)
            ));
        }
        out.sort(Comparator.comparing((ThreadSummary row) -> row.lastSentAt() != null ? row.lastSentAt() : Instant.EPOCH).reversed());
        return out;
    }

    @Transactional
    public List<MessageView> listClientMessages(User me, Long clientId, String threadKey, MessageChannel channel, Integer limit) {
        return listClientMessages(me, clientId, threadKey, channel, limit, 0, limit == null || limit <= 0 ? 100 : limit);
    }

    @Transactional
    public List<MessageView> listClientMessages(User me, Long clientId, String threadKey, MessageChannel channel, Integer limit, int page, int size) {
        Client client = requireVisibleClient(me, clientId);
        String selectedThreadKey = blankToNull(threadKey);
        int effectiveSize = limit != null && limit > 0 ? Math.min(limit, safeSize(size, 100, 500)) : safeSize(size, 100, 500);
        var pageable = PageRequest.of(safePage(page), effectiveSize);
        List<ClientMessage> selectedRows;
        if (selectedThreadKey == null) {
            selectedRows = messages.findPageByCompanyIdAndClientIdOrderByCreatedAtDesc(me.getCompany().getId(), client.getId(), pageable);
            selectedThreadKey = latestConversationKey(selectedRows);
            final String effectiveThreadKey = selectedThreadKey;
            selectedRows = selectedRows.stream()
                    .filter(row -> effectiveThreadKey == null || Objects.equals(conversationKey(row), effectiveThreadKey))
                    .filter(row -> channel == null || row.getChannel() == channel)
                    .toList();
        } else {
            selectedRows = messages.findPageByCompanyIdAndClientIdAndConversationKeyOrderByCreatedAtDesc(
                            me.getCompany().getId(),
                            client.getId(),
                            selectedThreadKey,
                            selectedThreadKey.startsWith(LEGACY_CONVERSATION_PREFIX),
                            pageable
                    ).stream()
                    .filter(row -> channel == null || row.getChannel() == channel)
                    .toList();
        }
        List<ClientMessage> chronological = new ArrayList<>(selectedRows);
        chronological.sort(Comparator.comparing(ClientMessage::getCreatedAt).thenComparing(ClientMessage::getId));
        if (channel == null || channel == MessageChannel.GUEST_APP) markStaffMessagesRead(me.getCompany().getId(), client.getId(), chronological);
        return chronological.stream()
                .map(this::toView)
                .toList();
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

    /** Schedules a message to be delivered at a future time, optionally repeating. */
    @Transactional
    public ScheduledMessageView createScheduledMessage(User me, ScheduleRequest request) {
        if (request == null || request.clientId() == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "clientId is required.");
        Client client = requireVisibleClient(me, request.clientId());
        String body = normalizeBody(request.body());
        if (body.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Message body is required.");
        if (request.scheduledFor() == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Scheduled time is required.");
        if (request.scheduledFor().isBefore(timeService.instant(me.getCompany().getId()))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Scheduled time must be in the future.");
        }
        MessageChannel channel = request.channel() == null ? MessageChannel.EMAIL : request.channel();
        MessageRecurrence recurrence = request.recurrence() == null ? MessageRecurrence.NONE : request.recurrence();

        ScheduledMessage row = new ScheduledMessage();
        row.setCompany(me.getCompany());
        row.setClient(client);
        row.setSenderUser(me);
        row.setChannel(channel);
        row.setSubject(channel == MessageChannel.EMAIL ? blankToNull(normalizeSubject(request.subject())) : null);
        row.setBody(body);
        row.setNextRunAt(request.scheduledFor());
        row.setRecurrence(recurrence);
        row.setStatus(ScheduledMessageStatus.ACTIVE);
        return toScheduledView(scheduledMessages.save(row));
    }

    @Transactional(readOnly = true)
    public List<ScheduledMessageView> listScheduledMessages(User me) {
        return scheduledMessages.findByCompanyIdAndStatusOrderByNextRunAtAsc(me.getCompany().getId(), ScheduledMessageStatus.ACTIVE).stream()
                .map(this::toScheduledView)
                .collect(Collectors.toList());
    }

    @Transactional
    public void cancelScheduledMessage(User me, Long id) {
        ScheduledMessage row = scheduledMessages.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Scheduled message not found."));
        scheduledMessages.delete(row);
    }

    /**
     * Dispatches a bounded set of due rows. Each message gets its own transaction and
     * pessimistic row lock, so one slow provider cannot keep every scheduled message
     * in a single global transaction.
     */
    public int dispatchDueScheduledMessages() {
        var page = PageRequest.of(0, scheduledDispatchBatchSize);
        var ids = new java.util.LinkedHashSet<Long>(scheduledMessages.findDueIds(Instant.now(), page));
        var simulatedTenantIds = timeService.simulatedTenantIds();
        if (!simulatedTenantIds.isEmpty() && ids.size() < scheduledDispatchBatchSize) {
            int remaining = scheduledDispatchBatchSize - ids.size();
            ids.addAll(scheduledMessages.findActiveIdsForCompanies(
                    simulatedTenantIds, PageRequest.of(0, remaining)));
        }

        int processed = 0;
        for (Long id : ids) {
            Boolean didProcess = transactionTemplate.execute(status -> dispatchOneLocked(id));
            if (Boolean.TRUE.equals(didProcess)) processed++;
        }
        return processed;
    }

    private boolean dispatchOneLocked(Long id) {
        ScheduledMessage row = scheduledMessages.findActiveForUpdate(id).orElse(null);
        if (row == null) return false;
        Long companyId = row.getCompany() != null ? row.getCompany().getId() : null;
        Instant now = timeService.instant(companyId);
        if (row.getNextRunAt() == null || now.isBefore(row.getNextRunAt())) return false;
        try {
            dispatchOne(row);
        } catch (Exception ex) {
            row.setLastError(truncateError(ex.getMessage()));
            if (row.getRecurrence() == MessageRecurrence.NONE) {
                row.setStatus(ScheduledMessageStatus.FAILED);
            } else {
                advanceRecurrence(row);
            }
            scheduledMessages.save(row);
        }
        return true;
    }

    private void dispatchOne(ScheduledMessage row) {
        Long companyId = row.getCompany() != null ? row.getCompany().getId() : null;
        Instant now = timeService.instant(companyId);
        if (row.getNextRunAt() == null || now.isBefore(row.getNextRunAt())) return;

        User sender = row.getSenderUser();
        if (sender == null) throw new IllegalStateException("Scheduled message has no sender.");
        send(sender, new SendMessageRequest(row.getClient().getId(), row.getChannel(), row.getSubject(), row.getBody(), null));

        row.setLastRunAt(now);
        row.setLastError(null);
        if (row.getRecurrence() == MessageRecurrence.NONE) {
            row.setStatus(ScheduledMessageStatus.COMPLETED);
        } else {
            advanceRecurrence(row);
        }
        scheduledMessages.save(row);
    }

    /** Moves nextRunAt forward by the recurrence interval until it is strictly after the effective now. */
    private void advanceRecurrence(ScheduledMessage row) {
        if (row.getRecurrence() == MessageRecurrence.NONE) return;
        Long companyId = row.getCompany() != null ? row.getCompany().getId() : null;
        Instant now = timeService.instant(companyId);
        java.time.ZonedDateTime next = (row.getNextRunAt() == null ? now : row.getNextRunAt()).atZone(SYSTEM_ZONE);
        int guard = 0;
        do {
            next = switch (row.getRecurrence()) {
                case DAILY -> next.plusDays(1);
                case WEEKLY -> next.plusWeeks(1);
                case MONTHLY -> next.plusMonths(1);
                case YEARLY -> next.plusYears(1);
                case NONE -> next;
            };
            guard++;
        } while (!next.toInstant().isAfter(now) && guard < 10000);
        row.setNextRunAt(next.toInstant());
    }

    private ScheduledMessageView toScheduledView(ScheduledMessage row) {
        return new ScheduledMessageView(
                row.getId(),
                row.getClient() != null ? row.getClient().getId() : null,
                clientDisplayName(row.getClient()),
                row.getChannel(),
                row.getSubject(),
                row.getBody(),
                row.getNextRunAt(),
                row.getRecurrence(),
                row.getStatus()
        );
    }

    private static String truncateError(String message) {
        if (message == null) return null;
        return message.length() > 2000 ? message.substring(0, 2000) : message;
    }

    /** Creates a staff-only internal note on a conversation. Never delivered to the client. */
    @Transactional
    public MessageView createInternalNote(User me, Long clientId, String body) {
        if (clientId == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "clientId is required.");
        Client client = requireVisibleClient(me, clientId);
        String normalized = normalizeBody(body);
        if (normalized.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Note body is required.");
        String conversationKey = resolveOpenConversationKey(
                client,
                messages.findFirstByCompanyIdAndClientIdAndConversationClosedFalseOrderByCreatedAtDescIdDesc(
                        me.getCompany().getId(), client.getId())
        );

        ClientMessage row = new ClientMessage();
        row.setCompany(me.getCompany());
        row.setClient(client);
        row.setSenderUser(me);
        row.setConversationKey(conversationKey);
        row.setConversationClosed(false);
        row.setConversationStarred(false);
        row.setDirection(MessageDirection.OUTBOUND);
        row.setChannel(MessageChannel.EMAIL); // sentinel channel; internal notes are never delivered
        row.setStatus(MessageStatus.SENT);
        row.setRecipient("");
        row.setBody(normalized);
        row.setInternalNote(true);
        row.setSentAt(Instant.now());
        return toView(messages.save(row));
    }

    /** Admin-only: attach a conversation to an employee by setting the client's assigned consultant. */
    @Transactional
    public AssigneeView setAssignee(User me, Long clientId, Long userId) {
        if (!SecurityUtils.isAdmin(me)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only admins can change the responsible employee.");
        }
        if (clientId == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "clientId is required.");
        Client client = clients.findByIdAndCompanyId(clientId, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Client not found."));
        if (userId == null) {
            client.setAssignedTo(null);
        } else {
            User assignee = users.findByIdAndCompanyId(userId, me.getCompany().getId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid consultant."));
            if (!assignee.isConsultant()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected user is not marked as consultant.");
            }
            client.setAssignedTo(assignee);
        }
        clients.save(client);
        User saved = client.getAssignedTo();
        return new AssigneeView(clientId, saved != null ? saved.getId() : null, displayUserName(saved));
    }

    /** Toggles the "starred" flag on a conversation (any staff member who can see the client). */
    @Transactional
    public ThreadFlagsView setStarred(User me, Long clientId, String threadKey, boolean starred) {
        Client client = requireVisibleClient(me, clientId);
        ConversationSelection selection = requireConversationSelection(me.getCompany().getId(), client, threadKey);
        selection.rows().forEach(row -> {
            row.setConversationStarred(starred);
            messages.save(row);
        });
        if (selection.legacy()) {
            client.setInboxStarred(starred);
            clients.save(client);
        }
        return new ThreadFlagsView(clientId, selection.threadKey(), starred, conversationClosed(selection.rows()));
    }

    /** Closes a conversation. Closed conversations cannot be reopened; the next inbound/outbound message starts a new chat. */
    @Transactional
    public ThreadFlagsView setStatus(User me, Long clientId, String threadKey, boolean closed) {
        if (!closed) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Closed conversations cannot be reopened. Send or receive a new message to start a new chat.");
        }
        Client client = requireVisibleClient(me, clientId);
        ConversationSelection selection = requireConversationSelection(me.getCompany().getId(), client, threadKey);
        selection.rows().forEach(row -> {
            row.setConversationClosed(true);
            messages.save(row);
        });
        if (selection.legacy()) {
            client.setInboxClosed(true);
            clients.save(client);
        }
        return new ThreadFlagsView(clientId, selection.threadKey(), conversationStarred(selection.rows()), true);
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

    @Transactional
    public int purgeMessagesOlderThan(Instant cutoff) {
        if (cutoff == null) return 0;
        messageAttachments.deleteAllByMessageCreatedAtBefore(cutoff);
        return messages.deleteAllByCreatedAtBefore(cutoff);
    }

    private MessageView sendInternal(User me, Client client, SendMessageRequest request, List<ClientFile> attachmentFiles) {
        MessageChannel channel = request.channel() == null ? MessageChannel.EMAIL : request.channel();
        String rawBody = normalizeBody(request.body());
        String plainBody = htmlToPlainText(rawBody);
        // Only email renders rich HTML; every other channel is plain text.
        boolean asHtml = channel == MessageChannel.EMAIL && looksLikeHtml(rawBody);
        String storedBody = asHtml ? rawBody : plainBody;
        List<ClientFile> safeAttachments = attachmentFiles == null ? List.of() : attachmentFiles;
        if (plainBody.isBlank() && safeAttachments.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Message body or at least one attachment is required.");
        if (!safeAttachments.isEmpty() && channel != MessageChannel.GUEST_APP) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Attachments are currently supported only for Guest App messages.");
        }
        if (channel == MessageChannel.GUEST_APP
                && !guestSettingsService.publicSettings(me.getCompany().getId()).guestAppEnabled()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Guest App is disabled for this tenant.");
        }

        String conversationKey = resolveOpenConversationKey(
                client,
                messages.findFirstByCompanyIdAndClientIdAndConversationClosedFalseOrderByCreatedAtDescIdDesc(
                        me.getCompany().getId(), client.getId())
        );

        ClientMessage row = new ClientMessage();
        row.setCompany(me.getCompany());
        row.setClient(client);
        row.setSenderUser(me);
        row.setConversationKey(conversationKey);
        row.setConversationClosed(false);
        row.setConversationStarred(false);
        row.setDirection(MessageDirection.OUTBOUND);
        row.setChannel(channel);
        row.setStatus(MessageStatus.FAILED);
        row.setSubject(blankToNull(normalizeSubject(request.subject())));
        row.setBody(storedBody);

        try {
            ChannelDeliveryResult result = switch (channel) {
                case EMAIL -> sendEmail(client, row.getSubject(), rawBody, plainBody, asHtml, me);
                case SMS -> sendSmsText(client, plainBody);
                case WHATSAPP -> sendWhatsAppText(client, row.getSubject(), plainBody, me);
                case VIBER -> sendViberText(client, plainBody);
                case GUEST_APP -> sendGuestAppMessage(client, plainBody, me, row, safeAttachments);
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
        logInboxDelivery(saved);
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
                    .filter(message -> Objects.equals(conversationKey(message), conversationKey(saved)))
                    .toList();
            markStaffMessagesRead(saved.getCompany().getId(), saved.getClient().getId(), guestAppRows, saved.getSentAt());
        }
        return toView(saved);
    }


    private void logInboxDelivery(ClientMessage message) {
        if (deliveryLogs == null || message == null || message.getCompany() == null) return;
        MessageDeliveryChannel channel = deliveryChannel(message.getChannel());
        if (channel == null) return;
        String type = "INBOX_" + (message.getChannel() == null ? "MESSAGE" : message.getChannel().name());
        String subject = message.getSubject() == null || message.getSubject().isBlank()
                ? type.replace('_', ' ')
                : message.getSubject();
        if (message.getStatus() == MessageStatus.FAILED) {
            deliveryLogs.failed(message.getCompany(), message.getClient(), message.getGuestUser(), channel, type,
                    message.getRecipient(), subject, message.getBody(), "client_message", message.getId(), message.getErrorMessage());
        } else if (message.getStatus() == MessageStatus.DELIVERED) {
            deliveryLogs.delivered(message.getCompany(), message.getClient(), message.getGuestUser(), channel, type,
                    message.getRecipient(), subject, message.getBody(), "client_message", message.getId(), message.getExternalMessageId(), null);
        } else {
            deliveryLogs.sent(message.getCompany(), message.getClient(), message.getGuestUser(), channel, type,
                    message.getRecipient(), subject, message.getBody(), "client_message", message.getId());
        }
    }

    private static MessageDeliveryChannel deliveryChannel(MessageChannel channel) {
        if (channel == null) return null;
        return switch (channel) {
            case EMAIL -> MessageDeliveryChannel.EMAIL;
            case SMS -> MessageDeliveryChannel.SMS;
            case GUEST_APP -> MessageDeliveryChannel.GUEST_APP;
            case WHATSAPP -> MessageDeliveryChannel.WHATSAPP;
            case VIBER -> MessageDeliveryChannel.VIBER;
        };
    }

    @Transactional
    public int ingestWhatsAppWebhook(Long companyId, JsonNode root, String signatureHeader, String rawPayload) {
        if (!globalMessagingProviders.isWhatsAppEnabled()) return 0;
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
        if (!globalMessagingProviders.isViberEnabled()) return 0;
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
        String conversationKey = resolveOpenConversationKey(
                client,
                messages.findFirstByCompanyIdAndClientIdAndConversationClosedFalseOrderByCreatedAtDescIdDesc(
                        company.getId(), client.getId())
        );

        ClientMessage row = new ClientMessage();
        row.setCompany(company);
        row.setClient(client);
        row.setConversationKey(conversationKey);
        row.setConversationClosed(false);
        row.setConversationStarred(false);
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

    private record ConversationSelection(String threadKey, List<ClientMessage> rows, boolean legacy) {}

    private String legacyConversationKey(Long clientId) {
        return LEGACY_CONVERSATION_PREFIX + (clientId == null ? "unknown" : clientId);
    }

    private String conversationKey(ClientMessage row) {
        String explicit = blankToNull(row == null ? null : row.getConversationKey());
        if (explicit != null) return explicit;
        return legacyConversationKey(row != null && row.getClient() != null ? row.getClient().getId() : null);
    }

    private Map<String, List<ClientMessage>> groupByConversationKey(List<ClientMessage> rows) {
        if (rows == null || rows.isEmpty()) return new LinkedHashMap<>();
        return rows.stream()
                .filter(Objects::nonNull)
                .collect(Collectors.groupingBy(this::conversationKey, LinkedHashMap::new, Collectors.toList()));
    }

    private ClientMessage latestDisplayMessage(List<ClientMessage> rows) {
        if (rows == null || rows.isEmpty()) return null;
        return rows.stream()
                .filter(row -> !row.isInternalNote())
                .max(Comparator.comparing(ClientMessage::getCreatedAt))
                .orElseGet(() -> rows.stream().max(Comparator.comparing(ClientMessage::getCreatedAt)).orElse(null));
    }

    private String latestConversationKey(List<ClientMessage> rows) {
        return groupByConversationKey(rows).entrySet().stream()
                .max(Comparator.comparing(entry -> {
                    ClientMessage latest = latestDisplayMessage(entry.getValue());
                    return latest == null ? Instant.EPOCH : messageInstant(latest);
                }))
                .map(Map.Entry::getKey)
                .orElse(null);
    }

    private boolean isLegacyConversation(List<ClientMessage> rows) {
        return rows != null && rows.stream().anyMatch(row -> blankToNull(row.getConversationKey()) == null);
    }

    private boolean conversationClosed(List<ClientMessage> rows) {
        if (rows == null || rows.isEmpty()) return false;
        if (isLegacyConversation(rows)) {
            Client client = rows.get(0).getClient();
            return (client != null && client.isInboxClosed()) || rows.stream().anyMatch(ClientMessage::isConversationClosed);
        }
        return rows.stream().anyMatch(ClientMessage::isConversationClosed);
    }

    private boolean conversationStarred(List<ClientMessage> rows) {
        if (rows == null || rows.isEmpty()) return false;
        if (isLegacyConversation(rows)) {
            Client client = rows.get(0).getClient();
            return (client != null && client.isInboxStarred()) || rows.stream().anyMatch(ClientMessage::isConversationStarred);
        }
        return rows.stream().anyMatch(ClientMessage::isConversationStarred);
    }

    private String resolveOpenConversationKey(Client client, List<ClientMessage> rows) {
        return groupByConversationKey(rows).entrySet().stream()
                .sorted(Comparator.<Map.Entry<String, List<ClientMessage>>, Instant>comparing(entry -> {
                    ClientMessage latest = latestDisplayMessage(entry.getValue());
                    return latest == null ? Instant.EPOCH : messageInstant(latest);
                }).reversed())
                .filter(entry -> !conversationClosed(entry.getValue()))
                .map(Map.Entry::getKey)
                .findFirst()
                .orElse("conversation-" + UUID.randomUUID());
    }

    /** Hot-path variant that reads only the newest open row instead of the client's full history. */
    private String resolveOpenConversationKey(Client client, Optional<ClientMessage> latestOpenRow) {
        if (latestOpenRow != null && latestOpenRow.isPresent()) {
            ClientMessage row = latestOpenRow.get();
            if (row.getConversationKey() != null && !row.getConversationKey().isBlank()) {
                return row.getConversationKey();
            }
            if (client != null && !client.isInboxClosed()) {
                return legacyConversationKey(client.getId());
            }
        }
        return "conversation-" + UUID.randomUUID();
    }

    private ConversationSelection requireConversationSelection(Long companyId, Client client, String threadKey) {
        if (client == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Client not found.");
        List<ClientMessage> rows = messages.findAllByCompanyIdAndClientIdOrderByCreatedAtAsc(companyId, client.getId());
        String effectiveThreadKey = blankToNull(threadKey);
        if (effectiveThreadKey == null) effectiveThreadKey = latestConversationKey(rows);
        if (effectiveThreadKey == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Conversation not found.");
        final String key = effectiveThreadKey;
        List<ClientMessage> selectedRows = rows.stream()
                .filter(row -> Objects.equals(conversationKey(row), key))
                .toList();
        if (selectedRows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Conversation not found.");
        return new ConversationSelection(key, selectedRows, isLegacyConversation(selectedRows));
    }

    private List<ClientMessage> filterVisibleMessages(User me) {
        return filterVisibleMessages(me, 0, 100);
    }

    private List<ClientMessage> filterVisibleMessages(User me, int page, int size) {
        var pageable = PageRequest.of(safePage(page), safeSize(size, 100, 500));
        if (SecurityUtils.isAdmin(me)) {
            return messages.findPageByCompanyIdOrderByCreatedAtDesc(me.getCompany().getId(), pageable);
        }
        return messages.findPageByCompanyIdAndAssignedToIdOrderByCreatedAtDesc(me.getCompany().getId(), me.getId(), pageable);
    }

    private static int safePage(int page) {
        return Math.max(0, page);
    }

    private static int safeSize(int size, int defaultSize, int maxSize) {
        if (size <= 0) return defaultSize;
        return Math.min(size, maxSize);
    }

    private boolean matchesFilter(ClientMessage row, ThreadFilter filter) {
        if (filter == null) return true;
        if (filter.clientId() != null && !Objects.equals(row.getClient().getId(), filter.clientId())) return false;
        if (filter.assignedUserId() != null) {
            User assignee = row.getClient().getAssignedTo();
            if (assignee == null || !Objects.equals(assignee.getId(), filter.assignedUserId())) return false;
        }
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

    private void requireGuestInboxEnabled(Long companyId) {
        if (!guestSettingsService.inboxEnabled(companyId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Guest inbox is disabled for this tenant.");
        }
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
        List<GuestTenantLink> links = guestTenantLinks.findAllByCompanyIdAndClientIdAndStatusOrderByUpdatedAtDesc(companyId, clientId, GuestTenantLinkStatus.ACTIVE);
        for (GuestTenantLink link : links) {
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
                conversationKey(row),
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
                toAttachmentViews(row),
                row.isInternalNote()
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
        GuestTenantLink link = guestTenantLinks.findFirstByCompanyIdAndClientIdAndStatusOrderByUpdatedAtDesc(
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

    private ChannelDeliveryResult sendEmail(Client client, String subject, String htmlBody, String plainBody, boolean asHtml, User me) {
        String to = blankToNull(client.getEmail());
        if (to == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Client does not have an email address.");
        if (!mailConfigured || mailSender == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Email is not configured on the server.");
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, asHtml, StandardCharsets.UTF_8.name());
            applyClientSender(helper, client.getCompany());
            helper.setTo(to);
            helper.setSubject(subject == null || subject.isBlank() ? defaultSubject(client) : subject);
            if (asHtml) {
                helper.setText(plainBody, htmlBody);
            } else {
                helper.setText(plainBody, false);
            }
            String replyTo = readSetting(client.getCompany().getId(), SettingKey.COMPANY_EMAIL);
            if (replyTo != null && !replyTo.isBlank()) helper.setReplyTo(replyTo.trim());
            else if (me.getEmail() != null && !me.getEmail().isBlank()) helper.setReplyTo(me.getEmail().trim());
            mailSender.send(message);
            return new ChannelDeliveryResult(to, null, null);
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Failed to send email: " + safeMessage(ex));
        }
    }

    private ChannelDeliveryResult sendSmsText(Client client, String body) {
        String to = blankToNull(client.getPhone());
        if (to == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Client does not have a phone number for SMS.");
        }
        if (!smsConfigured || smsGateway == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "SMS is not configured on the server. Configure the A1 Crosschat SMS gateway first.");
        }
        smsQuotaService.assertCanSend(client.getCompany().getId(), 1);
        try {
            SmsGateway.SmsSendResult result = smsGateway.send(new SmsGateway.SmsSendRequest(
                    client.getCompany().getId(),
                    to,
                    body,
                    buildInboxSmsCustomId(client)
            ));
            incrementTenantSmsSentCount(client.getCompany(), result.parts());
            String externalId = result.messageId() != null ? String.valueOf(result.messageId()) : result.customId();
            return new ChannelDeliveryResult(to.trim(), externalId, MessageStatus.SENT);
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "SMS send failed: " + safeMessage(ex));
        }
    }

    private String buildInboxSmsCustomId(Client client) {
        String clientPart = client != null && client.getId() != null ? String.valueOf(client.getId()) : "x";
        String base = "inbox-c" + clientPart + "-" + Instant.now().toEpochMilli();
        return base.length() <= 36 ? base : base.substring(0, 36);
    }

    private void incrementTenantSmsSentCount(Company company, int parts) {
        if (company == null || company.getId() == null) return;
        try {
            smsQuotaService.increment(company.getId(), parts);
        } catch (Exception ignored) {
            // SMS was accepted by the provider; do not fail the user-facing send just because usage metering failed.
        }
    }

    private ChannelDeliveryResult sendWhatsAppText(Client client, String subject, String body, User me) {
        if (!globalMessagingProviders.isWhatsAppEnabled()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "WhatsApp is globally disabled by platform admin.");
        }
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
        if (!globalMessagingProviders.isViberEnabled()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Viber is globally disabled by platform admin.");
        }
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
        String normalized = normalizeMsisdn(from);
        if (normalized == null) return null;
        return clients.findMessagingPhoneCandidatesByCompanyId(companyId, normalized, PageRequest.of(0, 1))
                .stream()
                .findFirst()
                .orElse(null);
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
        if (!globalMessagingProviders.isWhatsAppEnabled()) return false;
        String configured = readSetting(companyId, SettingKey.INBOX_WHATSAPP_WEBHOOK_VERIFY_TOKEN);
        return configured != null && !configured.isBlank() && configured.trim().equals(verifyToken == null ? "" : verifyToken.trim());
    }

    private void applyClientSender(MimeMessageHelper helper, Company company) throws jakarta.mail.MessagingException {
        if (emailSenderResolver != null) {
            emailSenderResolver.applyFrom(helper, company, TenantEmailSenderResolver.EmailPurpose.CLIENT_NOTIFICATION);
            emailSenderResolver.applyReplyTo(helper, company, TenantEmailSenderResolver.EmailPurpose.CLIENT_NOTIFICATION);
            return;
        }
        helper.setFrom(resolveFromAddress());
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
            case SMS -> blankToNull(client.getPhone()) != null ? client.getPhone().trim() : "";
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

    private static boolean looksLikeHtml(String value) {
        return value != null && value.matches("(?s).*<[a-zA-Z][\\s\\S]*>.*");
    }

    /** Converts editor HTML to a readable plain-text equivalent for non-HTML channels and email fallback. */
    private static String htmlToPlainText(String value) {
        if (value == null) return "";
        String text = value
                .replaceAll("(?i)<br\\s*/?>", "\n")
                .replaceAll("(?i)</(p|div|h[1-6]|li|blockquote|tr)>", "\n")
                .replaceAll("(?i)<li[^>]*>", "• ")
                .replaceAll("<[^>]+>", "");
        text = text.replace("&nbsp;", " ")
                .replace("&amp;", "&")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&quot;", "\"")
                .replace("&#39;", "'");
        text = text.replaceAll("\n{3,}", "\n\n");
        return text.trim();
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
