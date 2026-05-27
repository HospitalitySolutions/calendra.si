package com.example.app.register;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class RegisterPriceCatalog {
    public static final Set<String> PLAN_KEYS = Set.of("basic", "pro", "business");
    public static final Set<String> DEFAULT_ADDON_KEYS = Set.of("voice", "billing", "whitelabel");
    public static final double DEFAULT_ANNUAL_DISCOUNT_PERCENT = 15.0;

    private Map<String, Double> plans;
    /** Active add-on prices keyed by add-on id. Kept for backwards-compatible clients. */
    private Map<String, Double> addons;
    private Double annualDiscountPercent;
    /** Full add-on catalog used by platform admin and public register pages. */
    private List<AddonItem> addonItems;

    public RegisterPriceCatalog() {}

    public RegisterPriceCatalog(Map<String, Double> plans, Map<String, Double> addons) {
        this(plans, addons, DEFAULT_ANNUAL_DISCOUNT_PERCENT, defaultAddonItems());
    }

    public RegisterPriceCatalog(
            Map<String, Double> plans,
            Map<String, Double> addons,
            Double annualDiscountPercent,
            List<AddonItem> addonItems
    ) {
        this.plans = plans;
        this.addons = addons;
        this.annualDiscountPercent = annualDiscountPercent;
        this.addonItems = addonItems;
    }

    public static RegisterPriceCatalog defaults() {
        Map<String, Double> p = new LinkedHashMap<>();
        p.put("basic", 18.9);
        p.put("pro", 34.9);
        p.put("business", 59.9);
        List<AddonItem> items = defaultAddonItems();
        return new RegisterPriceCatalog(p, activeAddonMap(items), DEFAULT_ANNUAL_DISCOUNT_PERCENT, items);
    }

    public static List<AddonItem> defaultAddonItems() {
        List<AddonItem> a = new ArrayList<>();
        a.add(new AddonItem(
                "voice",
                "AI voice booking",
                "AI glasovne rezervacije",
                "Hands-free assistant for faster scheduling.",
                "Pomočnik brez rok za hitrejše naročanje terminov.",
                12.0,
                true));
        a.add(new AddonItem(
                "billing",
                "Billing & invoices",
                "Obračun in računi",
                "Invoices, payment records, and exports.",
                "Računi, evidence plačil in izvozi.",
                8.0,
                true));
        a.add(new AddonItem(
                "whitelabel",
                "Branded booking experience",
                "Blagovna znamka pri rezervacijah",
                "Custom colors, domain, and branded notifications.",
                "Barve, domena in obvestila v vaši blagovni znamki.",
                10.0,
                true));
        return a;
    }

    public static Map<String, Double> activeAddonMap(List<AddonItem> items) {
        Map<String, Double> out = new LinkedHashMap<>();
        if (items == null) return out;
        for (AddonItem item : items) {
            if (item == null || !Boolean.TRUE.equals(item.getActive())) continue;
            String key = item.getKey();
            Double monthly = item.getMonthly();
            if (key != null && !key.isBlank() && monthly != null) {
                out.put(key.trim(), monthly);
            }
        }
        return out;
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

    public Double getAnnualDiscountPercent() {
        return annualDiscountPercent;
    }

    public void setAnnualDiscountPercent(Double annualDiscountPercent) {
        this.annualDiscountPercent = annualDiscountPercent;
    }

    public List<AddonItem> getAddonItems() {
        return addonItems;
    }

    public void setAddonItems(List<AddonItem> addonItems) {
        this.addonItems = addonItems;
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class AddonItem {
        private String key;
        private String name;
        private String nameSl;
        private String description;
        private String descriptionSl;
        private Double monthly;
        private Boolean active;

        public AddonItem() {}

        public AddonItem(
                String key,
                String name,
                String nameSl,
                String description,
                String descriptionSl,
                Double monthly,
                Boolean active
        ) {
            this.key = key;
            this.name = name;
            this.nameSl = nameSl;
            this.description = description;
            this.descriptionSl = descriptionSl;
            this.monthly = monthly;
            this.active = active;
        }

        public String getKey() { return key; }
        public void setKey(String key) { this.key = key; }
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getNameSl() { return nameSl; }
        public void setNameSl(String nameSl) { this.nameSl = nameSl; }
        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
        public String getDescriptionSl() { return descriptionSl; }
        public void setDescriptionSl(String descriptionSl) { this.descriptionSl = descriptionSl; }
        public Double getMonthly() { return monthly; }
        public void setMonthly(Double monthly) { this.monthly = monthly; }
        public Boolean getActive() { return active; }
        public void setActive(Boolean active) { this.active = active; }
    }
}
