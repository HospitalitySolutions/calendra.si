package com.example.app.workspaceanalytics;

import com.example.app.user.User;
import com.example.app.workspacesubscription.WorkspaceEntitlementService;
import com.example.app.workspacesubscription.WorkspaceFeature;
import java.time.LocalDate;
import java.util.List;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/analytics/workspace")
public class WorkspaceAnalyticsController {
    private final WorkspaceAnalyticsService service;
    private WorkspaceEntitlementService entitlements;

    public WorkspaceAnalyticsController(WorkspaceAnalyticsService service) {
        this.service = service;
    }

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    void configureEntitlements(WorkspaceEntitlementService entitlements) {
        this.entitlements = entitlements;
    }

    private void requireEntitlement(User me) {
        if (entitlements != null) entitlements.requireFeature(me, WorkspaceFeature.WORKSPACE_ANALYTICS);
    }

    @GetMapping("/filters")
    public WorkspaceAnalyticsService.FiltersResponse filters(
            @AuthenticationPrincipal User me,
            @RequestParam(required = false) List<Long> unitIds) {
        requireEntitlement(me);
        return service.filters(me, unitIds);
    }

    @GetMapping("/overview")
    public WorkspaceAnalyticsService.OverviewResponse overview(
            @AuthenticationPrincipal User me,
            @RequestParam(required = false) LocalDate from,
            @RequestParam(required = false) LocalDate to,
            @RequestParam(required = false) List<Long> unitIds,
            @RequestParam(required = false) List<Long> locationIds,
            @RequestParam(required = false) List<Long> legalEntityIds,
            @RequestParam(required = false) List<Long> invoiceSeriesIds,
            @RequestParam(required = false) List<Long> employeeLoginAccountIds,
            @RequestParam(required = false) List<Long> workspaceServiceTemplateIds,
            @RequestParam(required = false) List<Long> sessionTypeIds,
            @RequestParam(required = false) List<String> bookingStatuses,
            @RequestParam(required = false) List<String> paymentStatuses) {
        requireEntitlement(me);
        return service.overview(me, query(from, to, unitIds, locationIds, legalEntityIds, invoiceSeriesIds,
                employeeLoginAccountIds, workspaceServiceTemplateIds, sessionTypeIds, bookingStatuses, paymentStatuses));
    }

    @GetMapping("/export")
    public ResponseEntity<byte[]> export(
            @AuthenticationPrincipal User me,
            @RequestParam(defaultValue = "csv") String format,
            @RequestParam(required = false) LocalDate from,
            @RequestParam(required = false) LocalDate to,
            @RequestParam(required = false) List<Long> unitIds,
            @RequestParam(required = false) List<Long> locationIds,
            @RequestParam(required = false) List<Long> legalEntityIds,
            @RequestParam(required = false) List<Long> invoiceSeriesIds,
            @RequestParam(required = false) List<Long> employeeLoginAccountIds,
            @RequestParam(required = false) List<Long> workspaceServiceTemplateIds,
            @RequestParam(required = false) List<Long> sessionTypeIds,
            @RequestParam(required = false) List<String> bookingStatuses,
            @RequestParam(required = false) List<String> paymentStatuses) {
        requireEntitlement(me);
        WorkspaceAnalyticsService.ExportPayload payload = service.export(me,
                query(from, to, unitIds, locationIds, legalEntityIds, invoiceSeriesIds,
                        employeeLoginAccountIds, workspaceServiceTemplateIds, sessionTypeIds,
                        bookingStatuses, paymentStatuses), format);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, payload.contentType())
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + payload.filename() + "\"")
                .body(payload.bytes());
    }

    private static WorkspaceAnalyticsService.Query query(
            LocalDate from,
            LocalDate to,
            List<Long> unitIds,
            List<Long> locationIds,
            List<Long> legalEntityIds,
            List<Long> invoiceSeriesIds,
            List<Long> employeeLoginAccountIds,
            List<Long> workspaceServiceTemplateIds,
            List<Long> sessionTypeIds,
            List<String> bookingStatuses,
            List<String> paymentStatuses) {
        return new WorkspaceAnalyticsService.Query(from, to, unitIds, locationIds, legalEntityIds,
                invoiceSeriesIds, employeeLoginAccountIds, workspaceServiceTemplateIds, sessionTypeIds,
                bookingStatuses, paymentStatuses);
    }
}
