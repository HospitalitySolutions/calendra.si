package com.example.app.guest.order;

import com.example.app.billing.*;
import com.example.app.billingissuer.InvoiceIssuanceService;
import com.example.app.client.Client;
import com.example.app.fiscal.FiscalizationService;
import com.example.app.commerce.CommerceLocationScopeService;
import com.example.app.guest.model.GuestPaymentMethodType;
import com.example.app.guest.model.GuestOrder;
import com.example.app.guest.common.GuestInvoiceSettingsSupport;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBillingSupport;
import com.example.app.session.SessionTypeLocationPriceService;
import com.example.app.session.SessionTypeRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class GuestBankTransferBillingService {
    private static final Logger log = LoggerFactory.getLogger(GuestBankTransferBillingService.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    private final BillRepository bills;
    private final PaymentMethodRepository paymentMethods;
    private final AppSettingRepository settings;
    private final FiscalizationService fiscalizationService;
    private final BillingEmailService billingEmailService;
    private final InvoicePdfS3Service invoicePdfS3Service;
    private final BillFolioPdfService billFolioPdfService;
    private final InvoiceOrderIdService invoiceOrderIdService;
    private final UserRepository users;
    private final SessionTypeRepository sessionTypes;

    private InvoiceIssuanceService invoiceIssuanceService;
    private CommerceLocationScopeService commerceLocations;
    @Autowired(required = false)
    private SessionTypeLocationPriceService locationPrices;

    public GuestBankTransferBillingService(
            BillRepository bills,
            PaymentMethodRepository paymentMethods,
            AppSettingRepository settings,
            FiscalizationService fiscalizationService,
            BillingEmailService billingEmailService,
            InvoicePdfS3Service invoicePdfS3Service,
            BillFolioPdfService billFolioPdfService,
            InvoiceOrderIdService invoiceOrderIdService,
            UserRepository users,
            SessionTypeRepository sessionTypes
    ) {
        this.bills = bills;
        this.paymentMethods = paymentMethods;
        this.settings = settings;
        this.fiscalizationService = fiscalizationService;
        this.billingEmailService = billingEmailService;
        this.invoicePdfS3Service = invoicePdfS3Service;
        this.billFolioPdfService = billFolioPdfService;
        this.invoiceOrderIdService = invoiceOrderIdService;
        this.users = users;
        this.sessionTypes = sessionTypes;
    }

    @Autowired(required = false)
    void configureInvoiceIssuanceService(InvoiceIssuanceService invoiceIssuanceService) {
        this.invoiceIssuanceService = invoiceIssuanceService;
    }

    @Autowired(required = false)
    void configureCommerceLocations(CommerceLocationScopeService commerceLocations) {
        this.commerceLocations = commerceLocations;
    }

    @Transactional
    public Bill issueConfirmedBookingBill(GuestOrder order, SessionBooking booking) {
        return issueAdvanceBill(order, booking, GuestPaymentMethodType.BANK_TRANSFER.name(), BillPaymentStatus.PAYMENT_PENDING, null);
    }

    @Transactional
    public Bill issuePaidAdvanceBill(GuestOrder order, SessionBooking booking, String paymentMethodType) {
        return issueAdvanceBill(order, booking, paymentMethodType, BillPaymentStatus.PAID, OffsetDateTime.now());
    }

    private Bill issueAdvanceBill(GuestOrder order, SessionBooking booking, String paymentMethodType, String targetPaymentStatus, OffsetDateTime paidAt) {
        if (booking == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Booking is required for advance billing.");
        }
        Long companyId = order.getCompany().getId();
        Bill existing = bills.findFirstByCompanyIdAndSourceSessionIdSnapshotAndBillTypeOrderByIdDesc(companyId, booking.getId(), BillType.ADVANCE)
                .orElse(null);
        if (existing != null) {
            return finalizeExistingAdvance(existing, targetPaymentStatus, paidAt, order);
        }

        Long billingLocationId = booking.getLocation() == null ? (order.getLocation() == null ? null : order.getLocation().getId()) : booking.getLocation().getId();
        PaymentMethod paymentMethod = resolvePaymentMethod(companyId, billingLocationId, paymentMethodType);
        Bill bill = new Bill();
        bill.setCompany(order.getCompany());
        bill.setBillType(BillType.ADVANCE);
        bill.setClient(order.getClient());
        setBillClientSnapshot(bill, order.getClient());
        GuestInvoiceSettingsSupport.applyBillRecipientSnapshot(bill, order.getClient());
        bill.setConsultant(resolveBillConsultant(companyId, booking));
        bill.setPaymentMethod(paymentMethod);
        bill.setIssueDate(LocalDate.now());
        assignInvoiceIdentity(bill, companyId, booking.getLocation() == null ? null : booking.getLocation().getId());
        bill.setSourceSessionIdSnapshot(booking.getId());
        bill.setInvoiceLocale(resolveInvoiceLocale(order));
        bill.setPaymentStatus(targetPaymentStatus);
        if (BillPaymentStatus.PAID.equals(targetPaymentStatus)) {
            bill.setPaidAt(paidAt == null ? OffsetDateTime.now() : paidAt);
        }
        applyGuestOrderReferenceIfMissing(bill, order);
        if (isBankTransferPayment(paymentMethod)) {
            applyOrderReferenceAsBankTransferReference(bill, order);
        }

        Map<Integer, BigDecimal> exactVoucherPayableByPosition = remainingPayableGrossByServicePosition(order);
        BigDecimal totalNet;
        BigDecimal totalGross;
        if (!exactVoucherPayableByPosition.isEmpty()) {
            List<SessionBillingSupport.PositionedCharge> positionedServices = resolvePositionedLinkedBillingServices(order, booking);
            if (positionedServices.isEmpty()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The booked service has no linked billing services, so an advance invoice cannot be generated.");
            }
            Totals exactTotals = addExactVoucherAllocatedItems(
                    bill, booking, positionedServices, exactVoucherPayableByPosition);
            totalNet = exactTotals.net();
            totalGross = exactTotals.gross();
        } else {
            List<SessionBillingSupport.Charge> linkedServices = resolveLinkedBillingServices(order, companyId, booking);
            if (linkedServices.isEmpty()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The booked service has no linked billing services, so an advance invoice cannot be generated.");
            }

            totalNet = BigDecimal.ZERO;
            totalGross = BigDecimal.ZERO;
            for (SessionBillingSupport.Charge charge : linkedServices) {
                TransactionService tx = charge.transactionService();
                if (tx == null) continue;
                int quantity = Math.max(1, charge.quantity());
                BigDecimal net = charge.netPrice() == null ? BigDecimal.ZERO : charge.netPrice();
                BigDecimal multiplier = tx.getTaxRate() == null ? BigDecimal.ZERO : tx.getTaxRate().multiplier;
                BigDecimal unitGross = net.add(net.multiply(multiplier)).setScale(2, RoundingMode.HALF_UP);
                BigDecimal lineGross = unitGross.multiply(BigDecimal.valueOf(quantity)).setScale(2, RoundingMode.HALF_UP);

                BillItem item = new BillItem();
                item.setBill(bill);
                item.setTransactionService(tx);
                item.setQuantity(quantity);
                item.setNetPrice(net);
                item.setGrossPrice(lineGross);
                item.setSourceSessionBookingId(booking.getId());
                totalNet = totalNet.add(net.multiply(BigDecimal.valueOf(quantity)));
                totalGross = totalGross.add(lineGross);
                bill.getItems().add(item);
            }
            Totals adjustedTotals = applyOrderAdvanceAmountIfPartial(order, bill, totalNet, totalGross);
            totalNet = adjustedTotals.net();
            totalGross = adjustedTotals.gross();
        }
        if (bill.getItems().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The booked service has no valid billing lines, so an advance invoice cannot be generated.");
        }

        bill.setTotalNet(totalNet.setScale(2, RoundingMode.HALF_UP));
        bill.setTotalGross(totalGross.setScale(2, RoundingMode.HALF_UP));
        applyGuestOrderReferenceIfMissing(bill, order);
        invoiceOrderIdService.assignIfMissing(bill);
        if (isBankTransferPayment(paymentMethod)) {
            applyOrderReferenceAsBankTransferReference(bill, order);
        }

        Bill saved = bills.saveAndFlush(bill);
        if (shouldFiscalizeOnBillCreate(saved.getPaymentMethod(), companyId)) {
            saved = fiscalizationService.fiscalizeBill(saved, companyId);
        }
        deliverAdvance(saved, companyId, order.getId());
        return saved;
    }

    private Bill finalizeExistingAdvance(Bill existing, String targetPaymentStatus, OffsetDateTime paidAt, GuestOrder order) {
        applyGuestOrderReferenceIfMissing(existing, order);
        invoiceOrderIdService.assignIfMissing(existing);
        applyOrderReferenceAsBankTransferReference(existing, order);
        String resolvedLocale = resolveInvoiceLocale(order);
        boolean explicitOrderLocale = order != null && order.getInvoiceLocale() != null && !order.getInvoiceLocale().isBlank();
        if (resolvedLocale != null && !resolvedLocale.isBlank()
                && (existing.getInvoiceLocale() == null || existing.getInvoiceLocale().isBlank()
                || (explicitOrderLocale && !resolvedLocale.equalsIgnoreCase(existing.getInvoiceLocale())))) {
            existing.setInvoiceLocale(resolvedLocale);
        }
        Long orderId = order == null ? null : order.getId();
        if (!BillPaymentStatus.PAID.equals(targetPaymentStatus) || BillPaymentStatus.PAID.equals(existing.getPaymentStatus())) {
            return bills.save(existing);
        }
        existing.setPaymentStatus(BillPaymentStatus.PAID);
        if (existing.getPaidAt() == null) {
            existing.setPaidAt(paidAt == null ? OffsetDateTime.now() : paidAt);
        }
        Bill saved = bills.saveAndFlush(existing);
        if (shouldFiscalizeOnBillCreate(saved.getPaymentMethod(), saved.getCompany().getId())
                && (saved.getFiscalStatus() == null
                || saved.getFiscalStatus() == BillFiscalStatus.NOT_SENT
                || saved.getFiscalStatus() == BillFiscalStatus.PENDING
                || saved.getFiscalStatus() == BillFiscalStatus.FAILED)) {
            saved = fiscalizationService.fiscalizeBill(saved, saved.getCompany().getId());
        }
        deliverAdvance(saved, saved.getCompany().getId(), orderId);
        return saved;
    }


    private List<SessionBillingSupport.Charge> resolveLinkedBillingServices(GuestOrder order, Long companyId, SessionBooking booking) {
        if (booking == null) return List.of();
        return SessionBillingSupport.charges(booking, Set.of(), entitlementCoveredServicePositions(order), locationPrices == null ? null : locationPrices::effectiveNet);
    }

    private List<SessionBillingSupport.PositionedCharge> resolvePositionedLinkedBillingServices(
            GuestOrder order,
            SessionBooking booking
    ) {
        if (booking == null) return List.of();
        return SessionBillingSupport.positionedCharges(booking, Set.of(), entitlementCoveredServicePositions(order), locationPrices == null ? null : locationPrices::effectiveNet);
    }

    /**
     * Reads the exact payable gross left on each service after VALUE-voucher allocation. Presence
     * of this metadata means the order has already applied deposit/service-voucher rules and then
     * deducted value vouchers against eligible service lines.
     */
    private Map<Integer, BigDecimal> remainingPayableGrossByServicePosition(GuestOrder order) {
        LinkedHashMap<Integer, BigDecimal> amounts = new LinkedHashMap<>();
        if (order == null || order.getMetadataJson() == null || order.getMetadataJson().isBlank()) return amounts;
        try {
            Map<?, ?> metadata = JSON.readValue(order.getMetadataJson(), Map.class);
            if (!Boolean.TRUE.equals(metadata.get("valueVoucherServiceAllocation"))) return amounts;
            Object rawServices = metadata.get("services");
            if (!(rawServices instanceof List<?> rows)) return amounts;
            for (int index = 0; index < rows.size(); index++) {
                if (!(rows.get(index) instanceof Map<?, ?> row)) continue;
                Object rawAmount = row.get("remainingPayableGross");
                if (rawAmount == null) continue;
                BigDecimal amount;
                try {
                    amount = new BigDecimal(String.valueOf(rawAmount)).max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
                } catch (Exception ignored) {
                    continue;
                }
                Object rawPosition = row.get("position");
                int position;
                try {
                    position = rawPosition == null ? index : Integer.parseInt(String.valueOf(rawPosition).replace(".0", ""));
                } catch (NumberFormatException ignored) {
                    position = index;
                }
                amounts.put(position, amount);
            }
        } catch (Exception ignored) {
            // Fall back to the legacy aggregate invoice projection when metadata is unavailable.
        }
        return amounts;
    }

    /**
     * Creates invoice lines from exact service positions. Each service's linked billing lines are
     * scaled only to that service's remaining payable amount, so a selected-scope Vrednostni bon
     * never reduces an unrelated service on the advance invoice.
     */
    private Totals addExactVoucherAllocatedItems(
            Bill bill,
            SessionBooking booking,
            List<SessionBillingSupport.PositionedCharge> positionedCharges,
            Map<Integer, BigDecimal> payableByPosition
    ) {
        LinkedHashMap<Integer, List<SessionBillingSupport.PositionedCharge>> byPosition = new LinkedHashMap<>();
        for (SessionBillingSupport.PositionedCharge charge : positionedCharges) {
            if (charge == null || charge.transactionService() == null) continue;
            byPosition.computeIfAbsent(charge.servicePosition(), ignored -> new ArrayList<>()).add(charge);
        }

        BigDecimal totalNet = BigDecimal.ZERO;
        BigDecimal totalGross = BigDecimal.ZERO;
        for (Map.Entry<Integer, List<SessionBillingSupport.PositionedCharge>> entry : byPosition.entrySet()) {
            List<SessionBillingSupport.PositionedCharge> positionCharges = entry.getValue();
            BigDecimal fullPositionGross = BigDecimal.ZERO;
            List<BigDecimal> fullLineGross = new ArrayList<>();
            for (SessionBillingSupport.PositionedCharge charge : positionCharges) {
                TransactionService tx = charge.transactionService();
                BigDecimal net = charge.netPrice() == null ? BigDecimal.ZERO : charge.netPrice();
                BigDecimal multiplier = tx.getTaxRate() == null ? BigDecimal.ZERO : tx.getTaxRate().multiplier;
                BigDecimal gross = net.add(net.multiply(multiplier)).setScale(2, RoundingMode.HALF_UP);
                fullLineGross.add(gross);
                fullPositionGross = fullPositionGross.add(gross);
            }
            if (fullPositionGross.compareTo(BigDecimal.ZERO) <= 0) continue;

            BigDecimal requested = payableByPosition.get(entry.getKey());
            BigDecimal targetGross = requested == null
                    ? fullPositionGross.setScale(2, RoundingMode.HALF_UP)
                    : requested.max(BigDecimal.ZERO).min(fullPositionGross).setScale(2, RoundingMode.HALF_UP);
            if (targetGross.compareTo(BigDecimal.ZERO) <= 0) continue;

            BigDecimal ratio = targetGross.divide(fullPositionGross, 8, RoundingMode.HALF_UP);
            BigDecimal remainingForPosition = targetGross;
            for (int index = 0; index < positionCharges.size(); index++) {
                SessionBillingSupport.PositionedCharge charge = positionCharges.get(index);
                TransactionService tx = charge.transactionService();
                BigDecimal lineGross;
                if (index == positionCharges.size() - 1) {
                    lineGross = remainingForPosition.max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
                } else {
                    lineGross = fullLineGross.get(index).multiply(ratio).setScale(2, RoundingMode.HALF_UP);
                    if (lineGross.compareTo(remainingForPosition) > 0) lineGross = remainingForPosition;
                    remainingForPosition = remainingForPosition.subtract(lineGross).setScale(2, RoundingMode.HALF_UP);
                }
                if (lineGross.compareTo(BigDecimal.ZERO) <= 0) continue;

                BigDecimal multiplier = tx.getTaxRate() == null ? BigDecimal.ZERO : tx.getTaxRate().multiplier;
                BigDecimal lineNet = lineGross.divide(BigDecimal.ONE.add(multiplier), 4, RoundingMode.HALF_UP);
                BillItem item = new BillItem();
                item.setBill(bill);
                item.setTransactionService(tx);
                item.setQuantity(1);
                item.setNetPrice(lineNet);
                item.setGrossPrice(lineGross);
                item.setSourceSessionBookingId(booking.getId());
                bill.getItems().add(item);
                totalNet = totalNet.add(lineNet);
                totalGross = totalGross.add(lineGross);
            }
        }
        return new Totals(totalNet, totalGross);
    }

    /**
     * The order snapshots the entitlement assigned to every selected service line. Once the
     * booking is confirmed those exact lines must stay off the advance invoice; otherwise a
     * Darilni bon/pass would reduce the total but the PDF could still show a proportional charge
     * for the covered service.
     */
    private Set<Integer> entitlementCoveredServicePositions(GuestOrder order) {
        LinkedHashSet<Integer> positions = new LinkedHashSet<>();
        if (order == null || order.getMetadataJson() == null || order.getMetadataJson().isBlank()) return positions;
        try {
            Map<?, ?> metadata = JSON.readValue(order.getMetadataJson(), Map.class);
            Object rawServices = metadata.get("services");
            if (!(rawServices instanceof List<?> rows)) return positions;
            for (int index = 0; index < rows.size(); index++) {
                if (!(rows.get(index) instanceof Map<?, ?> row)) continue;
                Object rawEntitlementId = row.get("entitlementId");
                if (rawEntitlementId == null || String.valueOf(rawEntitlementId).isBlank()
                        || "null".equalsIgnoreCase(String.valueOf(rawEntitlementId))) continue;
                Object rawPosition = row.get("position");
                try {
                    positions.add(rawPosition == null ? index : Integer.parseInt(String.valueOf(rawPosition)));
                } catch (NumberFormatException ignored) {
                    positions.add(index);
                }
            }
        } catch (Exception ignored) {
            // Legacy orders without parseable service metadata keep the old billing behavior.
        }
        return positions;
    }

    private void applyGuestOrderReferenceIfMissing(Bill bill, GuestOrder order) {
        if (bill == null) {
            return;
        }
        String referenceCode = order == null ? null : order.getReferenceCode();
        if (hasText(referenceCode)) {
            String clean = referenceCode.trim();
            bill.setOrderId(clean);
            Long counter = parseTrailingCounter(clean);
            if (counter != null) {
                bill.setOrderCounter(counter);
            }
        }
    }

    private void applyOrderReferenceAsBankTransferReference(Bill bill, GuestOrder order) {
        if (bill == null) {
            return;
        }
        String reference = firstNonBlank(
                order == null ? null : order.getReferenceCode(),
                bill.getOrderId(),
                bill.getBankTransferReference()
        );
        if (hasText(reference)) {
            bill.setBankTransferReference(reference.trim());
        }
    }

    private static Long parseTrailingCounter(String value) {
        if (value == null) return null;
        int idx = value.lastIndexOf('-');
        if (idx < 0 || idx >= value.length() - 1) return null;
        try {
            return Long.parseLong(value.substring(idx + 1));
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private Totals applyOrderAdvanceAmountIfPartial(GuestOrder order, Bill bill, BigDecimal originalNet, BigDecimal originalGross) {
        if (order == null || order.getTotalGross() == null || originalGross == null) {
            return new Totals(originalNet, originalGross);
        }
        BigDecimal requestedGross = order.getTotalGross().setScale(2, RoundingMode.HALF_UP);
        BigDecimal fullGross = originalGross.setScale(2, RoundingMode.HALF_UP);
        if (requestedGross.compareTo(BigDecimal.ZERO) <= 0 || requestedGross.compareTo(fullGross) >= 0) {
            return new Totals(originalNet, originalGross);
        }

        BigDecimal remainingGross = requestedGross;
        BigDecimal adjustedNet = BigDecimal.ZERO;
        BigDecimal ratio = requestedGross.divide(fullGross, 8, RoundingMode.HALF_UP);
        int count = bill.getItems().size();
        for (int i = 0; i < count; i++) {
            BillItem item = bill.getItems().get(i);
            BigDecimal itemGross;
            if (i == count - 1) {
                itemGross = remainingGross.max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
            } else {
                itemGross = item.getGrossPrice().multiply(ratio).setScale(2, RoundingMode.HALF_UP);
                remainingGross = remainingGross.subtract(itemGross);
            }
            BigDecimal taxMultiplier = item.getTransactionService() == null || item.getTransactionService().getTaxRate() == null
                    ? BigDecimal.ZERO
                    : item.getTransactionService().getTaxRate().multiplier;
            BigDecimal lineNet = itemGross.divide(BigDecimal.ONE.add(taxMultiplier), 2, RoundingMode.HALF_UP);
            int quantity = item.getQuantity() == null ? 1 : Math.max(1, item.getQuantity());
            BigDecimal unitNet = lineNet.divide(BigDecimal.valueOf(quantity), 4, RoundingMode.HALF_UP);
            item.setGrossPrice(itemGross);
            item.setNetPrice(unitNet);
            adjustedNet = adjustedNet.add(lineNet);
        }
        return new Totals(adjustedNet, requestedGross);
    }

    private void deliverAdvance(Bill bill, Long companyId, Long orderId) {
        try {
            if (isBankTransferPayment(bill.getPaymentMethod()) && !BillPaymentStatus.PAID.equals(bill.getPaymentStatus())) {
                byte[] pdf = billFolioPdfService.generate(bill, companyId);
                invoicePdfS3Service.uploadAndPersistKey(bill, pdf);
                billingEmailService.sendBankTransferFolio(bill, pdf);
            } else {
                byte[] pdf = billFolioPdfService.generate(bill, companyId);
                invoicePdfS3Service.uploadAndPersistKey(bill, pdf);
                billingEmailService.sendPaidBillReceipt(bill, pdf);
            }
        } catch (Exception ex) {
            log.warn("Failed to archive/email advance invoice for guest order {} and bill {}", orderId, bill.getId(), ex);
        }
    }

    private PaymentMethod resolvePaymentMethod(Long companyId, Long locationId, String paymentMethodType) {
        List<PaymentMethod> all = paymentMethods.findAllByCompanyIdOrderByNameAsc(companyId).stream()
                .filter(pm -> locationId == null || commerceLocations == null || commerceLocations.paymentMethodAvailableAt(pm, locationId))
                .toList();
        String normalized = (paymentMethodType == null ? "" : paymentMethodType).trim().toUpperCase(Locale.ROOT);
        if ("BANK_TRANSFER".equals(normalized)) {
            return all.stream()
                    .filter(pm -> pm.getPaymentType() == PaymentType.BANK_TRANSFER)
                    .filter(this::isExternallyEnabled)
                    .findFirst()
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "Bank transfer is not enabled for this company."));
        }
        if ("PAYPAL".equals(normalized) || "OTHER".equals(normalized)) {
            return all.stream()
                    .filter(pm -> pm.getPaymentType() == PaymentType.OTHER)
                    .filter(this::isExternallyEnabled)
                    .filter(this::isPaypalNamedMethod)
                    .findFirst()
                    .or(() -> all.stream()
                            .filter(pm -> pm.getPaymentType() == PaymentType.OTHER)
                            .filter(this::isExternallyEnabled)
                            .findFirst())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "PayPal is not enabled for this company."));
        }
        return all.stream()
                .filter(pm -> pm.getPaymentType() == PaymentType.CARD)
                .filter(this::isExternallyEnabled)
                .filter(PaymentMethod::isStripeEnabled)
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Card payments are not enabled for this company."));
    }

    private boolean isExternallyEnabled(PaymentMethod method) {
        return method.isGuestEnabled() || method.isWidgetEnabled();
    }

    private boolean isPaypalNamedMethod(PaymentMethod method) {
        if (method == null || method.getName() == null) return false;
        return "paypal".equalsIgnoreCase(method.getName().trim());
    }

    private static String resolveInvoiceLocale(GuestOrder order) {
        String language = null;
        if (order != null) {
            language = firstNonBlank(order.getInvoiceLocale(), order.getGuestUser() == null ? null : order.getGuestUser().getLanguage());
        }
        if (language == null || language.isBlank()) return null;
        return language.trim().toLowerCase(Locale.ROOT).startsWith("sl") ? "sl" : "en";
    }

    private static String firstNonBlank(String... values) {
        if (values == null) return null;
        for (String value : values) {
            if (value != null && !value.isBlank()) return value.trim();
        }
        return null;
    }

    private record Totals(BigDecimal net, BigDecimal gross) {}

    private User resolveBillConsultant(Long companyId, SessionBooking booking) {
        if (booking.getConsultant() != null) {
            return booking.getConsultant();
        }
        return users.findFirstByCompanyIdAndActiveTrueOrderByIdAsc(companyId)
                .or(() -> users.findFirstByCompanyIdOrderByIdAsc(companyId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Tenancy has no users available to issue the advance invoice against."));
    }

    private static boolean isBankTransferPayment(PaymentMethod paymentMethod) {
        return paymentMethod != null && paymentMethod.getPaymentType() == PaymentType.BANK_TRANSFER;
    }

    private void assignInvoiceIdentity(Bill bill, Long companyId, Long locationId) {
        if (invoiceIssuanceService != null) {
            invoiceIssuanceService.assign(bill, companyId, null, null, locationId, bill.getIssueDate());
        } else {
            bill.setBillNumber(nextInvoiceNumber(companyId));
        }
    }

    private String nextInvoiceNumber(Long companyId) {
        AppSetting setting = settings.findForUpdateByCompanyIdAndKey(companyId, SettingKey.INVOICE_COUNTER)
                .orElseThrow(() -> new IllegalStateException("Missing setting: INVOICE_COUNTER"));
        String current = setting.getValue();
        setting.setValue(incrementAlphaNumeric(current));
        settings.save(setting);
        return current;
    }

    private static String incrementAlphaNumeric(String value) {
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

    private static void setBillClientSnapshot(Bill bill, Client client) {
        if (client == null) {
            bill.setClientFirstNameSnapshot("");
            bill.setClientLastNameSnapshot("");
            return;
        }
        bill.setClientFirstNameSnapshot(client.getFirstName() == null ? "" : client.getFirstName());
        bill.setClientLastNameSnapshot(client.getLastName() == null ? "" : client.getLastName());
    }

    private boolean shouldFiscalizeOnBillCreate(PaymentMethod paymentMethod, Long companyId) {
        return paymentMethod != null && paymentMethod.isFiscalized() && isFiscalCashRegisterEnabled(companyId);
    }

    private boolean isFiscalCashRegisterEnabled(Long companyId) {
        if (companyId == null) return false;
        return settings.findByCompanyIdAndKey(companyId, SettingKey.BILLING_FISCAL_CASH_REGISTER_ENABLED)
                .map(AppSetting::getValue)
                .map(value -> "true".equalsIgnoreCase(value == null ? "" : value.trim()))
                .orElse(false);
    }

}
