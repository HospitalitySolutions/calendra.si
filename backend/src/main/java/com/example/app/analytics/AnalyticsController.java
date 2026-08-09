package com.example.app.analytics;

import com.example.app.user.User;
import java.time.LocalDate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/analytics")
public class AnalyticsController {
    private final AnalyticsService analyticsService;

    public AnalyticsController(AnalyticsService analyticsService) {
        this.analyticsService = analyticsService;
    }

    @GetMapping("/overview")
    public AnalyticsService.AnalyticsOverviewResponse overview(
            @AuthenticationPrincipal User me,
            @RequestParam(required = false) String period,
            @RequestParam(required = false) LocalDate from,
            @RequestParam(required = false) LocalDate to,
            @RequestParam(required = false) Long consultantId,
            @RequestParam(required = false) Long locationId,
            @RequestParam(required = false) Long spaceId,
            @RequestParam(required = false) Long typeId,
            @RequestParam(required = false) Long serviceGroupId
    ) {
        return analyticsService.overview(me, period, from, to, consultantId, locationId, spaceId, typeId, serviceGroupId);
    }

    @GetMapping("/multi-service")
    public AnalyticsService.MultiServiceAnalyticsResponse multiService(
            @AuthenticationPrincipal User me,
            @RequestParam(required = false) String period,
            @RequestParam(required = false) LocalDate from,
            @RequestParam(required = false) LocalDate to,
            @RequestParam(required = false) Long consultantId,
            @RequestParam(required = false) Long locationId
    ) {
        return analyticsService.multiService(me, period, from, to, consultantId, locationId);
    }
}
