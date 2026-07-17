package com.example.app.register;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Public, read-only pricing representation for calendra.si.
 *
 * <p>This intentionally excludes internal transaction-service ids and add-on billing mappings.
 * The public website receives only display-safe package prices, package names, included features,
 * and graduated additional-user pricing.</p>
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record PublicPricingCatalog(
        int catalogVersion,
        String currency,
        boolean vatIncluded,
        int includedUsers,
        int annualBilledMonths,
        int annualSavingsMonths,
        List<Plan> plans,
        List<Feature> features,
        List<AdditionalUserRule> additionalUserRules,
        double smsPerMessageGross
) {
    private static final List<String> PLAN_ORDER = List.of("basic", "pro", "business");
    private static final Map<String, String> PACKAGE_CODES = Map.of(
            "basic", "BASIC",
            "pro", "PROFESSIONAL",
            "business", "PREMIUM"
    );

    public static PublicPricingCatalog from(RegisterPriceCatalog catalog) {
        RegisterPriceCatalog source = catalog == null ? RegisterPriceCatalog.defaults() : catalog;
        Map<String, Double> prices = source.getPlans() == null ? Map.of() : source.getPlans();
        Map<String, RegisterPriceCatalog.PlanName> names = source.getPlanNames() == null
                ? Map.of()
                : source.getPlanNames();

        List<RegisterPriceCatalog.FeatureItem> activeFeatureItems = source.getFeatureItems() == null
                ? List.of()
                : source.getFeatureItems().stream()
                        .filter(item -> item != null && Boolean.FALSE != item.getActive())
                        .toList();

        List<Feature> publicFeatures = new ArrayList<>();
        for (RegisterPriceCatalog.FeatureItem item : activeFeatureItems) {
            String minimumPlan = normalizePlan(item.getMinPlan());
            List<String> includedPlans = PLAN_ORDER.stream()
                    .filter(plan -> planRank(plan) >= planRank(minimumPlan))
                    .toList();
            publicFeatures.add(new Feature(
                    safe(item.getKey()),
                    safe(item.getName()),
                    safe(item.getNameSl()),
                    safe(item.getDescription()),
                    safe(item.getDescriptionSl()),
                    minimumPlan,
                    includedPlans
            ));
        }

        List<Plan> publicPlans = new ArrayList<>();
        for (String planKey : PLAN_ORDER) {
            RegisterPriceCatalog.PlanName planName = names.get(planKey);
            double monthlyGross = roundMoney(prices.getOrDefault(planKey, 0.0));
            List<String> featureKeys = publicFeatures.stream()
                    .filter(feature -> feature.includedPlans().contains(planKey))
                    .map(Feature::key)
                    .filter(key -> key != null && !key.isBlank())
                    .toList();
            publicPlans.add(new Plan(
                    planKey,
                    PACKAGE_CODES.get(planKey),
                    planName == null ? defaultEnglishName(planKey) : fallback(planName.getName(), defaultEnglishName(planKey)),
                    planName == null ? defaultSlovenianName(planKey) : fallback(planName.getNameSl(), defaultSlovenianName(planKey)),
                    monthlyGross,
                    roundMoney(monthlyGross * RegisterPriceCatalog.ANNUAL_BILLED_MONTHS),
                    1,
                    "business".equals(planKey),
                    featureKeys
            ));
        }

        double userTwoToFive = firstAmount(
                source.getAdditionalUserMonthly(),
                source.getUsagePrices() == null ? null : source.getUsagePrices().getAdditionalUserMonthly(),
                9.9
        );
        double userSixOnward = firstAmount(
                source.getAdditionalUserMonthlyAfterFive(),
                source.getUsagePrices() == null ? null : source.getUsagePrices().getAdditionalUserMonthlyAfterFive(),
                6.9
        );
        double sms = firstAmount(
                source.getSmsPerMessage(),
                source.getUsagePrices() == null ? null : source.getUsagePrices().getSmsPerMessage(),
                0.05
        );

        return new PublicPricingCatalog(
                source.getCatalogVersion() == null
                        ? RegisterPriceCatalog.CURRENT_CATALOG_VERSION
                        : source.getCatalogVersion(),
                "EUR",
                true,
                1,
                RegisterPriceCatalog.ANNUAL_BILLED_MONTHS,
                RegisterPriceCatalog.ANNUAL_SAVINGS_MONTHS,
                List.copyOf(publicPlans),
                List.copyOf(publicFeatures),
                List.of(
                        new AdditionalUserRule(2, 5, roundMoney(userTwoToFive)),
                        new AdditionalUserRule(6, null, roundMoney(userSixOnward))
                ),
                roundFour(sms)
        );
    }

    private static int planRank(String planKey) {
        return switch (normalizePlan(planKey)) {
            case "basic" -> 0;
            case "business" -> 2;
            default -> 1;
        };
    }

    private static String normalizePlan(String planKey) {
        if ("basic".equalsIgnoreCase(planKey)) return "basic";
        if ("business".equalsIgnoreCase(planKey)) return "business";
        return "pro";
    }

    private static String defaultEnglishName(String key) {
        return switch (key) {
            case "basic" -> "Basic";
            case "business" -> "Premium";
            default -> "Professional";
        };
    }

    private static String defaultSlovenianName(String key) {
        return switch (key) {
            case "basic" -> "Osnovno";
            case "business" -> "Premium";
            default -> "Profesionalno";
        };
    }

    private static String fallback(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private static String safe(String value) {
        return value == null ? "" : value.trim();
    }

    private static double firstAmount(Double first, Double second, double fallback) {
        if (validAmount(first)) return first;
        if (validAmount(second)) return second;
        return fallback;
    }

    private static boolean validAmount(Double value) {
        return value != null && !value.isNaN() && !value.isInfinite() && value >= 0;
    }

    private static double roundMoney(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    private static double roundFour(double value) {
        return Math.round(value * 10_000.0) / 10_000.0;
    }

    public record Plan(
            String key,
            String packageCode,
            String name,
            String nameSl,
            double monthlyGross,
            double annualGross,
            int includedUsers,
            boolean popular,
            List<String> featureKeys
    ) {}

    public record Feature(
            String key,
            String name,
            String nameSl,
            String description,
            String descriptionSl,
            String minimumPlan,
            List<String> includedPlans
    ) {}

    public record AdditionalUserRule(
            int fromUser,
            Integer toUser,
            double monthlyGrossPerUser
    ) {}
}
