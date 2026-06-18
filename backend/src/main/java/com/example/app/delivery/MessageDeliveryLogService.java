package com.example.app.delivery;

import com.example.app.client.Client;
import com.example.app.company.Company;
import com.example.app.guest.model.GuestUser;
import java.time.Instant;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MessageDeliveryLogService {
    private final MessageDeliveryLogRepository logs;

    public MessageDeliveryLogService(MessageDeliveryLogRepository logs) {
        this.logs = logs;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public MessageDeliveryLog sent(
            Company company,
            Client client,
            GuestUser guestUser,
            MessageDeliveryChannel channel,
            String messageType,
            String recipient,
            String subject,
            String preview,
            String referenceType,
            Object referenceId
    ) {
        return record(company, client, guestUser, channel, MessageDeliveryStatus.SENT, messageType,
                recipient, subject, preview, referenceType, referenceId, null, null, null, null);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public MessageDeliveryLog delivered(
            Company company,
            Client client,
            GuestUser guestUser,
            MessageDeliveryChannel channel,
            String messageType,
            String recipient,
            String subject,
            String preview,
            String referenceType,
            Object referenceId,
            String providerMessageId,
            String providerStatusCode
    ) {
        return record(company, client, guestUser, channel, MessageDeliveryStatus.DELIVERED, messageType,
                recipient, subject, preview, referenceType, referenceId, providerMessageId, providerStatusCode, null, null);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public MessageDeliveryLog failed(
            Company company,
            Client client,
            GuestUser guestUser,
            MessageDeliveryChannel channel,
            String messageType,
            String recipient,
            String subject,
            String preview,
            String referenceType,
            Object referenceId,
            String errorMessage
    ) {
        return record(company, client, guestUser, channel, MessageDeliveryStatus.FAILED, messageType,
                recipient, subject, preview, referenceType, referenceId, null, null, errorMessage, null);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public MessageDeliveryLog skipped(
            Company company,
            Client client,
            GuestUser guestUser,
            MessageDeliveryChannel channel,
            String messageType,
            String recipient,
            String subject,
            String preview,
            String referenceType,
            Object referenceId,
            String reason
    ) {
        return record(company, client, guestUser, channel, MessageDeliveryStatus.SKIPPED, messageType,
                recipient, subject, preview, referenceType, referenceId, null, null, reason, null);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public MessageDeliveryLog record(
            Company company,
            Client client,
            GuestUser guestUser,
            MessageDeliveryChannel channel,
            MessageDeliveryStatus status,
            String messageType,
            String recipient,
            String subject,
            String preview,
            String referenceType,
            Object referenceId,
            String providerMessageId,
            String providerStatusCode,
            String errorMessage,
            String metadataJson
    ) {
        if (company == null || channel == null || status == null) return null;
        MessageDeliveryLog log = new MessageDeliveryLog();
        log.setCompany(company);
        log.setClient(client);
        log.setGuestUserId(guestUser == null ? null : guestUser.getId());
        log.setChannel(channel);
        log.setStatus(status);
        log.setMessageType(limit(blankToDefault(messageType, "MESSAGE"), 80));
        log.setRecipient(limit(recipient, 320));
        log.setSubject(limit(subject, 500));
        log.setMessagePreview(limit(preview, 1200));
        log.setReferenceType(limit(referenceType, 80));
        log.setReferenceId(referenceId == null ? null : limit(String.valueOf(referenceId), 80));
        log.setProviderMessageId(limit(providerMessageId, 255));
        log.setProviderStatusCode(limit(providerStatusCode, 80));
        log.setErrorMessage(limit(errorMessage, 1200));
        log.setMetadataJson(metadataJson);
        Instant now = Instant.now();
        if (status == MessageDeliveryStatus.SENT || status == MessageDeliveryStatus.DELIVERED) {
            log.setSentAt(now);
        }
        if (status == MessageDeliveryStatus.DELIVERED) {
            log.setDeliveredAt(now);
        }
        if (status == MessageDeliveryStatus.FAILED) {
            log.setFailedAt(now);
        }
        return logs.save(log);
    }

    @Transactional
    public int purgeLogsOlderThan(Instant cutoff) {
        if (cutoff == null) return 0;
        return logs.deleteOlderThan(cutoff);
    }

    private static String blankToDefault(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private static String limit(String value, int max) {
        if (value == null) return null;
        String trimmed = value.trim();
        if (trimmed.length() <= max) return trimmed;
        return trimmed.substring(0, Math.max(0, max - 1)) + "…";
    }
}
