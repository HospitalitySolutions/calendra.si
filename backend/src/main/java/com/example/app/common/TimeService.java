package com.example.app.common;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import org.springframework.stereotype.Service;

/**
 * The application's effective clock. Returns real time shifted by the active per-tenant simulation
 * offset (see {@link SimulatedTimeService}). The tenant is taken from the explicit argument when
 * provided, otherwise from {@link SimulatedTimeContext}. When no tenant is bound or simulated, this
 * returns real time.
 *
 * <p>Business logic that should respond to the time simulator must read "now" through this service.
 * Security, fiscalization and audit timestamps deliberately keep using {@code java.time} directly.</p>
 */
@Service
public class TimeService {
    private final SimulatedTimeService simulatedTimeService;

    public TimeService(SimulatedTimeService simulatedTimeService) {
        this.simulatedTimeService = simulatedTimeService;
    }

    private Duration offset(Long tenantId) {
        Long effectiveTenant = tenantId != null ? tenantId : SimulatedTimeContext.getTenantId();
        return simulatedTimeService.offsetFor(effectiveTenant);
    }

    public Instant instant() {
        return instant(null);
    }

    public Instant instant(Long tenantId) {
        Duration offset = offset(tenantId);
        Instant real = Instant.now();
        return offset.isZero() ? real : real.plus(offset);
    }

    public long epochMilli() {
        return instant().toEpochMilli();
    }

    public LocalDateTime localDateTime() {
        return localDateTime(ZoneId.systemDefault());
    }

    public LocalDateTime localDateTime(ZoneId zone) {
        return LocalDateTime.ofInstant(instant(), zone == null ? ZoneId.systemDefault() : zone);
    }

    public LocalDateTime localDateTime(ZoneId zone, Long tenantId) {
        return LocalDateTime.ofInstant(instant(tenantId), zone == null ? ZoneId.systemDefault() : zone);
    }

    public LocalDate localDate() {
        return localDate(ZoneId.systemDefault());
    }

    public LocalDate localDate(ZoneId zone) {
        return instant().atZone(zone == null ? ZoneId.systemDefault() : zone).toLocalDate();
    }

    public LocalDate localDate(ZoneId zone, Long tenantId) {
        return instant(tenantId).atZone(zone == null ? ZoneId.systemDefault() : zone).toLocalDate();
    }

    public OffsetDateTime offsetDateTime() {
        return OffsetDateTime.ofInstant(instant(), ZoneId.systemDefault());
    }

    public OffsetDateTime offsetDateTime(ZoneId zone) {
        return OffsetDateTime.ofInstant(instant(), zone == null ? ZoneId.systemDefault() : zone);
    }

    /** Whether the effective clock for the current/!given tenant is shifted from real time. */
    public boolean isSimulated(Long tenantId) {
        return !offset(tenantId).isZero();
    }
}
