package com.example.app.billing;

import com.example.app.company.ClientCompany;
import com.example.app.company.ClientCompanyRepository;
import com.example.app.client.Client;
import com.example.app.client.ClientRepository;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.SessionBookingStatus;
import com.example.app.session.SessionPriceCalculationMode;
import com.example.app.session.TypeTransactionService;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.fiscal.FiscalizationService;
import com.example.app.guest.model.GuestOrder;
import com.example.app.guest.model.GuestOrderRepository;
import com.example.app.guest.model.GuestPaymentMethodType;
import com.example.app.guest.model.OrderStatus;
import com.example.app.stripe.StripeBillingService;
import com.example.app.stripe.StripeCheckoutSessionResult;
import com.example.app.settings.AppSetting;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import org.hibernate.Hibernate;
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
    private static final ObjectMapper JSON = new ObjectMapper();
    /** Must match the frontend sentinel range used for invoice-editor lines added manually. */
    private static final long MANUAL_OPEN_BILL_LINE_SOURCE_ID_LIMIT = -900_000_000_000L;
    private static final Set<String> GUEST_PRODUCT_TYPES = Set.of("SESSION_SINGLE", "CLASS_TICKET", "PACK", "MEMBERSHIP", "GIFT_CARD");
    private static final List<String> DEFAULT_ALLOWED_FOR_CARD = List.of("SESSION_SINGLE", "CLASS_TICKET", "PACK", "MEMBERSHIP", "GIFT_CARD");
    private static final List<String> DEFAULT_ALLOWED_FOR_BANK_TRANSFER = List.of("PACK", "MEMBERSHIP", "GIFT_CARD");
    private static final List<String> DEFAULT_ALLOWED_FOR_OTHER = List.of("SESSION_SINGLE", "CLASS_TICKET", "PACK", "MEMBERSHIP", "GIFT_CARD");
    private final TransactionServiceRepository txRepo;
    private final PaymentMethodRepository paymentMethodRepo;
    private final BillRepository billRepo;
    private final AdvanceAllocationRepository advanceAllocationRepo;
    private final OpenBillRepository openBillRepo;
    private final SessionBookingRepository sessionBookings;
    private final ClientRepository clients;
    private final ClientCompanyRepository clientCompanies;
    private final UserRepository users;
    private final AppSettingRepository settings;
    private final FiscalizationService fiscalizationService;
    private final StripeBillingService stripeBillingService;
    private final BillingEmailService billingEmailService;
    private final BillFolioPdfService billFolioPdfService;
    private final InvoicePdfS3Service invoicePdfS3Service;
    private final FolioPdfService folioPdfService;
    private final BankStatementReconciliationService bankStatementReconciliationService;
    private final org.springframework.context.ApplicationEventPublisher events;
    private final GuestOrderRepository guestOrders;
    private final InvoiceOrderIdService invoiceOrderIdService;
    private final EntityManager entityManager;

    public BillingController(TransactionServiceRepository txRepo, PaymentMethodRepository paymentMethodRepo, BillRepository billRepo, AdvanceAllocationRepository advanceAllocationRepo, OpenBillRepository openBillRepo,
                             SessionBookingRepository sessionBookings, ClientRepository clients, ClientCompanyRepository clientCompanies, UserRepository users,
                             AppSettingRepository settings, FiscalizationService fiscalizationService,
                             StripeBillingService stripeBillingService, BillingEmailService billingEmailService, BillFolioPdfService billFolioPdfService,
                             InvoicePdfS3Service invoicePdfS3Service, FolioPdfService folioPdfService,
                             BankStatementReconciliationService bankStatementReconciliationService,
                             org.springframework.context.ApplicationEventPublisher events,
                             GuestOrderRepository guestOrders,
                             InvoiceOrderIdService invoiceOrderIdService,
                             EntityManager entityManager) {
        this.txRepo = txRepo;
        this.paymentMethodRepo = paymentMethodRepo;
        this.billRepo = billRepo;
        this.advanceAllocationRepo = advanceAllocationRepo;
        this.openBillRepo = openBillRepo;
        this.sessionBookings = sessionBookings;
        this.clients = clients;
        this.clientCompanies = clientCompanies;
        this.users = users;
        this.settings = settings;
        this.fiscalizationService = fiscalizationService;
        this.stripeBillingService = stripeBillingService;
        this.billingEmailService = billingEmailService;
        this.billFolioPdfService = billFolioPdfService;
        this.invoicePdfS3Service = invoicePdfS3Service;
        this.folioPdfService = folioPdfService;
        this.bankStatementReconciliationService = bankStatementReconciliationService;
        this.events = events;
        this.guestOrders = guestOrders;
        this.invoiceOrderIdService = invoiceOrderIdService;
        this.entityManager = entityManager;
    }

    public record BillItemRequest(Long transactionServiceId, Integer quantity, BigDecimal netPrice, Long sourceSessionBookingId) {}
    public record BillRequest(
            Long clientId,
            Long consultantId,
            Long paymentMethodId,
            String billingTarget,
            Long recipientCompanyId,
            String bankTransferReference,
            Long applyUnusedAdvanceBillId,
            BigDecimal applyUnusedAdvanceAmountGross,
            String billType,
            Long sessionId,
            List<PaymentSplitRequest> paymentSplits,
            List<BillItemRequest> items
    ) {}
    public record PaymentMethodRequest(
            String name,
            PaymentType paymentType,
            Boolean fiscalized,
            Boolean stripeEnabled,
            Boolean guestEnabled,
            Boolean widgetEnabled,
            Integer guestDisplayOrder,
            List<String> allowedGuestProductTypes
    ) {}
    public record PaymentMethodResponse(
            Long id,
            String name,
            PaymentType paymentType,
            boolean fiscalized,
            boolean stripeEnabled,
            boolean guestEnabled,
            boolean widgetEnabled,
            int guestDisplayOrder,
            List<String> allowedGuestProductTypes
    ) {}
    public record ClientSummary(Long id, String firstName, String lastName, String email, String phone) {}
    public record UserSummary(Long id, String firstName, String lastName, String email, Role role) {}
    public record PaymentMethodSummary(Long id, String name, PaymentType paymentType, boolean fiscalized, boolean stripeEnabled) {}
    public record PaymentSplitRequest(Long paymentMethodId, BigDecimal amountGross) {}
    public record PaymentSplitResponse(Long id, PaymentMethodSummary paymentMethod, BigDecimal amountGross) {}
    public record ServiceSummary(Long id, String code, String description, TaxRate taxRate, BigDecimal netPrice) {}
    public record BillItemResponse(
            Long id,
            ServiceSummary transactionService,
            Integer quantity,
            BigDecimal netPrice,
            BigDecimal grossPrice,
            Long sourceSessionBookingId
    ) {}
    public record BillResponse(
            Long id,
            String billNumber,
            String orderId,
            Long orderCounter,
            String billType,
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
            Long refundOfBillId,
            String refundReference,
            String bankTransferReference,
            List<PaymentSplitResponse> paymentSplits,
            List<BillItemResponse> items
    ) {}

    public record OpenBillItemRequest(Long transactionServiceId, Integer quantity, BigDecimal netPrice, Long sourceSessionBookingId, Long sourceAdvanceBillId) {}
    public record OpenBillItemResponse(Long id, ServiceSummary transactionService, Integer quantity, BigDecimal netPrice, Long sourceSessionBookingId, Long sourceAdvanceBillId) {}
    public record OpenBillSessionSummary(
            Long sessionId,
            String sessionDisplayId,
            String sessionInfo,
            String bookingGroupKey,
            String lifecycleStatus,
            String clientName,
            String consultantName,
            BigDecimal totalNet,
            BigDecimal totalGross,
            Integer lineItemCount
    ) {}
    public record OpenBillResponse(
            Long id,
            Long sessionId,
            ClientSummary client,
            UserSummary consultant,
            PaymentMethodSummary paymentMethod,
            String reference,
            List<OpenBillItemResponse> items,
            String sessionDisplayId,
            String sessionInfo,
            String batchScope,
            Long batchTargetClientId,
            Long batchTargetCompanyId,
            String billType,
            String bookingGroupKey,
            List<PaymentSplitResponse> paymentSplits,
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
    public record UnusedAdvanceResponse(
            Long advanceBillId,
            String billNumber,
            Long sessionId,
            ClientSummary client,
            RecipientCompanySummary recipientCompany,
            String billingTarget,
            LocalDate issueDate,
            BigDecimal totalNet,
            BigDecimal usedNet,
            BigDecimal remainingNet,
            BigDecimal totalGross,
            BigDecimal usedGross,
            BigDecimal remainingGross
    ) {}
    public record ApplyUnusedAdvanceRequest(Long advanceBillId, Long openBillId, Long sessionId, BigDecimal applyAmountNet) {}
    public record ApplyUnusedAdvanceResponse(Long openBillId, Long advanceBillId, BigDecimal remainingNet) {}
    public record OpenBillUpdateRequest(
            Long paymentMethodId,
            String reference,
            String billingTarget,
            Long clientId,
            Long recipientCompanyId,
            Long consultantId,
            Long sessionId,
            List<PaymentSplitRequest> paymentSplits,
            List<OpenBillItemRequest> items
    ) {}
    public record SplitOpenBillSessionRequest(Long sessionId) {}
    public record MergeOpenBillsRequest(List<Long> openBillIds) {}
    public record ManualOpenBillLineRequest(Long transactionServiceId, Integer quantity, BigDecimal netPrice, Long sourceSessionBookingId) {}

    public record ManualOpenBillRequest(
            Long clientId,
            Long recipientCompanyId,
            Long consultantId,
            Long paymentMethodId,
            Long sessionId,
            String billType,
            String reference,
            List<PaymentSplitRequest> paymentSplits,
            List<ManualOpenBillLineRequest> items
    ) {}
    public record AdditionalOpenBillRequest(
            Long clientId,
            Long recipientCompanyId,
            Long consultantId
    ) {}
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
        s.setActive(s.isActive());
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
        var nextActive = s.isActive();
        if (existing.isActive() && !nextActive
                && sessionBookings.existsUpcomingOrOngoingForTransactionService(companyId, id, LocalDateTime.now())) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "This transaction service is used by upcoming or ongoing bookings and cannot be inactivated."
            );
        }
        existing.setActive(nextActive);
        return txRepo.save(existing);
    }

    @PreAuthorize("hasRole('ADMIN')") 
    @DeleteMapping("/services/{id}")
    public void deleteService(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var existing = txRepo.findByIdAndCompanyId(id, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (sessionBookings.existsUpcomingOrOngoingForTransactionService(companyId, id, LocalDateTime.now())) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "This transaction service is used by upcoming or ongoing bookings and cannot be deleted. Set it inactive instead."
            );
        }
        txRepo.delete(existing);
    }

    @GetMapping("/payment-methods")
    @Transactional
    public List<PaymentMethodResponse> paymentMethods(@AuthenticationPrincipal User me) {
        Long companyId = me.getCompany().getId();
        ensureAdvancePaymentMethod(companyId, me.getCompany());
        return paymentMethodRepo.findAllByCompanyIdOrderByNameAsc(companyId).stream()
                .map(pm -> new PaymentMethodResponse(
                        pm.getId(),
                        pm.getName(),
                        pm.getPaymentType(),
                        pm.isFiscalized(),
                        pm.isStripeEnabled(),
                        pm.isGuestEnabled(),
                        pm.isWidgetEnabled(),
                        pm.getGuestDisplayOrder(),
                        readAllowedGuestProductTypes(pm)))
                .toList();
    }

    private PaymentMethod ensureAdvancePaymentMethod(Long companyId, com.example.app.company.Company company) {
        var existing = paymentMethodRepo.findAllByCompanyIdOrderByNameAsc(companyId).stream()
                .filter(pm -> pm.getPaymentType() == PaymentType.ADVANCE)
                .findFirst()
                .orElse(null);
        if (existing != null) {
            boolean dirty = false;
            if (existing.isFiscalized()) {
                existing.setFiscalized(false);
                dirty = true;
            }
            if (existing.isStripeEnabled()) {
                existing.setStripeEnabled(false);
                dirty = true;
            }
            if (existing.isGuestEnabled()) {
                existing.setGuestEnabled(false);
                dirty = true;
            }
            if (existing.isWidgetEnabled()) {
                existing.setWidgetEnabled(false);
                dirty = true;
            }
            if (dirty) {
                existing = paymentMethodRepo.save(existing);
            }
            return existing;
        }
        var method = new PaymentMethod();
        method.setCompany(company);
        method.setName("Advance");
        method.setPaymentType(PaymentType.ADVANCE);
        method.setFiscalized(false);
        method.setStripeEnabled(false);
        method.setGuestEnabled(false);
        method.setWidgetEnabled(false);
        method.setGuestDisplayOrder(999);
        method.setAllowedGuestProductTypesJson("[]");
        return paymentMethodRepo.save(method);
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
        return new PaymentMethodResponse(
                saved.getId(),
                saved.getName(),
                saved.getPaymentType(),
                saved.isFiscalized(),
                saved.isStripeEnabled(),
                saved.isGuestEnabled(),
                saved.isWidgetEnabled(),
                saved.getGuestDisplayOrder(),
                readAllowedGuestProductTypes(saved));
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
        return new PaymentMethodResponse(
                saved.getId(),
                saved.getName(),
                saved.getPaymentType(),
                saved.isFiscalized(),
                saved.isStripeEnabled(),
                saved.isGuestEnabled(),
                saved.isWidgetEnabled(),
                saved.getGuestDisplayOrder(),
                readAllowedGuestProductTypes(saved));
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
        openBillRepo.flush();
        advanceAllocationRepo.flush();
        entityManager.clear();

        syncOpenBillsByBatchSettings(companyId);
        openBillRepo.flush();
        advanceAllocationRepo.flush();
        entityManager.clear();

        return toOpenBillResponses(openBillRepo.findAllWithItemsByCompanyId(companyId), companyId);
    }


    @PostMapping("/open-bills/session/{sessionBookingId}")
    @Transactional
    public OpenBillResponse createOpenBillForSession(
            @PathVariable Long sessionBookingId,
            @RequestParam(name = "sharedGroup", defaultValue = "false") boolean sharedGroup,
            @RequestParam(name = "selectedOnly", defaultValue = "false") boolean selectedOnly,
            @AuthenticationPrincipal User me
    ) {
        var companyId = me.getCompany().getId();
        var session = sessionBookings.findByIdAndCompanyId(sessionBookingId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if ("CANCELLED".equalsIgnoreCase(String.valueOf(session.getBookingStatus()))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cancelled sessions cannot be billed.");
        }
        if (!selectedOnly && sharedGroup) {
            return createSharedOpenBillForSessionGroup(session, companyId);
        }
        if (!selectedOnly && !isTotalPriceCalculation(session) && hasMultipleBillableRowsInBookingGroup(session, companyId)) {
            return createPerClientOpenBillsForSessionGroup(session, companyId);
        }
        session = (!selectedOnly || isTotalPriceCalculation(session))
                ? billingSourceSessionForPriceMode(session, companyId)
                : session;
        if (session.getClient() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected session has no client.");
        }
        if (!isNoShowSession(session) && (session.getType() == null || session.getType().getLinkedServices() == null || session.getType().getLinkedServices().isEmpty())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected session has no transaction services.");
        }

        var consultant = resolveOpenBillConsultant(session, companyId);
        if (consultant == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unable to resolve consultant for this session.");
        }

        var client = session.getClient();
        PayeeResolution payee = resolveSessionPayee(session, client);
        var containingOpen = openBillRepo.findContainingSession(companyId, session.getId()).orElse(null);
        OpenBill open = resolveSyncTargetOpenBill(
                session,
                client,
                consultant,
                payee.linkedCompany(),
                payee.companyTarget(),
                payee.clientTarget(),
                containingOpen,
                companyId
        );

        boolean changed = false;
        changed |= ensureSessionServiceLines(open, session, companyId);
        changed |= ensureAdvanceOffsetLines(open, session, companyId);
        if (changed || open.getId() == null) {
            open = openBillRepo.saveAndFlush(open);
        }
        final Long openBillId = open.getId();
        return toOpenBillResponses(openBillRepo.findAllWithItemsByCompanyId(companyId), companyId)
                .stream()
                .filter(response -> Objects.equals(response.id(), openBillId))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private boolean hasMultipleBillableRowsInBookingGroup(SessionBooking sourceSession, Long companyId) {
        if (sourceSession == null || sourceSession.getId() == null) return false;
        return sessionBookings.findByBookingGroupKeyAndCompanyIdOrderByIdAsc(bookingGroupKey(sourceSession), companyId).stream()
                .filter(row -> row.getClient() != null)
                .filter(row -> !"CANCELLED".equalsIgnoreCase(String.valueOf(row.getBookingStatus())))
                .filter(row -> isNoShowSession(row) || (row.getType() != null && row.getType().getLinkedServices() != null && !row.getType().getLinkedServices().isEmpty()))
                .filter(row -> !isTotalPriceCalculation(row))
                .limit(2)
                .count() > 1;
    }

    private OpenBillResponse createPerClientOpenBillsForSessionGroup(SessionBooking sourceSession, Long companyId) {
        var groupRows = sessionBookings.findByBookingGroupKeyAndCompanyIdOrderByIdAsc(bookingGroupKey(sourceSession), companyId).stream()
                .filter(row -> row.getClient() != null)
                .filter(row -> !"CANCELLED".equalsIgnoreCase(String.valueOf(row.getBookingStatus())))
                .filter(row -> isNoShowSession(row) || (row.getType() != null && row.getType().getLinkedServices() != null && !row.getType().getLinkedServices().isEmpty()))
                .filter(row -> !isTotalPriceCalculation(row))
                .toList();
        if (groupRows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected session group has no billable clients.");
        }

        Long selectedOpenBillId = null;
        Long fallbackOpenBillId = null;
        for (SessionBooking row : groupRows) {
            var consultant = resolveOpenBillConsultant(row, companyId);
            if (consultant == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unable to resolve consultant for this session group.");
            }

            var client = row.getClient();
            PayeeResolution payee = resolveSessionPayee(row, client);
            var containingOpen = openBillRepo.findContainingSession(companyId, row.getId()).orElse(null);
            OpenBill open = resolveSyncTargetOpenBill(
                    row,
                    client,
                    consultant,
                    payee.linkedCompany(),
                    payee.companyTarget(),
                    payee.clientTarget(),
                    containingOpen,
                    companyId
            );

            boolean changed = false;
            changed |= ensureSessionServiceLines(open, row, companyId);
            changed |= ensureAdvanceOffsetLines(open, row, companyId);
            if (changed || open.getId() == null) {
                open = openBillRepo.saveAndFlush(open);
            }
            if (fallbackOpenBillId == null) {
                fallbackOpenBillId = open.getId();
            }
            if (Objects.equals(row.getId(), sourceSession.getId())) {
                selectedOpenBillId = open.getId();
            }
        }

        final Long responseOpenBillId = selectedOpenBillId != null ? selectedOpenBillId : fallbackOpenBillId;
        return toOpenBillResponses(openBillRepo.findAllWithItemsByCompanyId(companyId), companyId)
                .stream()
                .filter(response -> Objects.equals(response.id(), responseOpenBillId))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private OpenBillResponse createSharedOpenBillForSessionGroup(SessionBooking sourceSession, Long companyId) {
        var groupRows = sessionBookings.findByBookingGroupKeyAndCompanyIdOrderByIdAsc(bookingGroupKey(sourceSession), companyId).stream()
                .filter(row -> row.getClient() != null)
                .filter(row -> !"CANCELLED".equalsIgnoreCase(String.valueOf(row.getBookingStatus())))
                .filter(row -> isNoShowSession(row) || (row.getType() != null && row.getType().getLinkedServices() != null && !row.getType().getLinkedServices().isEmpty()))
                .toList();
        if (groupRows.isEmpty()) {
            groupRows = List.of(sourceSession);
        }

        Map<Long, SessionBooking> billableById = new LinkedHashMap<>();
        for (SessionBooking row : groupRows) {
            var billable = billingSourceSessionForPriceMode(row, companyId);
            if (billable == null || billable.getId() == null || billable.getClient() == null) continue;
            if ("CANCELLED".equalsIgnoreCase(String.valueOf(billable.getBookingStatus()))) continue;
            if (!isNoShowSession(billable) && (billable.getType() == null || billable.getType().getLinkedServices() == null || billable.getType().getLinkedServices().isEmpty())) continue;
            billableById.putIfAbsent(billable.getId(), billable);
        }
        var billableRows = new ArrayList<>(billableById.values());
        if (billableRows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected session group has no billable clients.");
        }

        var representative = billableRows.getFirst();
        var consultant = resolveOpenBillConsultant(representative, companyId);
        if (consultant == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unable to resolve consultant for this session group.");
        }

        OpenBill open = null;
        for (SessionBooking row : billableRows) {
            var containing = openBillRepo.findContainingSession(companyId, row.getId()).orElse(null);
            if (containing != null) {
                open = containing;
                break;
            }
        }
        if (open == null) {
            open = newOpenBillSkeleton(representative, representative.getClient(), consultant, null, OpenBill.BATCH_SCOPE_NONE, null, null);
        }
        if (open.getClient() == null) {
            open.setClient(representative.getClient());
        }
        if (open.getConsultant() == null) {
            open.setConsultant(consultant);
        }
        open.setSessionBooking(null);
        open.setBatchScope(OpenBill.BATCH_SCOPE_NONE);
        open.setBatchTargetClientId(null);
        open.setBatchTargetCompanyId(null);
        open.setManualSplitLocked(true);

        boolean changed = false;
        for (SessionBooking row : billableRows) {
            changed |= ensureSessionServiceLines(open, row, companyId);
            changed |= ensureAdvanceOffsetLines(open, row, companyId);
        }
        if (changed || open.getId() == null) {
            open = openBillRepo.saveAndFlush(open);
        }
        final Long openBillId = open.getId();
        return toOpenBillResponses(openBillRepo.findAllWithItemsByCompanyId(companyId), companyId)
                .stream()
                .filter(response -> Objects.equals(response.id(), openBillId))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    /**
     * Create an additional, empty {@link OpenBill} grouped with the given session via
     * {@code bookingGroupKey}. Used by the "Dodaj račun" flow when a multi-client
     * session needs more than the auto-created per-client bills (e.g. a second
     * company-paid bill alongside a private one).
     */
    @PostMapping("/open-bills/session/{sessionBookingId}/additional")
    @Transactional
    public OpenBillResponse createAdditionalOpenBillForSession(
            @PathVariable Long sessionBookingId,
            @RequestBody AdditionalOpenBillRequest req,
            @AuthenticationPrincipal User me
    ) {
        var companyId = me.getCompany().getId();
        var actor = users.findByIdAndCompanyId(me.getId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        var sourceSession = sessionBookings.findByIdAndCompanyId(sessionBookingId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if ("CANCELLED".equalsIgnoreCase(String.valueOf(sourceSession.getBookingStatus()))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cancelled sessions cannot be billed.");
        }
        if (req == null || (req.clientId() == null && req.recipientCompanyId() == null)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "clientId or recipientCompanyId is required.");
        }

        var resolvedClient = req.clientId() == null
                ? null
                : clients.findByIdAndCompanyId(req.clientId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid clientId."));
        var recipientCompany = req.recipientCompanyId() == null
                ? null
                : clientCompanies.findByIdAndOwnerCompanyId(req.recipientCompanyId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid recipientCompanyId."));

        if (resolvedClient == null && recipientCompany != null) {
            resolvedClient = clients.findFirstByCompanyIdAndBillingCompanyIdOrderByIdAsc(companyId, recipientCompany.getId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "No clients linked to this company."));
        }
        if (resolvedClient == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unable to resolve client for additional open bill.");
        }

        User consultant;
        if (req.consultantId() != null) {
            consultant = users.findByIdAndCompanyId(req.consultantId(), companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid consultantId."));
        } else if (sourceSession.getConsultant() != null) {
            consultant = sourceSession.getConsultant();
        } else if (resolvedClient.getAssignedTo() != null) {
            consultant = resolvedClient.getAssignedTo();
        } else {
            consultant = actor;
        }

        var additional = new OpenBill();
        additional.setCompany(actor.getCompany());
        additional.setClient(resolvedClient);
        additional.setConsultant(consultant);
        additional.setPaymentMethod(resolveDefaultPaymentMethod(companyId));
        additional.setBatchScope(recipientCompany != null ? OpenBill.BATCH_SCOPE_COMPANY : OpenBill.BATCH_SCOPE_NONE);
        additional.setBatchTargetCompanyId(recipientCompany != null ? recipientCompany.getId() : null);
        additional.setBatchTargetClientId(null);
        // Leave sessionBooking null to avoid the unique constraint on session_booking_id —
        // the editor groups bills by bookingGroupKey, so the new bill still appears as a tab
        // next to the per-session bills.
        additional.setSessionBooking(null);
        additional.setBookingGroupKey(resolveBookingGroupKeyForOpenBill(sourceSession));
        additional.setManualSplitLocked(true);

        var saved = openBillRepo.saveAndFlush(additional);
        final Long openBillId = saved.getId();
        return toOpenBillResponses(openBillRepo.findAllWithItemsByCompanyId(companyId), companyId)
                .stream()
                .filter(response -> Objects.equals(response.id(), openBillId))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    @PostMapping("/open-bills/manual")
    @Transactional
    public List<OpenBillResponse> createManualOpenBill(@RequestBody ManualOpenBillRequest req, @AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var actor = users.findByIdAndCompanyId(me.getId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
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
        SessionBooking selectedSession = null;
        if (req.sessionId() != null && req.sessionId() > 0) {
            selectedSession = sessionBookings.findByIdAndCompanyId(req.sessionId(), companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid sessionId."));
            if (selectedSession.getClient() == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected session has no client.");
            }
            if (client != null && !Objects.equals(selectedSession.getClient().getId(), client.getId())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected session does not belong to the selected client.");
            }
            if (recipientCompany != null) {
                var selectedBillingCompany = selectedSession.getClient().getBillingCompany();
                var selectedGroupCompany = selectedSession.getSessionGroupBillingCompany();
                boolean matchesCompany = (selectedBillingCompany != null && Objects.equals(selectedBillingCompany.getId(), recipientCompany.getId()))
                        || (selectedGroupCompany != null && Objects.equals(selectedGroupCompany.getId(), recipientCompany.getId()));
                if (!matchesCompany) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected session does not belong to the selected company.");
                }
            }
            client = selectedSession.getClient();
        }

        final var resolvedClient = client;
        final var resolvedLinkedCompany = recipientCompany != null ? recipientCompany : resolvedClient.getBillingCompany();
        final var selectedSessionForOpenBill = selectedSession;

        final boolean companyBatchEnabled = selectedSessionForOpenBill == null && resolvedLinkedCompany != null && resolvedLinkedCompany.isBatchPaymentEnabled();
        final boolean clientBatchEnabled = selectedSessionForOpenBill == null && !companyBatchEnabled && resolvedClient.isBatchPaymentEnabled();

        OpenBill open;
        if (selectedSessionForOpenBill != null) {
            open = openBillRepo.findContainingSession(companyId, selectedSessionForOpenBill.getId()).orElseGet(() -> {
                var created = new OpenBill();
                created.setCompany(actor.getCompany());
                created.setClient(resolvedClient);
                created.setConsultant(selectedSessionForOpenBill.getConsultant() != null
                        ? selectedSessionForOpenBill.getConsultant()
                        : (resolvedClient.getAssignedTo() != null ? resolvedClient.getAssignedTo() : actor));
                created.setPaymentMethod(resolveDefaultPaymentMethod(companyId));
                created.setBatchScope(OpenBill.BATCH_SCOPE_NONE);
                created.setBatchTargetClientId(null);
                created.setBatchTargetCompanyId(null);
                created.setSessionBooking(selectedSessionForOpenBill);
                created.setManualSplitLocked(false);
                created.setBookingGroupKey(resolveBookingGroupKeyForOpenBill(selectedSessionForOpenBill));
                return created;
            });
        } else if (companyBatchEnabled) {
            open = openBillRepo.findBatchByCompanyTarget(companyId, OpenBill.BATCH_SCOPE_COMPANY, resolvedLinkedCompany.getId()).orElseGet(() -> {
                var created = new OpenBill();
                created.setCompany(actor.getCompany());
                created.setClient(resolvedClient);
                created.setConsultant(resolvedClient.getAssignedTo() != null ? resolvedClient.getAssignedTo() : actor);
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
                created.setCompany(actor.getCompany());
                created.setClient(resolvedClient);
                created.setConsultant(resolvedClient.getAssignedTo() != null ? resolvedClient.getAssignedTo() : actor);
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
            open.setCompany(actor.getCompany());
            open.setClient(resolvedClient);
            open.setConsultant(resolvedClient.getAssignedTo() != null ? resolvedClient.getAssignedTo() : actor);
            open.setPaymentMethod(resolveDefaultPaymentMethod(companyId));
            open.setBatchScope(OpenBill.BATCH_SCOPE_NONE);
            open.setBatchTargetClientId(null);
            open.setBatchTargetCompanyId(null);
            open.setSessionBooking(null);
            open.setManualSplitLocked(false);
        }

        Long selectedSessionId = selectedSessionForOpenBill != null ? selectedSessionForOpenBill.getId() : null;
        long nextManualSessionNo = selectedSessionId == null ? nextManualSessionNumber(companyId) : 0L;
        if (selectedSessionId == null) {
            appendManualSessionNumber(open, nextManualSessionNo);
        }

        if (req.paymentMethodId() != null) {
            var paymentMethod = paymentMethodRepo.findByIdAndCompanyId(req.paymentMethodId(), companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid payment method."));
            open.setPaymentMethod(paymentMethod);
        }
        if (req.consultantId() != null) {
            var consultant = users.findByIdAndCompanyId(req.consultantId(), companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid consultantId."));
            open.setConsultant(consultant);
        }
        if (req.billType() != null && !req.billType().isBlank()) {
            open.setBillType(resolveRequestedBillType(req.billType()));
        } else if (selectedSessionForOpenBill == null) {
            // Manual open bills always need a concrete type since there is no session to derive from.
            open.setBillType(BillType.INVOICE);
        }
        open.setReference(req.reference() == null ? null : req.reference().trim());
        if (open.getBillType() == BillType.ADVANCE && resolveAdvanceDeductionServiceIds(companyId).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No transaction services are configured for ADVANCE bills.");
        }
        addInitialLinesToManualOpenBill(open, companyId, selectedSessionId, nextManualSessionNo, req.items());
        if (req.paymentSplits() != null) {
            replaceOpenBillPaymentSplits(open, req.paymentSplits(), companyId);
        }

        openBillRepo.save(open);

        syncOpenBillsFromPastSessions(companyId);
        return toOpenBillResponses(openBillRepo.findAllWithItemsByCompanyId(companyId), companyId);
    }

    private void replaceOpenBillPaymentSplits(OpenBill open, List<PaymentSplitRequest> splits, Long companyId) {
        if (open == null || splits == null) return;
        open.getPaymentSplits().clear();
        int order = 0;
        PaymentMethod firstMethod = null;
        for (PaymentSplitRequest split : splits) {
            if (split == null || split.paymentMethodId() == null) continue;
            BigDecimal amount = split.amountGross() == null ? BigDecimal.ZERO : split.amountGross().setScale(2, RoundingMode.HALF_UP);
            if (amount.compareTo(BigDecimal.ZERO) < 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Payment split amount cannot be negative.");
            }
            var method = paymentMethodRepo.findByIdAndCompanyId(split.paymentMethodId(), companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid payment method."));
            if (firstMethod == null) firstMethod = method;
            var row = new OpenBillPayment();
            row.setOpenBill(open);
            row.setPaymentMethod(method);
            row.setAmountGross(amount);
            row.setSortOrder(order++);
            open.getPaymentSplits().add(row);
        }
        if (firstMethod != null) {
            open.setPaymentMethod(firstMethod);
        }
    }

    private void replaceBillPaymentSplits(Bill bill, List<PaymentSplitRequest> splits, Long companyId, BigDecimal fallbackTotal) {
        if (bill == null || splits == null) return;
        bill.getPaymentSplits().clear();
        int order = 0;
        PaymentMethod firstMethod = null;
        for (PaymentSplitRequest split : splits) {
            if (split == null || split.paymentMethodId() == null) continue;
            BigDecimal amount = split.amountGross() == null ? BigDecimal.ZERO : split.amountGross().setScale(2, RoundingMode.HALF_UP);
            if (amount.compareTo(BigDecimal.ZERO) < 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Payment split amount cannot be negative.");
            }
            var method = paymentMethodRepo.findByIdAndCompanyId(split.paymentMethodId(), companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid payment method."));
            if (firstMethod == null) firstMethod = method;
            var row = new BillPayment();
            row.setBill(bill);
            row.setPaymentMethod(method);
            row.setAmountGross(amount);
            row.setSortOrder(order++);
            bill.getPaymentSplits().add(row);
        }
        if (firstMethod != null) {
            bill.setPaymentMethod(firstMethod);
        }
        if (bill.getPaymentSplits().isEmpty() && bill.getPaymentMethod() != null) {
            var row = new BillPayment();
            row.setBill(bill);
            row.setPaymentMethod(bill.getPaymentMethod());
            row.setAmountGross((fallbackTotal == null ? BigDecimal.ZERO : fallbackTotal).setScale(2, RoundingMode.HALF_UP));
            row.setSortOrder(0);
            bill.getPaymentSplits().add(row);
        }
    }

    private void copyOpenBillPaymentSplitsToBill(OpenBill open, Bill bill, BigDecimal totalGross) {
        if (open == null || bill == null) return;
        bill.getPaymentSplits().clear();
        if (open.getPaymentSplits() != null && !open.getPaymentSplits().isEmpty()) {
            int order = 0;
            for (OpenBillPayment split : open.getPaymentSplits()) {
                if (split == null || split.getPaymentMethod() == null) continue;
                var row = new BillPayment();
                row.setBill(bill);
                row.setPaymentMethod(split.getPaymentMethod());
                row.setAmountGross((split.getAmountGross() == null ? BigDecimal.ZERO : split.getAmountGross()).setScale(2, RoundingMode.HALF_UP));
                row.setSortOrder(order++);
                bill.getPaymentSplits().add(row);
            }
            if (!bill.getPaymentSplits().isEmpty()) {
                bill.setPaymentMethod(bill.getPaymentSplits().getFirst().getPaymentMethod());
                return;
            }
        }
        if (open.getPaymentMethod() != null) {
            var row = new BillPayment();
            row.setBill(bill);
            row.setPaymentMethod(open.getPaymentMethod());
            row.setAmountGross((totalGross == null ? BigDecimal.ZERO : totalGross).setScale(2, RoundingMode.HALF_UP));
            row.setSortOrder(0);
            bill.getPaymentSplits().add(row);
        }
    }

    private void copyRefundPaymentSplits(Bill original, Bill refund) {
        if (original == null || refund == null || original.getPaymentSplits() == null) return;
        int order = 0;
        for (BillPayment split : original.getPaymentSplits()) {
            if (split == null || split.getPaymentMethod() == null) continue;
            var row = new BillPayment();
            row.setBill(refund);
            row.setPaymentMethod(split.getPaymentMethod());
            row.setAmountGross((split.getAmountGross() == null ? BigDecimal.ZERO : split.getAmountGross()).negate().setScale(2, RoundingMode.HALF_UP));
            row.setSortOrder(order++);
            refund.getPaymentSplits().add(row);
        }
    }

    private void addInitialLinesToManualOpenBill(OpenBill open, Long companyId, Long selectedSessionId, long manualSessionNo, List<ManualOpenBillLineRequest> lines) {
        if (lines == null || lines.isEmpty()) {
            return;
        }
        Set<Long> allowedAdvanceServiceIds = open.getBillType() == BillType.ADVANCE
                ? resolveAdvanceDeductionServiceIds(companyId)
                : Set.of();
        if (open.getBillType() == BillType.ADVANCE && allowedAdvanceServiceIds.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No transaction services are configured for ADVANCE bills.");
        }
        Long syntheticSessionId = selectedSessionId != null ? selectedSessionId : -manualSessionNo;
        for (ManualOpenBillLineRequest line : lines) {
            if (line == null || line.transactionServiceId() == null) {
                continue;
            }
            if (open.getBillType() == BillType.ADVANCE && !allowedAdvanceServiceIds.contains(line.transactionServiceId())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "ADVANCE bills can only use transaction services marked for advance deduction.");
            }
            var tx = txRepo.findByIdAndCompanyId(line.transactionServiceId(), companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid transactionServiceId."));
            var obi = new OpenBillItem();
            obi.setOpenBill(open);
            obi.setTransactionService(tx);
            obi.setQuantity(line.quantity() != null && line.quantity() > 0 ? line.quantity() : 1);
            obi.setNetPrice(line.netPrice() != null ? line.netPrice() : tx.getNetPrice());
            obi.setSourceSessionBookingId(line.sourceSessionBookingId() != null ? line.sourceSessionBookingId() : syntheticSessionId);
            obi.setSourceAdvanceBillId(null);
            open.getItems().add(obi);
        }
    }

    @PutMapping("/open-bills/{id}")
    @Transactional
    public OpenBillResponse updateOpenBill(@PathVariable Long id, @RequestBody OpenBillUpdateRequest req, @AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var open = openBillRepo.findById(id).orElseThrow();
        if (!open.getCompany().getId().equals(companyId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        if (req.billingTarget() != null) {
            String target = req.billingTarget().trim().toUpperCase();
            if ("COMPANY".equals(target)) {
                if (req.recipientCompanyId() == null) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "recipientCompanyId is required for company open bills.");
                }
                var recipientCompany = clientCompanies.findByIdAndOwnerCompanyId(req.recipientCompanyId(), companyId)
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid recipientCompanyId."));
                Client resolvedClient = null;
                if (req.clientId() != null) {
                    resolvedClient = clients.findByIdAndCompanyId(req.clientId(), companyId)
                            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid clientId."));
                } else if (open.getClient() != null
                        && open.getClient().getCompany() != null
                        && Objects.equals(open.getClient().getCompany().getId(), companyId)) {
                    resolvedClient = open.getClient();
                } else {
                    resolvedClient = clients.findFirstByCompanyIdAndBillingCompanyIdOrderByIdAsc(companyId, recipientCompany.getId())
                            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "No clients linked to this company."));
                }
                open.setClient(resolvedClient);
                open.setBatchScope(OpenBill.BATCH_SCOPE_COMPANY);
                open.setBatchTargetCompanyId(recipientCompany.getId());
                open.setBatchTargetClientId(null);
            } else if ("PERSON".equals(target)) {
                if (req.clientId() == null) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "clientId is required for person open bills.");
                }
                var client = clients.findByIdAndCompanyId(req.clientId(), companyId)
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid clientId."));
                open.setClient(client);
                open.setBatchScope(OpenBill.BATCH_SCOPE_NONE);
                open.setBatchTargetClientId(null);
                open.setBatchTargetCompanyId(null);
            } else {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid billingTarget.");
            }
        }
        if (req.consultantId() != null) {
            var consultant = users.findByIdAndCompanyId(req.consultantId(), companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid consultantId."));
            open.setConsultant(consultant);
        }
        if (req.sessionId() != null) {
            var selectedSession = sessionBookings.findByIdAndCompanyId(req.sessionId(), companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid sessionId."));
            var owner = openBillRepo.findBySessionBookingIdAndCompanyId(selectedSession.getId(), companyId).orElse(null);
            if (owner != null && !Objects.equals(owner.getId(), open.getId())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected session is already linked to another open bill.");
            }
            if (!OpenBill.BATCH_SCOPE_COMPANY.equals(open.getBatchScope())
                    && selectedSession.getClient() != null && open.getClient() != null
                    && !Objects.equals(selectedSession.getClient().getId(), open.getClient().getId())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected session does not belong to the selected client.");
            }
            open.setSessionBooking(selectedSession);
        }
        if (req.paymentMethodId() != null) {
            var paymentMethod = paymentMethodRepo.findByIdAndCompanyId(req.paymentMethodId(), companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid payment method"));
            open.setPaymentMethod(paymentMethod);
        }
        if (req.paymentSplits() != null) {
            replaceOpenBillPaymentSplits(open, req.paymentSplits(), companyId);
        }
        open.setReference(req.reference() == null ? null : req.reference().trim());
        var existingItems = new ArrayList<>(open.getItems());
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
                var fallbackItem = idx < existingItems.size() ? existingItems.get(idx) : null;
                Long fallbackSourceSessionId = fallbackItem != null ? fallbackItem.getSourceSessionBookingId() : null;
                Long fallbackSourceAdvanceBillId = fallbackItem != null ? fallbackItem.getSourceAdvanceBillId() : null;
                obi.setSourceSessionBookingId(item.sourceSessionBookingId() != null ? item.sourceSessionBookingId() : fallbackSourceSessionId);
                obi.setSourceAdvanceBillId(item.sourceAdvanceBillId() != null ? item.sourceAdvanceBillId() : fallbackSourceAdvanceBillId);
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

    @PostMapping(value = "/open-bills/{id}/preview-pdf", produces = MediaType.APPLICATION_PDF_VALUE)
    @Transactional(readOnly = true)
    public ResponseEntity<byte[]> previewOpenBillPdf(@PathVariable Long id,
                                                     @RequestParam(value = "locale", required = false) String locale,
                                                     @RequestBody(required = false) OpenBillUpdateRequest req,
                                                     @AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var open = openBillRepo.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!open.getCompany().getId().equals(companyId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        Bill preview = buildTransientOpenBillPreview(open, req, companyId, me);
        byte[] pdf = billFolioPdfService.generate(preview, companyId, locale);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "inline; filename=\"invoice-preview-open-" + id + ".pdf\"")
                .contentType(MediaType.APPLICATION_PDF)
                .body(pdf);
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
        deleteAdvanceAllocationsForOpenBill(companyId, open.getId());
        advanceAllocationRepo.flush();
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
        split.setPaymentMethod(source.getPaymentMethod());
        split.setReference(source.getReference());
        split.setBatchScope(OpenBill.BATCH_SCOPE_NONE);
        split.setBatchTargetClientId(null);
        split.setBatchTargetCompanyId(null);
        split.setManualSplitLocked(true);
        split.setBillType(source.getBillType());

        if (sessionId < 0) {
            long manualNo = -sessionId;
            split.setClient(source.getClient());
            split.setConsultant(source.getConsultant());
            split.setSessionBooking(null);
            split.setBookingGroupKey(source.getBookingGroupKey());
            appendManualSessionNumber(split, manualNo);
            removeManualSessionNumber(source, manualNo);
        } else {
            var sourceSession = sessionBookings.findByIdAndCompanyId(sessionId, companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid sessionId."));
            split.setClient(sourceSession.getClient() != null ? sourceSession.getClient() : source.getClient());
            split.setConsultant(sourceSession.getConsultant() != null ? sourceSession.getConsultant() : source.getConsultant());
            split.setSessionBooking(sourceSession);
            split.setBookingGroupKey(resolveBookingGroupKeyForOpenBill(sourceSession));
        }

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
            moved.setSourceAdvanceBillId(item.getSourceAdvanceBillId());
            split.getItems().add(moved);
        }

        openBillRepo.save(split);
        if (split.getId() != null && source.getId() != null) {
            advanceAllocationRepo.reassignOpenBillForSession(companyId, source.getId(), split.getId(), sessionId);
            advanceAllocationRepo.flush();
        }
        if (source.getItems().isEmpty()) {
            deleteAdvanceAllocationsForOpenBill(companyId, source.getId());
            advanceAllocationRepo.flush();
            openBillRepo.delete(source);
        } else {
            openBillRepo.save(source);
        }

        return toOpenBillResponses(openBillRepo.findAllWithItemsByCompanyId(companyId), companyId);
    }


    @PostMapping("/open-bills/{id}/merge-related")
    @Transactional
    public List<OpenBillResponse> mergeRelatedOpenBills(
            @PathVariable Long id,
            @RequestBody(required = false) MergeOpenBillsRequest req,
            @AuthenticationPrincipal User me
    ) {
        var companyId = me.getCompany().getId();
        var target = openBillRepo.findByIdWithItemsForBatchSync(id, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));

        Set<Long> requestedIds = req == null || req.openBillIds() == null
                ? Set.of()
                : req.openBillIds().stream()
                .filter(Objects::nonNull)
                .collect(Collectors.toCollection(java.util.LinkedHashSet::new));
        if (requestedIds.isEmpty()) {
            requestedIds = relatedOpenBillIdsForSameBookingGroup(target, companyId);
        } else {
            requestedIds = new java.util.LinkedHashSet<>(requestedIds);
            requestedIds.add(id);
            requestedIds.addAll(relatedOpenBillIdsForSameBookingGroup(target, companyId));
        }

        if (!requestedIds.contains(id)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Target open bill must be included in the merge.");
        }

        // Keep the target as a session-group bill. Its individual line sourceSessionBookingId values
        // continue to drive the editor/client labels, while only one open-bill row remains.
        target.setSessionBooking(null);
        target.setBatchScope(OpenBill.BATCH_SCOPE_NONE);
        target.setBatchTargetClientId(null);
        target.setBatchTargetCompanyId(null);
        target.setManualSplitLocked(true);
        target = openBillRepo.saveAndFlush(target);
        Long targetOpenBillId = target.getId();

        for (Long sourceId : requestedIds) {
            if (Objects.equals(sourceId, targetOpenBillId)) continue;
            var sourceOpt = openBillRepo.findByIdWithItemsForBatchSync(sourceId, companyId);
            if (sourceOpt.isEmpty()) continue;
            var source = sourceOpt.get();
            if (source.isManualSplitLocked() && source.getManualSessionNumbersCsv() != null && !source.getManualSessionNumbersCsv().isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Manual open bills cannot be merged into a session bill.");
            }
            Long sourceOpenBillId = source.getId();
            Long fallbackSessionId = source.getSessionBooking() != null ? source.getSessionBooking().getId() : null;
            Set<Long> movedSessionIds = source.getItems() == null
                    ? Set.of()
                    : source.getItems().stream()
                    .map(item -> item.getSourceSessionBookingId() != null ? item.getSourceSessionBookingId() : fallbackSessionId)
                    .filter(Objects::nonNull)
                    .collect(Collectors.toSet());

            entityManager.flush();
            entityManager.clear();
            openBillRepo.moveItemsToOpenBill(sourceOpenBillId, targetOpenBillId, fallbackSessionId, companyId);
            for (Long sessionId : movedSessionIds) {
                advanceAllocationRepo.reassignOpenBillForSession(companyId, sourceOpenBillId, targetOpenBillId, sessionId);
            }
            deleteAdvanceAllocationsForOpenBill(companyId, sourceOpenBillId);
            openBillRepo.deletePaymentSplitsByOpenBillIdAndCompanyId(sourceOpenBillId, companyId);
            openBillRepo.deleteByIdAndCompanyId(sourceOpenBillId, companyId);
            openBillRepo.flush();
            advanceAllocationRepo.flush();
            entityManager.clear();
        }

        var refreshed = openBillRepo.findByIdWithItemsForBatchSync(targetOpenBillId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        refreshed.setSessionBooking(null);
        refreshed.setBatchScope(OpenBill.BATCH_SCOPE_NONE);
        refreshed.setBatchTargetClientId(null);
        refreshed.setBatchTargetCompanyId(null);
        refreshed.setManualSplitLocked(true);
        openBillRepo.saveAndFlush(refreshed);
        return toOpenBillResponses(openBillRepo.findAllWithItemsByCompanyId(companyId), companyId);
    }

    private Set<Long> relatedOpenBillIdsForSameBookingGroup(OpenBill target, Long companyId) {
        Set<String> groupKeys = openBillBookingGroupKeys(target, companyId);
        if (groupKeys.isEmpty()) {
            return Set.of(target.getId());
        }
        return openBillRepo.findAllWithItemsByCompanyId(companyId).stream()
                .filter(open -> !open.isManualSplitLocked() || parseManualSessionNumbers(open.getManualSessionNumbersCsv()).isEmpty())
                .filter(open -> openBillBookingGroupKeys(open, companyId).stream().anyMatch(groupKeys::contains))
                .map(OpenBill::getId)
                .filter(Objects::nonNull)
                .collect(Collectors.toCollection(java.util.LinkedHashSet::new));
    }

    private Set<String> openBillBookingGroupKeys(OpenBill open, Long companyId) {
        Set<Long> sessionIds = new java.util.LinkedHashSet<>();
        if (open.getSessionBooking() != null && open.getSessionBooking().getId() != null) {
            sessionIds.add(open.getSessionBooking().getId());
        }
        if (open.getItems() != null) {
            open.getItems().stream()
                    .map(OpenBillItem::getSourceSessionBookingId)
                    .filter(Objects::nonNull)
                    .filter(id -> id > 0)
                    .forEach(sessionIds::add);
        }
        if (sessionIds.isEmpty()) return Set.of();
        return sessionBookings.findAllByCompanyIdAndIds(companyId, sessionIds).stream()
                .map(BillingController::bookingGroupKey)
                .filter(key -> key != null && !key.isBlank())
                .collect(Collectors.toCollection(java.util.LinkedHashSet::new));
    }

    private static final Set<String> BILLABLE_LIFECYCLE_STATUSES_FOR_CLOSE = Set.of(
            SessionBookingStatus.RESERVED,
            SessionBookingStatus.ONGOING,
            SessionBookingStatus.CHECKED_OUT,
            SessionBookingStatus.NO_SHOW
    );

    private static boolean isManualOpenBillLineSourceId(Long sourceSessionBookingId) {
        return sourceSessionBookingId != null && sourceSessionBookingId <= MANUAL_OPEN_BILL_LINE_SOURCE_ID_LIMIT;
    }

    private static Long resolveInvoiceLineSourceSessionId(Long requestedSourceSessionBookingId, Long fallbackSourceSessionBookingId) {
        if (isManualOpenBillLineSourceId(requestedSourceSessionBookingId)) {
            return null;
        }
        if (requestedSourceSessionBookingId != null) {
            return requestedSourceSessionBookingId;
        }
        if (isManualOpenBillLineSourceId(fallbackSourceSessionBookingId)) {
            return null;
        }
        return fallbackSourceSessionBookingId;
    }

    private void requireOpenBillSessionsBillableForClose(Long companyId, Set<Long> sessionIds) {
        if (sessionIds == null || sessionIds.isEmpty()) {
            return;
        }
        Set<Long> realSessionIds = sessionIds.stream()
                .filter(Objects::nonNull)
                .filter(sessionId -> sessionId > 0)
                .collect(Collectors.toSet());
        if (realSessionIds.isEmpty()) {
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        boolean hasUnbillable = sessionBookings.findAllByCompanyIdAndIds(companyId, realSessionIds).stream()
                .anyMatch(session -> !BILLABLE_LIFECYCLE_STATUSES_FOR_CLOSE.contains(SessionBookingStatus.deriveLifecycleStatus(
                        session.getStartTime(),
                        session.getEndTime(),
                        session.getBookingStatus(),
                        now
                )));
        if (hasUnbillable) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Open bills can only be closed when the session is in RESERVED, ONGOING, CHECKED OUT or NO SHOW status.");
        }
    }

    /**
     * Session open bills are always service invoices unless an open bill was explicitly marked
     * as ADVANCE. Deposits/advances are issued separately and then consumed by the session
     * invoice through advance offset lines.
     */
    private BillType deriveBillTypeFromSessions(Long companyId, Set<Long> sessionIds) {
        return BillType.INVOICE;
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
                .filter(sourceSessionId -> !isManualOpenBillLineSourceId(sourceSessionId))
                .collect(Collectors.toSet());
        if (linkedSessionId != null) {
            linkedSessionIds.add(linkedSessionId);
        }
        requireOpenBillSessionsBillableForClose(companyId, linkedSessionIds);
        var bill = new Bill();
        bill.setCompany(me.getCompany());
        BillType resolvedBillType = open.getBillType() != null
                ? open.getBillType()
                : deriveBillTypeFromSessions(companyId, linkedSessionIds);
        boolean explicitAdvanceOpenBill = open.getBillType() == BillType.ADVANCE;
        Set<Long> allowedAdvanceServiceIds = explicitAdvanceOpenBill
                ? resolveAdvanceDeductionServiceIds(companyId)
                : Set.of();
        if (explicitAdvanceOpenBill && allowedAdvanceServiceIds.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No transaction services are configured for ADVANCE bills.");
        }
        bill.setBillType(resolvedBillType);
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
        bill.setBankTransferReference(open.getReference());
        bill.setIssueDate(LocalDate.now());
        if (open.getItems() == null || open.getItems().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Open bill has no items.");
        }
        BigDecimal totalNet = BigDecimal.ZERO;
        BigDecimal totalGross = BigDecimal.ZERO;
        for (var obi : open.getItems()) {
            var tx = obi.getTransactionService();
            if (explicitAdvanceOpenBill && (tx == null || !allowedAdvanceServiceIds.contains(tx.getId()))) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "ADVANCE bills can only use transaction services marked for advance deduction.");
            }
            var item = new BillItem();
            item.setBill(bill);
            item.setTransactionService(tx);
            item.setQuantity(obi.getQuantity());
            item.setNetPrice(obi.getNetPrice());
            item.setSourceSessionBookingId(resolveInvoiceLineSourceSessionId(obi.getSourceSessionBookingId(), linkedSessionId));
            item.setSourceAdvanceBillId(obi.getSourceAdvanceBillId());
            var grossSingle = obi.getNetPrice().add(obi.getNetPrice().multiply(tx.getTaxRate().multiplier)).setScale(2, RoundingMode.HALF_UP);
            item.setGrossPrice(grossSingle.multiply(BigDecimal.valueOf(obi.getQuantity())));
            totalNet = totalNet.add(obi.getNetPrice().multiply(BigDecimal.valueOf(obi.getQuantity())));
            totalGross = totalGross.add(item.getGrossPrice());
            bill.getItems().add(item);
        }
        bill.setTotalNet(totalNet);
        bill.setTotalGross(totalGross);
        copyOpenBillPaymentSplitsToBill(open, bill, totalGross);
        bill.setSourceSessionIdSnapshot(linkedSessionId != null ? linkedSessionId : linkedSessionIds.stream().findFirst().orElse(null));
        bill.setPaymentStatus(resolveInitialPaymentStatus(bill.getPaymentMethod()));
        if (BillPaymentStatus.PAID.equals(bill.getPaymentStatus())) {
            bill.setPaidAt(OffsetDateTime.now());
        }
        invoiceOrderIdService.assignIfMissing(bill);
        var saved = billRepo.saveAndFlush(bill);
        if (shouldFiscalizeOnBillCreate(saved.getPaymentMethod())) {
            saved = fiscalizationService.fiscalizeBill(saved, companyId);
        }
        linkSourceGuestOrderToCreatedBill(open, saved, companyId);
        if (!linkedSessionIds.isEmpty()) {
            var linkedSessions = sessionBookings.findAllByCompanyIdAndIds(companyId, linkedSessionIds);
            for (var session : linkedSessions) {
                session.setBilledAt(java.time.LocalDate.now());
            }
            sessionBookings.saveAll(linkedSessions);
            sessionBookings.flush();
        }
        deleteAdvanceAllocationsForOpenBill(companyId, open.getId());
        advanceAllocationRepo.flush();
        openBillRepo.delete(open);
        openBillRepo.flush();
        tryArchiveInvoicePdfAfterCreate(saved, companyId);
        return toResponse(saved);
    }

    /**
     * Builds an in-memory Bill from an open-bill editor payload for PDF preview only.
     * No invoice number is reserved, no fiscalization runs, no S3 object is archived, and no DB row is saved.
     */
    private Bill buildTransientOpenBillPreview(OpenBill open, OpenBillUpdateRequest req, Long companyId, User me) {
        if (open == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        var bill = new Bill();
        bill.setCompany(me.getCompany());
        bill.setBillNumber("PREVIEW-OPEN-" + open.getId());
        bill.setBillType(open.getBillType() != null ? open.getBillType() : BillType.INVOICE);

        Client client = resolvePreviewClient(open, req, companyId);
        String billingTarget = resolvePreviewBillingTarget(open, req);
        if ("COMPANY".equals(billingTarget)) {
            ClientCompany recipientCompany = resolvePreviewRecipientCompany(open, req, client, companyId);
            bill.setClient(null);
            bill.setClientFirstNameSnapshot("");
            bill.setClientLastNameSnapshot("");
            setBillRecipientCompanySnapshot(bill, recipientCompany);
        } else if ("PERSON".equals(billingTarget)) {
            if (client == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "clientId is required for person open bills.");
            }
            bill.setClient(client);
            setBillClientSnapshot(bill, client);
            setBillRecipientPersonSnapshot(bill);
        } else {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid billingTarget.");
        }

        User consultant = resolvePreviewConsultant(open, req, companyId, me);
        bill.setConsultant(consultant);
        PaymentMethod paymentMethod = resolvePreviewPaymentMethod(open, req, companyId);
        bill.setPaymentMethod(paymentMethod);
        bill.setBankTransferReference(req != null && req.reference() != null ? req.reference().trim() : open.getReference());
        bill.setIssueDate(LocalDate.now());

        Long linkedSessionId = resolvePreviewSessionId(open, req, companyId);
        BigDecimal totalNet = BigDecimal.ZERO;
        BigDecimal totalGross = BigDecimal.ZERO;
        List<OpenBillItemRequest> requestedItems = req == null ? null : req.items();
        if (requestedItems != null) {
            int idx = 0;
            List<OpenBillItem> existingItems = open.getItems() == null ? List.of() : new ArrayList<>(open.getItems());
            for (OpenBillItemRequest requested : requestedItems) {
                if (requested == null || requested.transactionServiceId() == null) continue;
                var tx = txRepo.findByIdAndCompanyId(requested.transactionServiceId(), companyId)
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
                OpenBillItem fallback = idx < existingItems.size() ? existingItems.get(idx) : null;
                var item = newTransientBillItem(
                        bill,
                        tx,
                        requested.quantity(),
                        requested.netPrice(),
                        resolveInvoiceLineSourceSessionId(
                                requested.sourceSessionBookingId(),
                                fallback == null ? linkedSessionId : fallback.getSourceSessionBookingId()),
                        requested.sourceAdvanceBillId() != null
                                ? requested.sourceAdvanceBillId()
                                : (fallback == null ? null : fallback.getSourceAdvanceBillId())
                );
                totalNet = totalNet.add(item.getNetPrice().multiply(BigDecimal.valueOf(item.getQuantity())));
                totalGross = totalGross.add(item.getGrossPrice());
                bill.getItems().add(item);
                idx++;
            }
        } else if (open.getItems() != null) {
            for (OpenBillItem openItem : open.getItems()) {
                if (openItem == null || openItem.getTransactionService() == null) continue;
                var item = newTransientBillItem(
                        bill,
                        openItem.getTransactionService(),
                        openItem.getQuantity(),
                        openItem.getNetPrice(),
                        resolveInvoiceLineSourceSessionId(openItem.getSourceSessionBookingId(), linkedSessionId),
                        openItem.getSourceAdvanceBillId()
                );
                totalNet = totalNet.add(item.getNetPrice().multiply(BigDecimal.valueOf(item.getQuantity())));
                totalGross = totalGross.add(item.getGrossPrice());
                bill.getItems().add(item);
            }
        }
        if (bill.getItems().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Open bill has no items.");
        }
        bill.setTotalNet(totalNet.setScale(2, RoundingMode.HALF_UP));
        bill.setTotalGross(totalGross.setScale(2, RoundingMode.HALF_UP));
        bill.setSourceSessionIdSnapshot(linkedSessionId != null
                ? linkedSessionId
                : bill.getItems().stream().map(BillItem::getSourceSessionBookingId).filter(Objects::nonNull).findFirst().orElse(null));
        bill.setPaymentStatus(resolveInitialPaymentStatus(bill.getPaymentMethod()));
        if (req != null && req.paymentSplits() != null) {
            replaceBillPaymentSplits(bill, req.paymentSplits(), companyId, bill.getTotalGross());
        } else {
            copyOpenBillPaymentSplitsToBill(open, bill, bill.getTotalGross());
        }
        return bill;
    }

    private BillItem newTransientBillItem(Bill bill,
                                          TransactionService tx,
                                          Integer quantity,
                                          BigDecimal requestedNetPrice,
                                          Long sourceSessionBookingId,
                                          Long sourceAdvanceBillId) {
        int qty = quantity != null && quantity > 0 ? quantity : 1;
        BigDecimal net = requestedNetPrice != null ? requestedNetPrice : (tx.getNetPrice() == null ? BigDecimal.ZERO : tx.getNetPrice());
        BigDecimal multiplier = tx.getTaxRate() == null ? BigDecimal.ZERO : tx.getTaxRate().multiplier;
        BigDecimal grossSingle = net.add(net.multiply(multiplier)).setScale(2, RoundingMode.HALF_UP);
        var item = new BillItem();
        item.setBill(bill);
        item.setTransactionService(tx);
        item.setQuantity(qty);
        item.setNetPrice(net.setScale(2, RoundingMode.HALF_UP));
        item.setGrossPrice(grossSingle.multiply(BigDecimal.valueOf(qty)).setScale(2, RoundingMode.HALF_UP));
        item.setSourceSessionBookingId(sourceSessionBookingId);
        item.setSourceAdvanceBillId(sourceAdvanceBillId);
        return item;
    }

    private Client resolvePreviewClient(OpenBill open, OpenBillUpdateRequest req, Long companyId) {
        if (req != null && req.clientId() != null) {
            return clients.findByIdAndCompanyId(req.clientId(), companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid clientId."));
        }
        return open.getClient();
    }

    private String resolvePreviewBillingTarget(OpenBill open, OpenBillUpdateRequest req) {
        if (req != null && req.billingTarget() != null && !req.billingTarget().isBlank()) {
            return req.billingTarget().trim().toUpperCase(Locale.ROOT);
        }
        return OpenBill.BATCH_SCOPE_COMPANY.equals(open.getBatchScope()) || open.getBatchTargetCompanyId() != null
                ? "COMPANY"
                : "PERSON";
    }

    private ClientCompany resolvePreviewRecipientCompany(OpenBill open, OpenBillUpdateRequest req, Client client, Long companyId) {
        Long companyIdToUse = req != null && req.recipientCompanyId() != null
                ? req.recipientCompanyId()
                : open.getBatchTargetCompanyId();
        if (companyIdToUse == null && client != null && client.getBillingCompany() != null) {
            companyIdToUse = client.getBillingCompany().getId();
        }
        if (companyIdToUse == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "recipientCompanyId is required for company open bills.");
        }
        return clientCompanies.findByIdAndOwnerCompanyId(companyIdToUse, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid recipientCompanyId."));
    }

    private User resolvePreviewConsultant(OpenBill open, OpenBillUpdateRequest req, Long companyId, User me) {
        if (req != null && req.consultantId() != null) {
            return users.findByIdAndCompanyId(req.consultantId(), companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid consultantId."));
        }
        return open.getConsultant() != null ? open.getConsultant() : me;
    }

    private PaymentMethod resolvePreviewPaymentMethod(OpenBill open, OpenBillUpdateRequest req, Long companyId) {
        if (req != null && req.paymentMethodId() != null) {
            return paymentMethodRepo.findByIdAndCompanyId(req.paymentMethodId(), companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid payment method"));
        }
        return open.getPaymentMethod() != null ? open.getPaymentMethod() : resolveDefaultPaymentMethod(companyId);
    }

    private Long resolvePreviewSessionId(OpenBill open, OpenBillUpdateRequest req, Long companyId) {
        if (req != null && req.sessionId() != null && req.sessionId() > 0) {
            return sessionBookings.findByIdAndCompanyId(req.sessionId(), companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid sessionId."))
                    .getId();
        }
        return open.getSessionBooking() != null ? open.getSessionBooking().getId() : null;
    }

    private void linkSourceGuestOrderToCreatedBill(OpenBill open, Bill saved, Long companyId) {
        if (open == null || open.getSourceGuestOrderId() == null || saved == null) return;
        var order = guestOrders.findById(open.getSourceGuestOrderId())
                .filter(candidate -> candidate.getCompany() != null && Objects.equals(candidate.getCompany().getId(), companyId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Linked wallet order was not found."));
        order.setBillId(saved.getId());
        order.setPaymentMethodType(toGuestOrderPaymentMethodType(saved.getPaymentMethod(), order.getPaymentMethodType()));
        guestOrders.saveAndFlush(order);
        if (BillPaymentStatus.PAID.equals(saved.getPaymentStatus())) {
            events.publishEvent(new BillPaidEvent(saved.getId(), companyId));
        }
    }

    private static GuestPaymentMethodType toGuestOrderPaymentMethodType(PaymentMethod paymentMethod, GuestPaymentMethodType fallback) {
        if (paymentMethod == null || paymentMethod.getPaymentType() == null) {
            return fallback == null ? GuestPaymentMethodType.PAY_AT_VENUE : fallback;
        }
        return switch (paymentMethod.getPaymentType()) {
            case BANK_TRANSFER -> GuestPaymentMethodType.BANK_TRANSFER;
            case CARD -> GuestPaymentMethodType.CARD;
            case OTHER -> fallback == GuestPaymentMethodType.PAYPAL ? GuestPaymentMethodType.PAYPAL : GuestPaymentMethodType.PAY_AT_VENUE;
            case CASH -> GuestPaymentMethodType.PAY_AT_VENUE;
            case ADVANCE -> fallback == null ? GuestPaymentMethodType.PAY_AT_VENUE : fallback;
        };
    }

    /**
     * Persists the invoice PDF to S3 when configured. Skips if a key already exists (e.g. fiscal success just uploaded).
     * Covers card/check flows that skip fiscalization on create and failed fiscal runs that would otherwise never archive.
     */
    private void tryArchiveInvoicePdfAfterCreate(Bill bill, Long companyId) {
        try {
            byte[] pdf = billFolioPdfService.generate(bill, companyId);
            invoicePdfS3Service.uploadAndPersistKey(bill, pdf);
        } catch (Exception e) {
            log.warn("Could not archive folio PDF to S3 for billId={}", bill.getId(), e);
        }
    }

    private void syncOpenBillsFromPastSessions(Long companyId) {
        var past = sessionBookings.findPastSessionsWithTypeAndCompanyId(LocalDateTime.now(), companyId);
        for (SessionBooking sb : past) {
            var type = sb.getType();
            if (type == null || type.getLinkedServices() == null || type.getLinkedServices().isEmpty()) continue;
            if (isTotalPriceCalculation(sb) && !Objects.equals(billingSourceSessionForPriceMode(sb, companyId).getId(), sb.getId())) continue;

            var client = sb.getClient();
            if (client == null) continue;

            var consultant = resolveOpenBillConsultant(sb, companyId);
            if (consultant == null) continue;

            PayeeResolution payee = resolveSessionPayee(sb, client);
            var linkedCompany = payee.linkedCompany();
            final boolean companyBatchEnabled = payee.companyTarget();
            final boolean clientBatchEnabled = payee.clientTarget();

            var legacyOpen = openBillRepo.findBySessionBookingIdAndCompanyId(sb.getId(), companyId).orElse(null);
            if (legacyOpen != null && legacyOpen.isManualSplitLocked()) {
                continue;
            }
            var containingOpen = legacyOpen != null
                    ? legacyOpen
                    : openBillRepo.findContainingSession(companyId, sb.getId()).orElse(null);

            OpenBill open = resolveSyncTargetOpenBill(sb, client, consultant, linkedCompany, companyBatchEnabled, clientBatchEnabled, containingOpen, companyId);
            boolean changed = false;

            if (legacyOpen != null && !sameOpenBill(legacyOpen, open)) {
                open = moveOpenBillRowsIntoTarget(companyId, legacyOpen, open, sb.getId());
            } else if (legacyOpen == null && containingOpen != null && !sameOpenBill(containingOpen, open)) {
                // Existing batch bills can contain multiple sessions; do not move the whole batch when a single
                // session payer changes. New payer selection is applied when the open bill is first created.
                continue;
            }

            changed |= ensureSessionServiceLines(open, sb, companyId);
            changed |= ensureAdvanceOffsetLines(open, sb, companyId);

            if (changed || open.getId() == null) {
                openBillRepo.save(open);
            }
        }
    }

    private void syncOpenBillsByBatchSettings(Long companyId) {
        var sourceIds = openBillRepo.findBatchMergeCandidateIds(companyId);
        for (Long sourceId : sourceIds) {
            mergeOpenBillIntoConfiguredBatch(companyId, sourceId);
            openBillRepo.flush();
            advanceAllocationRepo.flush();
            entityManager.clear();
        }
    }

    private void mergeOpenBillIntoConfiguredBatch(Long companyId, Long sourceId) {
        var sourceOpt = openBillRepo.findByIdWithItemsForBatchSync(sourceId, companyId);
        if (sourceOpt.isEmpty()) {
            return;
        }
        OpenBill source = sourceOpt.get();
        if (source.getId() == null) return;
        if (!OpenBill.BATCH_SCOPE_NONE.equals(source.getBatchScope())) return;
        if (source.getClient() == null || source.getItems() == null || source.getItems().isEmpty()) return;
        if (openBillHasExplicitSessionPayee(source, companyId)) return;

        BatchTarget batchTarget = resolveBatchTargetForOpenBillSource(source, companyId);
        if (batchTarget == null) return;

        OpenBill target;
        if (OpenBill.BATCH_SCOPE_COMPANY.equals(batchTarget.scope())) {
            target = openBillRepo.findBatchByCompanyTarget(companyId, OpenBill.BATCH_SCOPE_COMPANY, batchTarget.companyId())
                    .orElseGet(() -> newBatchOpenBillFromSource(source, OpenBill.BATCH_SCOPE_COMPANY, null, batchTarget.companyId()));
        } else {
            target = openBillRepo.findBatchByClientTarget(companyId, OpenBill.BATCH_SCOPE_CLIENT, batchTarget.clientId())
                    .orElseGet(() -> newBatchOpenBillFromSource(source, OpenBill.BATCH_SCOPE_CLIENT, batchTarget.clientId(), null));
        }
        if (sameOpenBill(source, target)) return;

        moveOpenBillRowsIntoTarget(
                companyId,
                source,
                target,
                source.getSessionBooking() != null ? source.getSessionBooking().getId() : null
        );
    }

    private record BatchTarget(String scope, Long clientId, Long companyId) {}

    private BatchTarget resolveBatchTargetForOpenBillSource(OpenBill source, Long companyId) {
        Set<Long> sessionIds = sourceSessionIds(source);
        if (!sessionIds.isEmpty()) {
            List<SessionBooking> sourceSessions = sourceSessionsForOpenBill(companyId, sessionIds);
            if (sourceSessions.size() != sessionIds.size()) {
                return null;
            }
            List<BatchTarget> resolvedTargets = sourceSessions.stream()
                    .map(this::resolveBatchTargetForSession)
                    .toList();
            if (resolvedTargets.stream().anyMatch(Objects::isNull)) {
                return null;
            }
            Set<BatchTarget> targets = resolvedTargets.stream()
                    .collect(Collectors.toCollection(java.util.LinkedHashSet::new));
            if (targets.size() == 1) {
                return targets.iterator().next();
            }
            return null;
        }
        return resolveBatchTargetForClient(source.getClient());
    }

    private List<SessionBooking> sourceSessionsForOpenBill(Long companyId, Set<Long> sessionIds) {
        if (sessionIds == null || sessionIds.isEmpty()) {
            return List.of();
        }
        return sessionBookings.findAllByCompanyIdAndIds(companyId, sessionIds).stream()
                .filter(session -> session != null && session.getClient() != null)
                .toList();
    }

    private BatchTarget resolveBatchTargetForSession(SessionBooking session) {
        if (session == null || session.getClient() == null) return null;
        String explicitType = session.getPayeeType() == null ? null : session.getPayeeType().trim().toUpperCase(java.util.Locale.ROOT);
        if (session.isPayeeCustomData()) return null;
        if ("COMPANY".equals(explicitType)) {
            ClientCompany payeeCompany = session.getPayeeCompany();
            if (payeeCompany != null && payeeCompany.isBatchPaymentEnabled() && payeeCompany.getId() != null) {
                return new BatchTarget(OpenBill.BATCH_SCOPE_COMPANY, null, payeeCompany.getId());
            }
            return null;
        }
        return resolveBatchTargetForClient(session.getClient());
    }

    private BatchTarget resolveBatchTargetForClient(Client client) {
        if (client == null || client.getId() == null) return null;
        ClientCompany linkedCompany = client.getBillingCompany();
        if (linkedCompany != null && linkedCompany.isBatchPaymentEnabled() && linkedCompany.getId() != null) {
            return new BatchTarget(OpenBill.BATCH_SCOPE_COMPANY, null, linkedCompany.getId());
        }
        if (client.isBatchPaymentEnabled()) {
            return new BatchTarget(OpenBill.BATCH_SCOPE_CLIENT, client.getId(), null);
        }
        return null;
    }

    private Set<Long> sourceSessionIds(OpenBill source) {
        Set<Long> sessionIds = new HashSet<>();
        if (source.getSessionBooking() != null && source.getSessionBooking().getId() != null) {
            sessionIds.add(source.getSessionBooking().getId());
        }
        if (source.getItems() != null) {
            source.getItems().stream()
                    .map(OpenBillItem::getSourceSessionBookingId)
                    .filter(Objects::nonNull)
                    .forEach(sessionIds::add);
        }
        return sessionIds;
    }

    private boolean openBillHasExplicitSessionPayee(OpenBill source, Long companyId) {
        if (source == null) return false;
        Set<Long> sessionIds = sourceSessionIds(source);
        if (sessionIds.isEmpty()) return false;
        return sessionBookings.findAllByCompanyIdAndIds(companyId, sessionIds).stream()
                .anyMatch(session -> {
                    if (session == null) return false;
                    if (session.isPayeeCustomData()) return true;
                    String explicitType = session.getPayeeType() == null ? null : session.getPayeeType().trim().toUpperCase(java.util.Locale.ROOT);
                    if (!"COMPANY".equals(explicitType)) return false;
                    ClientCompany payeeCompany = session.getPayeeCompany();
                    return payeeCompany == null || !payeeCompany.isBatchPaymentEnabled();
                });
    }

    private OpenBill moveOpenBillRowsIntoTarget(Long companyId, OpenBill source, OpenBill target, Long fallbackSessionId) {
        if (source == null || target == null || sameOpenBill(source, target)) {
            return target;
        }
        if (source.getId() == null) {
            return target;
        }

        Set<Long> movedSessionIds = source.getItems() == null
                ? Set.of()
                : source.getItems().stream()
                .map(item -> item.getSourceSessionBookingId() != null ? item.getSourceSessionBookingId() : fallbackSessionId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        mergeManualSessionNumbers(source, target);
        if ((target.getReference() == null || target.getReference().isBlank())
                && source.getReference() != null && !source.getReference().isBlank()) {
            target.setReference(source.getReference());
        }

        OpenBill savedTarget = openBillRepo.saveAndFlush(target);
        Long sourceOpenBillId = source.getId();
        Long targetOpenBillId = savedTarget.getId();

        // Hibernate orphanRemoval collections are intentionally not mutated here.
        // We first persist the batch target, clear the persistence context, and
        // then move the rows with bulk SQL. This prevents stale PersistentBag
        // snapshots from causing EntityEntry.getMaybeLazySet()/non-threadsafe
        // session failures when Open Bills is opened after enabling batch payment.
        entityManager.flush();
        entityManager.clear();

        openBillRepo.moveItemsToOpenBill(sourceOpenBillId, targetOpenBillId, fallbackSessionId, companyId);
        for (Long sessionId : movedSessionIds) {
            advanceAllocationRepo.reassignOpenBillForSession(companyId, sourceOpenBillId, targetOpenBillId, sessionId);
        }
        deleteAdvanceAllocationsForOpenBill(companyId, sourceOpenBillId);
        openBillRepo.deletePaymentSplitsByOpenBillIdAndCompanyId(sourceOpenBillId, companyId);
        openBillRepo.deleteByIdAndCompanyId(sourceOpenBillId, companyId);
        openBillRepo.flush();
        advanceAllocationRepo.flush();
        entityManager.clear();

        return openBillRepo.findByIdWithItemsForBatchSync(targetOpenBillId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private OpenBill newBatchOpenBillFromSource(OpenBill source, String batchScope, Long batchTargetClientId, Long batchTargetCompanyId) {
        var target = new OpenBill();
        target.setCompany(source.getCompany());
        target.setClient(source.getClient());
        target.setConsultant(source.getConsultant());
        target.setPaymentMethod(source.getPaymentMethod() != null ? source.getPaymentMethod() : resolveDefaultPaymentMethod(source.getCompany().getId()));
        target.setReference(source.getReference());
        target.setSessionBooking(null);
        target.setBatchScope(batchScope);
        target.setBatchTargetClientId(batchTargetClientId);
        target.setBatchTargetCompanyId(batchTargetCompanyId);
        target.setManualSplitLocked(false);
        target.setBillType(source.getBillType());
        target.setBookingGroupKey(source.getBookingGroupKey());
        return target;
    }

    private static void mergeManualSessionNumbers(OpenBill from, OpenBill to) {
        for (Long manualNo : parseManualSessionNumbers(from.getManualSessionNumbersCsv())) {
            appendManualSessionNumber(to, manualNo);
        }
    }

    private record PayeeResolution(ClientCompany linkedCompany, boolean companyTarget, boolean clientTarget) {}

    private PayeeResolution resolveSessionPayee(SessionBooking session, com.example.app.client.Client client) {
        String explicitType = session.getPayeeType() == null ? null : session.getPayeeType().trim().toUpperCase(java.util.Locale.ROOT);
        if ("COMPANY".equals(explicitType)) {
            ClientCompany payeeCompany = session.getPayeeCompany();
            if (session.isPayeeCustomData()) {
                return new PayeeResolution(payeeCompany, false, false);
            }
            boolean companyBatchEnabled = payeeCompany != null && payeeCompany.isBatchPaymentEnabled();
            return new PayeeResolution(payeeCompany, companyBatchEnabled, false);
        }
        if (session.isPayeeCustomData()) {
            return new PayeeResolution(null, false, false);
        }
        var linkedCompany = client.getBillingCompany();
        boolean companyBatchEnabled = linkedCompany != null && linkedCompany.isBatchPaymentEnabled();
        boolean clientBatchEnabled = !companyBatchEnabled && client.isBatchPaymentEnabled();
        return new PayeeResolution(linkedCompany, companyBatchEnabled, clientBatchEnabled);
    }

    private User resolveOpenBillConsultant(SessionBooking session, Long companyId) {
        if (session.getConsultant() != null) {
            return session.getConsultant();
        }
        return users.findAllByCompanyId(companyId).stream()
                .filter(User::isActive)
                .min(Comparator.comparing(User::getId))
                .orElse(null);
    }

    private OpenBill resolveSyncTargetOpenBill(
            SessionBooking session,
            com.example.app.client.Client client,
            User consultant,
            ClientCompany linkedCompany,
            boolean companyBatchEnabled,
            boolean clientBatchEnabled,
            OpenBill containingOpen,
            Long companyId
    ) {
        if (companyBatchEnabled) {
            return openBillRepo.findBatchByCompanyTarget(companyId, OpenBill.BATCH_SCOPE_COMPANY, linkedCompany.getId())
                    .orElseGet(() -> {
                        if (containingOpen != null
                                && OpenBill.BATCH_SCOPE_COMPANY.equals(containingOpen.getBatchScope())
                                && Objects.equals(containingOpen.getBatchTargetCompanyId(), linkedCompany.getId())) {
                            return containingOpen;
                        }
                        return newOpenBillSkeleton(session, client, consultant, null, OpenBill.BATCH_SCOPE_COMPANY, null, linkedCompany.getId());
                    });
        }
        if (clientBatchEnabled) {
            return openBillRepo.findBatchByClientTarget(companyId, OpenBill.BATCH_SCOPE_CLIENT, client.getId())
                    .orElseGet(() -> {
                        if (containingOpen != null
                                && OpenBill.BATCH_SCOPE_CLIENT.equals(containingOpen.getBatchScope())
                                && Objects.equals(containingOpen.getBatchTargetClientId(), client.getId())) {
                            return containingOpen;
                        }
                        return newOpenBillSkeleton(session, client, consultant, null, OpenBill.BATCH_SCOPE_CLIENT, client.getId(), null);
                    });
        }
        if (containingOpen != null) {
            return containingOpen;
        }
        return newOpenBillSkeleton(session, client, consultant, session, OpenBill.BATCH_SCOPE_NONE, null, null);
    }

    private OpenBill newOpenBillSkeleton(
            SessionBooking session,
            com.example.app.client.Client client,
            User consultant,
            SessionBooking singleSession,
            String batchScope,
            Long batchTargetClientId,
            Long batchTargetCompanyId
    ) {
        OpenBill open = new OpenBill();
        open.setCompany(session.getCompany());
        open.setClient(client);
        open.setConsultant(consultant);
        open.setPaymentMethod(resolveDefaultPaymentMethod(session.getCompany().getId()));
        open.setSessionBooking(singleSession);
        open.setBatchScope(batchScope);
        open.setBatchTargetClientId(batchTargetClientId);
        open.setBatchTargetCompanyId(batchTargetCompanyId);
        open.setBookingGroupKey(resolveBookingGroupKeyForOpenBill(session));
        return open;
    }

    private static String resolveBookingGroupKeyForOpenBill(SessionBooking session) {
        if (session == null) return null;
        String key = session.getBookingGroupKey();
        if (key != null && !key.isBlank()) return key;
        return null;
    }

    private boolean sameOpenBill(OpenBill a, OpenBill b) {
        return a != null && b != null && a.getId() != null && a.getId().equals(b.getId());
    }

    private boolean ensureSessionServiceLines(OpenBill open, SessionBooking session, Long companyId) {
        if (open == null || session == null) {
            return false;
        }

        boolean changed = false;
        SessionBooking billingSession = billingSourceSessionForPriceMode(session, companyId);
        Long sourceSessionId = billingSession == null ? null : billingSession.getId();
        if (sourceSessionId == null) {
            return false;
        }

        var expectedLinks = distinctLinkedServicesForBilling(billingSession);
        var expectedServiceIds = linkedServiceIds(expectedLinks);

        // TOTAL-priced group sessions must be charged once only: on the first billable
        // session row. If this sync is invoked for another participant row, remove any
        // old generated service lines for that row instead of adding another copy.
        if (isTotalPriceCalculation(session) && !Objects.equals(sourceSessionId, session.getId())) {
            return removeGeneratedSessionServiceLines(open, session.getId(), linkedServiceIds(distinctLinkedServicesForBilling(session)));
        }
        if (isTotalPriceCalculation(session)) {
            changed |= removeTotalPriceNonPrimaryLines(open, billingSession, companyId, expectedServiceIds);
        }

        if (isNoShowSession(billingSession)) {
            TransactionService noShowService = resolveNoShowTransactionService(companyId);
            BigDecimal price = noShowService.getNetPrice() == null ? BigDecimal.ZERO : noShowService.getNetPrice();
            OpenBillItem keptNoShowLine = null;
            var iterator = open.getItems().iterator();
            while (iterator.hasNext()) {
                var item = iterator.next();
                if (!Objects.equals(item.getSourceSessionBookingId(), sourceSessionId) || item.getSourceAdvanceBillId() != null) {
                    continue;
                }
                boolean isNoShowLine = item.getTransactionService() != null
                        && Objects.equals(item.getTransactionService().getId(), noShowService.getId());
                if (isNoShowLine && keptNoShowLine == null) {
                    keptNoShowLine = item;
                    if (!Objects.equals(item.getQuantity(), 1)) {
                        item.setQuantity(1);
                        changed = true;
                    }
                    if (!sameMoney(item.getNetPrice(), price)) {
                        item.setNetPrice(price);
                        changed = true;
                    }
                    continue;
                }
                iterator.remove();
                changed = true;
            }
            if (keptNoShowLine == null) {
                var obi = new OpenBillItem();
                obi.setOpenBill(open);
                obi.setTransactionService(entityManager.getReference(TransactionService.class, noShowService.getId()));
                obi.setQuantity(1);
                obi.setNetPrice(price);
                obi.setSourceSessionBookingId(sourceSessionId);
                obi.setSourceAdvanceBillId(null);
                open.getItems().add(obi);
                changed = true;
            }
            return changed;
        }

        Long configuredNoShowServiceId = resolveNoShowTransactionServiceId(companyId);
        if (configuredNoShowServiceId != null) {
            int before = open.getItems().size();
            open.getItems().removeIf(item -> Objects.equals(item.getSourceSessionBookingId(), sourceSessionId)
                    && item.getSourceAdvanceBillId() == null
                    && item.getTransactionService() != null
                    && Objects.equals(item.getTransactionService().getId(), configuredNoShowServiceId));
            changed |= open.getItems().size() != before;
        }

        changed |= ensureExpectedLinkedServiceLines(open, sourceSessionId, expectedLinks);
        return changed;
    }

    private boolean ensureExpectedLinkedServiceLines(OpenBill open, Long sourceSessionId, List<TypeTransactionService> expectedLinks) {
        boolean changed = false;
        for (TypeTransactionService link : expectedLinks) {
            var tx = link.getTransactionService();
            if (tx == null || tx.getId() == null) continue;
            var price = link.getPrice() != null ? link.getPrice() : tx.getNetPrice();
            if (price == null) {
                price = BigDecimal.ZERO;
            }

            OpenBillItem keptLine = null;
            var iterator = open.getItems().iterator();
            while (iterator.hasNext()) {
                var item = iterator.next();
                if (!Objects.equals(item.getSourceSessionBookingId(), sourceSessionId)
                        || item.getSourceAdvanceBillId() != null
                        || item.getTransactionService() == null
                        || !Objects.equals(item.getTransactionService().getId(), tx.getId())) {
                    continue;
                }
                if (keptLine == null) {
                    keptLine = item;
                    if (!Objects.equals(item.getQuantity(), 1)) {
                        item.setQuantity(1);
                        changed = true;
                    }
                    if (!sameMoney(item.getNetPrice(), price)) {
                        item.setNetPrice(price);
                        changed = true;
                    }
                    continue;
                }
                iterator.remove();
                changed = true;
            }

            if (keptLine == null) {
                var obi = new OpenBillItem();
                obi.setOpenBill(open);
                obi.setTransactionService(entityManager.getReference(TransactionService.class, tx.getId()));
                obi.setQuantity(1);
                obi.setNetPrice(price);
                obi.setSourceSessionBookingId(sourceSessionId);
                obi.setSourceAdvanceBillId(null);
                open.getItems().add(obi);
                changed = true;
            }
        }
        return changed;
    }

    private List<TypeTransactionService> distinctLinkedServicesForBilling(SessionBooking session) {
        if (session == null || session.getType() == null || session.getType().getLinkedServices() == null) {
            return List.of();
        }
        var byServiceId = new LinkedHashMap<Long, TypeTransactionService>();
        for (TypeTransactionService link : session.getType().getLinkedServices()) {
            if (link == null || link.getTransactionService() == null || link.getTransactionService().getId() == null) {
                continue;
            }
            byServiceId.putIfAbsent(link.getTransactionService().getId(), link);
        }
        return new ArrayList<>(byServiceId.values());
    }

    private Set<Long> linkedServiceIds(List<TypeTransactionService> links) {
        if (links == null || links.isEmpty()) {
            return Set.of();
        }
        return links.stream()
                .map(TypeTransactionService::getTransactionService)
                .filter(Objects::nonNull)
                .map(TransactionService::getId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
    }

    private boolean removeGeneratedSessionServiceLines(OpenBill open, Long sourceSessionId, Set<Long> transactionServiceIds) {
        if (open == null || open.getItems() == null || sourceSessionId == null || transactionServiceIds == null || transactionServiceIds.isEmpty()) {
            return false;
        }
        int before = open.getItems().size();
        open.getItems().removeIf(item -> Objects.equals(item.getSourceSessionBookingId(), sourceSessionId)
                && item.getSourceAdvanceBillId() == null
                && item.getTransactionService() != null
                && transactionServiceIds.contains(item.getTransactionService().getId()));
        return open.getItems().size() != before;
    }

    private boolean removeTotalPriceNonPrimaryLines(OpenBill open, SessionBooking billingSession, Long companyId, Set<Long> transactionServiceIds) {
        if (open == null || open.getItems() == null || billingSession == null || billingSession.getId() == null
                || transactionServiceIds == null || transactionServiceIds.isEmpty()) {
            return false;
        }
        String groupKey = bookingGroupKey(billingSession);
        if (groupKey == null || groupKey.isBlank()) {
            return false;
        }
        Set<Long> nonPrimarySessionIds = sessionBookings.findByBookingGroupKeyAndCompanyIdOrderByIdAsc(groupKey, companyId).stream()
                .map(SessionBooking::getId)
                .filter(Objects::nonNull)
                .filter(id -> !Objects.equals(id, billingSession.getId()))
                .collect(Collectors.toSet());
        if (nonPrimarySessionIds.isEmpty()) {
            return false;
        }
        int before = open.getItems().size();
        open.getItems().removeIf(item -> item.getSourceSessionBookingId() != null
                && nonPrimarySessionIds.contains(item.getSourceSessionBookingId())
                && item.getSourceAdvanceBillId() == null
                && item.getTransactionService() != null
                && transactionServiceIds.contains(item.getTransactionService().getId()));
        return open.getItems().size() != before;
    }

    private boolean isNoShowSession(SessionBooking session) {
        return session != null && SessionBookingStatus.NO_SHOW.equals(SessionBookingStatus.normalizeStored(session.getBookingStatus()));
    }

    private Long resolveNoShowTransactionServiceId(Long companyId) {
        if (companyId == null) return null;
        return settings.findByCompanyIdAndKey(companyId, SettingKey.NO_SHOW_TRANSACTION_SERVICE_ID)
                .map(setting -> parsePositiveLong(setting.getValue()))
                .orElse(null);
    }

    private Long parsePositiveLong(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            Long value = Long.parseLong(raw.trim());
            return value != null && value > 0 ? value : null;
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private TransactionService resolveNoShowTransactionService(Long companyId) {
        Long serviceId = resolveNoShowTransactionServiceId(companyId);
        if (serviceId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Configure a NO SHOW transaction service in Service type > Transaction services first.");
        }
        return txRepo.findByIdAndCompanyId(serviceId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Configured NO SHOW transaction service was not found."));
    }

    private SessionBooking billingSourceSessionForPriceMode(SessionBooking session, Long companyId) {
        if (!isTotalPriceCalculation(session)) return session;
        String groupKey = bookingGroupKey(session);
        return sessionBookings.findByBookingGroupKeyAndCompanyIdOrderByIdAsc(groupKey, companyId).stream()
                .filter(row -> row.getClient() != null)
                .filter(row -> !"CANCELLED".equalsIgnoreCase(String.valueOf(row.getBookingStatus())))
                .findFirst()
                .orElse(session);
    }

    private Long billingSourceSessionIdForPriceMode(SessionBooking session) {
        return session == null ? null : session.getId();
    }

    private boolean isTotalPriceCalculation(SessionBooking session) {
        return session != null
                && session.getType() != null
                && session.getType().getPriceCalculationMode() == SessionPriceCalculationMode.TOTAL;
    }

    private static String bookingGroupKey(SessionBooking session) {
        if (session != null && session.getBookingGroupKey() != null && !session.getBookingGroupKey().isBlank()) {
            return session.getBookingGroupKey();
        }
        return session == null || session.getId() == null ? "" : "legacy-" + session.getId();
    }

    private boolean ensureAdvanceOffsetLines(OpenBill open, SessionBooking session, Long companyId) {
        boolean changed = false;
        var advances = billRepo.findAllByCompanyIdAndSourceSessionIdSnapshotAndBillTypeOrderByIdAsc(companyId, session.getId(), BillType.ADVANCE);
        for (Bill advance : advances) {
            if (!BillPaymentStatus.PAID.equals(advance.getPaymentStatus())) continue;
            for (var billItem : advance.getItems()) {
                if (billItem.getTransactionService() == null) continue;
                var negativeNet = (billItem.getNetPrice() == null ? BigDecimal.ZERO : billItem.getNetPrice()).negate();
                boolean exists = open.getItems().stream().anyMatch(item -> Objects.equals(item.getSourceAdvanceBillId(), advance.getId())
                        && Objects.equals(item.getSourceSessionBookingId(), session.getId())
                        && item.getTransactionService() != null
                        && Objects.equals(item.getTransactionService().getId(), billItem.getTransactionService().getId())
                        && sameMoney(item.getNetPrice(), negativeNet)
                        && Objects.equals(item.getQuantity(), billItem.getQuantity()));
                if (!exists) {
                    var obi = new OpenBillItem();
                    obi.setOpenBill(open);
                    obi.setTransactionService(entityManager.getReference(TransactionService.class, billItem.getTransactionService().getId()));
                    obi.setQuantity(billItem.getQuantity());
                    obi.setNetPrice(negativeNet);
                    obi.setSourceSessionBookingId(session.getId());
                    obi.setSourceAdvanceBillId(advance.getId());
                    open.getItems().add(obi);
                    changed = true;
                }
            }
        }
        return changed;
    }

    private boolean sameMoney(BigDecimal a, BigDecimal b) {
        if (a == null && b == null) return true;
        if (a == null || b == null) return false;
        return a.compareTo(b) == 0;
    }

    private List<OpenBillResponse> toOpenBillResponses(List<OpenBill> openBills, Long companyId) {
        Set<Long> sessionIds = openBills.stream()
                .flatMap(open -> {
                    var itemSessionIds = open.getItems().stream()
                            .map(OpenBillItem::getSourceSessionBookingId)
                            .filter(Objects::nonNull)
                            .filter(sourceSessionId -> !isManualOpenBillLineSourceId(sourceSessionId));
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
        Set<Long> advanceBillIds = openBills.stream()
                .flatMap(open -> open.getItems().stream())
                .map(OpenBillItem::getSourceAdvanceBillId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<Long, String> advanceBillNumbersById = new HashMap<>();
        if (!advanceBillIds.isEmpty()) {
            billRepo.findAllByCompanyIdAndIdIn(companyId, advanceBillIds).forEach(b ->
                    advanceBillNumbersById.put(b.getId(), b.getBillNumber() == null ? String.valueOf(b.getId()) : b.getBillNumber())
            );
        }
        final Map<Long, String> advanceBillNoLookup = advanceBillNumbersById;
        return openBills.stream()
                .map(open -> toOpenBillResponse(open, sessionLookup, advanceBillNoLookup))
                .toList();
    }

    private OpenBillResponse toOpenBillResponse(OpenBill o, Map<Long, SessionBooking> sessionsById, Map<Long, String> advanceBillNumbersById) {
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
            String description = tx.getDescription() == null ? "" : tx.getDescription();
            Long advId = obi.getSourceAdvanceBillId();
            if (advId != null) {
                String billNo = advanceBillNumbersById.get(advId);
                if (billNo != null && !billNo.isBlank()) {
                    description = description + " (Bill No " + billNo + ")";
                }
            }
            var ss = new ServiceSummary(tx.getId(), tx.getCode(), description, tx.getTaxRate(), tx.getNetPrice());
            return new OpenBillItemResponse(obi.getId(), ss, obi.getQuantity(), obi.getNetPrice(), obi.getSourceSessionBookingId(), obi.getSourceAdvanceBillId());
        }).toList();

        Map<Long, BigDecimal> sessionNetTotals = new HashMap<>();
        Map<Long, BigDecimal> sessionGrossTotals = new HashMap<>();
        Map<Long, Integer> sessionLineCounts = new HashMap<>();
        for (var item : o.getItems()) {
            Long groupingSessionId = item.getSourceSessionBookingId();
            if (isManualOpenBillLineSourceId(groupingSessionId)) continue;
            if (groupingSessionId == null && o.getSessionBooking() != null) {
                groupingSessionId = o.getSessionBooking().getId();
            }
            if (groupingSessionId == null) continue;
            var tx = item.getTransactionService();
            if (tx == null) continue;
            int qty = item.getQuantity() == null ? 1 : item.getQuantity();
            BigDecimal net = (item.getNetPrice() == null ? BigDecimal.ZERO : item.getNetPrice())
                    .multiply(BigDecimal.valueOf(qty))
                    .setScale(2, RoundingMode.HALF_UP);
            BigDecimal grossSingle = (item.getNetPrice() == null ? BigDecimal.ZERO : item.getNetPrice())
                    .add((item.getNetPrice() == null ? BigDecimal.ZERO : item.getNetPrice()).multiply(tx.getTaxRate().multiplier))
                    .setScale(2, RoundingMode.HALF_UP);
            BigDecimal gross = grossSingle.multiply(BigDecimal.valueOf(qty)).setScale(2, RoundingMode.HALF_UP);
            sessionNetTotals.merge(groupingSessionId, net, BigDecimal::add);
            sessionGrossTotals.merge(groupingSessionId, gross, BigDecimal::add);
            sessionLineCounts.merge(groupingSessionId, 1, Integer::sum);
        }

        Map<Long, OpenBillSessionSummary> grouped = new LinkedHashMap<>();
        for (var item : o.getItems()) {
            if (item.getSourceSessionBookingId() == null || isManualOpenBillLineSourceId(item.getSourceSessionBookingId())) continue;
            var session = sessionsById.get(item.getSourceSessionBookingId());
            if (session == null) continue;
            grouped.putIfAbsent(session.getId(), new OpenBillSessionSummary(
                    session.getId(),
                    "#" + session.getId(),
                    formatSessionInfo(session),
                    bookingGroupKey(session),
                    deriveOpenBillSessionLifecycleStatus(session),
                    session.getClient() == null ? "Unknown client" : (session.getClient().getFirstName() + " " + session.getClient().getLastName()).trim(),
                    session.getConsultant() == null ? "Unassigned" : (session.getConsultant().getFirstName() + " " + session.getConsultant().getLastName()).trim(),
                    sessionNetTotals.getOrDefault(session.getId(), BigDecimal.ZERO),
                    sessionGrossTotals.getOrDefault(session.getId(), BigDecimal.ZERO),
                    sessionLineCounts.getOrDefault(session.getId(), 0)
            ));
        }
        if (grouped.isEmpty() && o.getSessionBooking() != null) {
            var s = o.getSessionBooking();
            grouped.put(s.getId(), new OpenBillSessionSummary(
                    s.getId(),
                    "#" + s.getId(),
                    formatSessionInfo(s),
                    bookingGroupKey(s),
                    deriveOpenBillSessionLifecycleStatus(s),
                    s.getClient() == null ? "Unknown client" : (s.getClient().getFirstName() + " " + s.getClient().getLastName()).trim(),
                    s.getConsultant() == null ? "Unassigned" : (s.getConsultant().getFirstName() + " " + s.getConsultant().getLastName()).trim(),
                    sessionNetTotals.getOrDefault(s.getId(), BigDecimal.ZERO),
                    sessionGrossTotals.getOrDefault(s.getId(), BigDecimal.ZERO),
                    sessionLineCounts.getOrDefault(s.getId(), 0)
            ));
        }

        for (Long manualNo : parseManualSessionNumbers(o.getManualSessionNumbersCsv())) {
            Long syntheticId = -manualNo;
            grouped.putIfAbsent(syntheticId, new OpenBillSessionSummary(
                    syntheticId,
                    "#M" + manualNo,
                    "Manual open bill",
                    null,
                    null,
                    clientSummary == null ? "Unknown client" : (clientSummary.firstName() + " " + clientSummary.lastName()).trim(),
                    consultantSummary == null ? "Unassigned" : (consultantSummary.firstName() + " " + consultantSummary.lastName()).trim(),
                    sessionNetTotals.getOrDefault(syntheticId, BigDecimal.ZERO),
                    sessionGrossTotals.getOrDefault(syntheticId, BigDecimal.ZERO),
                    sessionLineCounts.getOrDefault(syntheticId, 0)
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
                o.getReference(),
                items,
                sessionDisplayId,
                sessionInfo,
                o.getBatchScope(),
                o.getBatchTargetClientId(),
                o.getBatchTargetCompanyId(),
                o.getBillType() == null ? null : o.getBillType().name(),
                o.getBookingGroupKey(),
                toOpenBillPaymentSplitResponses(o, estimateOpenBillGross(o)),
                sessions
        );
    }

    private static String deriveOpenBillSessionLifecycleStatus(SessionBooking session) {
        if (session == null || session.getStartTime() == null || session.getEndTime() == null) {
            return null;
        }
        return SessionBookingStatus.deriveLifecycleStatus(
                session.getStartTime(),
                session.getEndTime(),
                session.getBookingStatus(),
                LocalDateTime.now()
        );
    }

    private static String formatSessionInfo(SessionBooking session) {
        if (session == null || session.getStartTime() == null) return "";
        return session.getStartTime().toLocalDate() + " " + session.getStartTime().toLocalTime().toString().substring(0, 5);
    }

    /**
     * Accepts real {@link SessionBooking} ids, line-item {@link OpenBillItem#getSourceSessionBookingId()},
     * and manual open-bill synthetic ids ({@code -manualNo}, see {@link #toOpenBillResponse}).
     */
    private static boolean openBillContainsSessionTarget(OpenBill openBill, Long sessionId) {
        if (sessionId == null) {
            return false;
        }
        if (openBill.getSessionBooking() != null && Objects.equals(openBill.getSessionBooking().getId(), sessionId)) {
            return true;
        }
        if (openBill.getItems().stream().anyMatch(item -> Objects.equals(item.getSourceSessionBookingId(), sessionId))) {
            return true;
        }
        if (sessionId < 0) {
            long manualNo = -sessionId;
            return parseManualSessionNumbers(openBill.getManualSessionNumbersCsv()).contains(manualNo);
        }
        return false;
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

    private static void removeManualSessionNumber(OpenBill open, long manualNo) {
        var remaining = parseManualSessionNumbers(open.getManualSessionNumbersCsv()).stream()
                .filter(value -> value != manualNo)
                .toList();
        open.setManualSessionNumbersCsv(remaining.stream().map(String::valueOf).collect(Collectors.joining(",")));
    }

    @PostMapping("/bills")
    @Transactional
    public BillResponse createBill(@RequestBody BillRequest request, @AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var bill = new Bill();
        bill.setCompany(me.getCompany());
        String billNumber = nextInvoiceNumber(companyId);
        bill.setBillNumber(billNumber);
        BillType requestedBillType = resolveRequestedBillType(request.billType());
        bill.setBillType(requestedBillType);
        Set<Long> allowedAdvanceServiceIds = requestedBillType == BillType.ADVANCE
                ? resolveAdvanceDeductionServiceIds(companyId)
                : Set.of();
        if (requestedBillType == BillType.ADVANCE && allowedAdvanceServiceIds.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No transaction services are configured for ADVANCE bills.");
        }
        com.example.app.client.Client client = null;
        if (request.clientId() != null && request.clientId() > 0) {
            client = clients.findByIdAndCompanyId(request.clientId(), companyId).orElseThrow();
        }
        String requestedTarget = request.billingTarget() == null ? "PERSON" : request.billingTarget().trim().toUpperCase();
        SessionBooking selectedSession = null;
        if (request.sessionId() != null && request.sessionId() > 0) {
            selectedSession = sessionBookings.findByIdAndCompanyId(request.sessionId(), companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid sessionId."));
            if (selectedSession.getClient() == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected session has no client.");
            }
            if (client != null && !Objects.equals(client.getId(), selectedSession.getClient().getId())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected session does not belong to the selected client.");
            }
            client = selectedSession.getClient();
        }
        if ("PERSON".equals(requestedTarget) && client == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Client is required for individual billing.");
        }
        if (selectedSession != null) {
            bill.setSourceSessionIdSnapshot(selectedSession.getId());
        }
        bill.setClient(client);
        if (client != null) {
            setBillClientSnapshot(bill, client);
        } else {
            bill.setClientFirstNameSnapshot("");
            bill.setClientLastNameSnapshot("");
        }
        var recipientCompany = resolveBillRecipientCompany(request, client, companyId);
        if (selectedSession != null && recipientCompany != null) {
            var selectedBillingCompany = selectedSession.getClient().getBillingCompany();
            var selectedGroupCompany = selectedSession.getSessionGroupBillingCompany();
            boolean matchesCompany = (selectedBillingCompany != null && Objects.equals(selectedBillingCompany.getId(), recipientCompany.getId()))
                    || (selectedGroupCompany != null && Objects.equals(selectedGroupCompany.getId(), recipientCompany.getId()));
            if (!matchesCompany) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected session does not belong to the selected company.");
            }
        }
        if (recipientCompany == null) {
            setBillRecipientPersonSnapshot(bill);
        } else {
            setBillRecipientCompanySnapshot(bill, recipientCompany);
        }
        bill.setConsultant(request.consultantId() != null ? users.findByIdAndCompanyId(request.consultantId(), companyId).orElseThrow() : me);
        bill.setPaymentMethod(resolvePaymentMethod(request.paymentMethodId(), companyId));
        bill.setBankTransferReference(request.bankTransferReference() == null ? null : request.bankTransferReference().trim());
        bill.setIssueDate(LocalDate.now());
        bill.setPaymentStatus(resolveInitialPaymentStatus(bill.getPaymentMethod()));
        if (BillPaymentStatus.PAID.equals(bill.getPaymentStatus())) {
            bill.setPaidAt(OffsetDateTime.now());
        }

        BigDecimal totalNet = BigDecimal.ZERO;
        BigDecimal totalGross = BigDecimal.ZERO;
        for (var req : request.items()) {
            if (requestedBillType == BillType.ADVANCE) {
                Long txId = req == null ? null : req.transactionServiceId();
                if (txId == null || !allowedAdvanceServiceIds.contains(txId)) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "ADVANCE bills can only use transaction services marked for advance deduction.");
                }
            }
            var tx = txRepo.findByIdAndCompanyId(req.transactionServiceId(), companyId).orElseThrow();
            var item = new BillItem();
            item.setBill(bill);
            item.setTransactionService(tx);
            item.setQuantity(req.quantity());
            var net = req.netPrice() == null ? tx.getNetPrice() : req.netPrice();
            item.setNetPrice(net);
            item.setSourceSessionBookingId(resolveInvoiceLineSourceSessionId(
                    req.sourceSessionBookingId(),
                    selectedSession != null ? selectedSession.getId() : null));
            var grossSingle = net.add(net.multiply(tx.getTaxRate().multiplier)).setScale(2, RoundingMode.HALF_UP);
            item.setGrossPrice(grossSingle.multiply(BigDecimal.valueOf(req.quantity())));
            totalNet = totalNet.add(net.multiply(BigDecimal.valueOf(req.quantity())));
            totalGross = totalGross.add(item.getGrossPrice());
            bill.getItems().add(item);
        }
        if (request.applyUnusedAdvanceBillId() != null || request.applyUnusedAdvanceAmountGross() != null) {
            if (requestedBillType != BillType.INVOICE) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unused deposits can be applied only to INVOICE.");
            }
            if (request.applyUnusedAdvanceBillId() == null || request.applyUnusedAdvanceAmountGross() == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "applyUnusedAdvanceBillId and applyUnusedAdvanceAmountGross must be provided together.");
            }
            BigDecimal applyAmountGross = request.applyUnusedAdvanceAmountGross().setScale(2, RoundingMode.HALF_UP);
            if (applyAmountGross.compareTo(BigDecimal.ZERO) <= 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "applyUnusedAdvanceAmountGross must be > 0.");
            }
            if (applyAmountGross.compareTo(totalGross.setScale(2, RoundingMode.HALF_UP)) > 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unused deposit amount cannot exceed the invoice amount.");
            }
            Bill advance = billRepo.findByIdAndCompanyId(request.applyUnusedAdvanceBillId(), companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Advance bill not found."));
            if (advance.getBillType() != BillType.ADVANCE) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected bill is not an advance.");
            }
            if (!BillPaymentStatus.PAID.equals(advance.getPaymentStatus())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only paid advances can be applied.");
            }
            BigDecimal remainingNet = computeRemainingAdvanceNet(companyId, advance).setScale(2, RoundingMode.HALF_UP);
            if (remainingNet.compareTo(BigDecimal.ZERO) <= 0) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Advance is already fully used.");
            }
            var deductionService = resolveAdvanceDeductionService(companyId);
            BigDecimal divisor = BigDecimal.ONE.add(deductionService.getTaxRate().multiplier);
            BigDecimal applyAmountNet = applyAmountGross.divide(divisor, 2, RoundingMode.HALF_UP);
            if (applyAmountNet.compareTo(remainingNet) > 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Requested unused deposit amount exceeds remaining advance.");
            }
            var depositItem = new BillItem();
            depositItem.setBill(bill);
            depositItem.setTransactionService(deductionService);
            depositItem.setQuantity(1);
            depositItem.setNetPrice(applyAmountNet.negate());
            depositItem.setGrossPrice(applyAmountGross.negate());
            depositItem.setSourceSessionBookingId(selectedSession != null ? selectedSession.getId() : null);
            depositItem.setSourceAdvanceBillId(advance.getId());
            totalNet = totalNet.add(depositItem.getNetPrice());
            totalGross = totalGross.add(depositItem.getGrossPrice());
            bill.getItems().add(depositItem);
        }
        bill.setTotalNet(totalNet);
        bill.setTotalGross(totalGross);
        if (request.paymentSplits() != null) {
            replaceBillPaymentSplits(bill, request.paymentSplits(), companyId, totalGross);
            bill.setPaymentStatus(resolveInitialPaymentStatus(bill.getPaymentMethod()));
            bill.setPaidAt(BillPaymentStatus.PAID.equals(bill.getPaymentStatus()) ? OffsetDateTime.now() : null);
        }
        invoiceOrderIdService.assignIfMissing(bill);
        // Ensure we map within an open session. Items are cascade-persisted.
        var saved = billRepo.save(bill);
        if (shouldFiscalizeOnBillCreate(saved.getPaymentMethod())) {
            saved = fiscalizationService.fiscalizeBill(saved, companyId);
        }

        if (selectedSession != null) {
            selectedSession.setBilledAt(LocalDate.now());
            sessionBookings.save(selectedSession);
        }

        tryArchiveInvoicePdfAfterCreate(saved, companyId);
        return toResponse(saved);
    }


    @PostMapping("/bills/{id}/refund")
    @Transactional
    public BillResponse refundBill(@PathVariable Long id, @AuthenticationPrincipal User me) {
        Long companyId = me.getCompany().getId();
        Bill original = billRepo.findByIdAndCompanyId(id, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (original.getRefundOfBillId() != null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Refund invoices cannot be refunded again.");
        }
        if (original.getTotalGross() == null || original.getTotalGross().compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only positive invoices can be refunded.");
        }
        if (!BillPaymentStatus.PAID.equals(original.getPaymentStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only paid invoices can be refunded.");
        }
        billRepo.findFirstByCompanyIdAndRefundOfBillId(companyId, original.getId()).ifPresent(existing -> {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This invoice has already been refunded.");
        });

        Bill refund = new Bill();
        refund.setCompany(original.getCompany());
        refund.setBillNumber(nextInvoiceNumber(companyId));
        refund.setBillType(BillType.INVOICE);
        refund.setClient(original.getClient());
        refund.setClientFirstNameSnapshot(original.getClientFirstNameSnapshot());
        refund.setClientLastNameSnapshot(original.getClientLastNameSnapshot());
        copyRecipientSnapshot(original, refund);
        refund.setConsultant(original.getConsultant());
        refund.setPaymentMethod(original.getPaymentMethod());
        copyRefundPaymentSplits(original, refund);
        refund.setIssueDate(LocalDate.now());
        refund.setPaymentStatus(BillPaymentStatus.PAID);
        refund.setPaidAt(OffsetDateTime.now());
        refund.setSourceSessionIdSnapshot(original.getSourceSessionIdSnapshot());
        refund.setRefundOfBillId(original.getId());
        refund.setRefundReference("Refund of " + (original.getBillNumber() == null ? original.getId() : original.getBillNumber()));

        BigDecimal totalNet = BigDecimal.ZERO;
        BigDecimal totalGross = BigDecimal.ZERO;
        for (BillItem originalItem : original.getItems()) {
            BillItem refundItem = new BillItem();
            refundItem.setBill(refund);
            refundItem.setTransactionService(originalItem.getTransactionService());
            refundItem.setQuantity(originalItem.getQuantity());
            refundItem.setNetPrice(safeMoney(originalItem.getNetPrice()).negate());
            refundItem.setGrossPrice(safeMoney(originalItem.getGrossPrice()).negate());
            refundItem.setSourceSessionBookingId(originalItem.getSourceSessionBookingId());
            refundItem.setSourceAdvanceBillId(originalItem.getSourceAdvanceBillId());
            totalNet = totalNet.add(refundItem.getNetPrice().multiply(BigDecimal.valueOf(refundItem.getQuantity() == null ? 1 : refundItem.getQuantity())));
            totalGross = totalGross.add(refundItem.getGrossPrice());
            refund.getItems().add(refundItem);
        }
        refund.setTotalNet(totalNet.setScale(2, RoundingMode.HALF_UP));
        refund.setTotalGross(totalGross.setScale(2, RoundingMode.HALF_UP));
        invoiceOrderIdService.assignIfMissing(refund);

        Bill saved = billRepo.saveAndFlush(refund);
        if (shouldFiscalizeOnBillCreate(saved.getPaymentMethod())) {
            saved = fiscalizationService.fiscalizeBill(saved, companyId);
        }
        tryArchiveInvoicePdfAfterCreate(saved, companyId);
        createGuestRefundOrderIfApplicable(original, saved);
        return toResponse(saved);
    }

    @GetMapping("/unused-advances")
    @Transactional(readOnly = true)
    public List<UnusedAdvanceResponse> unusedAdvances(@AuthenticationPrincipal User me) {
        Long companyId = me.getCompany().getId();
        return billRepo.findAllByCompanyIdAndBillTypeOrderByIssueDateDescIdDesc(companyId, BillType.ADVANCE).stream()
                .map(advance -> toUnusedAdvanceResponse(companyId, advance))
                .filter(advance -> advance.remainingNet().compareTo(BigDecimal.ZERO) > 0)
                .toList();
    }

    @PostMapping("/unused-advances/apply")
    @Transactional
    public ApplyUnusedAdvanceResponse applyUnusedAdvance(@RequestBody ApplyUnusedAdvanceRequest request, @AuthenticationPrincipal User me) {
        if (request == null || request.advanceBillId() == null || request.openBillId() == null || request.sessionId() == null || request.applyAmountNet() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "advanceBillId, openBillId, sessionId and applyAmountNet are required.");
        }
        Long companyId = me.getCompany().getId();
        BigDecimal applyAmountNet = request.applyAmountNet().setScale(2, RoundingMode.HALF_UP);
        if (applyAmountNet.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "applyAmountNet must be > 0.");
        }

        Bill advance = billRepo.findByIdAndCompanyId(request.advanceBillId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Advance bill not found."));
        if (advance.getBillType() != BillType.ADVANCE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected bill is not an advance.");
        }
        if (!BillPaymentStatus.PAID.equals(advance.getPaymentStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only paid advances can be applied.");
        }

        OpenBill openBill = openBillRepo.findById(request.openBillId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Open bill not found."));
        if (!companyId.equals(openBill.getCompany().getId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Open bill not found.");
        }
        // Avoid mutating a partially hydrated items bag (JOIN FETCH + DISTINCT pitfalls); orphanRemoval would delete missing rows on save.
        Hibernate.initialize(openBill.getItems());
        if (!openBillContainsSessionTarget(openBill, request.sessionId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected sessionId is not part of the target open bill.");
        }

        BigDecimal remaining = computeRemainingAdvanceNet(companyId, advance);
        if (remaining.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Advance is already fully used.");
        }
        if (applyAmountNet.compareTo(remaining) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "applyAmountNet exceeds remaining advance amount.");
        }

        var deductionService = resolveAdvanceDeductionService(companyId);
        BigDecimal applyAmountGross = applyAmountNet
                .multiply(BigDecimal.ONE.add(deductionService.getTaxRate().multiplier))
                .setScale(2, RoundingMode.HALF_UP);
        BigDecimal targetTransactionGross = computeOpenBillSessionTransactionGross(openBill, request.sessionId());
        if (targetTransactionGross.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Target open bill session has no transaction services to cover.");
        }
        if (applyAmountGross.compareTo(targetTransactionGross) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unused deposit amount cannot exceed the target open bill amount.");
        }

        var openItem = new OpenBillItem();
        openItem.setOpenBill(openBill);
        openItem.setTransactionService(deductionService);
        openItem.setQuantity(1);
        openItem.setNetPrice(applyAmountNet.negate());
        openItem.setSourceSessionBookingId(request.sessionId());
        openItem.setSourceAdvanceBillId(advance.getId());
        openBill.getItems().add(openItem);
        openBillRepo.save(openBill);

        var allocation = new AdvanceAllocation();
        allocation.setCompany(openBill.getCompany());
        allocation.setAdvanceBill(advance);
        allocation.setOpenBill(openBill);
        allocation.setSessionBookingId(request.sessionId());
        allocation.setTransactionService(deductionService);
        allocation.setAmountNet(applyAmountNet);
        advanceAllocationRepo.save(allocation);

        BigDecimal remainingAfter = computeRemainingAdvanceNet(companyId, advance).setScale(2, RoundingMode.HALF_UP);
        return new ApplyUnusedAdvanceResponse(openBill.getId(), advance.getId(), remainingAfter);
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
            billFolioPdfService.ensureOwnBankTransferSettings(companyId);
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
            byte[] folioPdf = billFolioPdfService.generate(bill, companyId);
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
        boolean alreadyPaid = BillPaymentStatus.PAID.equals(bill.getPaymentStatus());
        bill.setPaymentStatus(BillPaymentStatus.PAID);
        if (bill.getPaidAt() == null) {
            bill.setPaidAt(OffsetDateTime.now());
        }
        bill = billRepo.save(bill);
        if (!alreadyPaid) {
            events.publishEvent(new BillPaidEvent(bill.getId(), companyId));
        }
        return toResponse(bill);
    }


    @PostMapping("/bills/{id}/resend")
    @Transactional(readOnly = true)
    public Map<String, String> resendBillPdf(@PathVariable Long id,
                                             @RequestParam(value = "locale", required = false) String locale,
                                             @AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var bill = ensureSnapshotBackfilled(billRepo.findByIdAndCompanyId(id, companyId).orElseThrow());
        if (BillPaymentStatus.CANCELLED.equals(bill.getPaymentStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cancelled bill cannot be resent.");
        }
        byte[] pdf = billFolioPdfService.generate(bill, companyId, locale);
        billingEmailService.sendInvoiceFolio(bill, pdf);
        return Map.of("status", "sent");
    }

    @GetMapping(value = "/bills/{id}/pdf", produces = MediaType.APPLICATION_PDF_VALUE)
    @Transactional(readOnly = true)
    public ResponseEntity<byte[]> billPdf(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var bill = ensureSnapshotBackfilled(billRepo.findByIdAndCompanyId(id, companyId).orElseThrow());
        byte[] pdf = invoicePdfS3Service.downloadIfPresent(bill);
        if (pdf == null) {
            pdf = billFolioPdfService.generate(bill, companyId);
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + bill.getBillNumber() + ".pdf\"")
                .contentType(MediaType.APPLICATION_PDF)
                .body(pdf);
    }

    @GetMapping(value = "/bills/{id}/folio-pdf", produces = MediaType.APPLICATION_PDF_VALUE)
    @Transactional(readOnly = true)
    public ResponseEntity<byte[]> billFolioPdf(@PathVariable Long id,
                                               @RequestParam(value = "locale", required = false) String locale,
                                               @AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var bill = ensureSnapshotBackfilled(billRepo.findByIdAndCompanyId(id, companyId).orElseThrow());
        byte[] pdf = billFolioPdfService.generate(bill, companyId, locale);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "inline; filename=\"folio-" + bill.getBillNumber() + ".pdf\"")
                .contentType(MediaType.APPLICATION_PDF)
                .body(pdf);
    }

    private String settingValue(Long companyId, SettingKey key) {
        return settings.findByCompanyIdAndKey(companyId, key)
                .map(s -> s.getValue() == null ? "" : s.getValue())
                .orElse("");
    }

    private UnusedAdvanceResponse toUnusedAdvanceResponse(Long companyId, Bill advance) {
        BigDecimal total = (advance.getTotalNet() == null ? BigDecimal.ZERO : advance.getTotalNet()).setScale(2, RoundingMode.HALF_UP);
        BigDecimal used = totalAdvanceConsumedNet(companyId, advance.getId()).setScale(2, RoundingMode.HALF_UP);
        BigDecimal remaining = total.subtract(used).setScale(2, RoundingMode.HALF_UP);
        BigDecimal totalGross = (advance.getTotalGross() == null ? BigDecimal.ZERO : advance.getTotalGross()).setScale(2, RoundingMode.HALF_UP);
        BigDecimal remainingGross = total.compareTo(BigDecimal.ZERO) > 0
                ? remaining.multiply(totalGross).divide(total, 2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        BigDecimal usedGross = totalGross.subtract(remainingGross).setScale(2, RoundingMode.HALF_UP);
        var c = advance.getClient();
        var clientSummary = c == null
                ? null
                : new ClientSummary(c.getId(), snapshotFirstName(advance), snapshotLastName(advance), c.getEmail(), c.getPhone());
        var recipientCompanySummary = toRecipientCompanySummary(advance);
        String billingTarget = isCompanyRecipient(advance) ? "COMPANY" : "PERSON";
        return new UnusedAdvanceResponse(
                advance.getId(),
                advance.getBillNumber(),
                advance.getSourceSessionIdSnapshot(),
                clientSummary,
                recipientCompanySummary,
                billingTarget,
                advance.getIssueDate(),
                total,
                used,
                remaining,
                totalGross,
                usedGross,
                remainingGross
        );
    }

    private BigDecimal computeRemainingAdvanceNet(Long companyId, Bill advance) {
        BigDecimal total = advance.getTotalNet() == null ? BigDecimal.ZERO : advance.getTotalNet();
        BigDecimal used = totalAdvanceConsumedNet(companyId, advance.getId());
        return total.subtract(used);
    }

    /** Open-bill allocations plus folio lines that carried {@link BillItem#getSourceAdvanceBillId()} when the open bill was closed. */
    private BigDecimal totalAdvanceConsumedNet(Long companyId, Long advanceBillId) {
        BigDecimal fromAllocations = advanceAllocationRepo.sumAmountNetByCompanyIdAndAdvanceBillId(companyId, advanceBillId);
        BigDecimal fromFolio = advanceAllocationRepo.sumConsumedFromFolioByAdvanceBillId(companyId, advanceBillId);
        BigDecimal a = fromAllocations == null ? BigDecimal.ZERO : fromAllocations;
        BigDecimal b = fromFolio == null ? BigDecimal.ZERO : fromFolio;
        return a.add(b);
    }

    private void deleteAdvanceAllocationsForOpenBill(Long companyId, Long openBillId) {
        if (openBillId == null) {
            return;
        }
        advanceAllocationRepo.deleteByCompanyIdAndOpenBillId(companyId, openBillId);
    }

    private TransactionService resolveAdvanceDeductionService(Long companyId) {
        Set<Long> ids = resolveAdvanceDeductionServiceIds(companyId);
        if (ids.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing setting ADVANCE_DEDUCTION_TRANSACTION_SERVICE_ID.");
        }
        Long serviceId = ids.iterator().next();
        return txRepo.findByIdAndCompanyId(serviceId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Configured advance deduction service was not found."));
    }

    private Set<Long> resolveAdvanceDeductionServiceIds(Long companyId) {
        String raw = settingValue(companyId, SettingKey.ADVANCE_DEDUCTION_TRANSACTION_SERVICE_ID);
        if (raw == null || raw.isBlank()) {
            return Set.of();
        }
        Set<Long> ids = new java.util.LinkedHashSet<>();
        for (String part : raw.split(",")) {
            String token = part == null ? "" : part.trim();
            if (token.isBlank()) continue;
            long parsed;
            try {
                parsed = Long.parseLong(token);
            } catch (NumberFormatException ex) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid ADVANCE_DEDUCTION_TRANSACTION_SERVICE_ID setting.");
            }
            if (parsed > 0) {
                ids.add(parsed);
            }
        }
        return ids;
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
            return new BillItemResponse(item.getId(), serviceSummary, item.getQuantity(), item.getNetPrice(), item.getGrossPrice(), item.getSourceSessionBookingId());
        }).toList();

        return new BillResponse(
                bill.getId(),
                bill.getBillNumber(),
                bill.getOrderId(),
                bill.getOrderCounter(),
                bill.getBillType() == null ? BillType.INVOICE.name() : bill.getBillType().name(),
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
                bill.getRefundOfBillId(),
                bill.getRefundReference(),
                bill.getBankTransferReference(),
                toBillPaymentSplitResponses(bill),
                items
        );
    }


    private static BigDecimal safeMoney(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private static void copyRecipientSnapshot(Bill source, Bill target) {
        target.setRecipientTypeSnapshot(source.getRecipientTypeSnapshot());
        target.setRecipientPersonEmailSnapshot(source.getRecipientPersonEmailSnapshot());
        target.setRecipientCompanyIdSnapshot(source.getRecipientCompanyIdSnapshot());
        target.setRecipientCompanyNameSnapshot(source.getRecipientCompanyNameSnapshot());
        target.setRecipientCompanyAddressSnapshot(source.getRecipientCompanyAddressSnapshot());
        target.setRecipientCompanyPostalCodeSnapshot(source.getRecipientCompanyPostalCodeSnapshot());
        target.setRecipientCompanyCitySnapshot(source.getRecipientCompanyCitySnapshot());
        target.setRecipientCompanyVatIdSnapshot(source.getRecipientCompanyVatIdSnapshot());
        target.setRecipientCompanyIbanSnapshot(source.getRecipientCompanyIbanSnapshot());
        target.setRecipientCompanyEmailSnapshot(source.getRecipientCompanyEmailSnapshot());
        target.setRecipientCompanyTelephoneSnapshot(source.getRecipientCompanyTelephoneSnapshot());
    }

    private void createGuestRefundOrderIfApplicable(Bill original, Bill refund) {
        GuestOrder originalOrder = guestOrders.findByBillId(original.getId()).orElse(null);
        if (originalOrder == null) return;

        GuestOrder refundOrder = new GuestOrder();
        refundOrder.setCompany(originalOrder.getCompany());
        refundOrder.setClient(originalOrder.getClient());
        refundOrder.setGuestUser(originalOrder.getGuestUser());
        refundOrder.setStatus(OrderStatus.REFUNDED);
        refundOrder.setPaymentMethodType(originalOrder.getPaymentMethodType());
        refundOrder.setCurrency(originalOrder.getCurrency());
        refundOrder.setSubtotalGross(refund.getTotalGross());
        refundOrder.setTaxAmount(BigDecimal.ZERO);
        refundOrder.setTotalGross(refund.getTotalGross());
        String originalNo = original.getBillNumber() == null ? String.valueOf(original.getId()) : original.getBillNumber();
        String refundNo = refund.getBillNumber() == null ? String.valueOf(refund.getId()) : refund.getBillNumber();
        refundOrder.setReferenceCode(("REFUND-" + originalNo + "-" + refundNo).replaceAll("\\s+", "-"));
        refundOrder.setBillId(refund.getId());
        refundOrder.setPaidAt(java.time.Instant.now());
        refundOrder.setMetadataJson(guestRefundMetadata(originalOrder, originalNo));
        guestOrders.save(refundOrder);
    }

    private static String guestRefundMetadata(GuestOrder originalOrder, String originalBillNumber) {
        String productName = "Refund";
        String productType = "ORDER";
        try {
            Map<?, ?> map = JSON.readValue(originalOrder.getMetadataJson(), Map.class);
            Object pName = map.get("productName");
            if (pName != null && !String.valueOf(pName).isBlank()) {
                productName = "Refund · " + String.valueOf(pName);
            }
            Object pType = map.get("productType");
            if (pType != null && !String.valueOf(pType).isBlank()) {
                productType = String.valueOf(pType);
            }
        } catch (Exception ignore) {
        }
        try {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("productName", productName);
            out.put("productType", productType);
            out.put("refundOfInvoice", originalBillNumber);
            return JSON.writeValueAsString(out);
        } catch (Exception ex) {
            return "{\"productName\":\"Refund\",\"productType\":\"ORDER\",\"refundOfInvoice\":\"" + originalBillNumber + "\"}";
        }
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

    private BillType resolveRequestedBillType(String raw) {
        if (raw == null || raw.isBlank()) return BillType.INVOICE;
        try {
            return BillType.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid bill type. Allowed values: INVOICE, ADVANCE.");
        }
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

    private SessionBooking resolveOpenBillPayerSession(OpenBill open, Set<Long> linkedSessionIds, Long companyId) {
        if (open == null) return null;
        if (open.getSessionBooking() != null) {
            return open.getSessionBooking();
        }
        if (linkedSessionIds == null || linkedSessionIds.isEmpty()) {
            return null;
        }
        return sessionBookings.findAllByCompanyIdAndIds(companyId, linkedSessionIds).stream()
                .filter(session -> session.getPayeeType() != null && !session.getPayeeType().isBlank())
                .findFirst()
                .orElse(null);
    }

    private static void applyCustomSessionPayeeToBill(Bill bill, SessionBooking session) {
        String type = session.getPayeeType() == null ? "PERSON" : session.getPayeeType().trim().toUpperCase(Locale.ROOT);
        if ("COMPANY".equals(type)) {
            setBillRecipientCustomCompanySnapshot(bill, session);
            bill.setClient(null);
            bill.setClientFirstNameSnapshot("");
            bill.setClientLastNameSnapshot("");
            return;
        }
        if (notBlank(session.getPayeePersonFirstName()) || notBlank(session.getPayeePersonLastName())) {
            bill.setClientFirstNameSnapshot(emptySafe(session.getPayeePersonFirstName()));
            bill.setClientLastNameSnapshot(emptySafe(session.getPayeePersonLastName()));
        }
        setBillRecipientPersonSnapshot(bill);
        bill.setRecipientPersonEmailSnapshot(emptyToNull(session.getPayeePersonEmail()));
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
        bill.setRecipientPersonEmailSnapshot(null);
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
        bill.setRecipientPersonEmailSnapshot(null);
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

    private static void setBillRecipientCustomCompanySnapshot(Bill bill, SessionBooking session) {
        ClientCompany fallback = session.getPayeeCompany();
        bill.setRecipientTypeSnapshot("COMPANY");
        bill.setRecipientPersonEmailSnapshot(null);
        bill.setRecipientCompanyIdSnapshot(fallback == null ? null : fallback.getId());
        bill.setRecipientCompanyNameSnapshot(firstNonBlank(session.getPayeeCompanyName(), fallback == null ? null : fallback.getName()));
        bill.setRecipientCompanyAddressSnapshot(firstNonBlank(session.getPayeeCompanyAddress(), fallback == null ? null : fallback.getAddress()));
        bill.setRecipientCompanyPostalCodeSnapshot(firstNonBlank(session.getPayeeCompanyPostalCode(), fallback == null ? null : fallback.getPostalCode()));
        bill.setRecipientCompanyCitySnapshot(firstNonBlank(session.getPayeeCompanyCity(), fallback == null ? null : fallback.getCity()));
        bill.setRecipientCompanyVatIdSnapshot(firstNonBlank(session.getPayeeCompanyVatId(), fallback == null ? null : fallback.getVatId()));
        bill.setRecipientCompanyIbanSnapshot(fallback == null ? null : fallback.getIban());
        bill.setRecipientCompanyEmailSnapshot(firstNonBlank(session.getPayeeCompanyEmail(), fallback == null ? null : fallback.getEmail()));
        bill.setRecipientCompanyTelephoneSnapshot(fallback == null ? null : fallback.getTelephone());
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

    private static boolean notBlank(String value) {
        return value != null && !value.isBlank();
    }

    private static String emptyToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String firstNonBlank(String preferred, String fallback) {
        String cleaned = emptyToNull(preferred);
        return cleaned != null ? cleaned : emptyToNull(fallback);
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

    private static BigDecimal estimateOpenBillGross(OpenBill open) {
        if (open == null || open.getItems() == null) return BigDecimal.ZERO;
        BigDecimal total = BigDecimal.ZERO;
        for (var item : open.getItems()) {
            if (item == null || item.getTransactionService() == null) continue;
            BigDecimal net = item.getNetPrice() == null ? BigDecimal.ZERO : item.getNetPrice();
            int qty = item.getQuantity() == null ? 1 : Math.max(1, item.getQuantity());
            BigDecimal grossSingle = net.add(net.multiply(item.getTransactionService().getTaxRate().multiplier)).setScale(2, RoundingMode.HALF_UP);
            total = total.add(grossSingle.multiply(BigDecimal.valueOf(qty))).setScale(2, RoundingMode.HALF_UP);
        }
        return total.setScale(2, RoundingMode.HALF_UP);
    }

    private static List<PaymentSplitResponse> toOpenBillPaymentSplitResponses(OpenBill open, BigDecimal fallbackGross) {
        if (open != null && open.getPaymentSplits() != null && !open.getPaymentSplits().isEmpty()) {
            return open.getPaymentSplits().stream()
                    .filter(split -> split.getPaymentMethod() != null)
                    .sorted(Comparator.comparing(OpenBillPayment::getSortOrder, Comparator.nullsLast(Integer::compareTo)))
                    .map(split -> new PaymentSplitResponse(
                            split.getId(),
                            toPaymentMethodSummary(split.getPaymentMethod()),
                            (split.getAmountGross() == null ? BigDecimal.ZERO : split.getAmountGross()).setScale(2, RoundingMode.HALF_UP)
                    ))
                    .toList();
        }
        if (open == null || open.getPaymentMethod() == null) return List.of();
        return List.of(new PaymentSplitResponse(null, toPaymentMethodSummary(open.getPaymentMethod()), (fallbackGross == null ? BigDecimal.ZERO : fallbackGross).setScale(2, RoundingMode.HALF_UP)));
    }

    private static List<PaymentSplitResponse> toBillPaymentSplitResponses(Bill bill) {
        if (bill != null && bill.getPaymentSplits() != null && !bill.getPaymentSplits().isEmpty()) {
            return bill.getPaymentSplits().stream()
                    .filter(split -> split.getPaymentMethod() != null)
                    .sorted(Comparator.comparing(BillPayment::getSortOrder, Comparator.nullsLast(Integer::compareTo)))
                    .map(split -> new PaymentSplitResponse(
                            split.getId(),
                            toPaymentMethodSummary(split.getPaymentMethod()),
                            (split.getAmountGross() == null ? BigDecimal.ZERO : split.getAmountGross()).setScale(2, RoundingMode.HALF_UP)
                    ))
                    .toList();
        }
        if (bill == null || bill.getPaymentMethod() == null) return List.of();
        return List.of(new PaymentSplitResponse(null, toPaymentMethodSummary(bill.getPaymentMethod()), (bill.getTotalGross() == null ? BigDecimal.ZERO : bill.getTotalGross()).setScale(2, RoundingMode.HALF_UP)));
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
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "inline; filename=\"folio-" + filename + ".pdf\"")
                .contentType(MediaType.APPLICATION_PDF)
                .body(pdf);
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
        if (req.guestEnabled() != null) {
            pm.setGuestEnabled(req.guestEnabled());
        }
        if (req.widgetEnabled() != null) {
            pm.setWidgetEnabled(req.widgetEnabled());
        } else if (req.guestEnabled() != null) {
            // Backward compatibility for older clients that only send guestEnabled.
            pm.setWidgetEnabled(req.guestEnabled());
        }
        if (req.guestDisplayOrder() != null) {
            pm.setGuestDisplayOrder(Math.max(0, req.guestDisplayOrder()));
        }
        pm.setAllowedGuestProductTypesJson(writeAllowedGuestProductTypes(req.allowedGuestProductTypes(), req.paymentType()));
    }

    private static boolean defaultFiscalized(PaymentType paymentType) {
        return paymentType != PaymentType.CARD && paymentType != PaymentType.ADVANCE;
    }

    private static boolean defaultStripeEnabled(PaymentType paymentType) {
        return paymentType == PaymentType.CARD;
    }

    private static List<String> defaultAllowedGuestProductTypes(PaymentType paymentType) {
        if (paymentType == PaymentType.BANK_TRANSFER) return DEFAULT_ALLOWED_FOR_BANK_TRANSFER;
        if (paymentType == PaymentType.CARD) return DEFAULT_ALLOWED_FOR_CARD;
        if (paymentType == PaymentType.ADVANCE) return List.of();
        return DEFAULT_ALLOWED_FOR_OTHER;
    }

    private static String writeAllowedGuestProductTypes(List<String> raw, PaymentType paymentType) {
        List<String> sanitized = sanitizeAllowedGuestProductTypes(raw, paymentType);
        try {
            return JSON.writeValueAsString(sanitized);
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid allowedGuestProductTypes payload.");
        }
    }

    private static List<String> readAllowedGuestProductTypes(PaymentMethod pm) {
        String raw = pm.getAllowedGuestProductTypesJson();
        if (raw == null || raw.isBlank()) return defaultAllowedGuestProductTypes(pm.getPaymentType());
        try {
            var node = JSON.readTree(raw);
            if (node == null || !node.isArray()) return defaultAllowedGuestProductTypes(pm.getPaymentType());
            List<String> parsed = new ArrayList<>();
            node.forEach(entry -> {
                String value = entry == null ? "" : entry.asText("");
                String normalized = value.trim().toUpperCase(Locale.ROOT);
                if (!normalized.isEmpty() && GUEST_PRODUCT_TYPES.contains(normalized) && !parsed.contains(normalized)) {
                    parsed.add(normalized);
                }
            });
            return parsed.isEmpty() ? defaultAllowedGuestProductTypes(pm.getPaymentType()) : parsed;
        } catch (Exception ex) {
            return defaultAllowedGuestProductTypes(pm.getPaymentType());
        }
    }

    private static List<String> sanitizeAllowedGuestProductTypes(List<String> raw, PaymentType paymentType) {
        if (raw == null || raw.isEmpty()) return defaultAllowedGuestProductTypes(paymentType);
        List<String> sanitized = new ArrayList<>();
        for (String entry : raw) {
            String normalized = entry == null ? "" : entry.trim().toUpperCase(Locale.ROOT);
            if (!normalized.isEmpty() && GUEST_PRODUCT_TYPES.contains(normalized) && !sanitized.contains(normalized)) {
                sanitized.add(normalized);
            }
        }
        if (sanitized.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "allowedGuestProductTypes must include at least one supported product type.");
        }
        return sanitized;
    }

    private BigDecimal computeOpenBillSessionTransactionGross(OpenBill openBill, Long sessionId) {
        BigDecimal total = BigDecimal.ZERO;
        for (OpenBillItem item : openBill.getItems()) {
            if (item.getSourceAdvanceBillId() != null) continue;
            if (!openBillItemMatchesSession(openBill, item, sessionId)) continue;
            var tx = item.getTransactionService();
            if (tx == null) continue;
            BigDecimal net = item.getNetPrice() == null ? BigDecimal.ZERO : item.getNetPrice();
            BigDecimal qty = BigDecimal.valueOf(item.getQuantity() == null ? 1 : item.getQuantity());
            BigDecimal grossSingle = net.add(net.multiply(tx.getTaxRate().multiplier)).setScale(2, RoundingMode.HALF_UP);
            total = total.add(grossSingle.multiply(qty));
        }
        return total.setScale(2, RoundingMode.HALF_UP);
    }

    private boolean openBillItemMatchesSession(OpenBill openBill, OpenBillItem item, Long sessionId) {
        if (sessionId == null) return false;
        Long itemSessionId = item.getSourceSessionBookingId();
        if (itemSessionId != null) return Objects.equals(itemSessionId, sessionId);
        return openBill.getSessionBooking() != null && Objects.equals(openBill.getSessionBooking().getId(), sessionId);
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
