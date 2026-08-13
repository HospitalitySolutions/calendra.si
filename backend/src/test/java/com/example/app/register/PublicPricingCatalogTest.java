package com.example.app.register;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class PublicPricingCatalogTest {
    @Test
    void exposesDisplaySafeGrossPricingAndCumulativeFeatureRows() {
        PublicPricingCatalog catalog = PublicPricingCatalog.from(RegisterPriceCatalog.defaults());

        assertThat(catalog.catalogVersion()).isEqualTo(2);
        assertThat(catalog.currency()).isEqualTo("EUR");
        assertThat(catalog.vatIncluded()).isTrue();
        assertThat(catalog.annualBilledMonths()).isEqualTo(10);
        assertThat(catalog.annualSavingsMonths()).isEqualTo(2);

        assertThat(catalog.plans())
                .extracting(PublicPricingCatalog.Plan::key, PublicPricingCatalog.Plan::monthlyGross, PublicPricingCatalog.Plan::annualGross)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple("basic", 17.9, 179.0),
                        org.assertj.core.groups.Tuple.tuple("pro", 34.9, 349.0),
                        org.assertj.core.groups.Tuple.tuple("business", 54.9, 549.0)
                );

        PublicPricingCatalog.Feature basicFeature = catalog.features().stream()
                .filter(feature -> "appointments".equals(feature.key()))
                .findFirst()
                .orElseThrow();
        assertThat(basicFeature.includedPlans()).containsExactly("basic", "pro", "business");

        PublicPricingCatalog.Feature premiumFeature = catalog.features().stream()
                .filter(feature -> "reporting".equals(feature.key()))
                .findFirst()
                .orElseThrow();
        assertThat(premiumFeature.includedPlans()).containsExactly("business");

        assertThat(catalog.additionalUserRules())
                .extracting(
                        PublicPricingCatalog.AdditionalUserRule::fromUser,
                        PublicPricingCatalog.AdditionalUserRule::toUser,
                        PublicPricingCatalog.AdditionalUserRule::monthlyGrossPerUser
                )
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(2, 5, 9.9),
                        org.assertj.core.groups.Tuple.tuple(6, null, 6.9)
                );

        assertThat(catalog.addOns())
                .extracting(
                        PublicPricingCatalog.AddOn::key,
                        PublicPricingCatalog.AddOn::code,
                        PublicPricingCatalog.AddOn::monthlyGross
                )
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple("voice", "VOICE", 12.0),
                        org.assertj.core.groups.Tuple.tuple("billing", "BILLING", 8.0),
                        org.assertj.core.groups.Tuple.tuple("whitelabel", "WHITELABEL", 10.0)
                );
        assertThat(catalog.addOns())
                .allSatisfy(addOn -> assertThat(addOn.availablePlans())
                        .containsExactly("basic", "pro", "business"));
    }
}
