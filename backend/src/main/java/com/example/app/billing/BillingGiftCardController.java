package com.example.app.billing;

import com.example.app.activitylog.ActivityAction;
import com.example.app.activitylog.ActivityDetails;
import com.example.app.activitylog.ActivityLogService;
import com.example.app.activitylog.ActivityModule;
import com.example.app.client.Client;
import com.example.app.guest.model.EntitlementStatus;
import com.example.app.guest.model.EntitlementType;
import com.example.app.guest.model.GuestEntitlement;
import com.example.app.guest.model.GuestEntitlementRepository;
import com.example.app.guest.model.GuestOrder;
import com.example.app.guest.model.OrderStatus;
import com.example.app.guest.model.ProductType;
import com.example.app.guest.model.VoucherRedemptionMode;
import com.example.app.guest.model.VoucherRules;
import com.example.app.guest.model.VoucherServiceScope;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/billing")
public class BillingGiftCardController {
    private final GuestEntitlementRepository entitlements;
    private final BillRepository bills;
    private final GiftCardEmailService giftCardEmailService;
    private final BillingModuleAccessService billingModuleAccessService;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private ActivityLogService activityLogs;

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

    public record GiftCardStatsResponse(long active, long partial, long used, long expired, BigDecimal outstanding) {}
    public record GiftCardPageResponse(
            List<GiftCardBillingResponse> content,
            long totalElements,
            int page,
            int size,
            int totalPages,
            GiftCardStatsResponse stats
    ) {}

    public record GiftCardBillingResponse(
            Long id,
            String giftCardNumber,
            String code,
            String productName,
            String voucherMode,
            String voucherScope,
            List<String> eligibleServiceNames,
            Long clientId,
            String clientName,
            String clientEmail,
            BigDecimal valueGross,
            BigDecimal usedGross,
            BigDecimal remainingGross,
            Integer remainingUses,
            Instant issuedAt,
            Instant expiresAt,
            String status,
            Long billId,
            String billNumber,
            String orderReference,
            Long locationId,
            String locationName
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


    @GetMapping("/gift-cards/paged")
    @Transactional(readOnly = true)
    public GiftCardPageResponse pagedGiftCards(
            @AuthenticationPrincipal User me,
            @RequestParam(name = "locationId", required = false) Long locationId,
            @RequestParam(name = "search", required = false) String search,
            @RequestParam(name = "dateFrom", required = false) java.time.LocalDate dateFrom,
            @RequestParam(name = "dateTo", required = false) java.time.LocalDate dateTo,
            @RequestParam(name = "status", required = false) String statusFilter,
            @RequestParam(name = "sortField", defaultValue = "issuedAt") String sortField,
            @RequestParam(name = "sortDir", defaultValue = "desc") String sortDir,
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "size", defaultValue = "10") int size
    ) {
        List<GiftCardBillingResponse> locationRows = giftCards(me).stream()
                .filter(card -> locationId == null || card.locationId() == null || Objects.equals(card.locationId(), locationId))
                .toList();

        GiftCardStatsResponse stats = new GiftCardStatsResponse(
                locationRows.stream().filter(card -> "active".equals(card.status())).count(),
                locationRows.stream().filter(card -> "partially_used".equals(card.status())).count(),
                locationRows.stream().filter(card -> "used".equals(card.status())).count(),
                locationRows.stream().filter(card -> "expired".equals(card.status())).count(),
                locationRows.stream()
                        .filter(card -> !"SERVICE".equalsIgnoreCase(String.valueOf(card.voucherMode())))
                        .filter(card -> "active".equals(card.status()) || "partially_used".equals(card.status()))
                        .map(card -> safeMoney(card.remainingGross()))
                        .reduce(BigDecimal.ZERO, BigDecimal::add)
                        .setScale(2, RoundingMode.HALF_UP)
        );

        String q = search == null ? "" : search.trim().toLowerCase(java.util.Locale.ROOT);
        java.time.Instant fromInstant = dateFrom == null ? null : dateFrom.atStartOfDay(java.time.ZoneOffset.UTC).toInstant();
        java.time.Instant toInstant = dateTo == null ? null : dateTo.plusDays(1).atStartOfDay(java.time.ZoneOffset.UTC).toInstant();
        String normalizedStatus = statusFilter == null ? "all" : statusFilter.trim().toLowerCase(java.util.Locale.ROOT);

        java.util.List<GiftCardBillingResponse> filtered = locationRows.stream()
                .filter(card -> fromInstant == null || card.issuedAt() == null || !card.issuedAt().isBefore(fromInstant))
                .filter(card -> toInstant == null || card.issuedAt() == null || card.issuedAt().isBefore(toInstant))
                .filter(card -> "all".equals(normalizedStatus) || normalizedStatus.isBlank() || normalizedStatus.equals(String.valueOf(card.status()).toLowerCase(java.util.Locale.ROOT)))
                .filter(card -> q.isBlank() || giftCardSearchText(card).contains(q))
                .sorted(giftCardComparator(sortField, sortDir))
                .toList();

        int safeSize = Math.min(Math.max(size, 1), 100);
        int totalPages = filtered.isEmpty() ? 0 : (int) Math.ceil((double) filtered.size() / safeSize);
        int safePage = totalPages == 0 ? 0 : Math.min(Math.max(page, 0), totalPages - 1);
        int from = safePage * safeSize;
        int to = Math.min(from + safeSize, filtered.size());
        List<GiftCardBillingResponse> content = from >= filtered.size() ? List.of() : filtered.subList(from, to);
        return new GiftCardPageResponse(content, filtered.size(), safePage, safeSize, totalPages, stats);
    }

