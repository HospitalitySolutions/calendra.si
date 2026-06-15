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
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class RegisterCatalogService {
    private static final double MAX_PRICE = 100_000.0;
    private static final Set<String> PLAN_TRANSACTION_SERVICE_KEYS = Set.of(
            "basicMonthly", "basicAnnual", "proMonthly", "proAnnual", "businessMonthly", "businessAnnual"
    );

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

        Map<String, RegisterPriceCatalog.PlanName> planNames = normalizePlanNames(base.getPlanNames(), patch.getPlanNames());

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
        out.setPlanNames(planNames);
        out.setAnnualDiscountPercent(annualDiscountPercent);
        out.setAddonItems(addonItems);
        out.setFeatureItems(featureItems);
        out.setAdditionalUserMonthly(roundMoney(additionalUserMonthly));
        out.setSmsPerMessage(roundFour(smsPerMessage));
        out.setUsagePrices(new RegisterPriceCatalog.UsagePrices(out.getAdditionalUserMonthly(), out.getSmsPerMessage()));
        out.setPlanTransactionServiceIds(normalizePlanTransactionServiceIds(base.getPlanTransactionServiceIds(), patch.getPlanTransactionServiceIds()));
        out.setAdditionalUserTransactionServiceId(firstValidServiceId(
                patch.getAdditionalUserTransactionServiceId(),
                patch.getUsagePrices() == null ? null : patch.getUsagePrices().getAdditionalUserTransactionServiceId(),
                base.getAdditionalUserTransactionServiceId()
        ));
        out.setSmsTransactionServiceId(firstValidServiceId(
                patch.getSmsTransactionServiceId(),
                patch.getUsagePrices() == null ? null : patch.getUsagePrices().getSmsTransactionServiceId(),
                base.getSmsTransactionServiceId()
        ));
        out.setUsagePrices(new RegisterPriceCatalog.UsagePrices(
                out.getAdditionalUserMonthly(),
                out.getSmsPerMessage(),
                out.getAdditionalUserTransactionServiceId(),
                out.getSmsTransactionServiceId()
        ));
        return out;
    }

    private static RegisterPriceCatalog validateAndMerge(RegisterPriceCatalog base, RegisterPriceCatalog incoming) {
        if (incoming == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Body required");
        }
        return merge(base, incoming);
    }

    private static Map<String, RegisterPriceCatalog.PlanName> normalizePlanNames(
            Map<String, RegisterPriceCatalog.PlanName> base,
            Map<String, RegisterPriceCatalog.PlanName> patch
    ) {
        Map<String, RegisterPriceCatalog.PlanName> out = new LinkedHashMap<>();
        for (String key : List.of("basic", "pro", "business")) {
            RegisterPriceCatalog.PlanName fallback = base == null ? null : base.get(key);
            String defaultName = fallback == null ? titleFromKey(key) : text(fallback.getName(), titleFromKey(key));
            String defaultNameSl = fallback == null ? defaultName : text(fallback.getNameSl(), defaultName);
            out.put(key, new RegisterPriceCatalog.PlanName(defaultName, defaultNameSl));
        }
        if (patch != null) {
            for (String key : List.of("basic", "pro", "business")) {
                RegisterPriceCatalog.PlanName incoming = patch.get(key);
                if (incoming == null) continue;
                RegisterPriceCatalog.PlanName fallback = out.get(key);
                String name = text(incoming.getName(), fallback == null ? titleFromKey(key) : fallback.getName());
                String nameSl = text(incoming.getNameSl(), fallback == null ? name : fallback.getNameSl());
                out.put(key, new RegisterPriceCatalog.PlanName(name, nameSl));
            }
        }
        return out;
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
                    Boolean.FALSE != item.getActive(),
                    firstValidServiceId(item.getTransactionServiceId(), fb == null ? null : fb.getTransactionServiceId())
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

    private static Map<String, Long> normalizePlanTransactionServiceIds(Map<String, Long> base, Map<String, Long> patch) {
        Map<String, Long> out = new LinkedHashMap<>();
        if (base != null) {
            for (Map.Entry<String, Long> entry : base.entrySet()) {
                Long id = validServiceId(entry.getValue());
                if (PLAN_TRANSACTION_SERVICE_KEYS.contains(entry.getKey()) && id != null) {
                    out.put(entry.getKey(), id);
                }
            }
        }
        if (patch != null) {
            for (String key : PLAN_TRANSACTION_SERVICE_KEYS) {
                if (!patch.containsKey(key)) continue;
                Long id = validServiceId(patch.get(key));
                if (id == null) {
                    out.remove(key);
                } else {
                    out.put(key, id);
                }
            }
        }
        return out.isEmpty() ? null : out;
    }

    private static Long firstValidServiceId(Long... values) {
        if (values == null) {
            return null;
        }
        for (Long value : values) {
            Long id = validServiceId(value);
            if (id != null) {
                return id;
            }
        }
        return null;
    }

    private static Long validServiceId(Long value) {
        return value == null || value <= 0 ? null : value;
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
