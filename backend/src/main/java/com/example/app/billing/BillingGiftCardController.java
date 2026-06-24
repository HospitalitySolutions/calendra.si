package com.example.app.billing;

import com.example.app.client.Client;
import com.example.app.guest.model.EntitlementStatus;
import com.example.app.guest.model.EntitlementType;
import com.example.app.guest.model.GuestEntitlement;
import com.example.app.guest.model.GuestEntitlementRepository;
import com.example.app.guest.model.GuestOrder;
import com.example.app.guest.model.OrderStatus;
import com.example.app.guest.model.ProductType;
import com.example.app.guest.order.GiftCardEmailService;
import com.example.app.settings.BillingModuleAccessService;
import com.example.app.user.User;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/billing")
public class BillingGiftCardController {
    private final GuestEntitlementRepository entitlements;
    private final BillRepository bills;
    private final GiftCardEmailService giftCardEmailService;
    private final BillingModuleAccessService billingModuleAccessService;

    public BillingGiftCardController(
            GuestEntitlementRepository entitlements,
            BillRepository bills,
            GiftCardEmailService giftCardEmailService,
            BillingModuleAccessService billingModuleAccessService
    ) {
        this.entitlements = entitlements;
        this.bills = bills;
        this.giftCardEmailService = giftCardEmailService;
        this.billingModuleAccessService = billingModuleAccessService;
    }

    public record GiftCardBillingResponse(
            Long id,
            String giftCardNumber,
            String code,
            String productName,
            Long clientId,
            String clientName,
            String clientEmail,
            BigDecimal valueGross,
            BigDecimal usedGross,
            BigDecimal remainingGross,
            Instant issuedAt,
            Instant expiresAt,
            String status,
            Long billId,
            String billNumber,
            String orderReference
    ) {}

    @GetMapping("/gift-cards")
    @Transactional(readOnly = true)
    public List<GiftCardBillingResponse> giftCards(@AuthenticationPrincipal User me) {
        Long companyId = me.getCompany().getId();
        billingModuleAccessService.assertGiftCardsEnabled(companyId);
        List<GuestEntitlement> cards = entitlements.findGiftCardsByCompanyId(companyId, EntitlementType.GIFT_CARD, ProductType.GIFT_CARD);
        Set<Long> billIds = cards.stream()
                .map(GuestEntitlement::getSourceOrder)
                .filter(Objects::nonNull)
                .map(GuestOrder::getBillId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<Long, Bill> billsById = billIds.isEmpty()
                ? Map.of()
                : bills.findAllById(billIds).stream()
                    .filter(bill -> bill.getCompany() != null && Objects.equals(bill.getCompany().getId(), companyId))
                    .collect(Collectors.toMap(Bill::getId, bill -> bill));
        return cards.stream()
                .map(card -> toResponse(card, billsById.get(card.getSourceOrder() == null ? null : card.getSourceOrder().getBillId())))
                .toList();
    }

    @GetMapping(value = "/gift-cards/{id}/pdf", produces = MediaType.APPLICATION_PDF_VALUE)
    @Transactional(readOnly = true)
    public ResponseEntity<byte[]> giftCardPdf(@PathVariable Long id, @AuthenticationPrincipal User me) throws IOException {
        billingModuleAccessService.assertGiftCardsEnabled(me.getCompany().getId());
        GuestEntitlement entitlement = loadGiftCard(id, me);
        byte[] pdf = giftCardEmailService.giftCardPdf(entitlement);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + giftCardEmailService.giftCardPdfFileName(entitlement) + "\"")
                .contentType(MediaType.APPLICATION_PDF)
                .body(pdf);
    }

    @PostMapping("/gift-cards/{id}/send")
    @Transactional
    public GiftCardBillingResponse sendGiftCard(@PathVariable Long id, @AuthenticationPrincipal User me) {
        billingModuleAccessService.assertGiftCardsEnabled(me.getCompany().getId());
        GuestEntitlement entitlement = loadGiftCard(id, me);
        giftCardEmailService.sendGiftCardEmail(entitlement);
        Bill bill = null;
        GuestOrder order = entitlement.getSourceOrder();
        if (order != null && order.getBillId() != null) {
            bill = bills.findByIdAndCompanyId(order.getBillId(), me.getCompany().getId()).orElse(null);
        }
        return toResponse(entitlement, bill);
    }