    private static String giftCardSearchText(GiftCardBillingResponse card) {
        String services = card.eligibleServiceNames() == null ? "" : String.join(" ", card.eligibleServiceNames());
        return String.join(" ",
                String.valueOf(card.giftCardNumber()), String.valueOf(card.code()), String.valueOf(card.productName()),
                String.valueOf(card.voucherMode()), services, String.valueOf(card.clientName()), String.valueOf(card.clientEmail()),
                String.valueOf(card.billNumber()), String.valueOf(card.orderReference()))
                .toLowerCase(java.util.Locale.ROOT);
    }

    private static java.util.Comparator<GiftCardBillingResponse> giftCardComparator(String sortField, String sortDir) {
        java.util.Comparator<GiftCardBillingResponse> comparator = switch (sortField == null ? "" : sortField.trim()) {
            case "id" -> java.util.Comparator.comparing(card -> safeSortText(card.giftCardNumber() == null ? card.id() : card.giftCardNumber()));
            case "code" -> java.util.Comparator.comparing(card -> safeSortText(card.code()));
            case "type" -> java.util.Comparator.comparing(card -> safeSortText(String.valueOf(card.voucherMode()) + " " + String.valueOf(card.voucherScope())));
            case "customer" -> java.util.Comparator.comparing(card -> safeSortText(String.valueOf(card.clientName()) + " " + String.valueOf(card.clientEmail())));
            case "content" -> java.util.Comparator.comparing(card -> safeSortText(String.valueOf(card.productName()) + " " + (card.eligibleServiceNames() == null ? "" : String.join(" ", card.eligibleServiceNames())) + " " + String.valueOf(card.valueGross())));
            case "expires" -> java.util.Comparator.comparing(card -> card.expiresAt() == null ? java.time.Instant.MAX : card.expiresAt());
            case "status" -> java.util.Comparator.comparing(card -> safeSortText(card.status()));
            case "invoice" -> java.util.Comparator.comparing(card -> safeSortText(card.billNumber() == null ? card.orderReference() : card.billNumber()));
            default -> java.util.Comparator.comparing(card -> card.issuedAt() == null ? java.time.Instant.EPOCH : card.issuedAt());
        };
        comparator = comparator.thenComparing(card -> card.issuedAt() == null ? java.time.Instant.EPOCH : card.issuedAt())
                .thenComparing(GiftCardBillingResponse::id);
        return "asc".equalsIgnoreCase(sortDir) ? comparator : comparator.reversed();
    }

