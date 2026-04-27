package com.example.app.register;

import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.user.User;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Comparator;
import java.util.LinkedHashMap;
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
        Map<String, Double> addons = new LinkedHashMap<>(base.getAddons());
        if (patch.getPlans() != null) {
            for (Map.Entry<String, Double> e : patch.getPlans().entrySet()) {
                if (RegisterPriceCatalog.PLAN_KEYS.contains(e.getKey()) && isValidAmount(e.getValue())) {
                    plans.put(e.getKey(), roundMoney(e.getValue()));
                }
            }
        }
        if (patch.getAddons() != null) {
            for (Map.Entry<String, Double> e : patch.getAddons().entrySet()) {
                if (RegisterPriceCatalog.ADDON_KEYS.contains(e.getKey()) && isValidAmount(e.getValue())) {
                    addons.put(e.getKey(), roundMoney(e.getValue()));
                }
            }
        }
        return new RegisterPriceCatalog(plans, addons);
    }

    private static RegisterPriceCatalog validateAndMerge(RegisterPriceCatalog base, RegisterPriceCatalog incoming) {
        if (incoming == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Body required");
        }
        return merge(base, incoming);
    }

    private static boolean isValidAmount(Double v) {
        if (v == null || v.isNaN() || v.isInfinite()) {
            return false;
        }
        return v >= 0 && v <= MAX_PRICE;
    }

    private static double roundMoney(double v) {
        return Math.round(v * 100.0) / 100.0;
    }
}
