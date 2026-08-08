package com.example.app.guest.model;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.LinkedHashSet;
import java.util.Objects;
import java.util.Set;

/** Shared voucher semantics used by booking, billing and wallet flows. */
public final class VoucherRules {
    private static final ObjectMapper JSON = new ObjectMapper();

    private VoucherRules() {}

    public static VoucherRedemptionMode productMode(GuestProduct product) {
        if (product == null || product.getProductType() != ProductType.GIFT_CARD) return null;
        return product.getVoucherRedemptionMode() == null
                ? VoucherRedemptionMode.VALUE
                : product.getVoucherRedemptionMode();
    }

    public static VoucherServiceScope productScope(GuestProduct product) {
        if (product == null || product.getProductType() != ProductType.GIFT_CARD) return null;
        return product.getVoucherServiceScope() == null
                ? VoucherServiceScope.ALL_SERVICES
                : product.getVoucherServiceScope();
    }

    public static BigDecimal productFaceValueGross(GuestProduct product) {
        if (product == null || product.getProductType() != ProductType.GIFT_CARD) return null;
        BigDecimal value = product.getVoucherFaceValueGross() == null
                ? product.getPriceGross()
                : product.getVoucherFaceValueGross();
        return value == null ? null : value.setScale(2, RoundingMode.HALF_UP);
    }

    public static boolean productAllowsService(GuestProduct product, Long sessionTypeId) {
        if (product == null || product.getProductType() != ProductType.GIFT_CARD || sessionTypeId == null) return false;
        if (productScope(product) == VoucherServiceScope.ALL_SERVICES) return true;
        return product.getVoucherSessionTypes() != null && product.getVoucherSessionTypes().stream()
                .anyMatch(type -> type != null && Objects.equals(type.getId(), sessionTypeId));
    }

    public static VoucherRedemptionMode entitlementMode(GuestEntitlement entitlement) {
        VoucherRedemptionMode snapshot = parseMode(entitlement == null ? null : entitlement.getMetadataJson());
        if (snapshot != null) return snapshot;
        return entitlement == null ? null : productMode(entitlement.getProduct());
    }

    public static VoucherServiceScope entitlementScope(GuestEntitlement entitlement) {
        VoucherServiceScope snapshot = parseScope(entitlement == null ? null : entitlement.getMetadataJson());
        if (snapshot != null) return snapshot;
        return entitlement == null ? null : productScope(entitlement.getProduct());
    }

    public static BigDecimal entitlementFaceValueGross(GuestEntitlement entitlement) {
        if (entitlement == null) return null;
        BigDecimal snapshot = decimal(entitlement.getMetadataJson(), "faceValueGross");
        if (snapshot != null) return snapshot.setScale(2, RoundingMode.HALF_UP);
        return productFaceValueGross(entitlement.getProduct());
    }

    public static Set<Long> entitlementEligibleServiceIds(GuestEntitlement entitlement) {
        Set<Long> snapshot = parseServiceIds(entitlement == null ? null : entitlement.getMetadataJson());
        if (!snapshot.isEmpty() || entitlementScope(entitlement) == VoucherServiceScope.SELECTED_SERVICES) {
            return snapshot;
        }
        GuestProduct product = entitlement == null ? null : entitlement.getProduct();
        LinkedHashSet<Long> ids = new LinkedHashSet<>();
        if (product != null && product.getVoucherSessionTypes() != null) {
            product.getVoucherSessionTypes().forEach(type -> {
                if (type != null && type.getId() != null) ids.add(type.getId());
            });
        }
        return ids;
    }

    public static Set<String> entitlementEligibleServiceNames(GuestEntitlement entitlement) {
        Set<String> snapshot = parseServiceNames(entitlement == null ? null : entitlement.getMetadataJson());
        if (!snapshot.isEmpty() || entitlementScope(entitlement) == VoucherServiceScope.SELECTED_SERVICES) {
            return snapshot;
        }
        GuestProduct product = entitlement == null ? null : entitlement.getProduct();
        LinkedHashSet<String> names = new LinkedHashSet<>();
        if (product != null && product.getVoucherSessionTypes() != null) {
            product.getVoucherSessionTypes().forEach(type -> {
                if (type != null && type.getName() != null && !type.getName().isBlank()) names.add(type.getName().trim());
            });
        }
        return names;
    }

    public static boolean entitlementAllowsService(GuestEntitlement entitlement, Long sessionTypeId) {
        if (entitlement == null || sessionTypeId == null) return false;
        if (entitlementScope(entitlement) == VoucherServiceScope.ALL_SERVICES) return true;
        return entitlementEligibleServiceIds(entitlement).contains(sessionTypeId);
    }

    public static boolean isServiceVoucher(GuestEntitlement entitlement) {
        return entitlement != null
                && (entitlement.getEntitlementType() == EntitlementType.GIFT_CARD
                    || (entitlement.getProduct() != null && entitlement.getProduct().getProductType() == ProductType.GIFT_CARD))
                && entitlementMode(entitlement) == VoucherRedemptionMode.SERVICE;
    }

    public static boolean isValueVoucher(GuestEntitlement entitlement) {
        return entitlement != null
                && (entitlement.getEntitlementType() == EntitlementType.GIFT_CARD
                    || (entitlement.getProduct() != null && entitlement.getProduct().getProductType() == ProductType.GIFT_CARD))
                && entitlementMode(entitlement) != VoucherRedemptionMode.SERVICE;
    }

    private static VoucherRedemptionMode parseMode(String metadataJson) {
        String raw = text(metadataJson, "voucherMode");
        if (raw == null) return null;
        try {
            return VoucherRedemptionMode.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private static VoucherServiceScope parseScope(String metadataJson) {
        String raw = text(metadataJson, "voucherScope");
        if (raw == null) return null;
        try {
            return VoucherServiceScope.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private static String text(String metadataJson, String key) {
        if (metadataJson == null || metadataJson.isBlank()) return null;
        try {
            JsonNode node = JSON.readTree(metadataJson).path(key);
            String value = node.asText(null);
            return value == null || value.isBlank() ? null : value;
        } catch (Exception ex) {
            return null;
        }
    }

    private static BigDecimal decimal(String metadataJson, String key) {
        if (metadataJson == null || metadataJson.isBlank()) return null;
        try {
            JsonNode node = JSON.readTree(metadataJson).path(key);
            if (node.isNumber()) return node.decimalValue();
            if (node.isTextual() && !node.asText().isBlank()) return new BigDecimal(node.asText().trim());
        } catch (Exception ignored) {
        }
        return null;
    }

    private static Set<Long> parseServiceIds(String metadataJson) {
        LinkedHashSet<Long> ids = new LinkedHashSet<>();
        if (metadataJson == null || metadataJson.isBlank()) return ids;
        try {
            JsonNode node = JSON.readTree(metadataJson).path("eligibleSessionTypeIds");
            if (node.isArray()) {
                node.forEach(value -> {
                    if (value.canConvertToLong()) ids.add(value.asLong());
                });
            }
        } catch (Exception ignored) {
        }
        return ids;
    }

    private static Set<String> parseServiceNames(String metadataJson) {
        LinkedHashSet<String> names = new LinkedHashSet<>();
        if (metadataJson == null || metadataJson.isBlank()) return names;
        try {
            JsonNode node = JSON.readTree(metadataJson).path("eligibleServiceNames");
            if (node.isArray()) {
                node.forEach(value -> {
                    String name = value.asText(null);
                    if (name != null && !name.isBlank()) names.add(name.trim());
                });
            }
        } catch (Exception ignored) {
        }
        return names;
    }
}
