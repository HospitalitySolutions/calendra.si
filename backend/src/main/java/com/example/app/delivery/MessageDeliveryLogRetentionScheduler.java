package com.example.app.delivery;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class MessageDeliveryLogRetentionScheduler {
    private static final Logger log = LoggerFactory.getLogger(MessageDeliveryLogRetentionScheduler.class);

    private final MessageDeliveryLogService service;
    private final Duration retention;

    public MessageDeliveryLogRetentionScheduler(
            MessageDeliveryLogService service,
            @Value("${app.delivery-logs.retention:P30D}") Duration retention
    ) {
        this.service = service;
        this.retention = retention == null || retention.isNegative() || retention.isZero()
                ? Duration.ofDays(30)
                : retention;
    }

    @Scheduled(cron = "${app.delivery-logs.retention-cron:0 37 2 * * *}")
    @SchedulerLock(name = "messageDeliveryLogRetentionScheduler_purgeExpiredLogs", lockAtMostFor = "PT30M", lockAtLeastFor = "PT1M")
    public void purgeExpiredLogs() {
        int deleted = service.purgeLogsOlderThan(Instant.now().minus(retention));
        if (deleted > 0) {
            log.info("Deleted {} message delivery logs older than {}.", deleted, retention);
        }
    }
}
