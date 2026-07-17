package com.example.app.account;

import com.example.app.billing.Bill;
import com.example.app.billing.BillFolioPdfService;
import com.example.app.billing.BillItem;
import com.example.app.billing.BillPaymentSplitSupport;
import com.example.app.billing.BillRepository;
import com.example.app.billing.BillType;
import com.example.app.billing.InvoicePdfS3Service;
import com.example.app.company.ClientCompanyRepository;
import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Tenant-facing account management endpoints that show invoices issued by the Platform Admin tenant.
 *
 * <p>These are intentionally not placed under {@code /api/billing}: tenants must be able to see their
 * own platform subscription invoices even when the tenant's Billing/Obračun module is disabled.</p>
 */
@RestController
@RequestMapping("/api/account-management")
@PreAuthorize("hasRole('ADMIN')")
public class AccountManagementInvoiceController {
    private static final String PLATFORM_ADMIN_COMPANY_NAME = "Platform Admin";
    private static final String PLATFORM_SUBSCRIPTION_REFERENCE_PREFIX = "CALENDRA-SUBSCRIPTION:";

    private final CompanyRepository companies;
    private final ClientCompanyRepository clientCompanies;
    private final BillRepository bills;
    private final UserRepository users;
    private final InvoicePdfS3Service invoicePdfS3Service;
    private final BillFolioPdfService billFolioPdfService;

    public AccountManagementInvoiceController(
            CompanyRepository companies,
            ClientCompanyRepository clientCompanies,
            BillRepository bills,
            UserRepository users,
            InvoicePdfS3Service invoicePdfS3Service,
            BillFolioPdfService billFolioPdfService
    ) {
        this.companies = companies;
        this.clientCompanies = clientCompanies;
        this.bills = bills;
        this.users = users;
        this.invoicePdfS3Service = invoicePdfS3Service;
        this.billFolioPdfService = billFolioPdfService;
    }

    public record ReceivedPlatformInvoiceResponse(
            Long id,
            String billNumber,
            String orderId,
            String billType,
            LocalDate issueDate,
            BigDecimal totalGross,
            BigDecimal pendingPaymentGross,
            String paymentStatus,
            OffsetDateTime paidAt,
            String issuerName,
            String issuerTenantCode,
            String recipientCompanyName,
            List<String> itemDescriptions,
            boolean pdfAvailable,
            String stripeHostedInvoiceUrl
    ) {}

    @GetMapping("/received-invoices")
    @Transactional(readOnly = true)
    public List<ReceivedPlatformInvoiceResponse> receivedInvoices(@AuthenticationPrincipal User me) {
        Company tenantCompany = me == null ? null : me.getCompany();
        Company platformCompany = resolvePlatformCompany().orElse(null);
        if (tenantCompany == null || tenantCompany.getId() == null || platformCompany == null || platformCompany.getId() == null) {
            return List.of();
        }
        if (Objects.equals(tenantCompany.getId(), platformCompany.getId())) {
            return List.of();
        }

        String subscriptionReference = subscriptionReference(tenantCompany.getId());
        return bills.findAllByCompanyIdAndBillTypeAndBankTransferReferenceOrderByIssueDateDescIdDesc(
                        platformCompany.getId(), BillType.INVOICE, subscriptionReference)
                .stream()
                .map(bill -> toResponse(bill, platformCompany))
                .toList();
    }