    private GuestEntitlement loadGiftCard(Long id, User me) {
        Long companyId = me.getCompany().getId();
        return entitlements.findById(id)
                .filter(card -> card.getCompany() != null && Objects.equals(card.getCompany().getId(), companyId))
                .filter(this::isGiftCard)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Gift card not found."));
    }

    private GiftCardBillingResponse toResponse(GuestEntitlement entitlement, Bill bill) {
        GuestOrder order = entitlement.getSourceOrder();
        BigDecimal valueGross = giftCardValueGross(entitlement);
        BigDecimal remainingGross = safeMoney(entitlement.getRemainingValueGross());
        BigDecimal usedGross = valueGross.subtract(remainingGross).max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
        Client client = entitlement.getClient();
        String clientName = client == null ? "" : (safeText(client.getFirstName()) + " " + safeText(client.getLastName())).trim();
        if (clientName.isBlank() && client != null) clientName = safeText(client.getEmail());
        return new GiftCardBillingResponse(
                entitlement.getId(),
                giftCardNumber(entitlement),
                firstNonBlank(entitlement.getDisplayCode(), entitlement.getEntitlementCode(), ""),
                entitlement.getProduct() == null ? "" : safeText(entitlement.getProduct().getName()),
                client == null ? null : client.getId(),
                clientName,
                client == null ? null : client.getEmail(),
                valueGross,
                usedGross,
                remainingGross,
                entitlement.getCreatedAt(),
                entitlement.getValidUntil(),
                status(entitlement, valueGross, remainingGross),
                bill == null ? (order == null ? null : order.getBillId()) : bill.getId(),
                bill == null ? null : bill.getBillNumber(),
                order == null ? null : order.getReferenceCode()
        );
    }

    private String giftCardNumber(GuestEntitlement entitlement) {
        if (entitlement == null) return "DB-0";
        Integer seq = entitlement.getDisplaySeq();
        if (seq != null && seq > 0) {
            return "DB-" + seq;
        }
        return "DB-" + (entitlement.getId() == null ? 0 : entitlement.getId());
    }

    private boolean isGiftCard(GuestEntitlement entitlement) {
        return entitlement != null && (entitlement.getEntitlementType() == EntitlementType.GIFT_CARD
                || (entitlement.getProduct() != null && entitlement.getProduct().getProductType() == ProductType.GIFT_CARD));
    }

    private BigDecimal giftCardValueGross(GuestEntitlement entitlement) {
        if (entitlement.getProduct() != null && entitlement.getProduct().getPriceGross() != null) {
            return safeMoney(entitlement.getProduct().getPriceGross());
        }
        GuestOrder order = entitlement.getSourceOrder();
        if (order != null && order.getTotalGross() != null) return safeMoney(order.getTotalGross());
        return safeMoney(entitlement.getRemainingValueGross());
    }

    private String status(GuestEntitlement entitlement, BigDecimal valueGross, BigDecimal remainingGross) {
        if (entitlement.getStatus() == EntitlementStatus.CANCELLED) return "cancelled";
        if (entitlement.getStatus() == EntitlementStatus.PENDING) return "pending_payment";
        GuestOrder order = entitlement.getSourceOrder();
        if (order != null && order.getStatus() == OrderStatus.PENDING) return "pending_payment";
        if (order != null && order.getStatus() == OrderStatus.CANCELLED) return "cancelled";
        if (entitlement.getStatus() == EntitlementStatus.EXPIRED || (entitlement.getValidUntil() != null && !entitlement.getValidUntil().isAfter(Instant.now()))) return "expired";
        if (entitlement.getStatus() == EntitlementStatus.USED_UP || remainingGross.compareTo(BigDecimal.ZERO) <= 0) return "used";
        BigDecimal usedGross = safeMoney(valueGross).subtract(safeMoney(remainingGross));
        if (usedGross.compareTo(BigDecimal.ZERO) > 0) return "partially_used";
        return "active";
    }

    private static BigDecimal safeMoney(BigDecimal value) {
        return (value == null ? BigDecimal.ZERO : value).setScale(2, RoundingMode.HALF_UP);
    }

    private static String safeText(String value) {
        return value == null ? "" : value.trim();
    }

    private static String firstNonBlank(String... values) {
        if (values == null) return "";
        for (String value : values) {
            if (value != null && !value.isBlank()) return value.trim();
        }
        return "";
    }
}
