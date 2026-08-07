package com.example.app.fiscal;

import com.example.app.activitylog.ActivityAction;
import com.example.app.activitylog.ActivityDetails;
import com.example.app.activitylog.ActivityLogService;
import com.example.app.activitylog.ActivityModule;
import com.example.app.billing.BillFiscalStatus;
import com.example.app.billing.BillRepository;
import com.example.app.billingissuer.CompanyLegalEntity;
import com.example.app.billingissuer.CompanyLegalEntityRepository;
import com.example.app.billingissuer.InvoiceSeries;
import com.example.app.billingissuer.InvoiceSeriesRepository;
import com.example.app.billingissuer.LegalEntity;
import com.example.app.billingissuer.LegalEntityRepository;
import com.example.app.location.Location;
import com.example.app.location.LocationRepository;
import com.example.app.user.User;
import com.example.app.workspaceclient.WorkspaceClientAccessService;
import com.example.app.settings.BillingModuleAccessService;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
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
import org.springframework.web.bind.annotation.ModelAttribute;
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
    private final BillingModuleAccessService billingModuleAccess;
    private final AppSettingRepository settings;
    private final LegalEntityRepository legalEntities;
    private final CompanyLegalEntityRepository issuerAssignments;
    private final InvoiceSeriesRepository invoiceSeries;
    private final LocationRepository locations;
    private final WorkspaceClientAccessService workspaceAccess;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private ActivityLogService activityLogs;

    public FiscalController(
            FiscalizationService fiscalizationService,
            FiscalSettingsService fiscalSettingsService,
            BillRepository bills,
            FiscalCertificateRepository certificates,
            BillingModuleAccessService billingModuleAccess,
            AppSettingRepository settings,
            LegalEntityRepository legalEntities,
            CompanyLegalEntityRepository issuerAssignments,
            InvoiceSeriesRepository invoiceSeries,
            LocationRepository locations,
            WorkspaceClientAccessService workspaceAccess
    ) {
        this.fiscalizationService = fiscalizationService;
        this.fiscalSettingsService = fiscalSettingsService;
        this.bills = bills;
        this.certificates = certificates;
        this.billingModuleAccess = billingModuleAccess;
        this.settings = settings;
        this.legalEntities = legalEntities;
        this.issuerAssignments = issuerAssignments;
        this.invoiceSeries = invoiceSeries;
        this.locations = locations;
        this.workspaceAccess = workspaceAccess;
    }

    @ModelAttribute
    public void ensureBillingModuleEnabled(@AuthenticationPrincipal User me) {
        billingModuleAccess.assertBillingEnabled(me);
        if (me == null || me.getCompany() == null || !isFiscalCashRegisterEnabled(me.getCompany().getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Davčna blagajna is disabled for this tenant.");
        }
    }

    private boolean isFiscalCashRegisterEnabled(Long companyId) {
        if (companyId == null) return false;
        return settings.findByCompanyIdAndKey(companyId, SettingKey.BILLING_FISCAL_CASH_REGISTER_ENABLED)
                .map(AppSetting::getValue)
                .map(value -> "true".equalsIgnoreCase(value == null ? "" : value.trim()))
                .orElse(false);
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
    public FiscalResponse registerPremise(
            @RequestParam(name = "legalEntityId", required = false) Long legalEntityId,
            @RequestParam(name = "locationId", required = false) Long locationId,
            @RequestParam(name = "invoiceSeriesId", required = false) Long invoiceSeriesId,
            @AuthenticationPrincipal User me
    ) {
        LegalEntity issuer = resolveAssignedIssuer(me, legalEntityId);
        Location location = resolveLocation(me, locationId);
        InvoiceSeries series = resolveSeries(me, issuer, location, invoiceSeriesId);
        FiscalResponse result = fiscalizationService.registerBusinessPremise(me.getCompany().getId(), issuer, location, series, me);
        if (activityLogs != null) {
            activityLogs.recordUser(me, ActivityModule.CONFIGURATION, ActivityAction.FISCAL_PREMISE_REGISTERED,
                    "FISCAL_PREMISE", location == null ? null : location.getId(), location == null ? "Fiscal premise" : location.getName(),
                    "Registered fiscal business premise", location == null ? null : location.getId(), null,
                    ActivityDetails.of("legalEntity", issuer == null ? null : issuer.getName(),
                            "invoiceSeries", series == null ? null : series.getName(),
                            "targetPath", "/configuration?tab=billing"));
        }
        return result;
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/certificate")
    @Transactional
    public FiscalCertificateMetaResponse uploadCertificate(
            @RequestParam("file") MultipartFile file,
            @RequestParam(name = "legalEntityId", required = false) Long legalEntityId,
            @AuthenticationPrincipal User me
    ) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Certificate file is required.");
        }
        try {
            LegalEntity issuer = resolveAssignedIssuer(me, legalEntityId);
            requireIssuerAdminAcrossAssignments(me, issuer);
            var existing = certificates.findByLegalEntityId(issuer.getId()).orElseGet(FiscalCertificate::new);
            existing.setCompany(me.getCompany());
            existing.setLegalEntity(issuer);
            existing.setFileName(file.getOriginalFilename() == null ? "certificate.p12" : file.getOriginalFilename());
            existing.setContentType(file.getContentType() == null ? "application/x-pkcs12" : file.getContentType());
            existing.setCertificateData(file.getBytes());
            var saved = certificates.save(existing);
            FiscalCertificateMetaResponse result = toMeta(saved);
            if (activityLogs != null) {
                activityLogs.recordUser(me, ActivityModule.CONFIGURATION, ActivityAction.FISCAL_CERTIFICATE_UPDATED,
                        "FISCAL_CERTIFICATE", issuer.getId(), issuer.getName(), "Updated fiscal certificate", null, null,
                        ActivityDetails.of("fileName", result.fileName(), "expiresAt", result.expiresAt(),
                                "targetPath", "/configuration?tab=billing"));
            }
            return result;
        } catch (ResponseStatusException e) {
            throw e;
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
    public FiscalCertificateMetaResponse certificateMeta(
            @RequestParam(name = "legalEntityId", required = false) Long legalEntityId,
            @AuthenticationPrincipal User me
    ) {
        LegalEntity issuer = resolveAssignedIssuer(me, legalEntityId);
        return certificates.findByLegalEntityId(issuer.getId())
                .map(this::toMeta)
                .orElseGet(() -> new FiscalCertificateMetaResponse(false, null, null, null, null));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/certificate")
    @Transactional
    public void deleteCertificate(
            @RequestParam(name = "legalEntityId", required = false) Long legalEntityId,
            @AuthenticationPrincipal User me
    ) {
        LegalEntity issuer = resolveAssignedIssuer(me, legalEntityId);
        requireIssuerAdminAcrossAssignments(me, issuer);
        certificates.deleteByLegalEntityId(issuer.getId());
        if (activityLogs != null) {
            activityLogs.recordUser(me, ActivityModule.CONFIGURATION, ActivityAction.FISCAL_CERTIFICATE_DELETED,
                    "FISCAL_CERTIFICATE", issuer.getId(), issuer.getName(), "Deleted fiscal certificate", null, null,
                    ActivityDetails.of("targetPath", "/configuration?tab=billing"));
        }
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

    private void requireIssuerAdminAcrossAssignments(User me, LegalEntity issuer) {
        var companyIds = issuerAssignments.findAllByLegalEntityId(issuer.getId()).stream()
                .filter(CompanyLegalEntity::isActive)
                .map(row -> row.getCompany().getId())
                .toList();
        workspaceAccess.requireAdminForCompanies(me, companyIds);
    }

    private LegalEntity resolveAssignedIssuer(User me, Long requestedId) {
        Long companyId = me.getCompany().getId();
        CompanyLegalEntity assignment = requestedId == null
                ? issuerAssignments.findFirstByCompanyIdAndActiveTrueOrderByDefaultIssuerDescIdAsc(companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "No invoice issuer is assigned to this operating unit."))
                : issuerAssignments.findByCompanyIdAndLegalEntityId(companyId, requestedId)
                    .filter(CompanyLegalEntity::isActive)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invoice issuer is not assigned to this operating unit."));
        return legalEntities.findById(assignment.getLegalEntity().getId())
                .filter(LegalEntity::isActive)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invoice issuer is inactive or missing."));
    }

    private Location resolveLocation(User me, Long requestedId) {
        Long companyId = me.getCompany().getId();
        if (requestedId != null) {
            return locations.findByIdAndCompanyId(requestedId, companyId)
                    .filter(Location::isActive)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Location does not belong to this operating unit."));
        }
        return locations.findFirstByCompanyIdAndDefaultLocationTrue(companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "No default location is configured."));
    }

    private InvoiceSeries resolveSeries(User me, LegalEntity issuer, Location location, Long requestedId) {
        if (requestedId == null) {
            return issuerAssignments.findByCompanyIdAndLegalEntityId(me.getCompany().getId(), issuer.getId())
                    .map(CompanyLegalEntity::getDefaultInvoiceSeries)
                    .filter(value -> value != null && value.isActive())
                    .orElse(null);
        }
        InvoiceSeries series = invoiceSeries.findByIdAndWorkspaceId(requestedId, me.getCompany().getWorkspace().getId())
                .filter(InvoiceSeries::isActive)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invoice series not found."));
        if (!series.getLegalEntity().getId().equals(issuer.getId())
                || (series.getCompany() != null && !series.getCompany().getId().equals(me.getCompany().getId()))
                || (series.getLocation() != null && !series.getLocation().getId().equals(location.getId()))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invoice series is not valid for the selected issuer and location.");
        }
        return series;
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
            var issuer = c.getLegalEntity();
            if (issuer == null || issuer.getId() == null) return null;
            String certificatePassword = fiscalSettingsService.certificatePasswordFor(issuer);
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
