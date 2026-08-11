package com.example.app.consumables;

import com.example.app.settings.GlobalConsumablesFeatureService;
import com.example.app.user.User;
import java.time.LocalDate;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/consumables/reports")
public class ConsumableReportController {
    private static final MediaType XLSX = MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    private final ConsumableReportService reports;
    private final GlobalConsumablesFeatureService consumablesFeatureService;

    public ConsumableReportController(ConsumableReportService reports, GlobalConsumablesFeatureService consumablesFeatureService) {
        this.reports = reports;
        this.consumablesFeatureService = consumablesFeatureService;
    }

    @PreAuthorize("@permissionGuard.can(authentication, 'CONSUMABLES_REPORTS')")
    @GetMapping
    public ConsumableReportService.ReportResponse report(
            @AuthenticationPrincipal User me,
            @RequestParam(defaultValue = "STOCK_VALUATION") ConsumableReportService.ReportType type,
            @RequestParam(required = false) LocalDate from,
            @RequestParam(required = false) LocalDate to,
            @RequestParam(required = false) Long locationId,
            @RequestParam(required = false) Long serviceTypeId,
            @RequestParam(required = false) Long employeeId
    ) {
        consumablesFeatureService.assertEnabledForUser(me);
        return reports.build(me, type, new ConsumableReportService.Filters(from, to, locationId, serviceTypeId, employeeId));
    }

    @PreAuthorize("@permissionGuard.can(authentication, 'CONSUMABLES_REPORTS')")
    @GetMapping(value = "/csv", produces = "text/csv;charset=UTF-8")
    public ResponseEntity<byte[]> csv(
            @AuthenticationPrincipal User me,
            @RequestParam(defaultValue = "STOCK_VALUATION") ConsumableReportService.ReportType type,
            @RequestParam(required = false) LocalDate from,
            @RequestParam(required = false) LocalDate to,
            @RequestParam(required = false) Long locationId,
            @RequestParam(required = false) Long serviceTypeId,
            @RequestParam(required = false) Long employeeId
    ) {
        consumablesFeatureService.assertEnabledForUser(me);
        var report = reports.build(me, type, new ConsumableReportService.Filters(from, to, locationId, serviceTypeId, employeeId));
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + reports.fileBaseName(report) + ".csv\"")
                .contentType(MediaType.parseMediaType("text/csv;charset=UTF-8"))
                .body(reports.toCsv(report));
    }

    @PreAuthorize("@permissionGuard.can(authentication, 'CONSUMABLES_REPORTS')")
    @GetMapping("/excel")
    public ResponseEntity<byte[]> excel(
            @AuthenticationPrincipal User me,
            @RequestParam(defaultValue = "STOCK_VALUATION") ConsumableReportService.ReportType type,
            @RequestParam(required = false) LocalDate from,
            @RequestParam(required = false) LocalDate to,
            @RequestParam(required = false) Long locationId,
            @RequestParam(required = false) Long serviceTypeId,
            @RequestParam(required = false) Long employeeId
    ) {
        consumablesFeatureService.assertEnabledForUser(me);
        var report = reports.build(me, type, new ConsumableReportService.Filters(from, to, locationId, serviceTypeId, employeeId));
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + reports.fileBaseName(report) + ".xlsx\"")
                .contentType(XLSX)
                .body(reports.toXlsx(report));
    }
}
