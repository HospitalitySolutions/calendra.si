package com.example.app.session;

import com.example.app.billing.OpenBillSyncService;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.settings.TenantReservationRulesService;
import java.time.LocalDateTime;
import java.util.List;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Automatically converts missed RESERVED bookings to NO_SHOW when enabled in App settings. */
@Service
public class NoShowAutoMarkerScheduler {
    private static final Logger log = LoggerFactory.getLogger(NoShowAutoMarkerScheduler.class);
    private static final int BATCH_SIZE = 200;

    private final SessionBookingRepository bookings;
    private final AppSettingRepository settings;
    private final TenantReservationRulesService reservationRulesService;
    private final BookingChangePublisher bookingChangePublisher;
    private final OpenBillSyncService openBillSyncService;

    public NoShowAutoMarkerScheduler(
            SessionBookingRepository bookings,
            AppSettingRepository settings,
            TenantReservationRulesService reservationRulesService,
            BookingChangePublisher bookingChangePublisher,
            OpenBillSyncService openBillSyncService
    ) {
        this.bookings = bookings;
        this.settings = settings;
        this.reservationRulesService = reservationRulesService;
        this.bookingChangePublisher = bookingChangePublisher;
        this.openBillSyncService = openBillSyncService;
    }

    @Scheduled(cron = "${app.no-show-auto-marker.cron:0 */5 * * * *}")
    @SchedulerLock(name = "noShowAutoMarkerScheduler_markDueBookings", lockAtMostFor = "PT5M", lockAtLeastFor = "PT10S")
    @Transactional
    public void markDueBookings() {
        LocalDateTime latestStart = LocalDateTime.now();
        LocalDateTime earliestStart = latestStart.minusDays(3);
        List<SessionBooking> candidates = bookings.findReservedNoShowCandidates(
                earliestStart,
                latestStart,
                PageRequest.of(0, BATCH_SIZE)
        );
        if (candidates.isEmpty()) return;
        int marked = 0;
        for (SessionBooking booking : candidates) {
            if (booking == null || booking.getCompany() == null || booking.getCompany().getId() == null || booking.getStartTime() == null) {
                continue;
            }
            Long companyId = booking.getCompany().getId();
            if (!isNoShowStatusEnabled(companyId)) {
                continue;
            }
            TenantReservationRulesService.TenantReservationRules rules = reservationRulesService.resolve(companyId);
            if (!TenantReservationRulesService.isAutomaticNoShow(rules)) {
                continue;
            }
            LocalDateTime tenantNow = LocalDateTime.now();
            if (booking.getStartTime().plusMinutes(rules.noShowAfterMinutes()).isAfter(tenantNow)) {
                continue;
            }
            booking.setBookingStatus(SessionBookingStatus.NO_SHOW);
            bookings.save(booking);
            marked++;
            openBillSyncService.enqueueBookingsSync(companyId, List.of(booking));
            bookingChangePublisher.publish(
                    companyId,
                    booking.getId(),
                    booking.getStartTime(),
                    booking.getEndTime(),
                    BookingChangePublisher.BOOKING_UPDATED
            );
        }
        if (marked > 0) {
            log.info("Automatically marked {} bookings as no-show", marked);
        }
    }

    private boolean isNoShowStatusEnabled(Long companyId) {
        if (companyId == null) return true;
        return settings.findByCompanyIdAndKey(companyId, SettingKey.NO_SHOW_ENABLED)
                .map(AppSetting::getValue)
                .map(value -> !"false".equalsIgnoreCase(value == null ? "" : value.trim()))
                .orElse(true);
    }
}
