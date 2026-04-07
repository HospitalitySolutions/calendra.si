package com.example.app.billing;

import com.example.app.company.ClientCompany;
import com.example.app.company.ClientCompanyRepository;
import com.example.app.client.ClientRepository;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.TypeTransactionService;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.fiscal.FiscalizationService;
import com.example.app.stripe.StripeBillingService;
import com.example.app.stripe.StripeCheckoutSessionResult;
import com.example.app.settings.AppSetting;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/billing")
public class BillingController {
    private static final Logger log = LoggerFactory.getLogger(BillingController.class);
    private final TransactionServiceRepository txRepo;
    private final PaymentMethodRepository paymentMethodRepo;
    private final BillRepository billRepo;
    private final OpenBillRepository openBillRepo;
    private final SessionBookingRepository sessionBookings;
    private final ClientRepository clients;
    private final ClientCompanyRepository clientCompanies;
    private final UserRepository users;
    private final AppSettingRepository settings;
    private final FiscalizationService fiscalizationService;
    private final StripeBillingService stripeBillingService;
    private final BillingEmailService billingEmailService;
    private final BillPdfService billPdfService;
    private final InvoicePdfS3Service invoicePdfS3Service;
    private final FolioPdfService folioPdfService;
    private final UpnQrPayloadBuilder upnQrPayloadBuilder;
    private final BankStatementReconciliationService bankStatementReconciliationService;

    public BillingController(TransactionServiceRepository txRepo, PaymentMethodRepository paymentMethodRepo, BillRepository billRepo, OpenBillRepository openBillRepo,
                             SessionBookingRepository sessionBookings, ClientRepository clients, ClientCompanyRepository clientCompanies, UserRepository users,
                             AppSettingRepository settings, FiscalizationService fiscalizationService,
                             StripeBillingService stripeBillingService, BillingEmailService billingEmailService, BillPdfService billPdfService,
                             InvoicePdfS3Service invoicePdfS3Service, FolioPdfService folioPdfService, UpnQrPayloadBuilder upnQrPayloadBuilder,
                             BankStatementReconciliationService bankStatementReconciliationService) {
        this.txRepo = txRepo;
        this.paymentMethodRepo = paymentMethodRepo;
        this.billRepo = billRepo;
        this.openBillRepo = openBillRepo;
        this.sessionBookings = sessionBookings;
        this.clients = clients;
        this.clientCompanies = clientCompanies;
        this.users = users;
        this.settings = settings;
        this.fiscalizationService = fiscalizationService;
        this.stripeBillingService = stripeBillingService;
        this.billingEmailService = billingEmailService;
        this.billPdfService = billPdfService;
        this.invoicePdfS3Service = invoicePdfS3Service;
        this.folioPdfService = folioPdfService;
        this.upnQrPayloadBuilder = upnQrPayloadBuilder;
        this.bankStatementReconciliationService = bankStatementReconciliationService;
    }

    public record BillItemRequest(Long transactionServiceId, Integer quantity, BigDecimal netPrice) {}
    public record BillRequest(
            Long clientId,
            Long consultantId,
            Long paymentMethodId,
            String billingTarget,
            Long recipientCompanyId,
            List<BillItemRequest> items
    ) {}
    public record PaymentMethodRequest(String name, PaymentType paymentType, Boolean fiscalized, Boolean stripeEnabled) {}
    public record PaymentMethodResponse(Long id, String name, PaymentType paymentType, boolean fiscalized, boolean stripeEnabled) {}
    public record ClientSummary(Long id, String firstName, String lastName, String email, String phone) {}
    public record UserSummary(Long id, String firstName, String lastName, String email, Role role) {}
    public record PaymentMethodSummary(Long id, String name, PaymentType paymentType, boolean fiscalized, boolean stripeEnabled) {}
    public record ServiceSummary(Long id, String code, String description, TaxRate taxRate, BigDecimal netPrice) {}
    public record BillItemResponse(
            Long id,
            ServiceSummary transactionService,
            Integer quantity,
            BigDecimal netPrice,
            BigDecimal grossPrice
    ) {}
    public record BillResponse(
            Long id,
            String billNumber,
            Long sessionId,
            ClientSummary client,
            RecipientCompanySummary recipientCompany,
            String billingTarget,
            UserSummary consultant,
            PaymentMethodSummary paymentMethod,
            LocalDate issueDate,
            BigDecimal totalNet,
            BigDecimal totalGross,
            String paymentStatus,
            String checkoutSessionId,
            String paymentIntentId,
            String stripeInvoiceId,
            String stripeHostedInvoiceUrl,
            OffsetDateTime paidAt,
            String fiscalStatus,
            String fiscalZoi,
            String fiscalEor,
            String fiscalQr,
            String fiscalMessageId,
            String fiscalLastError,
            Integer fiscalAttemptCount,
            List<BillItemResponse> items
    ) {}

    public record OpenBillItemRequest(Long transactionServiceId, Integer quantity, BigDecimal netPrice, Long sourceSessionBookingId) {}
    public record OpenBillItemResponse(Long id, ServiceSummary transactionService, Integer quantity, BigDecimal netPrice, Long sourceSessionBookingId) {}
    public record OpenBillSessionSummary(
            Long sessionId,
            String sessionDisplayId,
            String sessionInfo,
            String clientName,
            String consultantName
    ) {}
    public record OpenBillResponse(
            Long id,
            Long sessionId,
            ClientSummary client,
            UserSummary consultant,
            PaymentMethodSummary paymentMethod,
            List<OpenBillItemResponse> items,
            String sessionDisplayId,
            String sessionInfo,
            String batchScope,
            Long batchTargetClientId,
            Long batchTargetCompanyId,
            List<OpenBillSessionSummary> sessions
    ) {}
    public record CheckoutSessionResponse(
            Long billId,
            String billNumber,
            String paymentStatus,
            String checkoutSessionId,
            String checkoutUrl,
            OffsetDateTime checkoutSessionExpiresAt
    ) {}
    public record BankStatementImportResponse(
            int processedRows,
            int matchedCount,
            int unmatchedCount,
            List<BankStatementReconciliationService.MatchedBill> matchedBills
    ) {}
    public record OpenBillUpdateRequest(Long paymentMethodId, List<OpenBillItemRequest> items) {}
    public record SplitOpenBillSessionRequest(Long sessionId) {}
    public record ManualOpenBillRequest(Long clientId, Long recipientCompanyId) {}
    public record RecipientCompanySummary(
            Long id,
            String name,
            String address,
            String postalCode,
            String city,
            String vatId,
            String iban,
            String email,
            String telephone
    ) {}

    @GetMapping("/services")
    public List<TransactionService> services(@AuthenticationPrincipal User me) {
        return txRepo.findAllByCompanyId(me.getCompany().getId());
    }

    @PreAuthorize("hasRole('ADMIN')") 
    @PostMapping("/services")
    public TransactionService createService(@RequestBody TransactionService s, @AuthenticationPrincipal User me) {
        s.setCompany(me.getCompany());
        return txRepo.save(s);
    }

