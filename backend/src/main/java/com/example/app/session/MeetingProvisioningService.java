package com.example.app.session;

import com.example.app.google.GoogleMeetService;
import com.example.app.reminder.ReminderService;
import com.example.app.zoom.ZoomService;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Durable, bounded online-meeting provisioning. Provider calls happen outside
 * the booking transaction and therefore never hold the per-tenant booking lock.
 */
@Service
public class MeetingProvisioningService {
    private static final Logger log = LoggerFactory.getLogger(MeetingProvisioningService.class);

    private final SessionBookingRepository bookings;
    private final ZoomService zoomService;
    private final GoogleMeetService googleMeetService;
    private final ReminderService reminderService;
    private final BookingChangePublisher bookingChangePublisher;
    private final TransactionTemplate transactions;
    private final int batchSize;
    private final int maxAttempts;
    private final Duration processingLease;
    private final Duration retryBase;

    public MeetingProvisioningService(
            SessionBookingRepository bookings,
            ZoomService zoomService,
            GoogleMeetService googleMeetService,
            ReminderService reminderService,
            BookingChangePublisher bookingChangePublisher,
            PlatformTransactionManager transactionManager,
            @Value("${app.meetings.provisioning.batch-size:50}") int batchSize,
            @Value("${app.meetings.provisioning.max-attempts:6}") int maxAttempts,
            @Value("${app.meetings.provisioning.processing-lease:PT5M}") Duration processingLease,
            @Value("${app.meetings.provisioning.retry-base:PT30S}") Duration retryBase
    ) {
        this.bookings = bookings;
        this.zoomService = zoomService;
        this.googleMeetService = googleMeetService;
        this.reminderService = reminderService;
        this.bookingChangePublisher = bookingChangePublisher;
        this.transactions = new TransactionTemplate(transactionManager);
        this.batchSize = Math.max(1, Math.min(500, batchSize));
        this.maxAttempts = Math.max(1, Math.min(20, maxAttempts));
        this.processingLease = processingLease == null || processingLease.isNegative() || processingLease.isZero()
                ? Duration.ofMinutes(5) : processingLease;
        this.retryBase = retryBase == null || retryBase.isNegative() || retryBase.isZero()
                ? Duration.ofSeconds(30) : retryBase;
    }

    public int processDueBatch() {
        Instant now = Instant.now();
        transactions.executeWithoutResult(status -> bookings.recoverStaleMeetingProvisioning(
                now.minus(processingLease), now));
        List<Long> ids = bookings.findDueMeetingRepresentativeIds(now, PageRequest.of(0, batchSize));
        int processed = 0;
        for (Long id : ids) {
            if (processOne(id)) processed++;
        }
        return processed;
    }

    private boolean processOne(Long representativeId) {
        ProvisioningSnapshot snapshot = transactions.execute(status -> claim(representativeId));
        if (snapshot == null) return false;

        try {
            String meetingLink = createMeetingUrl(snapshot);
            if (meetingLink == null || meetingLink.isBlank()) {
                throw new IllegalStateException("Meeting provider returned an empty URL.");
            }
            transactions.executeWithoutResult(status -> complete(snapshot, meetingLink.trim()));
            return true;
        } catch (Exception ex) {
            String message = safeMessage(ex);
            Boolean terminal = transactions.execute(status -> fail(snapshot, message));
            log.warn("Online meeting provisioning failed companyId={} bookingGroupKey={} provider={} attempt={}: {}",
                    snapshot.companyId(), snapshot.bookingGroupKey(), snapshot.provider(), snapshot.attempt(), message);
            if (Boolean.TRUE.equals(terminal)) {
                throw new IllegalStateException(
                        "Online meeting provisioning exhausted all retries for booking group "
                                + snapshot.bookingGroupKey() + ": " + message,
                        ex);
            }
            return true;
        }
    }

