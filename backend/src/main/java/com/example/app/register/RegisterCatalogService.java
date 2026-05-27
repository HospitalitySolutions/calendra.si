package com.example.app.register;

import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.user.User;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class RegisterCatalogService {
    private static final double MAX_PRICE = 100_000.0;

    private final AppSettingRepository settings;
    private final ObjectMapper objectMapper;

    public RegisterCatalogService(AppSettingRepository settings, ObjectMapper objectMapper) {
        this.settings = settings;
        this.objectMapper = objectMapper;
    }

    /** Merged catalog for public register UI (defaults + newest stored override by {@code updatedAt}). */
    public RegisterPriceCatalog mergedCatalog() {
        RegisterPriceCatalog base = RegisterPriceCatalog.defaults();
        String json = settings.findAllByKey(SettingKey.PLATFORM_REGISTER_PRICE_JSON).stream()
                .filter(s -> s.getValue() != null && !s.getValue().isBlank())
                .max(Comparator.comparing(AppSetting::getUpdatedAt))
                .map(AppSetting::getValue)
                .orElse(null);
        if (json == null) {
            return base;
        }
        try {
            RegisterPriceCatalog patch = objectMapper.readValue(json, RegisterPriceCatalog.class);
            return merge(base, patch);
        } catch (Exception ignored) {
            return base;
        }
    }

    public RegisterPriceCatalog readForCompany(Long companyId) {
        RegisterPriceCatalog base = RegisterPriceCatalog.defaults();
        return settings
                .findByCompanyIdAndKey(companyId, SettingKey.PLATFORM_REGISTER_PRICE_JSON)
                .map(AppSetting::getValue)
                .filter(v -> !v.isBlank())
                .flatMap(json -> {
                    try {
                        return java.util.Optional.of(objectMapper.readValue(json, RegisterPriceCatalog.class));
                    } catch (Exception e) {
                        return java.util.Optional.empty();
                    }
                })
                .map(patch -> merge(base, patch))
                .orElse(base);
    }

    public RegisterPriceCatalog saveForCompany(Long companyId, User actingUser, RegisterPriceCatalog incoming) {
        RegisterPriceCatalog validated = validateAndMerge(RegisterPriceCatalog.defaults(), incoming);
        String json;
        try {
            json = objectMapper.writeValueAsString(validated);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Could not serialize catalog");
        }
        AppSetting row = settings.findByCompanyIdAndKey(companyId, SettingKey.PLATFORM_REGISTER_PRICE_JSON)
                .orElseGet(() -> {
                    AppSetting s = new AppSetting();
                    s.setCompany(actingUser.getCompany());
                    s.setKey(SettingKey.PLATFORM_REGISTER_PRICE_JSON.name());
                    return s;
                });
        row.setValue(json);
        settings.save(row);
        return validated;
    }

    private static RegisterPriceCatalog merge(RegisterPriceCatalog base, RegisterPriceCatalog patch) {
        Map<String, Double> plans = new LinkedHashMap<>(base.getPlans());
        if (patch.getPlans() != null) {
            for (Map.Entry<String, Double> e : patch.getPlans().entrySet()) {
                if (RegisterPriceCatalog.PLAN_KEYS.contains(e.getKey()) && isValidAmount(e.getValue())) {
                    plans.put(e.getKey(), roundMoney(e.getValue()));
                }
            }
        }

        List<RegisterPriceCatalog.AddonItem> addonItems = patch.getAddonItems() != null
                ? normalizeAddonItems(patch.getAddonItems(), base.getAddonItems())
                : normalizeLegacyAddonMap(base.getAddonItems(), patch.getAddons());
        Map<String, Double> addons = RegisterPriceCatalog.addonMapFromItems(addonItems);

        List<RegisterPriceCatalog.FeatureItem> featureItems = patch.getFeatureItems() != null
                ? normalizeFeatureItems(patch.getFeatureItems(), base.getFeatureItems())
                : copyFeatureItems(base.getFeatureItems());

        double annualDiscountPercent = isValidPercent(patch.getAnnualDiscountPercent())
                ? roundMoney(patch.getAnnualDiscountPercent())
                : nullSafe(base.getAnnualDiscountPercent(), 15.0);

        double additionalUserMonthly = firstValidAmount(
                patch.getAdditionalUserMonthly(),
                patch.getUsagePrices() == null ? null : patch.getUsagePrices().getAdditionalUserMonthly(),
                base.getAdditionalUserMonthly(),
                9.9
        );
        double smsPerMessage = firstValidAmount(
                patch.getSmsPerMessage(),
                patch.getUsagePrices() == null ? null : patch.getUsagePrices().getSmsPerMessage(),
                base.getSmsPerMessage(),
                0.05
        );

        RegisterPriceCatalog out = new RegisterPriceCatalog(plans, addons);
        out.setAnnualDiscountPercent(annualDiscountPercent);
        out.setAddonItems(addonItems);
        out.setFeatureItems(featureItems);
        out.setAdditionalUserMonthly(roundMoney(additionalUserMonthly));
        out.setSmsPerMessage(roundFour(smsPerMessage));
        out.setUsagePrices(new RegisterPriceCatalog.UsagePrices(out.getAdditionalUserMonthly(), out.getSmsPerMessage()));
        return out;
    }

    private static RegisterPriceCatalog validateAndMerge(RegisterPriceCatalog base, RegisterPriceCatalog incoming) {
        if (incoming == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Body required");
        }
        return merge(base, incoming);
    }

    private static List<RegisterPriceCatalog.AddonItem> normalizeLegacyAddonMap(
            List<RegisterPriceCatalog.AddonItem> defaults,
            Map<String, Double> patch
    ) {
        List<RegisterPriceCatalog.AddonItem> items = copyAddonItems(defaults);
        if (patch == null) {
            return items;
        }
        for (Map.Entry<String, Double> entry : patch.entrySet()) {
            String key = normalizeKey(entry.getKey());
            if (key.isBlank() || !isValidAmount(entry.getValue())) {
                continue;
            }
            RegisterPriceCatalog.AddonItem existing = items.stream()
                    .filter(item -> key.equals(item.getKey()))
                    .findFirst()
                    .orElse(null);
            if (existing == null) {
                existing = new RegisterPriceCatalog.AddonItem(key, titleFromKey(key), titleFromKey(key), "Optional platform add-on.", "Dodatek za platformo.", roundMoney(entry.getValue()), true);
                items.add(existing);
            } else {
                existing.setMonthly(roundMoney(entry.getValue()));
            }
        }
        return items;
    }

    private static List<RegisterPriceCatalog.AddonItem> normalizeAddonItems(
            List<RegisterPriceCatalog.AddonItem> raw,
            List<RegisterPriceCatalog.AddonItem> defaults
    ) {
        Map<String, RegisterPriceCatalog.AddonItem> fallback = new LinkedHashMap<>();
        if (defaults != null) {
            for (RegisterPriceCatalog.AddonItem item : defaults) {
                if (item != null && item.getKey() != null) fallback.put(item.getKey(), item);
            }
        }
        Map<String, RegisterPriceCatalog.AddonItem> out = new LinkedHashMap<>();
        for (RegisterPriceCatalog.AddonItem item : raw) {
            if (item == null) continue;
            String key = normalizeKey(item.getKey() == null ? item.getName() : item.getKey());
            if (key.isBlank()) continue;
            RegisterPriceCatalog.AddonItem fb = fallback.get(key);
            double monthly = isValidAmount(item.getMonthly()) ? item.getMonthly() : nullSafe(fb == null ? null : fb.getMonthly(), 0.0);
            out.put(key, new RegisterPriceCatalog.AddonItem(
                    key,
                    text(item.getName(), fb == null ? titleFromKey(key) : fb.getName()),
                    text(item.getNameSl(), fb == null ? titleFromKey(key) : fb.getNameSl()),
                    text(item.getDescription(), fb == null ? "Optional platform add-on." : fb.getDescription()),
                    text(item.getDescriptionSl(), fb == null ? "Dodatek za platformo." : fb.getDescriptionSl()),
                    roundMoney(monthly),
                    Boolean.FALSE != item.getActive()
            ));
        }
        return new ArrayList<>(out.values());
    }

    private static List<RegisterPriceCatalog.FeatureItem> copyFeatureItems(List<RegisterPriceCatalog.FeatureItem> raw) {
        return normalizeFeatureItems(raw == null ? List.of() : raw, List.of());
    }

    private static List<RegisterPriceCatalog.FeatureItem> normalizeFeatureItems(
            List<RegisterPriceCatalog.FeatureItem> raw,
            List<RegisterPriceCatalog.FeatureItem> defaults
    ) {
        Map<String, RegisterPriceCatalog.FeatureItem> fallback = new LinkedHashMap<>();
        if (defaults != null) {
            for (RegisterPriceCatalog.FeatureItem item : defaults) {
                if (item != null && item.getKey() != null) fallback.put(item.getKey(), item);
            }
        }
        Map<String, RegisterPriceCatalog.FeatureItem> out = new LinkedHashMap<>();
        for (RegisterPriceCatalog.FeatureItem item : raw) {
            if (item == null) continue;
            String key = normalizeKey(item.getKey() == null ? item.getName() : item.getKey());
            if (key.isBlank()) continue;
            RegisterPriceCatalog.FeatureItem fb = fallback.get(key);
            out.put(key, new RegisterPriceCatalog.FeatureItem(
                    key,
                    text(item.getName(), fb == null ? titleFromKey(key) : fb.getName()),
                    text(item.getNameSl(), fb == null ? titleFromKey(key) : fb.getNameSl()),
                    text(item.getDescription(), fb == null ? "Plan feature." : fb.getDescription()),
                    text(item.getDescriptionSl(), fb == null ? "Funkcija paketa." : fb.getDescriptionSl()),
                    normalizePlanKey(item.getMinPlan(), fb == null ? "pro" : fb.getMinPlan()),
                    Boolean.FALSE != item.getActive()
            ));
        }
        return new ArrayList<>(out.values());
    }

    private static List<RegisterPriceCatalog.AddonItem> copyAddonItems(List<RegisterPriceCatalog.AddonItem> raw) {
        return normalizeAddonItems(raw == null ? List.of() : raw, List.of());
    }

    private static boolean isValidAmount(Double v) {
        if (v == null || v.isNaN() || v.isInfinite()) {
            return false;
        }
        return v >= 0 && v <= MAX_PRICE;
    }

    private static boolean isValidPercent(Double v) {
        if (v == null || v.isNaN() || v.isInfinite()) {
            return false;
        }
        return v >= 0 && v <= 100.0;
    }

    private static double firstValidAmount(Double first, Double second, Double third, double fallback) {
        if (isValidAmount(first)) return first;
        if (isValidAmount(second)) return second;
        if (isValidAmount(third)) return third;
        return fallback;
    }

    private static double nullSafe(Double v, double fallback) {
        return v == null ? fallback : v;
    }

    private static double roundMoney(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    private static double roundFour(double v) {
        return Math.round(v * 10000.0) / 10000.0;
    }

    private static String normalizeKey(String raw) {
        if (raw == null) return "";
        return raw.trim().toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("^-|-$", "");
    }

    private static String normalizePlanKey(String raw, String fallback) {
        if (raw == null) return normalizePlanKey(fallback, "pro");
        String value = raw.trim().toLowerCase(Locale.ROOT);
        if ("basic".equals(value) || "pro".equals(value) || "business".equals(value)) {
            return value;
        }
        return "basic".equals(fallback) || "business".equals(fallback) ? fallback : "pro";
    }

    private static String titleFromKey(String key) {
        if (key == null || key.isBlank()) return "Custom item";
        String cleaned = key.replace('-', ' ');
        return Character.toUpperCase(cleaned.charAt(0)) + cleaned.substring(1);
    }

    private static String text(String value, String fallback) {
        return value == null || value.trim().isBlank() ? fallback : value.trim();
    }
}
