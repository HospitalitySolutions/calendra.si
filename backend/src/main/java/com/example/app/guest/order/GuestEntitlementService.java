package com.example.app.guest.order;

import com.example.app.client.Client;
import com.example.app.guest.model.*;
import com.example.app.session.SessionBooking;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class GuestEntitlementService {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final List<EntitlementStatus> ACTIVE_STATUSES = List.of(EntitlementStatus.ACTIVE);
    private static final char[] OPAQUE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();
    private static final SecureRandom OPAQUE_CODE_RANDOM = new SecureRandom();

    private final GuestEntitlementRepository entitlements;
    private final GuestEntitlementUsageRepository usages;

    public GuestEntitlementService(GuestEntitlementRepository entitlements, GuestEntitlementUsageRepository usages) {
        this.entitlements = entitlements;
        this.usages = usages;
    }

    @Transactional
    public GuestEntitlement ensureEntitlementForOrder(GuestOrder order, GuestProduct product) {
        return entitlements.findBySourceOrderId(order.getId()).orElseGet(() -> createEntitlement(order, product));
    }

    @Transactional
    public GuestEntitlementSelection consumeBestMatchingEntitlement(Client client, Long companyId, Long sessionTypeId, SessionBooking booking) {
        GuestEntitlement entitlement = findBestMatchingEntitlement(client, companyId, sessionTypeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "No active membership or visit pack is available for this booking."));
        return consumeEntitlement(entitlement, booking);
    }

    @Transactional
    public GuestEntitlementSelection consumeSelectedEntitlement(Client client, Long companyId, Long sessionTypeId, Long entitlementId, SessionBooking booking) {
        GuestEntitlement entitlement = entitlements.findById(entitlementId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected pass or visit is not available."));
        Instant now = Instant.now();
        boolean matchesClient = entitlement.getClient() != null && Objects.equals(entitlement.getClient().getId(), client.getId());
        boolean matchesCompany = entitlement.getCompany() != null && Objects.equals(entitlement.getCompany().getId(), companyId);
        boolean active = entitlement.getStatus() == EntitlementStatus.ACTIVE;
        boolean validFrom = entitlement.getValidFrom() == null || !entitlement.getValidFrom().isAfter(now);
        boolean validUntil = entitlement.getValidUntil() == null || entitlement.getValidUntil().isAfter(now);
        boolean hasUses = entitlement.getRemainingUses() == null || entitlement.getRemainingUses() > 0;
        boolean notGiftCard = entitlement.getEntitlementType() != EntitlementType.GIFT_CARD;
        boolean matchesService = entitlement.getProduct() != null
                && (entitlement.getProduct().getSessionType() == null || Objects.equals(entitlement.getProduct().getSessionType().getId(), sessionTypeId));
        if (!matchesClient || !matchesCompany || !active || !validFrom || !validUntil || !hasUses || !notGiftCard || !matchesService) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected pass or visit is not available for this booking.");
        }
        return consumeEntitlement(entitlement, booking);
    }

    private GuestEntitlementSelection consumeEntitlement(GuestEntitlement entitlement, SessionBooking booking) {
        List<GuestEntitlementUsage> existingUsages = usages.findAllBySessionBookingIdOrderByUsedAtAsc(booking.getId());
        if (!existingUsages.isEmpty()) {
            GuestEntitlementUsage existingUsage = existingUsages.get(0);
            return new GuestEntitlementSelection(existingUsage.getEntitlement(), false);
        }
        GuestEntitlementUsage usage = new GuestEntitlementUsage();
        usage.setEntitlement(entitlement);
        usage.setSessionBooking(booking);
        usage.setReason(EntitlementUsageReason.BOOKING);
        usage.setUsedAt(Instant.now());
        usages.save(usage);
        decrementIfLimited(entitlement);
        entitlements.save(entitlement);
        return new GuestEntitlementSelection(entitlement, true);
    }

    @Transactional
    public GuestEntitlementSelection consumeBestMatchingGiftCard(
            Client client,
            Long companyId,
            BigDecimal amountGross,
            String currency,
            SessionBooking booking
    ) {
        if (amountGross == null || amountGross.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Gift card payment requires a positive booking amount.");
        }
        BigDecimal amount = amountGross.setScale(2, RoundingMode.HALF_UP);
        List<GuestEntitlementUsage> existingUsages = usages.findAllBySessionBookingIdOrderByUsedAtAsc(booking.getId());
        if (!existingUsages.isEmpty()) {
            boolean allGiftCardUsages = existingUsages.stream()
                    .allMatch(usage -> usage.getEntitlement().getEntitlementType() == EntitlementType.GIFT_CARD);
            if (allGiftCardUsages) {
                return new GuestEntitlementSelection(existingUsages.get(0).getEntitlement(), false);
            }
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This booking already used a wallet entitlement.");
        }
        List<GuestEntitlement> matchingGiftCards = findMatchingGiftCards(client, companyId, currency);
        BigDecimal totalAvailable = matchingGiftCards.stream()
                .map(GuestEntitlement::getRemainingValueGross)
                .filter(Objects::nonNull)
                .map(value -> value.setScale(2, RoundingMode.HALF_UP))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        if (totalAvailable.compareTo(amount) < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No active gift cards with enough total balance are available for this booking.");
        }
        BigDecimal remaining = amount;
        GuestEntitlement firstConsumed = null;
        for (GuestEntitlement entitlement : matchingGiftCards) {
            if (remaining.compareTo(BigDecimal.ZERO) <= 0) break;
            BigDecimal beforeBalance = entitlement.getRemainingValueGross() == null
                    ? BigDecimal.ZERO
                    : entitlement.getRemainingValueGross().setScale(2, RoundingMode.HALF_UP);
            if (beforeBalance.compareTo(BigDecimal.ZERO) <= 0) continue;
            BigDecimal amountFromCard = beforeBalance.min(remaining).setScale(2, RoundingMode.HALF_UP);
            if (amountFromCard.compareTo(BigDecimal.ZERO) <= 0) continue;
            BigDecimal nextBalance = beforeBalance.subtract(amountFromCard).setScale(2, RoundingMode.HALF_UP);
            GuestEntitlementUsage usage = new GuestEntitlementUsage();
            usage.setEntitlement(entitlement);
            usage.setSessionBooking(booking);
            usage.setReason(EntitlementUsageReason.BOOKING);
            usage.setUsedAt(Instant.now());
            usage.setUnitsUsed(toCents(amountFromCard));
            usage.setUnitsBefore(toCents(beforeBalance));
            usage.setUnitsAfter(toCents(nextBalance.max(BigDecimal.ZERO)));
            usages.save(usage);
            entitlement.setRemainingValueGross(nextBalance.max(BigDecimal.ZERO));
            if (nextBalance.compareTo(BigDecimal.ZERO) <= 0) {
                entitlement.setRemainingUses(0);
                entitlement.setStatus(EntitlementStatus.USED_UP);
            } else {
                entitlement.setRemainingUses(1);
                entitlement.setStatus(EntitlementStatus.ACTIVE);
            }
            entitlements.save(entitlement);
            if (firstConsumed == null) {
                firstConsumed = entitlement;
            }
            remaining = remaining.subtract(amountFromCard).setScale(2, RoundingMode.HALF_UP);
        }
        if (remaining.compareTo(BigDecimal.ZERO) > 0 || firstConsumed == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Gift card payment could not be fully allocated.");
        }
        return new GuestEntitlementSelection(firstConsumed, true);
    }

    @Transactional
    public boolean maybeRestoreCreditForBooking(SessionBooking booking) {
        List<GuestEntitlementUsage> usageRows = usages.findAllBySessionBookingIdOrderByUsedAtAsc(booking.getId());
        if (usageRows.isEmpty()) return false;
        for (GuestEntitlementUsage usage : usageRows) {
            GuestEntitlement entitlement = usage.getEntitlement();
            if (entitlement.getEntitlementType() == EntitlementType.GIFT_CARD) {
                BigDecimal restoredBalance = usage.getUnitsBefore() == null
                        ? entitlement.getRemainingValueGross()
                        : BigDecimal.valueOf(usage.getUnitsBefore(), 2).setScale(2, RoundingMode.HALF_UP);
                entitlement.setRemainingValueGross(restoredBalance);
                entitlement.setRemainingUses(1);
            } else {
                incrementIfLimited(entitlement);
            }
            entitlement.setStatus(EntitlementStatus.ACTIVE);
            entitlements.save(entitlement);
        }
        usages.deleteAll(usageRows);
        return true;
    }

    @Transactional(readOnly = true)
    public boolean autoRenews(GuestEntitlement entitlement) {
        String raw = entitlement.getMetadataJson();
        if (raw != null && !raw.isBlank()) {
            try {
                JsonNode root = JSON.readTree(raw);
                if (root.has("autoRenews")) {
                    return root.path("autoRenews").asBoolean(entitlement.getProduct().isAutoRenews());
                }
            } catch (Exception ignore) {
            }
        }
        return entitlement.getProduct() != null && entitlement.getProduct().isAutoRenews();
    }

    @Transactional
    public GuestEntitlement updateAutoRenew(GuestEntitlement entitlement, boolean autoRenews) {
        if (entitlement.getEntitlementType() != EntitlementType.MEMBERSHIP) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Auto-renew is only available for memberships.");
        }
        Map<String, Object> metadata = metadata(entitlement.getMetadataJson());
        metadata.put("autoRenews", autoRenews);
        entitlement.setMetadataJson(writeMetadata(metadata));
        return entitlements.save(entitlement);
    }

    @Transactional(readOnly = true)
    public java.util.Optional<GuestEntitlement> findOwnedEntitlement(Long entitlementId, Long clientId, Long companyId) {
        return entitlements.findById(entitlementId)
                .filter(entitlement -> Objects.equals(entitlement.getClient().getId(), clientId))
                .filter(entitlement -> Objects.equals(entitlement.getCompany().getId(), companyId));
    }

    /**
     * Marks {@link EntitlementStatus#ACTIVE} and {@link EntitlementStatus#PENDING} entitlements as {@link EntitlementStatus#EXPIRED}
     * when {@code validUntil} is set and not after {@code now}.
     *
     * @return number of rows updated
     */
    @Transactional
    public int markExpiredEntitlements(Instant now) {
        return entitlements.markExpiredEntitlements(
                EntitlementStatus.EXPIRED,
                List.of(EntitlementStatus.ACTIVE, EntitlementStatus.PENDING),
                now);
    }

    private GuestEntitlement createEntitlement(GuestOrder order, GuestProduct product) {
        GuestEntitlement entitlement = new GuestEntitlement();
        entitlement.setCompany(order.getCompany());
        entitlement.setClient(order.getClient());
        entitlement.setProduct(product);
        entitlement.setSourceOrder(order);
        entitlement.setEntitlementType(entitlementType(product.getProductType()));
        entitlement.setStatus(EntitlementStatus.ACTIVE);
        entitlement.setValidFrom(order.getPaidAt() != null ? order.getPaidAt() : Instant.now());
        if (product.getValidityDays() != null && product.getValidityDays() > 0) {
            entitlement.setValidUntil(entitlement.getValidFrom().plusSeconds(product.getValidityDays() * 86400L));
        }
        entitlement.setRemainingUses(product.getProductType() == ProductType.GIFT_CARD ? Integer.valueOf(1) : product.getUsageLimit());
        if (product.getProductType() == ProductType.GIFT_CARD) {
            entitlement.setRemainingValueGross((product.getPriceGross() == null ? BigDecimal.ZERO : product.getPriceGross()).setScale(2, RoundingMode.HALF_UP));
        }
        int seq = (int) (entitlements.countByProductId(product.getId()) + 1);
        entitlement.setDisplaySeq(seq);
        entitlement.setDisplayCode(buildDisplayCode(product, seq));
        entitlement.setEntitlementCode(generateUniqueEntitlementCode());
        entitlement.setMetadataJson(writeMetadata(new LinkedHashMap<>(Map.of(
                "autoRenews", product.isAutoRenews(),
                "listPriceGross", order.getSubtotalGross() == null ? BigDecimal.ZERO.doubleValue() : order.getSubtotalGross().doubleValue()
        ))));
        return entitlements.save(entitlement);
    }


    private String generateUniqueEntitlementCode() {
        for (int attempt = 0; attempt < 16; attempt++) {
            String code = "ENT-" + randomOpaqueCode(10);
            if (!entitlements.existsByEntitlementCode(code)) {
                return code;
            }
        }
        throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not generate entitlement code.");
    }

    private static String randomOpaqueCode(int length) {
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            sb.append(OPAQUE_CODE_ALPHABET[OPAQUE_CODE_RANDOM.nextInt(OPAQUE_CODE_ALPHABET.length)]);
        }
        return sb.toString();
    }

    /**
     * Derives a human-friendly code like "CM8-425-001":
     *  - Prefix: uppercase initials of product name (first letter of each alnum word),
     *    truncated to 3 chars; falls back to a 2-letter code for the product type.
     *  - Middle: integer part of the product's gross price (rounded), or "0".
     *  - Suffix: zero-padded 3-digit per-product running sequence.
     */
    private static String buildDisplayCode(GuestProduct product, int sequence) {
        String prefix = initials(product.getName());
        if (prefix.isBlank()) {
            prefix = switch (product.getProductType()) {
                case CLASS_TICKET -> "TK";
                case PACK -> "PK";
                case MEMBERSHIP -> "MB";
                case GIFT_CARD -> "GC";
                default -> "GP";
            };
        }
        int priceInt = product.getPriceGross() == null
                ? 0
                : product.getPriceGross().setScale(0, java.math.RoundingMode.HALF_UP).intValue();
        return String.format("%s-%d-%03d", prefix, priceInt, Math.max(1, sequence));
    }

    private static String initials(String name) {
        if (name == null || name.isBlank()) return "";
        StringBuilder sb = new StringBuilder();
        boolean newWord = true;
        for (int i = 0; i < name.length() && sb.length() < 3; i++) {
            char c = name.charAt(i);
            if (Character.isLetterOrDigit(c)) {
                if (newWord) {
                    sb.append(Character.toUpperCase(c));
                    newWord = false;
                }
            } else {
                newWord = true;
            }
        }
        return sb.toString();
    }

    private java.util.Optional<GuestEntitlement> findBestMatchingEntitlement(Client client, Long companyId, Long sessionTypeId) {
        Instant now = Instant.now();
        return entitlements.findAllByClientIdAndCompanyIdAndStatusInOrderByCreatedAtDesc(client.getId(), companyId, ACTIVE_STATUSES).stream()
                .filter(entitlement -> entitlement.getValidFrom() == null || !entitlement.getValidFrom().isAfter(now))
                .filter(entitlement -> entitlement.getValidUntil() == null || entitlement.getValidUntil().isAfter(now))
                .filter(entitlement -> entitlement.getEntitlementType() != EntitlementType.GIFT_CARD)
                .filter(entitlement -> entitlement.getRemainingUses() == null || entitlement.getRemainingUses() > 0)
                .filter(entitlement -> entitlement.getProduct() != null)
                .filter(entitlement -> entitlement.getProduct().getSessionType() == null || Objects.equals(entitlement.getProduct().getSessionType().getId(), sessionTypeId))
                .sorted(entitlementPriority())
                .findFirst();
    }

    private List<GuestEntitlement> findMatchingGiftCards(Client client, Long companyId, String currency) {
        Instant now = Instant.now();
        String expectedCurrency = currency == null ? null : currency.trim().toUpperCase(java.util.Locale.ROOT);
        return entitlements.findAllByClientIdAndCompanyIdAndStatusInOrderByCreatedAtDesc(client.getId(), companyId, ACTIVE_STATUSES).stream()
                .filter(entitlement -> entitlement.getValidFrom() == null || !entitlement.getValidFrom().isAfter(now))
                .filter(entitlement -> entitlement.getValidUntil() == null || entitlement.getValidUntil().isAfter(now))
                .filter(entitlement -> entitlement.getEntitlementType() == EntitlementType.GIFT_CARD
                        || (entitlement.getProduct() != null && entitlement.getProduct().getProductType() == ProductType.GIFT_CARD))
                .filter(entitlement -> entitlement.getProduct() != null)
                .filter(entitlement -> expectedCurrency == null
                        || entitlement.getProduct().getCurrency() == null
                        || expectedCurrency.equals(entitlement.getProduct().getCurrency().trim().toUpperCase(java.util.Locale.ROOT)))
                .filter(entitlement -> entitlement.getRemainingValueGross() != null
                        && entitlement.getRemainingValueGross().compareTo(BigDecimal.ZERO) > 0)
                .sorted(giftCardConsumptionPriority())
                .toList();
    }

    private Comparator<GuestEntitlement> entitlementPriority() {
        return Comparator
                .comparing((GuestEntitlement entitlement) -> entitlement.getValidUntil() == null ? Instant.MAX : entitlement.getValidUntil())
                .thenComparing(GuestEntitlement::getCreatedAt);
    }

    private Comparator<GuestEntitlement> giftCardConsumptionPriority() {
        return Comparator
                .comparing((GuestEntitlement entitlement) -> entitlement.getRemainingValueGross() == null
                        ? BigDecimal.ZERO
                        : entitlement.getRemainingValueGross().setScale(2, RoundingMode.HALF_UP))
                .thenComparing(GuestEntitlement::getCreatedAt);
    }

    private static int toCents(BigDecimal amount) {
        return amount.movePointRight(2).setScale(0, RoundingMode.HALF_UP).intValue();
    }

    private void decrementIfLimited(GuestEntitlement entitlement) {
        if (entitlement.getRemainingUses() == null) return;
        entitlement.setRemainingUses(Math.max(0, entitlement.getRemainingUses() - 1));
        if (entitlement.getRemainingUses() <= 0) {
            entitlement.setStatus(EntitlementStatus.USED_UP);
        }
    }

    private void incrementIfLimited(GuestEntitlement entitlement) {
        if (entitlement.getRemainingUses() == null) return;
        entitlement.setRemainingUses(entitlement.getRemainingUses() + 1);
    }

    private static EntitlementType entitlementType(ProductType productType) {
        return switch (productType) {
            case CLASS_TICKET -> EntitlementType.TICKET;
            case PACK -> EntitlementType.PACK;
            case MEMBERSHIP -> EntitlementType.MEMBERSHIP;
            case GIFT_CARD -> EntitlementType.GIFT_CARD;
            default -> EntitlementType.ACCESS;
        };
    }

    private static Map<String, Object> metadata(String raw) {
        if (raw == null || raw.isBlank()) return new LinkedHashMap<>();
        try {
            return JSON.readValue(raw, LinkedHashMap.class);
        } catch (Exception ex) {
            return new LinkedHashMap<>();
        }
    }

    private static String writeMetadata(Map<String, Object> metadata) {
        try {
            return JSON.writeValueAsString(metadata);
        } catch (Exception ex) {
            return "{}";
        }
    }

    public record GuestEntitlementSelection(GuestEntitlement entitlement, boolean consumed) {}
}