    @PreAuthorize("hasRole('ADMIN')") 
    @PutMapping("/services/{id}")
    public TransactionService updateService(@PathVariable Long id, @RequestBody TransactionService s, @AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var existing = txRepo.findByIdAndCompanyId(id, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        existing.setCode(s.getCode());
        existing.setDescription(s.getDescription());
        existing.setTaxRate(s.getTaxRate());
        existing.setNetPrice(s.getNetPrice());
        return txRepo.save(existing);
    }

    @PreAuthorize("hasRole('ADMIN')") 
    @DeleteMapping("/services/{id}")
    public void deleteService(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var existing = txRepo.findByIdAndCompanyId(id, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        txRepo.delete(existing);
    }

    @GetMapping("/payment-methods")
    @Transactional(readOnly = true)
    public List<PaymentMethodResponse> paymentMethods(@AuthenticationPrincipal User me) {
        return paymentMethodRepo.findAllByCompanyIdOrderByNameAsc(me.getCompany().getId()).stream()
                .map(pm -> new PaymentMethodResponse(pm.getId(), pm.getName(), pm.getPaymentType(), pm.isFiscalized(), pm.isStripeEnabled()))
                .toList();
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/payment-methods")
    @Transactional
    public PaymentMethodResponse createPaymentMethod(@RequestBody PaymentMethodRequest req, @AuthenticationPrincipal User me) {
        if (req == null || req.name() == null || req.name().trim().isEmpty() || req.paymentType() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name and paymentType are required.");
        }
        var pm = new PaymentMethod();
        pm.setCompany(me.getCompany());
        pm.setName(req.name().trim());
        pm.setPaymentType(req.paymentType());
        applyPaymentMethodFlags(pm, req);
        var saved = paymentMethodRepo.save(pm);
        return new PaymentMethodResponse(saved.getId(), saved.getName(), saved.getPaymentType(), saved.isFiscalized(), saved.isStripeEnabled());
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/payment-methods/{id}")
    @Transactional
    public PaymentMethodResponse updatePaymentMethod(@PathVariable Long id, @RequestBody PaymentMethodRequest req, @AuthenticationPrincipal User me) {
        var pm = paymentMethodRepo.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (req == null || req.name() == null || req.name().trim().isEmpty() || req.paymentType() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name and paymentType are required.");
        }
        pm.setName(req.name().trim());
        pm.setPaymentType(req.paymentType());
        applyPaymentMethodFlags(pm, req);
        var saved = paymentMethodRepo.save(pm);
        return new PaymentMethodResponse(saved.getId(), saved.getName(), saved.getPaymentType(), saved.isFiscalized(), saved.isStripeEnabled());
    }

    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/payment-methods/{id}")
    @Transactional
    public void deletePaymentMethod(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var pm = paymentMethodRepo.findByIdAndCompanyId(id, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        paymentMethodRepo.delete(pm);
    }

    @GetMapping("/bills")
    @Transactional(readOnly = true)
    public List<BillResponse> bills(@AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        return billRepo.findAllByCompanyId(companyId).stream()
                .map(this::ensureSnapshotBackfilled)
                .map(BillingController::toResponse)
                .toList();
    }

    @GetMapping("/open-bills")
    @Transactional
    public List<OpenBillResponse> openBills(@AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        syncOpenBillsFromPastSessions(companyId);
        return toOpenBillResponses(openBillRepo.findAllWithItemsByCompanyId(companyId), companyId);
    }

    @PostMapping("/open-bills/manual")
    @Transactional
    public List<OpenBillResponse> createManualOpenBill(@RequestBody ManualOpenBillRequest req, @AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        if (req == null || (req.clientId() == null && req.recipientCompanyId() == null)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "clientId or recipientCompanyId is required.");
        }

        var client = req.clientId() == null
                ? null
                : clients.findByIdAndCompanyId(req.clientId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid clientId."));
        var recipientCompany = req.recipientCompanyId() == null
                ? null
                : clientCompanies.findByIdAndOwnerCompanyId(req.recipientCompanyId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid recipientCompanyId."));

        if (client == null && recipientCompany != null) {
            client = clients.findFirstByCompanyIdAndBillingCompanyIdOrderByIdAsc(companyId, recipientCompany.getId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "No clients linked to this company."));
        }
        if (client == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unable to resolve client for manual open bill.");
        }
        final var resolvedClient = client;
        final var resolvedLinkedCompany = recipientCompany != null ? recipientCompany : resolvedClient.getBillingCompany();

        final boolean companyBatchEnabled = resolvedLinkedCompany != null && resolvedLinkedCompany.isBatchPaymentEnabled();
        final boolean clientBatchEnabled = !companyBatchEnabled && resolvedClient.isBatchPaymentEnabled();

        OpenBill open;
        if (companyBatchEnabled) {
            open = openBillRepo.findBatchByCompanyTarget(companyId, OpenBill.BATCH_SCOPE_COMPANY, resolvedLinkedCompany.getId()).orElseGet(() -> {
                var created = new OpenBill();
                created.setCompany(me.getCompany());
                created.setClient(resolvedClient);
                created.setConsultant(resolvedClient.getAssignedTo() != null ? resolvedClient.getAssignedTo() : me);
                created.setPaymentMethod(resolveDefaultPaymentMethod(companyId));
                created.setBatchScope(OpenBill.BATCH_SCOPE_COMPANY);
                created.setBatchTargetCompanyId(resolvedLinkedCompany.getId());
                created.setBatchTargetClientId(null);
                created.setSessionBooking(null);
                created.setManualSplitLocked(false);
                return created;
            });
        } else if (clientBatchEnabled) {
            open = openBillRepo.findBatchByClientTarget(companyId, OpenBill.BATCH_SCOPE_CLIENT, resolvedClient.getId()).orElseGet(() -> {
                var created = new OpenBill();
                created.setCompany(me.getCompany());
                created.setClient(resolvedClient);
                created.setConsultant(resolvedClient.getAssignedTo() != null ? resolvedClient.getAssignedTo() : me);
                created.setPaymentMethod(resolveDefaultPaymentMethod(companyId));
                created.setBatchScope(OpenBill.BATCH_SCOPE_CLIENT);
                created.setBatchTargetClientId(resolvedClient.getId());
                created.setBatchTargetCompanyId(null);
                created.setSessionBooking(null);
                created.setManualSplitLocked(false);
                return created;
            });
        } else {
            open = new OpenBill();
            open.setCompany(me.getCompany());
            open.setClient(resolvedClient);
            open.setConsultant(resolvedClient.getAssignedTo() != null ? resolvedClient.getAssignedTo() : me);
            open.setPaymentMethod(resolveDefaultPaymentMethod(companyId));
            open.setBatchScope(OpenBill.BATCH_SCOPE_NONE);
            open.setBatchTargetClientId(null);
            open.setBatchTargetCompanyId(null);
            open.setSessionBooking(null);
            open.setManualSplitLocked(false);
        }

        long nextManualSessionNo = nextManualSessionNumber(companyId);
        appendManualSessionNumber(open, nextManualSessionNo);
        openBillRepo.save(open);

        syncOpenBillsFromPastSessions(companyId);
        return toOpenBillResponses(openBillRepo.findAllWithItemsByCompanyId(companyId), companyId);
    }

    @PutMapping("/open-bills/{id}")
    @Transactional
    public OpenBillResponse updateOpenBill(@PathVariable Long id, @RequestBody OpenBillUpdateRequest req, @AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var open = openBillRepo.findById(id).orElseThrow();
        if (!open.getCompany().getId().equals(companyId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        if (req.paymentMethodId() != null) {
            var paymentMethod = paymentMethodRepo.findByIdAndCompanyId(req.paymentMethodId(), companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid payment method"));
            open.setPaymentMethod(paymentMethod);
        }
        var existingSourceSessionIds = open.getItems().stream()
                .map(OpenBillItem::getSourceSessionBookingId)
                .toList();
        open.getItems().clear();
        if (req.items() != null) {
            int idx = 0;
            for (var item : req.items()) {
                var tx = txRepo.findByIdAndCompanyId(item.transactionServiceId(), companyId)
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
                var obi = new OpenBillItem();
                obi.setOpenBill(open);
                obi.setTransactionService(tx);
                obi.setQuantity(item.quantity() != null ? item.quantity() : 1);
                obi.setNetPrice(item.netPrice() != null ? item.netPrice() : tx.getNetPrice());
                Long fallbackSourceSessionId = idx < existingSourceSessionIds.size() ? existingSourceSessionIds.get(idx) : null;
                obi.setSourceSessionBookingId(item.sourceSessionBookingId() != null ? item.sourceSessionBookingId() : fallbackSourceSessionId);
                open.getItems().add(obi);
                idx++;
            }
        }
        openBillRepo.save(open);
        return toOpenBillResponses(openBillRepo.findAllWithItemsByCompanyId(companyId), companyId)
                .stream()
                .filter(o -> o.id().equals(id))
                .findFirst()
                .orElseThrow();
    }

    @DeleteMapping("/open-bills/{id}")
    @Transactional
    public void deleteOpenBill(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var open = openBillRepo.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!open.getCompany().getId().equals(companyId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        var session = open.getSessionBooking();
        openBillRepo.delete(open);
        if (session != null) {
            session.setBilledAt(LocalDate.now());
            sessionBookings.save(session);
        }
    }

    @PostMapping("/open-bills/{id}/split-session")
    @Transactional
    public List<OpenBillResponse> splitOpenBillBySession(
            @PathVariable Long id,
            @RequestBody SplitOpenBillSessionRequest req,
            @AuthenticationPrincipal User me
    ) {
        var companyId = me.getCompany().getId();
        if (req == null || req.sessionId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "sessionId is required.");
        }

        var source = openBillRepo.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!source.getCompany().getId().equals(companyId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }

        Long sessionId = req.sessionId();
        var sourceSession = sessionBookings.findByIdAndCompanyId(sessionId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid sessionId."));

        var matchedItems = source.getItems().stream()
                .filter(item -> Objects.equals(item.getSourceSessionBookingId(), sessionId)
                        || (item.getSourceSessionBookingId() == null
                        && source.getSessionBooking() != null
                        && Objects.equals(source.getSessionBooking().getId(), sessionId)))
                .toList();

        if (matchedItems.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No open-bill lines found for that session.");
        }

        var split = new OpenBill();
        split.setCompany(source.getCompany());
        split.setClient(sourceSession.getClient() != null ? sourceSession.getClient() : source.getClient());
        split.setConsultant(sourceSession.getConsultant() != null ? sourceSession.getConsultant() : source.getConsultant());
        split.setPaymentMethod(source.getPaymentMethod());
        split.setSessionBooking(sourceSession);
        split.setBatchScope(OpenBill.BATCH_SCOPE_NONE);
        split.setBatchTargetClientId(null);
        split.setBatchTargetCompanyId(null);
        split.setManualSplitLocked(true);

        if (split.getClient() == null || split.getConsultant() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Split target requires client and consultant.");
        }

        for (var item : new ArrayList<>(matchedItems)) {
            source.getItems().remove(item);
            var moved = new OpenBillItem();
            moved.setOpenBill(split);
            moved.setTransactionService(item.getTransactionService());
            moved.setQuantity(item.getQuantity());
            moved.setNetPrice(item.getNetPrice());
            moved.setSourceSessionBookingId(sessionId);
            split.getItems().add(moved);
        }

        openBillRepo.save(split);
        if (source.getItems().isEmpty()) {
            openBillRepo.delete(source);
        } else {
            openBillRepo.save(source);
        }

        return toOpenBillResponses(openBillRepo.findAllWithItemsByCompanyId(companyId), companyId);
    }

    @PostMapping("/open-bills/{id}/create-bill")
    @Transactional
    public BillResponse createBillFromOpen(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var open = openBillRepo.findById(id).orElseThrow();
        if (!open.getCompany().getId().equals(companyId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        final Long linkedSessionId = open.getSessionBooking() != null ? open.getSessionBooking().getId() : null;
        final Set<Long> linkedSessionIds = open.getItems().stream()
                .map(OpenBillItem::getSourceSessionBookingId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        if (linkedSessionId != null) {
            linkedSessionIds.add(linkedSessionId);
        }
        var bill = new Bill();
        bill.setCompany(me.getCompany());
        bill.setBillNumber(nextInvoiceNumber(companyId));
        bill.setClient(open.getClient());
        setBillClientSnapshot(bill, open.getClient());
        if (OpenBill.BATCH_SCOPE_COMPANY.equals(open.getBatchScope()) && open.getBatchTargetCompanyId() != null) {
            var recipientCompany = clientCompanies.findByIdAndOwnerCompanyId(open.getBatchTargetCompanyId(), companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid batch recipient company."));
            setBillRecipientCompanySnapshot(bill, recipientCompany);
            bill.setClient(null);
            bill.setClientFirstNameSnapshot("");
            bill.setClientLastNameSnapshot("");
        } else {
            setBillRecipientPersonSnapshot(bill);
        }
        bill.setConsultant(open.getConsultant());
        bill.setPaymentMethod(open.getPaymentMethod() != null ? open.getPaymentMethod() : resolveDefaultPaymentMethod(companyId));
        bill.setIssueDate(LocalDate.now());
        if (open.getItems() == null || open.getItems().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Open bill has no items.");
        }
        BigDecimal totalNet = BigDecimal.ZERO;
        BigDecimal totalGross = BigDecimal.ZERO;
        for (var obi : open.getItems()) {
            var tx = obi.getTransactionService();
            var item = new BillItem();
            item.setBill(bill);
            item.setTransactionService(tx);
            item.setQuantity(obi.getQuantity());
            item.setNetPrice(obi.getNetPrice());
            var grossSingle = obi.getNetPrice().add(obi.getNetPrice().multiply(tx.getTaxRate().multiplier)).setScale(2, RoundingMode.HALF_UP);
            item.setGrossPrice(grossSingle.multiply(BigDecimal.valueOf(obi.getQuantity())));
            totalNet = totalNet.add(obi.getNetPrice().multiply(BigDecimal.valueOf(obi.getQuantity())));
            totalGross = totalGross.add(item.getGrossPrice());
            bill.getItems().add(item);
        }
        bill.setTotalNet(totalNet);
        bill.setTotalGross(totalGross);
        bill.setSourceSessionIdSnapshot(linkedSessionId != null ? linkedSessionId : linkedSessionIds.stream().findFirst().orElse(null));
        bill.setPaymentStatus(resolveInitialPaymentStatus(bill.getPaymentMethod()));
        if (BillPaymentStatus.PAID.equals(bill.getPaymentStatus())) {
            bill.setPaidAt(OffsetDateTime.now());
        }
        var saved = billRepo.saveAndFlush(bill);
        if (shouldFiscalizeOnBillCreate(saved.getPaymentMethod())) {
            saved = fiscalizationService.fiscalizeBill(saved, companyId);
        }
        if (!linkedSessionIds.isEmpty()) {
            var linkedSessions = sessionBookings.findAllByCompanyIdAndIds(companyId, linkedSessionIds);
            for (var session : linkedSessions) {
                session.setBilledAt(java.time.LocalDate.now());
            }
            sessionBookings.saveAll(linkedSessions);
            sessionBookings.flush();
        }
        openBillRepo.delete(open);
        openBillRepo.flush();
        tryArchiveInvoicePdfAfterCreate(saved, companyId);
        return toResponse(saved);
    }

    /**
     * Persists the invoice PDF to S3 when configured. Skips if a key already exists (e.g. fiscal success just uploaded).
     * Covers card/check flows that skip fiscalization on create and failed fiscal runs that would otherwise never archive.
     */
    private void tryArchiveInvoicePdfAfterCreate(Bill bill, Long companyId) {
        try {
            byte[] pdf = billPdfService.generatePdf(bill, companyId);
            invoicePdfS3Service.uploadAndPersistKey(bill, pdf);
        } catch (Exception e) {
            log.warn("Could not archive invoice PDF to S3 for billId={}", bill.getId(), e);
        }
    }

    private void syncOpenBillsFromPastSessions(Long companyId) {
        var past = sessionBookings.findPastSessionsWithTypeAndCompanyId(LocalDateTime.now(), companyId);
        for (SessionBooking sb : past) {
            if (sb.getConsultant() == null) continue;
            var type = sb.getType();
            if (type == null || type.getLinkedServices() == null || type.getLinkedServices().isEmpty()) continue;

            OpenBill open = null;
            var client = sb.getClient();
            var linkedCompany = client == null ? null : client.getBillingCompany();
            final boolean companyBatchEnabled = linkedCompany != null && linkedCompany.isBatchPaymentEnabled();
            final boolean clientBatchEnabled = !companyBatchEnabled && client != null && client.isBatchPaymentEnabled();

            var legacyOpen = openBillRepo.findBySessionBookingIdAndCompanyId(sb.getId(), companyId).orElse(null);
            if (legacyOpen != null && legacyOpen.isManualSplitLocked()) {
                // Explicitly split by user - keep separate and never auto-merge back.
                continue;
            }
            if (legacyOpen != null && !companyBatchEnabled && !clientBatchEnabled) {
                // Legacy single-session open bill is still correct when no batch mode is enabled.
                continue;
            }
            if (legacyOpen == null && openBillRepo.existsItemBySourceSessionBookingIdAndCompanyId(sb.getId(), companyId)) {
                // Already represented in a grouped bill.
                continue;
            }

            if (companyBatchEnabled) {
                open = openBillRepo.findBatchByCompanyTarget(companyId, OpenBill.BATCH_SCOPE_COMPANY, linkedCompany.getId()).orElse(null);
                if (open == null) {
                    open = new OpenBill();
                    open.setCompany(sb.getCompany());
                    open.setClient(client);
                    open.setConsultant(sb.getConsultant());
                    open.setPaymentMethod(resolveDefaultPaymentMethod(companyId));
                    open.setSessionBooking(null);
                    open.setBatchScope(OpenBill.BATCH_SCOPE_COMPANY);
                    open.setBatchTargetCompanyId(linkedCompany.getId());
                    open.setBatchTargetClientId(null);
                }
            } else if (clientBatchEnabled) {
                open = openBillRepo.findBatchByClientTarget(companyId, OpenBill.BATCH_SCOPE_CLIENT, client.getId()).orElse(null);
                if (open == null) {
                    open = new OpenBill();
                    open.setCompany(sb.getCompany());
                    open.setClient(client);
                    open.setConsultant(sb.getConsultant());
                    open.setPaymentMethod(resolveDefaultPaymentMethod(companyId));
                    open.setSessionBooking(null);
                    open.setBatchScope(OpenBill.BATCH_SCOPE_CLIENT);
                    open.setBatchTargetClientId(client.getId());
                    open.setBatchTargetCompanyId(null);
                }
            } else {
                open = new OpenBill();
                open.setCompany(sb.getCompany());
                open.setClient(client);
                open.setConsultant(sb.getConsultant());
                open.setPaymentMethod(resolveDefaultPaymentMethod(companyId));
                open.setSessionBooking(sb);
                open.setBatchScope(OpenBill.BATCH_SCOPE_NONE);
                open.setBatchTargetClientId(null);
                open.setBatchTargetCompanyId(null);
            }

            if (legacyOpen != null) {
                for (var item : new ArrayList<>(legacyOpen.getItems())) {
                    var moved = new OpenBillItem();
                    moved.setOpenBill(open);
                    moved.setTransactionService(item.getTransactionService());
                    moved.setQuantity(item.getQuantity());
                    moved.setNetPrice(item.getNetPrice());
                    moved.setSourceSessionBookingId(sb.getId());
                    open.getItems().add(moved);
                }
                openBillRepo.save(open);
                openBillRepo.delete(legacyOpen);
            } else {
                for (TypeTransactionService link : type.getLinkedServices()) {
                    var tx = link.getTransactionService();
                    var price = link.getPrice() != null ? link.getPrice() : tx.getNetPrice();
                    var obi = new OpenBillItem();
                    obi.setOpenBill(open);
                    obi.setTransactionService(tx);
                    obi.setQuantity(1);
                    obi.setNetPrice(price);
                    obi.setSourceSessionBookingId(sb.getId());
                    open.getItems().add(obi);
                }
                openBillRepo.save(open);
            }
        }
    }

    private List<OpenBillResponse> toOpenBillResponses(List<OpenBill> openBills, Long companyId) {
        Set<Long> sessionIds = openBills.stream()
                .flatMap(open -> {
                    var itemSessionIds = open.getItems().stream()
                            .map(OpenBillItem::getSourceSessionBookingId)
                            .filter(Objects::nonNull);
                    if (open.getSessionBooking() != null) {
                        return java.util.stream.Stream.concat(itemSessionIds, java.util.stream.Stream.of(open.getSessionBooking().getId()));
                    }
                    return itemSessionIds;
                })
                .collect(Collectors.toSet());

        Map<Long, SessionBooking> sessionsById = new HashMap<>();
        if (!sessionIds.isEmpty()) {
            sessionsById = sessionBookings.findAllByCompanyIdAndIds(companyId, sessionIds).stream()
                    .collect(Collectors.toMap(SessionBooking::getId, s -> s));
        }

        final Map<Long, SessionBooking> sessionLookup = sessionsById;
        return openBills.stream()
                .map(open -> toOpenBillResponse(open, sessionLookup))
                .toList();
    }

    private OpenBillResponse toOpenBillResponse(OpenBill o, Map<Long, SessionBooking> sessionsById) {
        var c = o.getClient();
        var clientSummary = c == null
                ? null
                : new ClientSummary(c.getId(), c.getFirstName(), c.getLastName(), c.getEmail(), c.getPhone());
        var u = o.getConsultant();
        var consultantSummary = u == null
                ? null
                : new UserSummary(u.getId(), u.getFirstName(), u.getLastName(), u.getEmail(), u.getRole());
        var paymentMethodSummary = toPaymentMethodSummary(o.getPaymentMethod());
        var items = o.getItems().stream().map(obi -> {
            var tx = obi.getTransactionService();
            var ss = new ServiceSummary(tx.getId(), tx.getCode(), tx.getDescription(), tx.getTaxRate(), tx.getNetPrice());
            return new OpenBillItemResponse(obi.getId(), ss, obi.getQuantity(), obi.getNetPrice(), obi.getSourceSessionBookingId());
        }).toList();

        Map<Long, OpenBillSessionSummary> grouped = new LinkedHashMap<>();
        for (var item : o.getItems()) {
            if (item.getSourceSessionBookingId() == null) continue;
            var session = sessionsById.get(item.getSourceSessionBookingId());
            if (session == null) continue;
            grouped.putIfAbsent(session.getId(), new OpenBillSessionSummary(
                    session.getId(),
                    "#" + session.getId(),
                    formatSessionInfo(session),
                    session.getClient() == null ? "Unknown client" : (session.getClient().getFirstName() + " " + session.getClient().getLastName()).trim(),
                    session.getConsultant() == null ? "Unassigned" : (session.getConsultant().getFirstName() + " " + session.getConsultant().getLastName()).trim()
            ));
        }
        if (grouped.isEmpty() && o.getSessionBooking() != null) {
            var s = o.getSessionBooking();
            grouped.put(s.getId(), new OpenBillSessionSummary(
                    s.getId(),
                    "#" + s.getId(),
                    formatSessionInfo(s),
                    s.getClient() == null ? "Unknown client" : (s.getClient().getFirstName() + " " + s.getClient().getLastName()).trim(),
                    s.getConsultant() == null ? "Unassigned" : (s.getConsultant().getFirstName() + " " + s.getConsultant().getLastName()).trim()
            ));
        }

        for (Long manualNo : parseManualSessionNumbers(o.getManualSessionNumbersCsv())) {
            Long syntheticId = -manualNo;
            grouped.putIfAbsent(syntheticId, new OpenBillSessionSummary(
                    syntheticId,
                    "#M" + manualNo,
                    "Manual open bill",
                    clientSummary == null ? "Unknown client" : (clientSummary.firstName() + " " + clientSummary.lastName()).trim(),
                    consultantSummary == null ? "Unassigned" : (consultantSummary.firstName() + " " + consultantSummary.lastName()).trim()
            ));
        }

        var sessions = grouped.values().stream()
                .sorted(Comparator.comparing(OpenBillSessionSummary::sessionInfo, Comparator.nullsLast(String::compareTo)))
                .toList();

        Long sessionId = sessions.isEmpty() ? null : sessions.getFirst().sessionId();
        String sessionDisplayId = sessions.isEmpty() ? "—" : sessions.getFirst().sessionDisplayId();
        String sessionInfo = sessions.isEmpty() ? "" : sessions.getFirst().sessionInfo();
        return new OpenBillResponse(
                o.getId(),
                sessionId,
                clientSummary,
                consultantSummary,
                paymentMethodSummary,
                items,
                sessionDisplayId,
                sessionInfo,
                o.getBatchScope(),
                o.getBatchTargetClientId(),
                o.getBatchTargetCompanyId(),
                sessions
        );
    }

    private static String formatSessionInfo(SessionBooking session) {
        if (session == null || session.getStartTime() == null) return "";
        return session.getStartTime().toLocalDate() + " " + session.getStartTime().toLocalTime().toString().substring(0, 5);
    }

    private long nextManualSessionNumber(Long companyId) {
        Long maxSessionIdRaw = sessionBookings.findMaxIdByCompanyId(companyId);
        Long maxManualRaw = openBillRepo.findMaxManualSessionNumberByCompanyId(companyId);
        long maxSessionId = maxSessionIdRaw == null ? 0L : maxSessionIdRaw;
        long maxManual = maxManualRaw == null ? 0L : maxManualRaw;
        return Math.max(maxSessionId, maxManual) + 1;
    }

    private static List<Long> parseManualSessionNumbers(String csv) {
        if (csv == null || csv.isBlank()) return List.of();
        return java.util.Arrays.stream(csv.split(","))
                .map(String::trim)
                .filter(s -> !s.isBlank())
                .map(s -> {
                    try {
                        return Long.parseLong(s);
                    } catch (NumberFormatException ignored) {
                        return null;
                    }
                })
                .filter(Objects::nonNull)
                .distinct()
                .toList();
    }

    private static void appendManualSessionNumber(OpenBill open, long manualNo) {
        var all = new ArrayList<>(parseManualSessionNumbers(open.getManualSessionNumbersCsv()));
        if (!all.contains(manualNo)) {
            all.add(manualNo);
        }
        open.setManualSessionNumbersCsv(all.stream().map(String::valueOf).collect(Collectors.joining(",")));
        long prevMax = open.getManualSessionNumberMax() == null ? 0 : open.getManualSessionNumberMax();
        open.setManualSessionNumberMax(Math.max(prevMax, manualNo));
    }

    @PostMapping("/bills")
    @Transactional
    public BillResponse createBill(@RequestBody BillRequest request, @AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var bill = new Bill();
        bill.setCompany(me.getCompany());
        String billNumber = nextInvoiceNumber(companyId);
        bill.setBillNumber(billNumber);
        com.example.app.client.Client client = null;
        if (request.clientId() != null && request.clientId() > 0) {
            client = clients.findByIdAndCompanyId(request.clientId(), companyId).orElseThrow();
        }
        String requestedTarget = request.billingTarget() == null ? "PERSON" : request.billingTarget().trim().toUpperCase();
        if ("PERSON".equals(requestedTarget) && client == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Client is required for individual billing.");
        }
        bill.setClient(client);
        if (client != null) {
            setBillClientSnapshot(bill, client);
        } else {
            bill.setClientFirstNameSnapshot("");
            bill.setClientLastNameSnapshot("");
        }
        var recipientCompany = resolveBillRecipientCompany(request, client, companyId);
        if (recipientCompany == null) {
            setBillRecipientPersonSnapshot(bill);
        } else {
            setBillRecipientCompanySnapshot(bill, recipientCompany);
        }
        bill.setConsultant(request.consultantId() != null ? users.findByIdAndCompanyId(request.consultantId(), companyId).orElseThrow() : me);
        bill.setPaymentMethod(resolvePaymentMethod(request.paymentMethodId(), companyId));
        bill.setIssueDate(LocalDate.now());
        bill.setPaymentStatus(resolveInitialPaymentStatus(bill.getPaymentMethod()));
        if (BillPaymentStatus.PAID.equals(bill.getPaymentStatus())) {
            bill.setPaidAt(OffsetDateTime.now());
        }

        BigDecimal totalNet = BigDecimal.ZERO;
        BigDecimal totalGross = BigDecimal.ZERO;
        for (var req : request.items()) {
            var tx = txRepo.findByIdAndCompanyId(req.transactionServiceId(), companyId).orElseThrow();
            var item = new BillItem();
            item.setBill(bill);
            item.setTransactionService(tx);
            item.setQuantity(req.quantity());
            var net = req.netPrice() == null ? tx.getNetPrice() : req.netPrice();
            item.setNetPrice(net);
            var grossSingle = net.add(net.multiply(tx.getTaxRate().multiplier)).setScale(2, RoundingMode.HALF_UP);
            item.setGrossPrice(grossSingle.multiply(BigDecimal.valueOf(req.quantity())));
            totalNet = totalNet.add(net.multiply(BigDecimal.valueOf(req.quantity())));
            totalGross = totalGross.add(item.getGrossPrice());
            bill.getItems().add(item);
        }
        bill.setTotalNet(totalNet);
        bill.setTotalGross(totalGross);
        // Ensure we map within an open session. Items are cascade-persisted.
        var saved = billRepo.save(bill);
        if (shouldFiscalizeOnBillCreate(saved.getPaymentMethod())) {
            saved = fiscalizationService.fiscalizeBill(saved, companyId);
        }

        // Manual bill creation (outside open-bill flow) should still mark a matching session as billed.
        if (saved.getClient() != null) {
            var unbilled = sessionBookings.findUnbilledByClientAndConsultant(
                    companyId,
                    saved.getClient().getId(),
                    saved.getConsultant().getId()
            );
            if (!unbilled.isEmpty()) {
                var session = unbilled.get(0);
                saved.setSourceSessionIdSnapshot(session.getId());
                session.setBilledAt(LocalDate.now());
                sessionBookings.save(session);
                saved = billRepo.save(saved);
            }
        }

        tryArchiveInvoicePdfAfterCreate(saved, companyId);
        return toResponse(saved);
    }

    @PostMapping("/bills/{id}/checkout-session")
    @Transactional
    public CheckoutSessionResponse createCheckoutSession(@PathVariable Long id, @AuthenticationPrincipal User me) {
        Long companyId = me.getCompany().getId();
        Bill bill = billRepo.findByIdAndCompanyId(id, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (bill.getPaymentMethod() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bill has no payment method.");
        }
        if (isBankTransferPayment(bill.getPaymentMethod())) {
            ensureOwnBankTransferSettings(companyId);
            if (BillPaymentStatus.CANCELLED.equals(bill.getPaymentStatus())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Cannot send folio for a cancelled bill.");
            }
            if (bill.getBankTransferReference() == null || bill.getBankTransferReference().isBlank()) {
                bill.setBankTransferReference(BankStatementReconciliationService.bankReferenceForBill(bill));
            }
            if (!BillPaymentStatus.PAID.equals(bill.getPaymentStatus())) {
                bill.setPaymentStatus(BillPaymentStatus.PAYMENT_PENDING);
            }
            bill = billRepo.save(bill);
            var req = buildFolioPdfRequest(bill, companyId);
            var layout = loadFolioLayout(companyId);
            byte[] folioPdf = folioPdfService.generate(req, layout, loadLogoBytes(companyId), loadSignatureBytes(companyId));
            invoicePdfS3Service.uploadFolioForBill(bill, folioPdf);
            billingEmailService.sendBankTransferFolio(bill, folioPdf);
            return new CheckoutSessionResponse(bill.getId(), bill.getBillNumber(), bill.getPaymentStatus(), null, null, null);
        }
        if (!bill.getPaymentMethod().isStripeEnabled()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Stripe payment link is available only for card payment methods with Stripe enabled.");
        }
        StripeCheckoutSessionResult checkout = stripeBillingService.createCheckoutSessionForBill(bill);
        billingEmailService.sendCheckoutLink(bill, checkout.url());
        return new CheckoutSessionResponse(bill.getId(), bill.getBillNumber(), bill.getPaymentStatus(), bill.getCheckoutSessionId(), checkout.url(), bill.getCheckoutSessionExpiresAt());
    }

    @PostMapping(value = "/bank-reconciliation/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Transactional
    public BankStatementImportResponse importBankStatement(@RequestParam("file") MultipartFile file,
                                                           @AuthenticationPrincipal User me) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Select a bank statement file first.");
        }
        var result = bankStatementReconciliationService.importStatement(me.getCompany().getId(), file);
        return new BankStatementImportResponse(result.processedRows(), result.matchedCount(), result.unmatchedCount(), result.matchedBills());
    }

    @PostMapping("/bills/{id}/mark-paid")
    @Transactional
    public BillResponse markBillPaid(@PathVariable Long id, @AuthenticationPrincipal User me) {
        Long companyId = me.getCompany().getId();
        Bill bill = billRepo.findByIdAndCompanyId(id, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (BillPaymentStatus.CANCELLED.equals(bill.getPaymentStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cancelled bill cannot be marked as paid.");
        }
        bill.setPaymentStatus(BillPaymentStatus.PAID);
        if (bill.getPaidAt() == null) {
            bill.setPaidAt(OffsetDateTime.now());
        }
        bill = billRepo.save(bill);
        return toResponse(bill);
    }

    @GetMapping(value = "/bills/{id}/pdf", produces = MediaType.APPLICATION_PDF_VALUE)
    @Transactional(readOnly = true)
    public ResponseEntity<byte[]> billPdf(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var bill = ensureSnapshotBackfilled(billRepo.findByIdAndCompanyId(id, companyId).orElseThrow());
        byte[] pdf = invoicePdfS3Service.downloadIfPresent(bill);
        if (pdf == null) {
            pdf = billPdfService.generatePdf(bill, companyId);
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + bill.getBillNumber() + ".pdf\"")
                .contentType(MediaType.APPLICATION_PDF)
                .body(pdf);
    }

    @GetMapping(value = "/bills/{id}/folio-pdf", produces = MediaType.APPLICATION_PDF_VALUE)
    @Transactional(readOnly = true)
    public ResponseEntity<byte[]> billFolioPdf(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var bill = ensureSnapshotBackfilled(billRepo.findByIdAndCompanyId(id, companyId).orElseThrow());
        var req = buildFolioPdfRequest(bill, companyId);
        var layout = loadFolioLayout(companyId);
        byte[] pdf = folioPdfService.generate(req, layout, loadLogoBytes(companyId), loadSignatureBytes(companyId));
        invoicePdfS3Service.uploadFolioForBill(bill, pdf);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "inline; filename=\"folio-" + bill.getBillNumber() + ".pdf\"")
                .contentType(MediaType.APPLICATION_PDF)
                .body(pdf);
    }

    private FolioPdfRequest buildFolioPdfRequest(Bill bill, Long companyId) {
        var req = new FolioPdfRequest();
        req.setFolioNumber(bill.getBillNumber());
        req.setFolioDate(bill.getIssueDate() != null ? bill.getIssueDate().toString() : "");

        // Company fields (address, postal, city are now separate)
        req.setCompanyName(settingValue(companyId, SettingKey.COMPANY_NAME));
        req.setCompanyAddress(settingValue(companyId, SettingKey.COMPANY_ADDRESS));
        req.setCompanyPostalCode(settingValue(companyId, SettingKey.COMPANY_POSTAL_CODE));
        req.setCompanyCity(settingValue(companyId, SettingKey.COMPANY_CITY));
        req.setCompanyTaxId(settingValue(companyId, SettingKey.COMPANY_VAT_ID));
        req.setIban(settingValue(companyId, SettingKey.COMPANY_IBAN));

        // Date of service: most recent session date linked to this bill, falling back to issue date
        LocalDate serviceDate = null;
        Long srcSessionId = bill.getSourceSessionIdSnapshot();
        if (srcSessionId != null) {
            serviceDate = sessionBookings.findById(srcSessionId)
                    .map(sb -> sb.getStartTime() != null ? sb.getStartTime().toLocalDate() : null)
                    .orElse(null);
        }
        if (serviceDate == null) {
            serviceDate = bill.getIssueDate();
        }
        req.setDateOfService(serviceDate != null ? serviceDate.toString() : "");

        // Due date: issue date + PAYMENT_DEADLINE_DAYS
        if (bill.getIssueDate() != null) {
            req.setDueDate(bill.getIssueDate().plusDays(resolvePaymentDeadlineDays(companyId)).toString());
        }

        // Recipient
        boolean companyRecipient = "COMPANY".equalsIgnoreCase(bill.getRecipientTypeSnapshot());
        if (companyRecipient) {
            req.setRecipientName(bill.getRecipientCompanyNameSnapshot() != null ? bill.getRecipientCompanyNameSnapshot() : "");
            req.setRecipientAddress(bill.getRecipientCompanyAddressSnapshot() != null ? bill.getRecipientCompanyAddressSnapshot() : "");
            req.setRecipientPostalCode(bill.getRecipientCompanyPostalCodeSnapshot() != null ? bill.getRecipientCompanyPostalCodeSnapshot() : "");
            req.setRecipientCity(bill.getRecipientCompanyCitySnapshot() != null ? bill.getRecipientCompanyCitySnapshot() : "");
            req.setRecipientVatId(bill.getRecipientCompanyVatIdSnapshot() != null ? bill.getRecipientCompanyVatIdSnapshot() : "");
        } else {
            String first = bill.getClientFirstNameSnapshot() != null ? bill.getClientFirstNameSnapshot() : "";
            String last = bill.getClientLastNameSnapshot() != null ? bill.getClientLastNameSnapshot() : "";
            req.setRecipientName((first + " " + last).trim());
        }

        req.setIssuedBy(bill.getConsultant().getFirstName() + " " + bill.getConsultant().getLastName());
        if (bill.getPaymentMethod() != null) {
            req.setPaymentMethod(bill.getPaymentMethod().getName());
        }
        if (isBankTransferPayment(bill.getPaymentMethod())) {
            ensureOwnBankTransferSettings(companyId);
            String companyIban = settingValue(companyId, SettingKey.COMPANY_IBAN);
            String companyBic = settingValue(companyId, SettingKey.COMPANY_BIC);
            String recipientNameForQr = firstNonBlank(req.getCompanyName(), bill.getRecipientCompanyNameSnapshot());
            String recipientStreetForQr = firstNonBlank(req.getCompanyAddress(), settingValue(companyId, SettingKey.COMPANY_ADDRESS));
            String recipientCityForQr = joinPostalAndCity(req.getCompanyPostalCode(), req.getCompanyCity());
            String payerName = companyRecipient
                    ? req.getRecipientName()
                    : (req.getRecipientName() == null || req.getRecipientName().isBlank() ? "Placnik" : req.getRecipientName());
            String payerStreet = companyRecipient ? firstNonBlank(req.getRecipientAddress(), "") : "";
            String payerCity = companyRecipient ? joinPostalAndCity(req.getRecipientPostalCode(), req.getRecipientCity()) : "";
            String reference = firstNonBlank(bill.getBankTransferReference(), BankStatementReconciliationService.bankReferenceForBill(bill));
            String purposeCode = firstNonBlank(settingValue(companyId, SettingKey.BANK_QR_PURPOSE_CODE), "OTHR");
            String purpose = buildUpnPurpose(companyId, bill);
            req.setIban(companyIban);
            req.setNotes(buildPaymentNotes(req.getNotes(), reference, companyBic));
            req.setPaymentQrPayload(upnQrPayloadBuilder.build(new UpnQrPayloadBuilder.UpnQrRequest(
                    payerName,
                    payerStreet,
                    payerCity,
                    bill.getTotalGross(),
                    purposeCode,
                    purpose,
                    null,
                    companyIban,
                    reference,
                    recipientNameForQr,
                    recipientStreetForQr,
                    recipientCityForQr
            )));
        } else if (bill.getStripeHostedInvoiceUrl() != null && !bill.getStripeHostedInvoiceUrl().isBlank()) {
            req.setPaymentQrPayload(bill.getStripeHostedInvoiceUrl());
        }

        String fallbackDate = serviceDate != null ? serviceDate.toString() : "";

        var serviceLines = new ArrayList<FolioPdfRequest.ServiceLine>();
        for (var item : bill.getItems()) {
            var ts = item.getTransactionService();
            String desc = ts.getCode() + " - " + ts.getDescription();

            // Per-unit gross: item.grossPrice is total (qty * unit gross), so divide back
            BigDecimal totalGrossLine = item.getGrossPrice() != null ? item.getGrossPrice() : BigDecimal.ZERO;
            int qty = item.getQuantity();
            BigDecimal perUnitGross = qty > 0
                    ? totalGrossLine.divide(BigDecimal.valueOf(qty), 2, RoundingMode.HALF_UP)
                    : totalGrossLine;

            // Tax info from the transaction service's tax rate
            String taxPct = ts.getTaxRate() != null ? ts.getTaxRate().label : "0%";
            BigDecimal netTotal = (item.getNetPrice() != null ? item.getNetPrice() : BigDecimal.ZERO)
                    .multiply(BigDecimal.valueOf(qty));
            BigDecimal taxAmt = totalGrossLine.subtract(netTotal).setScale(2, RoundingMode.HALF_UP);

            var sl = new FolioPdfRequest.ServiceLine(desc, qty, item.getNetPrice(), perUnitGross);
            sl.setDate(fallbackDate);
            sl.setTaxPercent(taxPct);
            sl.setTaxAmount(taxAmt);
            sl.setTotalPrice(totalGrossLine);
            serviceLines.add(sl);
        }
        req.setServices(serviceLines);
        return req;
    }

    private int resolvePaymentDeadlineDays(Long companyId) {
        String deadlineDays = settingValue(companyId, SettingKey.PAYMENT_DEADLINE_DAYS);
        try {
            return Integer.parseInt(deadlineDays);
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }

    private String buildUpnPurpose(Long companyId, Bill bill) {
        String base = firstNonBlank(settingValue(companyId, SettingKey.BANK_QR_PURPOSE_TEXT), "PLACILO FOLIA");
        String suffix = firstNonBlank(bill.getBillNumber(), bill.getStripeInvoiceNumber());
        String value = (base + " " + suffix).trim();
        return value.length() <= 42 ? value : value.substring(0, 42);
    }

    private String buildPaymentNotes(String existing, String reference, String bic) {
        List<String> parts = new ArrayList<>();
        if (existing != null && !existing.isBlank()) parts.add(existing.trim());
        if (reference != null && !reference.isBlank()) parts.add("Reference: " + reference);
        if (bic != null && !bic.isBlank()) parts.add("BIC/SWIFT: " + bic);
        return String.join(" | ", parts);
    }

    private String joinPostalAndCity(String postalCode, String city) {
        String pc = postalCode == null ? "" : postalCode.trim();
        String c = city == null ? "" : city.trim();
        if (pc.isBlank()) return c;
        if (c.isBlank()) return pc;
        return pc + " " + c;
    }

    private String formatUpnRecipientCity(String postalCode, String city, String countryCode, String iban) {
        String base = joinPostalAndCity(postalCode, city);
        String normalizedCountry = companyCountryCodeFromIbanOrStripe(iban, countryCode);
        if (normalizedCountry.isBlank() || "SI".equalsIgnoreCase(normalizedCountry)) {
            return base;
        }
        String prefix = normalizedCountry.toUpperCase();
        if (base == null || base.isBlank()) {
            return prefix;
        }
        if (base.regionMatches(true, 0, prefix + "-", 0, prefix.length() + 1)) {
            return base;
        }
        return prefix + "-" + base;
    }

    private String companyCountryCodeFromIbanOrStripe(String iban, String countryCode) {
        String cc = countryCode == null ? "" : countryCode.trim().toUpperCase();
        if (cc.length() == 2) return cc;
        String normalizedIban = iban == null ? "" : iban.replace(" ", "").trim().toUpperCase();
        if (normalizedIban.length() >= 2) {
            String derived = normalizedIban.substring(0, 2);
            if (derived.chars().allMatch(Character::isLetter)) {
                return derived;
            }
        }
        return "";
    }

    private String firstNonBlank(String... values) {
        if (values == null) return "";
        for (String value : values) {
            if (value != null && !value.isBlank()) return value.trim();
        }
        return "";
    }

    private void ensureOwnBankTransferSettings(Long companyId) {
        List<String> missing = new ArrayList<>();
        if (settingValue(companyId, SettingKey.COMPANY_NAME).isBlank()) missing.add("company name");
        if (settingValue(companyId, SettingKey.COMPANY_ADDRESS).isBlank()) missing.add("company address");
        if (settingValue(companyId, SettingKey.COMPANY_POSTAL_CODE).isBlank()) missing.add("company postal code");
        if (settingValue(companyId, SettingKey.COMPANY_CITY).isBlank()) missing.add("company city");
        if (settingValue(companyId, SettingKey.COMPANY_IBAN).isBlank()) missing.add("company IBAN");
        if (!missing.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Bank transfer folio requires these Configuration fields: " + String.join(", ", missing));
        }
    }

    private String settingValue(Long companyId, SettingKey key) {
        return settings.findByCompanyIdAndKey(companyId, key)
                .map(s -> s.getValue() == null ? "" : s.getValue())
                .orElse("");
    }

    private static BillResponse toResponse(Bill bill) {
        var c = bill.getClient();
        var clientSummary = c == null
                ? null
                : new ClientSummary(c.getId(), snapshotFirstName(bill), snapshotLastName(bill), c.getEmail(), c.getPhone());
        var recipientCompanySummary = toRecipientCompanySummary(bill);

        var u = bill.getConsultant();
        var consultantSummary = new UserSummary(u.getId(), u.getFirstName(), u.getLastName(), u.getEmail(), u.getRole());
        var paymentMethodSummary = toPaymentMethodSummary(bill.getPaymentMethod());

        var items = bill.getItems().stream().map(item -> {
            var tx = item.getTransactionService();
            var serviceSummary = new ServiceSummary(tx.getId(), tx.getCode(), tx.getDescription(), tx.getTaxRate(), tx.getNetPrice());
            return new BillItemResponse(item.getId(), serviceSummary, item.getQuantity(), item.getNetPrice(), item.getGrossPrice());
        }).toList();

        return new BillResponse(
                bill.getId(),
                bill.getBillNumber(),
                bill.getSourceSessionIdSnapshot(),
                clientSummary,
                recipientCompanySummary,
                bill.getRecipientTypeSnapshot() == null || bill.getRecipientTypeSnapshot().isBlank()
                        ? "PERSON"
                        : bill.getRecipientTypeSnapshot(),
                consultantSummary,
                paymentMethodSummary,
                bill.getIssueDate(),
                bill.getTotalNet(),
                bill.getTotalGross(),
                normalizePaymentStatus(bill.getPaymentStatus()),
                bill.getCheckoutSessionId(),
                bill.getPaymentIntentId(),
                bill.getStripeInvoiceId(),
                bill.getStripeHostedInvoiceUrl(),
                bill.getPaidAt(),
                normalizeFiscalStatus(bill.getFiscalStatus()),
                bill.getFiscalZoi(),
                bill.getFiscalEor(),
                bill.getFiscalQr(),
                bill.getFiscalMessageId(),
                bill.getFiscalLastError(),
                bill.getFiscalAttemptCount(),
                items
        );
    }

    private static String normalizeFiscalStatus(BillFiscalStatus status) {
        if (status == null || status == BillFiscalStatus.PENDING) {
            return "NOT_SENT";
        }
        return status.name();
    }


    private int paymentDeadlineDays(Long companyId) {
        try {
            String raw = settingValue(companyId, SettingKey.PAYMENT_DEADLINE_DAYS);
            int parsed = Integer.parseInt(raw == null || raw.isBlank() ? "15" : raw.trim());
            return Math.max(parsed, 0);
        } catch (Exception ignored) {
            return 15;
        }
    }

    private static String normalizePaymentStatus(String status) {
        if (!BillPaymentStatus.isKnown(status)) return BillPaymentStatus.OPEN;
        return status;
    }

    private String nextInvoiceNumber(Long companyId) {
        var setting = settings.findByCompanyIdAndKey(companyId, SettingKey.INVOICE_COUNTER)
                .orElseThrow(() -> new IllegalStateException("Missing setting: INVOICE_COUNTER"));
        String current = setting.getValue();
        setting.setValue(incrementAlphaNumeric(current));
        settings.save(setting);
        return current;
    }

    static String incrementAlphaNumeric(String value) {
        if (value == null || value.isBlank()) return "1";
        String v = value.trim();
        var m = java.util.regex.Pattern.compile("^(.*?)(\\d+)$").matcher(v);
        if (m.matches()) {
            String prefix = m.group(1);
            String digits = m.group(2);
            long n = Long.parseLong(digits);
            String next = String.valueOf(n + 1);
            if (next.length() < digits.length()) {
                next = "0".repeat(digits.length() - next.length()) + next;
            }
            return prefix + next;
        }
        return v + "1";
    }

    private static void setBillClientSnapshot(Bill bill, com.example.app.client.Client client) {
        if (client == null) {
            bill.setClientFirstNameSnapshot("");
            bill.setClientLastNameSnapshot("");
            return;
        }
        bill.setClientFirstNameSnapshot(client.getFirstName() == null ? "" : client.getFirstName());
        bill.setClientLastNameSnapshot(client.getLastName() == null ? "" : client.getLastName());
    }

    private ClientCompany resolveBillRecipientCompany(BillRequest request, com.example.app.client.Client client, Long companyId) {
        String requestedTarget = request.billingTarget() == null ? "" : request.billingTarget().trim().toUpperCase();
        boolean companyRequested = "COMPANY".equals(requestedTarget);
        if (!companyRequested) {
            return null;
        }
        if (request.recipientCompanyId() != null) {
            return clientCompanies.findByIdAndOwnerCompanyId(request.recipientCompanyId(), companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid recipient company."));
        }
        if (client != null && client.getBillingCompany() != null) {
            return client.getBillingCompany();
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Recipient company is required for company billing.");
    }

    private static void setBillRecipientPersonSnapshot(Bill bill) {
        bill.setRecipientTypeSnapshot("PERSON");
        bill.setRecipientCompanyIdSnapshot(null);
        bill.setRecipientCompanyNameSnapshot(null);
        bill.setRecipientCompanyAddressSnapshot(null);
        bill.setRecipientCompanyPostalCodeSnapshot(null);
        bill.setRecipientCompanyCitySnapshot(null);
        bill.setRecipientCompanyVatIdSnapshot(null);
        bill.setRecipientCompanyIbanSnapshot(null);
        bill.setRecipientCompanyEmailSnapshot(null);
        bill.setRecipientCompanyTelephoneSnapshot(null);
    }

    private static void setBillRecipientCompanySnapshot(Bill bill, ClientCompany company) {
        bill.setRecipientTypeSnapshot("COMPANY");
        bill.setRecipientCompanyIdSnapshot(company.getId());
        bill.setRecipientCompanyNameSnapshot(company.getName());
        bill.setRecipientCompanyAddressSnapshot(company.getAddress());
        bill.setRecipientCompanyPostalCodeSnapshot(company.getPostalCode());
        bill.setRecipientCompanyCitySnapshot(company.getCity());
        bill.setRecipientCompanyVatIdSnapshot(company.getVatId());
        bill.setRecipientCompanyIbanSnapshot(company.getIban());
        bill.setRecipientCompanyEmailSnapshot(company.getEmail());
        bill.setRecipientCompanyTelephoneSnapshot(company.getTelephone());
    }

    private Bill ensureSnapshotBackfilled(Bill bill) {
        if ((bill.getClientFirstNameSnapshot() == null || bill.getClientFirstNameSnapshot().isBlank())
                && bill.getClient() != null && bill.getClient().getFirstName() != null) {
            bill.setClientFirstNameSnapshot(bill.getClient().getFirstName());
        }
        if ((bill.getClientLastNameSnapshot() == null || bill.getClientLastNameSnapshot().isBlank())
                && bill.getClient() != null && bill.getClient().getLastName() != null) {
            bill.setClientLastNameSnapshot(bill.getClient().getLastName());
        }
        if ((bill.getClientFirstNameSnapshot() == null || bill.getClientFirstNameSnapshot().isBlank())
                || (bill.getClientLastNameSnapshot() == null || bill.getClientLastNameSnapshot().isBlank())) {
            return bill;
        }
        if (bill.getRecipientTypeSnapshot() == null || bill.getRecipientTypeSnapshot().isBlank()) {
            bill.setRecipientTypeSnapshot("PERSON");
        }
        if (bill.getId() != null && (bill.getUpdatedAt() != null)) {
            // persisted update for old rows missing snapshots
            return billRepo.save(bill);
        }
        return bill;
    }

    private static String snapshotFirstName(Bill bill) {
        if (bill.getClientFirstNameSnapshot() != null && !bill.getClientFirstNameSnapshot().isBlank()) {
            return bill.getClientFirstNameSnapshot();
        }
        return bill.getClient() != null ? bill.getClient().getFirstName() : "";
    }

    private static String snapshotLastName(Bill bill) {
        if (bill.getClientLastNameSnapshot() != null && !bill.getClientLastNameSnapshot().isBlank()) {
            return bill.getClientLastNameSnapshot();
        }
        return bill.getClient() != null ? bill.getClient().getLastName() : "";
    }

    private static boolean isCompanyRecipient(Bill bill) {
        return "COMPANY".equalsIgnoreCase(bill.getRecipientTypeSnapshot());
    }

    private static RecipientCompanySummary toRecipientCompanySummary(Bill bill) {
        if (!isCompanyRecipient(bill)) {
            return null;
        }
        return new RecipientCompanySummary(
                bill.getRecipientCompanyIdSnapshot(),
                snapshotRecipientCompanyName(bill),
                snapshotRecipientCompanyAddress(bill),
                snapshotRecipientCompanyPostalCode(bill),
                snapshotRecipientCompanyCity(bill),
                snapshotRecipientCompanyVatId(bill),
                snapshotRecipientCompanyIban(bill),
                snapshotRecipientCompanyEmail(bill),
                snapshotRecipientCompanyTelephone(bill)
        );
    }

    private static String snapshotRecipientCompanyName(Bill bill) { return emptySafe(bill.getRecipientCompanyNameSnapshot()); }
    private static String snapshotRecipientCompanyAddress(Bill bill) { return emptySafe(bill.getRecipientCompanyAddressSnapshot()); }
    private static String snapshotRecipientCompanyPostalCode(Bill bill) { return emptySafe(bill.getRecipientCompanyPostalCodeSnapshot()); }
    private static String snapshotRecipientCompanyCity(Bill bill) { return emptySafe(bill.getRecipientCompanyCitySnapshot()); }
    private static String snapshotRecipientCompanyVatId(Bill bill) { return emptySafe(bill.getRecipientCompanyVatIdSnapshot()); }
    private static String snapshotRecipientCompanyIban(Bill bill) { return emptySafe(bill.getRecipientCompanyIbanSnapshot()); }
    private static String snapshotRecipientCompanyEmail(Bill bill) { return emptySafe(bill.getRecipientCompanyEmailSnapshot()); }
    private static String snapshotRecipientCompanyTelephone(Bill bill) { return emptySafe(bill.getRecipientCompanyTelephoneSnapshot()); }

    private static String emptySafe(String value) {
        return value == null ? "" : value;
    }

    private PaymentMethod resolvePaymentMethod(Long paymentMethodId, Long companyId) {
        if (paymentMethodId != null) {
            return paymentMethodRepo.findByIdAndCompanyId(paymentMethodId, companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid payment method"));
        }
        return resolveDefaultPaymentMethod(companyId);
    }

    private PaymentMethod resolveDefaultPaymentMethod(Long companyId) {
        var all = paymentMethodRepo.findAllByCompanyIdOrderByNameAsc(companyId);
        if (all.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No payment methods configured. Add one in Configuration > Billing.");
        }
        return all.getFirst();
    }

    private static PaymentMethodSummary toPaymentMethodSummary(PaymentMethod paymentMethod) {
        if (paymentMethod == null) return null;
        return new PaymentMethodSummary(
                paymentMethod.getId(),
                paymentMethod.getName(),
                paymentMethod.getPaymentType(),
                paymentMethod.isFiscalized(),
                paymentMethod.isStripeEnabled()
        );
    }

    /* ── Folio PDF generation (standalone, not tied to a persisted bill) ── */

    @PostMapping(value = "/folio/pdf", produces = MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<byte[]> folioPdf(@RequestBody FolioPdfRequest req,
                                           @AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var layout = loadFolioLayout(companyId);
        byte[] pdf = folioPdfService.generate(req, layout, loadLogoBytes(companyId), loadSignatureBytes(companyId));
        String filename = req.getFolioNumber() != null ? req.getFolioNumber() : "folio";
        invoicePdfS3Service.uploadFolioForDocument(companyId, parseIssueDate(req.getFolioDate()), filename, pdf);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "inline; filename=\"folio-" + filename + ".pdf\"")
                .contentType(MediaType.APPLICATION_PDF)
                .body(pdf);
    }

    private LocalDate parseIssueDate(String value) {
        if (value == null || value.isBlank()) {
            return LocalDate.now();
        }
        try {
            return LocalDate.parse(value);
        } catch (Exception ex) {
            return LocalDate.now();
        }
    }

    /* ── Folio layout config management ── */

    private static final ObjectMapper LAYOUT_MAPPER = new ObjectMapper();

    @GetMapping("/folio-layout")
    public ResponseEntity<String> getFolioLayout(@AuthenticationPrincipal User me) {
        var json = settingValue(me.getCompany().getId(), SettingKey.FOLIO_TEMPLATE_LAYOUT_JSON);
        if (!json.isBlank()) {
            var trimmed = json.strip();
            boolean looksValid = trimmed.startsWith("{") && trimmed.contains("\"fields\"");
            if (looksValid) {
                return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(json);
            }
        }
        try {
            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(LAYOUT_MAPPER.writeValueAsString(FolioLayoutConfig.defaultLayout()));
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/folio-layout")
    public ResponseEntity<String> saveFolioLayout(@RequestBody String body, @AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var s = settings.findByCompanyIdAndKey(companyId, SettingKey.FOLIO_TEMPLATE_LAYOUT_JSON).orElseGet(() -> {
            var ns = new AppSetting();
            ns.setCompany(me.getCompany());
            ns.setKey(SettingKey.FOLIO_TEMPLATE_LAYOUT_JSON.name());
            return ns;
        });
        s.setValue(body);
        settings.save(s);
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(body);
    }

    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/folio-layout")
    public ResponseEntity<String> resetFolioLayout(@AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        settings.findByCompanyIdAndKey(companyId, SettingKey.FOLIO_TEMPLATE_LAYOUT_JSON)
                .ifPresent(settings::delete);
        try {
            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(LAYOUT_MAPPER.writeValueAsString(FolioLayoutConfig.defaultLayout()));
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    /* ── Folio logo management ── */

    private static final long LOGO_MAX_BYTES = 500_000;
    private static final Set<String> LOGO_MIME_TYPES = Set.of("image/png", "image/jpeg", "image/jpg");

    @GetMapping("/folio-logo")
    public ResponseEntity<String> getFolioLogo(@AuthenticationPrincipal User me) {
        var dataUri = settingValue(me.getCompany().getId(), SettingKey.COMPANY_LOGO_BASE64);
        if (dataUri.isBlank()) {
            return ResponseEntity.noContent().build();
        }
        return ResponseEntity.ok().contentType(MediaType.TEXT_PLAIN).body(dataUri);
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/folio-logo")
    public ResponseEntity<String> uploadFolioLogo(@RequestParam("file") MultipartFile file,
                                                   @AuthenticationPrincipal User me) {
        if (file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "File is empty");
        }
        var contentType = file.getContentType();
        if (contentType == null || !LOGO_MIME_TYPES.contains(contentType.toLowerCase())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only PNG and JPEG images are accepted");
        }
        if (file.getSize() > LOGO_MAX_BYTES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Logo must be smaller than 500 KB");
        }
        try {
            byte[] bytes = file.getBytes();
            String base64 = java.util.Base64.getEncoder().encodeToString(bytes);
            String dataUri = "data:" + contentType + ";base64," + base64;

            var companyId = me.getCompany().getId();
            var s = settings.findByCompanyIdAndKey(companyId, SettingKey.COMPANY_LOGO_BASE64).orElseGet(() -> {
                var ns = new AppSetting();
                ns.setCompany(me.getCompany());
                ns.setKey(SettingKey.COMPANY_LOGO_BASE64.name());
                return ns;
            });
            s.setValue(dataUri);
            settings.save(s);
            return ResponseEntity.ok().contentType(MediaType.TEXT_PLAIN).body(dataUri);
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to process upload");
        }
    }

    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/folio-logo")
    public ResponseEntity<Void> deleteFolioLogo(@AuthenticationPrincipal User me) {
        settings.findByCompanyIdAndKey(me.getCompany().getId(), SettingKey.COMPANY_LOGO_BASE64)
                .ifPresent(settings::delete);
        return ResponseEntity.noContent().build();
    }

    private byte[] loadLogoBytes(Long companyId) {
        var dataUri = settingValue(companyId, SettingKey.COMPANY_LOGO_BASE64);
        if (dataUri.isBlank()) return null;
        int commaIdx = dataUri.indexOf(',');
        if (commaIdx < 0) return null;
        try {
            return java.util.Base64.getDecoder().decode(dataUri.substring(commaIdx + 1));
        } catch (IllegalArgumentException e) {
            log.warn("Invalid base64 logo for company, ignoring", e);
            return null;
        }
    }

    private byte[] loadSignatureBytes(Long companyId) {
        var dataUri = settingValue(companyId, SettingKey.FOLIO_SIGNATURE_BASE64);
        if (dataUri.isBlank()) return null;
        int commaIdx = dataUri.indexOf(',');
        if (commaIdx < 0) return null;
        try {
            return java.util.Base64.getDecoder().decode(dataUri.substring(commaIdx + 1));
        } catch (IllegalArgumentException e) {
            log.warn("Invalid base64 signature for company, ignoring", e);
            return null;
        }
    }

    private FolioLayoutConfig loadFolioLayout(Long companyId) {
        var json = settingValue(companyId, SettingKey.FOLIO_TEMPLATE_LAYOUT_JSON);
        var trimmed = json.strip();
        if (json.isBlank() || !trimmed.startsWith("{") || !trimmed.contains("\"fields\"")) {
            return FolioLayoutConfig.defaultLayout();
        }
        try {
            return LAYOUT_MAPPER.readValue(json, FolioLayoutConfig.class);
        } catch (Exception e) {
            log.warn("Invalid folio layout JSON for company={}, using defaults", companyId, e);
            return FolioLayoutConfig.defaultLayout();
        }
    }

    /* ── Folio signature management ── */

    @GetMapping("/folio-signature")
    public ResponseEntity<String> getFolioSignature(@AuthenticationPrincipal User me) {
        var dataUri = settingValue(me.getCompany().getId(), SettingKey.FOLIO_SIGNATURE_BASE64);
        if (dataUri.isBlank()) {
            return ResponseEntity.noContent().build();
        }
        return ResponseEntity.ok().contentType(MediaType.TEXT_PLAIN).body(dataUri);
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/folio-signature")
    public ResponseEntity<String> uploadFolioSignature(@RequestParam("file") MultipartFile file,
                                                       @AuthenticationPrincipal User me) {
        if (file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "File is empty");
        }
        var contentType = file.getContentType();
        if (contentType == null || !LOGO_MIME_TYPES.contains(contentType.toLowerCase())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only PNG and JPEG images are accepted");
        }
        if (file.getSize() > LOGO_MAX_BYTES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Signature must be smaller than 500 KB");
        }
        try {
            byte[] bytes = file.getBytes();
            String base64 = java.util.Base64.getEncoder().encodeToString(bytes);
            String dataUri = "data:" + contentType + ";base64," + base64;

            var companyId = me.getCompany().getId();
            var s = settings.findByCompanyIdAndKey(companyId, SettingKey.FOLIO_SIGNATURE_BASE64).orElseGet(() -> {
                var ns = new AppSetting();
                ns.setCompany(me.getCompany());
                ns.setKey(SettingKey.FOLIO_SIGNATURE_BASE64.name());
                return ns;
            });
            s.setValue(dataUri);
            settings.save(s);
            return ResponseEntity.ok().contentType(MediaType.TEXT_PLAIN).body(dataUri);
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to process upload");
        }
    }

    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/folio-signature")
    public ResponseEntity<Void> deleteFolioSignature(@AuthenticationPrincipal User me) {
        settings.findByCompanyIdAndKey(me.getCompany().getId(), SettingKey.FOLIO_SIGNATURE_BASE64)
                .ifPresent(settings::delete);
        return ResponseEntity.noContent().build();
    }

    private static void applyPaymentMethodFlags(PaymentMethod pm, PaymentMethodRequest req) {
        pm.setFiscalized(req.fiscalized() != null ? req.fiscalized() : defaultFiscalized(req.paymentType()));
        boolean stripeEnabled = req.paymentType() == PaymentType.CARD
                && (req.stripeEnabled() != null ? req.stripeEnabled() : defaultStripeEnabled(req.paymentType()));
        pm.setStripeEnabled(stripeEnabled);
    }

    private static boolean defaultFiscalized(PaymentType paymentType) {
        return paymentType != PaymentType.CARD;
    }

    private static boolean defaultStripeEnabled(PaymentType paymentType) {
        return paymentType == PaymentType.CARD;
    }

    private static boolean shouldFiscalizeOnBillCreate(PaymentMethod paymentMethod) {
        return paymentMethod != null && paymentMethod.isFiscalized();
    }

    private static String resolveInitialPaymentStatus(PaymentMethod paymentMethod) {
        if (isBankTransferPayment(paymentMethod)) return BillPaymentStatus.PAYMENT_PENDING;
        if (paymentMethod != null && paymentMethod.isStripeEnabled()) return BillPaymentStatus.OPEN;
        return BillPaymentStatus.PAID;
    }

    private static boolean isBankTransferPayment(PaymentMethod paymentMethod) {
        return paymentMethod != null && paymentMethod.getPaymentType() == PaymentType.BANK_TRANSFER;
    }
}
