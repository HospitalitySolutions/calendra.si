package com.example.app.analytics;

import com.example.app.user.User;
import java.time.LocalDate;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.ResponseStatus;

@RestController
@RequestMapping("/api/analytics")
public class AnalyticsController {
    private final AnalyticsService analyticsService;
    private final AnalyticsReportService analyticsReportService;

    public AnalyticsController(AnalyticsService analyticsService, AnalyticsReportService analyticsReportService) {
        this.analyticsService = analyticsService;
        this.analyticsReportService = analyticsReportService;
    }

    public record ReportRequest(
            String email,
            String period,
            LocalDate from,
            LocalDate to,
            Long consultantId,
            Long spaceId,
            Long typeId
    ) {}

    @GetMapping("/overview")
    public AnalyticsService.AnalyticsOverviewResponse overview(
            @AuthenticationPrincipal User me,
            @RequestParam(required = false) String period,
            @RequestParam(required = false) LocalDate from,
            @RequestParam(required = false) LocalDate to,
            @RequestParam(required = false) Long consultantId,
            @RequestParam(required = false) Long spaceId,
            @RequestParam(required = false) Long typeId
    ) {
        return analyticsService.overview(me, period, from, to, consultantId, spaceId, typeId);
    }

    @PostMapping("/report/send")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Map<String, String> sendReport(
            @AuthenticationPrincipal User me,
            @RequestBody(required = false) ReportRequest request
    ) {
        String target = analyticsReportService.sendManualReport(me, request);
        return Map.of("status", "sent", "email", target);
    }
}
