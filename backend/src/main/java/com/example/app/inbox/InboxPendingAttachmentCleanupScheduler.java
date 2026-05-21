package com.example.app.inbox;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import java.time.Duration;
import java.time.Instant;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class InboxPendingAttachmentCleanupScheduler {
    private final ClientMessageService service;
    private final Duration retention;

    public InboxPendingAttachmentCleanupScheduler(
            ClientMessageService service,
            @Value("${app.inbox.pending-attachment-retention:PT24H}") Duration retention
    ) {
        this.service = service;
        this.retention = retention == null || retention.isNegative() || retention.isZero() ? Duration.ofHours(24) : retention;
    }

    @Scheduled(cron = "0 17 * * * *")
    @SchedulerLock(name = "inboxPendingAttachmentCleanupScheduler_cleanupExpiredPendingAttachments", lockAtMostFor = "PT20M", lockAtLeastFor = "PT1M")
    public void cleanupExpiredPendingAttachments() {
        service.cleanupExpiredPendingInboxAttachments(Instant.now().minus(retention));
    }
}
