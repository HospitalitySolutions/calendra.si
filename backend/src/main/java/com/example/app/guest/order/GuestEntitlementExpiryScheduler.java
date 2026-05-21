package com.example.app.guest.order;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class GuestEntitlementExpiryScheduler {
    private static final Logger log = LoggerFactory.getLogger(GuestEntitlementExpiryScheduler.class);

    private final GuestEntitlementService entitlementService;

    public GuestEntitlementExpiryScheduler(GuestEntitlementService entitlementService) {
        this.entitlementService = entitlementService;
    }

    @Scheduled(cron = "0 */1 * * * *")
    @SchedulerLock(name = "guestEntitlementExpiryScheduler_markExpiredEntitlements", lockAtMostFor = "PT5M", lockAtLeastFor = "PT15S")
    @Transactional
    public void markExpiredEntitlements() {
        int updated = entitlementService.markExpiredEntitlements(Instant.now());
        if (updated > 0) {
            log.info("Marked {} guest entitlements as EXPIRED.", updated);
        }
    }
}