    private ProvisioningSnapshot claim(Long representativeId) {
        SessionBooking representative = bookings.findMeetingProvisioningRepresentative(representativeId).orElse(null);
        if (representative == null
                || representative.getCompany() == null
                || representative.getCompany().getId() == null
                || representative.getBookingGroupKey() == null
                || representative.getBookingGroupKey().isBlank()
                || representative.getConsultant() == null
                || representative.getConsultant().getId() == null) {
            return null;
        }
        Instant startedAt = Instant.now();
        int claimed = bookings.claimMeetingProvisioning(
                representative.getCompany().getId(), representative.getBookingGroupKey(), startedAt);
        if (claimed <= 0) return null;
        return new ProvisioningSnapshot(
                representative.getCompany().getId(),
                representative.getBookingGroupKey(),
                representative.getId(),
                representative.getConsultant().getId(),
                representative.getStartTime(),
                representative.getEndTime(),
                normalizeProvider(representative.getMeetingProvider()),
                representative.getMeetingProvisioningAttempts() + 1
        );
    }

    private String createMeetingUrl(ProvisioningSnapshot snapshot) {
        if ("google".equals(snapshot.provider())) {
            return googleMeetService.createMeetingUrl(
                    snapshot.consultantId(), snapshot.startTime(), snapshot.endTime(), "Session");
        }
        return zoomService.createMeetingUrl(
                snapshot.consultantId(), snapshot.startTime(), snapshot.endTime(), "Session");
    }

    private void complete(ProvisioningSnapshot snapshot, String meetingLink) {
        bookings.markMeetingProvisioningReady(snapshot.companyId(), snapshot.bookingGroupKey(), meetingLink);
        List<SessionBooking> rows = bookings.findByBookingGroupKeyAndCompanyIdOrderByIdAsc(
                snapshot.bookingGroupKey(), snapshot.companyId());
        for (SessionBooking row : rows) {
            if (row.isMeetingConfirmationPending()) {
                reminderService.sendBookingConfirmation(row);
                row.setMeetingConfirmationPending(false);
            }
        }
        bookings.saveAll(rows);
        bookingChangePublisher.publish(
                snapshot.companyId(), snapshot.representativeId(), snapshot.startTime(), snapshot.endTime(),
                BookingChangePublisher.BOOKING_UPDATED);
    }

    private boolean fail(ProvisioningSnapshot snapshot, String error) {
        boolean terminal = snapshot.attempt() >= maxAttempts;
        Instant nextAttempt = terminal ? null : Instant.now().plus(retryDelay(snapshot.attempt()));
        bookings.markMeetingProvisioningFailed(
                snapshot.companyId(), snapshot.bookingGroupKey(), terminal ? "FAILED" : "RETRY", error, nextAttempt);
        return terminal;
    }

    private Duration retryDelay(int attempt) {
        long multiplier = 1L << Math.min(10, Math.max(0, attempt - 1));
        long seconds;
        try {
            seconds = Math.multiplyExact(retryBase.getSeconds(), multiplier);
        } catch (ArithmeticException ex) {
            seconds = 1800;
        }
        return Duration.ofSeconds(Math.min(1800, Math.max(5, seconds)));
    }

    private static String normalizeProvider(String provider) {
        return provider != null && "google".equalsIgnoreCase(provider.trim()) ? "google" : "zoom";
    }

    private static String safeMessage(Exception ex) {
        String message = ex == null ? null : ex.getMessage();
        if (message == null || message.isBlank()) message = ex == null ? "Unknown error" : ex.getClass().getSimpleName();
        message = message.replaceAll("[\\r\\n\\t]+", " ");
        return message.length() <= 1000 ? message : message.substring(0, 1000);
    }

    private record ProvisioningSnapshot(
            Long companyId,
            String bookingGroupKey,
            Long representativeId,
            Long consultantId,
            LocalDateTime startTime,
            LocalDateTime endTime,
            String provider,
            int attempt
    ) {}
}
