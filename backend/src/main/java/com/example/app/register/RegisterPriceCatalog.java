package com.example.app.register;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class RegisterPriceCatalog {
    public static final Set<String> PLAN_KEYS = Set.of("basic", "pro", "business");
    public static final Set<String> ADDON_KEYS = Set.of("voice", "billing", "whitelabel");

    private Map<String, Double> plans;
    private Map<String, Double> addons;

    public RegisterPriceCatalog() {}

    public RegisterPriceCatalog(Map<String, Double> plans, Map<String, Double> addons) {
        this.plans = plans;
        this.addons = addons;
    }

    public static RegisterPriceCatalog defaults() {
        Map<String, Double> p = new LinkedHashMap<>();
        p.put("basic", 18.9);
        p.put("pro", 34.9);
        p.put("business", 59.9);
        Map<String, Double> a = new LinkedHashMap<>();
        a.put("voice", 12.0);
        a.put("billing", 8.0);
        a.put("whitelabel", 10.0);
        return new RegisterPriceCatalog(p, a);
    }

    public Map<String, Double> getPlans() {
        return plans;
    }

    public void setPlans(Map<String, Double> plans) {
        this.plans = plans;
    }

    public Map<String, Double> getAddons() {
        return addons;
    }

    public void setAddons(Map<String, Double> addons) {
        this.addons = addons;
    }
}
