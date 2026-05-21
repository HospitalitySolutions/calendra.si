package com.example.app.fiscal;

import com.example.app.billing.BillFiscalStatus;
import com.example.app.billing.BillRepository;
import com.example.app.user.User;
import java.io.ByteArrayInputStream;
import java.security.KeyStore;
import java.security.cert.X509Certificate;
import java.util.Enumeration;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/fiscal")
public class FiscalController {
    private final FiscalizationService fiscalizationService;
    private final FiscalSettingsService fiscalSettingsService;
    private final BillRepository bills;
    private final FiscalCertificateRepository certificates;

    public FiscalController(
            FiscalizationService fiscalizationService,
            FiscalSettingsService fiscalSettingsService,
            BillRepository bills,
            FiscalCertificateRepository certificates
    ) {
        this.fiscalizationService = fiscalizationService;
        this.fiscalSettingsService = fiscalSettingsService;
        this.bills = bills;
        this.certificates = certificates;
    }

    public record FiscalInvoiceStatusResponse(
            Long billId,
            String status,
            String zoi,
            String eor,
            String messageId,
            Integer attempts,
            String lastError
    ) {}
    public record FiscalCertificateMetaResponse(
            boolean uploaded,
            String fileName,
            String contentType,
            String uploadedAt,
            String expiresAt
    ) {}
    public record FiscalInvoiceLogResponse(
            Long billId,
            String status,
            String logJson,
            String lastError,
            String requestBody,
            String responseBody
    ) {}

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/premises/register")
    public FiscalResponse registerPremise(@AuthenticationPrincipal User me) {
        return fiscalizationService.registerBusinessPremise(me.getCompany().getId(), me);
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/certificate")
    @Transactional
    public FiscalCertificateMetaResponse uploadCertificate(
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal User me
    ) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Certificate file is required.");
        }
        try {
            var existing = certificates.findByCompanyId(me.getCompany().getId()).orElseGet(FiscalCertificate::new);
            existing.setCompany(me.getCompany());
            existing.setFileName(file.getOriginalFilename() == null ? "certificate.p12" : file.getOriginalFilename());
            existing.setContentType(file.getContentType() == null ? "application/x-pkcs12" : file.getContentType());
            existing.setCertificateData(file.getBytes());
            var saved = certificates.save(existing);
            return toMeta(saved);
        } catch (Exception e) {
            String reason = e.getMessage();
            Throwable cause = e.getCause();
            if ((reason == null || reason.isBlank()) && cause != null) {
                reason = cause.getMessage();
            }
            if (reason == null || reason.isBlank()) {
                reason = "Unknown upload error.";
            }
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unable to upload certificate: " + reason);
        }
    }

    @GetMapping("/certificate/meta")
    @Transactional(readOnly = true)
    public FiscalCertificateMetaResponse certificateMeta(@AuthenticationPrincipal User me) {
        return certificates.findByCompanyId(me.getCompany().getId())
                .map(this::toMeta)
                .orElseGet(() -> new FiscalCertificateMetaResponse(false, null, null, null, null));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/certificate")
    @Transactional
    public void deleteCertificate(@AuthenticationPrincipal User me) {
        certificates.deleteByCompanyId(me.getCompany().getId());
    }

    @PostMapping("/invoices/{billId}/retry")
    @Transactional
    public FiscalInvoiceStatusResponse retryInvoice(@PathVariable Long billId, @AuthenticationPrincipal User me) {
        var bill = bills.findByIdAndCompanyId(billId, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        var updated = fiscalizationService.fiscalizeBill(bill, me.getCompany().getId());
        return toStatus(updated);
    }

    @GetMapping("/invoices/{billId}/status")
    @Transactional(readOnly = true)
    public FiscalInvoiceStatusResponse invoiceStatus(@PathVariable Long billId, @AuthenticationPrincipal User me) {
        var bill = bills.findByIdAndCompanyId(billId, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        return toStatus(bill);
    }

    @GetMapping("/invoices/{billId}/log")
    @Transactional(readOnly = true)
    public FiscalInvoiceLogResponse invoiceLog(@PathVariable Long billId, @AuthenticationPrincipal User me) {
        var bill = bills.findByIdAndCompanyId(billId, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        return new FiscalInvoiceLogResponse(
                bill.getId(),
                normalizeFiscalStatus(bill.getFiscalStatus()),
                bill.getFiscalLogJson() == null || bill.getFiscalLogJson().isBlank() ? "[]" : bill.getFiscalLogJson(),
                bill.getFiscalLastError(),
                bill.getFiscalRequestBody(),
                bill.getFiscalResponseBody()
        );
    }

    private FiscalInvoiceStatusResponse toStatus(com.example.app.billing.Bill bill) {
        return new FiscalInvoiceStatusResponse(
                bill.getId(),
                normalizeFiscalStatus(bill.getFiscalStatus()),
                bill.getFiscalZoi(),
                bill.getFiscalEor(),
                bill.getFiscalMessageId(),
                bill.getFiscalAttemptCount(),
                bill.getFiscalLastError()
        );
    }

    private String normalizeFiscalStatus(BillFiscalStatus status) {
        if (status == null || status == BillFiscalStatus.PENDING) {
            return "NOT_SENT";
        }
        return status.name();
    }

    private FiscalCertificateMetaResponse toMeta(FiscalCertificate c) {
        return new FiscalCertificateMetaResponse(
                true,
                c.getFileName(),
                c.getContentType(),
                c.getUpdatedAt() == null ? null : c.getUpdatedAt().toString(),
                certificateExpiry(c)
        );
    }

    private String certificateExpiry(FiscalCertificate c) {
        try {
            var company = c.getCompany();
            if (company == null || company.getId() == null) return null;
            String certificatePassword = fiscalSettingsService.forCompany(company.getId()).certificatePassword();
            if (certificatePassword == null || certificatePassword.isBlank()) return null;
            KeyStore ks = KeyStore.getInstance("PKCS12");
            ks.load(new ByteArrayInputStream(c.getCertificateData()), certificatePassword.toCharArray());
            Enumeration<String> aliases = ks.aliases();
            while (aliases.hasMoreElements()) {
                String alias = aliases.nextElement();
                if (!ks.isCertificateEntry(alias) && !ks.isKeyEntry(alias)) continue;
                var cert = ks.getCertificate(alias);
                if (cert instanceof X509Certificate x509) {
                    return x509.getNotAfter().toInstant().toString();
                }
            }
            return null;
        } catch (Exception ignored) {
            return null;
        }
    }
}