    @GetMapping(value = "/received-invoices/{id}/pdf", produces = MediaType.APPLICATION_PDF_VALUE)
    @Transactional(readOnly = true)
    public ResponseEntity<byte[]> receivedInvoicePdf(
            @PathVariable Long id,
            @RequestParam(name = "inline", defaultValue = "false") boolean inline,
            @AuthenticationPrincipal User me
    ) {
        Company tenantCompany = me == null ? null : me.getCompany();
        Company platformCompany = resolvePlatformCompany().orElse(null);
        if (tenantCompany == null || tenantCompany.getId() == null || platformCompany == null || platformCompany.getId() == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        if (Objects.equals(tenantCompany.getId(), platformCompany.getId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }

        String subscriptionReference = subscriptionReference(tenantCompany.getId());
        Bill bill = bills.findByIdAndCompanyIdAndBankTransferReference(id, platformCompany.getId(), subscriptionReference)
                .filter(row -> row.getBillType() == BillType.INVOICE)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        byte[] pdf = invoicePdfS3Service.downloadIfPresent(bill);
        if (pdf == null) {
            pdf = billFolioPdfService.generate(bill, platformCompany.getId());
        }
        String fileName = safeFileName(firstNonBlank(bill.getBillNumber(), "platform-invoice-" + bill.getId())) + ".pdf";
        String disposition = (inline ? "inline" : "attachment") + "; filename=\"" + fileName + "\"";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition)
                .contentType(MediaType.APPLICATION_PDF)
                .body(pdf);
    }

    private static String subscriptionReference(Long tenantCompanyId) {
        return PLATFORM_SUBSCRIPTION_REFERENCE_PREFIX + tenantCompanyId;
    }

    private Optional<Company> resolvePlatformCompany() {
        Optional<Company> named = companies.findAll().stream()
                .filter(c -> c.getName() != null && PLATFORM_ADMIN_COMPANY_NAME.equalsIgnoreCase(c.getName().trim()))
                .min(Comparator.comparing(Company::getId));
        if (named.isPresent()) {
            return named;
        }
        return users.findAllByRoleOrderByIdAsc(Role.SUPER_ADMIN).stream()
                .map(User::getCompany)
                .filter(Objects::nonNull)
                .findFirst();
    }

    private static ReceivedPlatformInvoiceResponse toResponse(Bill bill, Company issuer) {
        List<String> itemDescriptions = bill.getItems() == null ? List.of() : bill.getItems().stream()
                .map(BillItem::getTransactionService)
                .filter(Objects::nonNull)
                .map(tx -> firstNonBlank(tx.getDescription(), tx.getCode()))
                .filter(value -> value != null && !value.isBlank())
                .distinct()
                .toList();
        return new ReceivedPlatformInvoiceResponse(
                bill.getId(),
                bill.getBillNumber(),
                bill.getOrderId(),
                bill.getBillType() == null ? BillType.INVOICE.name() : bill.getBillType().name(),
                bill.getIssueDate(),
                money(bill.getTotalGross()),
                pendingGross(bill),
                normalizePaymentStatus(bill.getPaymentStatus()),
                bill.getPaidAt(),
                issuer == null ? PLATFORM_ADMIN_COMPANY_NAME : firstNonBlank(issuer.getName(), PLATFORM_ADMIN_COMPANY_NAME),
                issuer == null ? null : issuer.getTenantCode(),
                firstNonBlank(bill.getRecipientCompanyNameSnapshot(), ""),
                itemDescriptions,
                bill.getInvoicePdfObjectKey() != null && !bill.getInvoicePdfObjectKey().isBlank(),
                bill.getStripeHostedInvoiceUrl()
        );
    }

    private static BigDecimal pendingGross(Bill bill) {
        String status = normalizePaymentStatus(bill == null ? null : bill.getPaymentStatus());
        if ("PAID".equals(status) || "CANCELLED".equals(status)) {
            return BigDecimal.ZERO;
        }
        return money(BillPaymentSplitSupport.resolvePendingPaymentGross(bill));
    }

    private static BigDecimal money(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private static String normalizePaymentStatus(String value) {
        if (value == null || value.isBlank()) return "OPEN";
        return value.trim().toUpperCase();
    }

    private static String firstNonBlank(String... values) {
        if (values == null) return "";
        for (String value : values) {
            if (value != null && !value.trim().isBlank()) {
                return value.trim();
            }
        }
        return "";
    }

    private static String safeFileName(String value) {
        String cleaned = firstNonBlank(value, "platform-invoice").replaceAll("[^a-zA-Z0-9._-]", "_");
        return cleaned.isBlank() ? "platform-invoice" : cleaned;
    }
}
