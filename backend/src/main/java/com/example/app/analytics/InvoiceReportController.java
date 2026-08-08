package com.example.app.analytics;

import com.example.app.user.User;
import java.time.LocalDate;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/analytics/reports/invoices")
public class InvoiceReportController {
    private static final MediaType XLSX = MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    private final InvoiceReportService service;

    public InvoiceReportController(InvoiceReportService service) {
        this.service = service;
    }

    @GetMapping(value = "/pdf", produces = MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<byte[]> pdf(
            @AuthenticationPrincipal User me,
            @RequestParam(required = false) LocalDate from,
            @RequestParam(required = false) LocalDate to,
            @RequestParam(required = false) Long paymentMethodId,
            @RequestParam(required = false) String customer,
            @RequestParam(required = false) String taxRate,
            @RequestParam(required = false) String paymentStatus,
            @RequestParam(required = false) String billType,
            @RequestParam(required = false) String invoiceNumber,
            @RequestParam(required = false) Long locationId
    ) {
        InvoiceReportService.Filters filters = new InvoiceReportService.Filters(from, to, paymentMethodId, customer, taxRate, paymentStatus, billType, invoiceNumber, locationId);
        InvoiceReportService.Report report = service.build(me, filters);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + service.fileBaseName(report) + ".pdf\"")
                .contentType(MediaType.APPLICATION_PDF)
                .body(service.toPdf(report, filters));
    }

    @GetMapping(value = "/excel")
    public ResponseEntity<byte[]> excel(
            @AuthenticationPrincipal User me,
            @RequestParam(required = false) LocalDate from,
            @RequestParam(required = false) LocalDate to,
            @RequestParam(required = false) Long paymentMethodId,
            @RequestParam(required = false) String customer,
            @RequestParam(required = false) String taxRate,
            @RequestParam(required = false) String paymentStatus,
            @RequestParam(required = false) String billType,
            @RequestParam(required = false) String invoiceNumber,
            @RequestParam(required = false) Long locationId
    ) {
        InvoiceReportService.Filters filters = new InvoiceReportService.Filters(from, to, paymentMethodId, customer, taxRate, paymentStatus, billType, invoiceNumber, locationId);
        InvoiceReportService.Report report = service.build(me, filters);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + service.fileBaseName(report) + ".xlsx\"")
                .contentType(XLSX)
                .body(service.toXlsx(report, filters));
    }
}
