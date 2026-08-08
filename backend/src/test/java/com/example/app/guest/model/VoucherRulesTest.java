package com.example.app.guest.model;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.app.session.SessionType;
import org.junit.jupiter.api.Test;

class VoucherRulesTest {

    @Test
    void legacyGiftCardDefaultsToValueVoucherForAllServices() {
        GuestProduct product = new GuestProduct();
        product.setProductType(ProductType.GIFT_CARD);
        GuestEntitlement entitlement = new GuestEntitlement();
        entitlement.setProduct(product);
        entitlement.setEntitlementType(EntitlementType.GIFT_CARD);

        assertThat(VoucherRules.isValueVoucher(entitlement)).isTrue();
        assertThat(VoucherRules.isServiceVoucher(entitlement)).isFalse();
        assertThat(VoucherRules.entitlementAllowsService(entitlement, 123L)).isTrue();
    }

    @Test
    void issuedVoucherUsesSnapshottedServiceRules() {
        GuestProduct product = new GuestProduct();
        product.setProductType(ProductType.GIFT_CARD);
        product.setVoucherRedemptionMode(VoucherRedemptionMode.VALUE);
        product.setVoucherServiceScope(VoucherServiceScope.ALL_SERVICES);

        GuestEntitlement entitlement = new GuestEntitlement();
        entitlement.setProduct(product);
        entitlement.setEntitlementType(EntitlementType.GIFT_CARD);
        entitlement.setMetadataJson(
                "{\"voucherMode\":\"SERVICE\",\"voucherScope\":\"SELECTED_SERVICES\",\"eligibleSessionTypeIds\":[11,12]}"
        );

        assertThat(VoucherRules.isServiceVoucher(entitlement)).isTrue();
        assertThat(VoucherRules.entitlementAllowsService(entitlement, 11L)).isTrue();
        assertThat(VoucherRules.entitlementAllowsService(entitlement, 99L)).isFalse();
    }

    @Test
    void productSelectedServicesAreUsedBeforeIssuance() {
        GuestProduct product = new GuestProduct();
        product.setProductType(ProductType.GIFT_CARD);
        product.setVoucherRedemptionMode(VoucherRedemptionMode.SERVICE);
        product.setVoucherServiceScope(VoucherServiceScope.SELECTED_SERVICES);
        SessionType service = new SessionType();
        service.setId(44L);
        product.getVoucherSessionTypes().add(service);

        assertThat(VoucherRules.productAllowsService(product, 44L)).isTrue();
        assertThat(VoucherRules.productAllowsService(product, 45L)).isFalse();
    }
    @Test
    void issuedVoucherUsesSnapshottedFaceValueAndServiceNames() {
        GuestProduct product = new GuestProduct();
        product.setProductType(ProductType.GIFT_CARD);
        product.setPriceGross(new java.math.BigDecimal("75.00"));
        product.setVoucherFaceValueGross(new java.math.BigDecimal("90.00"));
        product.setVoucherRedemptionMode(VoucherRedemptionMode.SERVICE);
        product.setVoucherServiceScope(VoucherServiceScope.SELECTED_SERVICES);

        GuestEntitlement entitlement = new GuestEntitlement();
        entitlement.setProduct(product);
        entitlement.setEntitlementType(EntitlementType.GIFT_CARD);
        entitlement.setMetadataJson(
                "{\"voucherMode\":\"VALUE\",\"voucherScope\":\"SELECTED_SERVICES\","
                        + "\"eligibleSessionTypeIds\":[11,12],"
                        + "\"eligibleServiceNames\":[\"Bikini - mali\",\"Bikini - veliki\"],"
                        + "\"faceValueGross\":100.00}"
        );

        assertThat(VoucherRules.entitlementMode(entitlement)).isEqualTo(VoucherRedemptionMode.VALUE);
        assertThat(VoucherRules.entitlementFaceValueGross(entitlement)).isEqualByComparingTo("100.00");
        assertThat(VoucherRules.entitlementEligibleServiceNames(entitlement))
                .containsExactly("Bikini - mali", "Bikini - veliki");
    }

}