    private static String safeSortText(Object value) {
        return String.valueOf(value == null ? "" : value).toLowerCase(java.util.Locale.ROOT);
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
        GiftCardBillingResponse result = toResponse(entitlement, bill);
        if (activityLogs != null) {
            activityLogs.recordUser(me, ActivityModule.BILLING, ActivityAction.GIFT_CARD_SENT,
                    "GIFT_CARD", result.id(), result.giftCardNumber(),
                    "CLIENT", result.clientId(), result.clientName(),
                    "Sent voucher", result.locationId(), null,
                    ActivityDetails.of("product", result.productName(), "voucherMode", result.voucherMode(),
                            "valueGross", result.valueGross(), "billNumber", result.billNumber(), "targetPath", "/billing"));
        }
        return result;
    }

    private GuestEntitlement loadGiftCard(Long id, User me) {
        Long companyId = me.getCompany().getId();
        return entitlements.findById(id)
                .filter(card -> card.getCompany() != null && Objects.equals(card.getCompany().getId(), companyId))
                .filter(this::isGiftCard)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Voucher not found."));
    }

    private GiftCardBillingResponse toResponse(GuestEntitlement entitlement, Bill bill) {
        GuestOrder order = entitlement.getSourceOrder();
        VoucherRedemptionMode mode = VoucherRules.entitlementMode(entitlement);
        VoucherServiceScope scope = VoucherRules.entitlementScope(entitlement);
        boolean valueVoucher = mode != VoucherRedemptionMode.SERVICE;
        BigDecimal valueGross = valueVoucher ? VoucherRules.entitlementFaceValueGross(entitlement) : null;
        BigDecimal remainingGross = valueVoucher ? safeMoney(entitlement.getRemainingValueGross()) : null;
        BigDecimal usedGross = valueVoucher
                ? safeMoney(valueGross).subtract(safeMoney(remainingGross)).max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP)
                : null;
        Client client = entitlement.getClient();
        String clientName = client == null ? "" : (safeText(client.getFirstName()) + " " + safeText(client.getLastName())).trim();
        if (clientName.isBlank() && client != null) clientName = safeText(client.getEmail());
        return new GiftCardBillingResponse(
                entitlement.getId(),
                giftCardNumber(entitlement),
                firstNonBlank(entitlement.getDisplayCode(), entitlement.getEntitlementCode(), ""),
                entitlement.getProduct() == null ? "" : safeText(entitlement.getProduct().getName()),
                (mode == null ? VoucherRedemptionMode.VALUE : mode).name(),
                (scope == null ? VoucherServiceScope.ALL_SERVICES : scope).name(),
                VoucherRules.entitlementEligibleServiceNames(entitlement).stream().toList(),
                client == null ? null : client.getId(),
                clientName,
                client == null ? null : client.getEmail(),
                valueGross,
                usedGross,
                remainingGross,
                entitlement.getRemainingUses(),
                entitlement.getCreatedAt(),
                entitlement.getValidUntil(),
                status(entitlement, mode, valueGross, remainingGross),
                bill == null ? (order == null ? null : order.getBillId()) : bill.getId(),
                bill == null ? null : bill.getBillNumber(),
                order == null ? null : order.getReferenceCode(),
                bill == null || bill.getLocation() == null ? null : bill.getLocation().getId(),
                bill == null || bill.getLocation() == null ? null : bill.getLocation().getName()
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

    private String status(GuestEntitlement entitlement, VoucherRedemptionMode mode, BigDecimal valueGross, BigDecimal remainingGross) {
        if (entitlement.getStatus() == EntitlementStatus.CANCELLED) return "cancelled";
        if (entitlement.getStatus() == EntitlementStatus.PENDING) return "pending_payment";
        GuestOrder order = entitlement.getSourceOrder();
        if (order != null && order.getStatus() == OrderStatus.PENDING) return "pending_payment";
        if (order != null && order.getStatus() == OrderStatus.CANCELLED) return "cancelled";
        if (entitlement.getStatus() == EntitlementStatus.EXPIRED || (entitlement.getValidUntil() != null && !entitlement.getValidUntil().isAfter(Instant.now()))) return "expired";
        if (entitlement.getStatus() == EntitlementStatus.USED_UP) return "used";
        if (mode == VoucherRedemptionMode.SERVICE) {
            return entitlement.getRemainingUses() != null && entitlement.getRemainingUses() <= 0 ? "used" : "active";
        }
        if (safeMoney(remainingGross).compareTo(BigDecimal.ZERO) <= 0) return "used";
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
