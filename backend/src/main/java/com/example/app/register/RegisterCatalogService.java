package com.example.app.register;

import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.user.User;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

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

        double annualDiscount = firstValidPercent(
                patch.getAnnualDiscountPercent(),
                base.getAnnualDiscountPercent() == null
                        ? RegisterPriceCatalog.DEFAULT_ANNUAL_DISCOUNT_PERCENT
                        : base.getAnnualDiscountPercent());

        List<RegisterPriceCatalog.AddonItem> addonItems;
        if (patch.getAddonItems() != null) {
            addonItems = normalizeAddonItems(patch.getAddonItems());
        } else {
            addonItems = normalizeAddonItems(base.getAddonItems());
            if (patch.getAddons() != null) {
                addonItems = applyLegacyAddonPricePatch(addonItems, patch.getAddons());
            }
        }
        Map<String, Double> addons = RegisterPriceCatalog.activeAddonMap(addonItems);
        return new RegisterPriceCatalog(plans, addons, roundMoney(annualDiscount), addonItems);
    }

    private static RegisterPriceCatalog validateAndMerge(RegisterPriceCatalog base, RegisterPriceCatalog incoming) {
        if (incoming == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Body required");
        }
        return merge(base, incoming);
    }

    private static List<RegisterPriceCatalog.AddonItem> normalizeAddonItems(List<RegisterPriceCatalog.AddonItem> incoming) {
        Map<String, RegisterPriceCatalog.AddonItem> out = new LinkedHashMap<>();
        if (incoming == null) return List.of();
        for (RegisterPriceCatalog.AddonItem item : incoming) {
            if (item == null || !isValidAmount(item.getMonthly())) continue;
            String key = normalizeAddonKey(item.getKey(), item.getName());
            if (key.isBlank()) continue;
            String fallbackName = titleFromKey(key);
            out.put(key, new RegisterPriceCatalog.AddonItem(
                    key,
                    cleanText(item.getName(), fallbackName),
                    cleanText(item.getNameSl(), cleanText(item.getName(), fallbackName)),
                    cleanText(item.getDescription(), "Optional platform add-on."),
                    cleanText(item.getDescriptionSl(), cleanText(item.getDescription(), "Dodatek za platformo.")),
                    roundMoney(item.getMonthly()),
                    item.getActive() == null || Boolean.TRUE.equals(item.getActive())));
        }
        return List.copyOf(out.values());
    }

    private static List<RegisterPriceCatalog.AddonItem> applyLegacyAddonPricePatch(
            List<RegisterPriceCatalog.AddonItem> baseItems,
            Map<String, Double> patch
    ) {
        Map<String, RegisterPriceCatalog.AddonItem> out = new LinkedHashMap<>();
        for (RegisterPriceCatalog.AddonItem item : baseItems) {
            String key = normalizeAddonKey(item.getKey(), item.getName());
            Double patched = patch.get(key);
            out.put(key, new RegisterPriceCatalog.AddonItem(
                    key,
                    item.getName(),
                    item.getNameSl(),
                    item.getDescription(),
                    item.getDescriptionSl(),
                    isValidAmount(patched) ? roundMoney(patched) : item.getMonthly(),
                    item.getActive() == null || Boolean.TRUE.equals(item.getActive())));
        }
        for (Map.Entry<String, Double> entry : patch.entrySet()) {
            String key = normalizeAddonKey(entry.getKey(), entry.getKey());
            if (out.containsKey(key) || !isValidAmount(entry.getValue())) continue;
            out.put(key, new RegisterPriceCatalog.AddonItem(
                    key,
                    titleFromKey(key),
                    titleFromKey(key),
                    "Optional platform add-on.",
                    "Dodatek za platformo.",
                    roundMoney(entry.getValue()),
                    true));
        }
        return List.copyOf(out.values());
    }

    private static String cleanText(String raw, String fallback) {
        String v = raw == null ? "" : raw.trim();
        if (v.isBlank()) return fallback;
        return v.length() > 180 ? v.substring(0, 180).trim() : v;
    }

    private static String normalizeAddonKey(String rawKey, String fallbackName) {
        String source = rawKey == null || rawKey.isBlank() ? fallbackName : rawKey;
        if (source == null) return "";
        String slug = source.trim().toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
        return slug.length() > 64 ? slug.substring(0, 64).replaceAll("-$", "") : slug;
    }

    private static String titleFromKey(String key) {
        if (key == null || key.isBlank()) return "Add-on";
        String[] parts = key.replace('-', ' ').split("\\s+");
        StringBuilder out = new StringBuilder();
        for (String part : parts) {
            if (part.isBlank()) continue;
            if (out.length() > 0) out.append(' ');
            out.append(part.substring(0, 1).toUpperCase(Locale.ROOT));
            if (part.length() > 1) out.append(part.substring(1));
        }
        return out.length() == 0 ? "Add-on" : out.toString();
    }

    private static boolean isValidAmount(Double v) {
        if (v == null || v.isNaN() || v.isInfinite()) {
            return false;
        }
        return v >= 0 && v <= MAX_PRICE;
    }

    private static double firstValidPercent(Double requested, double fallback) {
        if (requested == null || requested.isNaN() || requested.isInfinite() || requested < 0 || requested > 100) {
            return fallback;
        }
        return requested;
    }

    private static double roundMoney(double v) {
        return Math.round(v * 100.0) / 100.0;
    }
}
