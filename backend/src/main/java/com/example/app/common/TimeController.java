package com.example.app.common;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Exposes the effective "now" for the calling user's tenant so the frontend can mirror an active
 * time simulation. The tenant context is set by {@link TimeSimulationContextInterceptor}.
 */
@RestController
@RequestMapping("/api/time")
public class TimeController {
    private final TimeService timeService;

    public TimeController(TimeService timeService) {
        this.timeService = timeService;
    }

    public record TimeNow(long epochMillis, String iso, boolean simulated) {}

    @GetMapping("/now")
    @PreAuthorize("isAuthenticated()")
    public TimeNow now() {
        Long tenantId = SimulatedTimeContext.getTenantId();
        return new TimeNow(
                timeService.epochMilli(),
                timeService.instant().toString(),
                timeService.isSimulated(tenantId));
    }
}
