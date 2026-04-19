package com.example.app.guest.order;

import com.example.app.client.Client;
import com.example.app.guest.model.*;
import com.example.app.session.SessionBooking;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Comparator;
import java.util.EnumSet;
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
        if (usages.findBySessionBookingId(booking.getId()).isPresent()) {
            GuestEntitlementUsage existingUsage = usages.findBySessionBookingId(booking.getId()).orElseThrow();
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
    public boolean maybeRestoreCreditForBooking(SessionBooking booking) {
        GuestEntitlementUsage usage = usages.findBySessionBookingId(booking.getId()).orElse(null);
        if (usage == null) return false;
        GuestEntitlement entitlement = usage.getEntitlement();
        incrementIfLimited(entitlement);
        entitlement.setStatus(EntitlementStatus.ACTIVE);
        entitlements.save(entitlement);
        usages.delete(usage);
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
        entitlement.setRemainingUses(product.getUsageLimit());
        entitlement.setMetadataJson(writeMetadata(new LinkedHashMap<>(Map.of(
                "autoRenews", product.isAutoRenews(),
                "listPriceGross", order.getSubtotalGross() == null ? BigDecimal.ZERO.doubleValue() : order.getSubtotalGross().doubleValue()
        ))));
        return entitlements.save(entitlement);
    }

    private java.util.Optional<GuestEntitlement> findBestMatchingEntitlement(Client client, Long companyId, Long sessionTypeId) {
        Instant now = Instant.now();
        return entitlements.findAllByClientIdAndCompanyIdAndStatusInOrderByCreatedAtDesc(client.getId(), companyId, ACTIVE_STATUSES).stream()
                .filter(entitlement -> entitlement.getValidFrom() == null || !entitlement.getValidFrom().isAfter(now))
                .filter(entitlement -> entitlement.getValidUntil() == null || entitlement.getValidUntil().isAfter(now))
                .filter(entitlement -> entitlement.getRemainingUses() == null || entitlement.getRemainingUses() > 0)
                .filter(entitlement -> entitlement.getProduct() != null)
                .filter(entitlement -> entitlement.getProduct().getSessionType() == null || Objects.equals(entitlement.getProduct().getSessionType().getId(), sessionTypeId))
                .sorted(entitlementPriority())
                .findFirst();
    }

    private Comparator<GuestEntitlement> entitlementPriority() {
        return Comparator
                .comparing((GuestEntitlement entitlement) -> entitlement.getValidUntil() == null ? Instant.MAX : entitlement.getValidUntil())
                .thenComparing(GuestEntitlement::getCreatedAt);
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