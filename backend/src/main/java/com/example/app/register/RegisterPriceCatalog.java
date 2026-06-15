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

    private Map<String, Double> plans;
    /** Localized public package names used by the register flow. */
    private Map<String, PlanName> planNames;
    /** Legacy/simple add-on price map, kept for backwards compatibility. */
    private Map<String, Double> addons;
    private Double annualDiscountPercent;
    private List<AddonItem> addonItems;
    private List<FeatureItem> featureItems;
    private Double additionalUserMonthly;
    private Double smsPerMessage;
    private UsagePrices usagePrices;
    /** Optional transaction service ids on the Platform Admin tenant for package billing. */
    private Map<String, Long> planTransactionServiceIds;
    private Long additionalUserTransactionServiceId;
    private Long smsTransactionServiceId;

    public RegisterPriceCatalog() {}

    public RegisterPriceCatalog(Map<String, Double> plans, Map<String, Double> addons) {
        this.plans = plans;
        this.addons = addons;
    }

    public static RegisterPriceCatalog defaults() {
        RegisterPriceCatalog out = new RegisterPriceCatalog();
        Map<String, Double> p = new LinkedHashMap<>();
        p.put("basic", 18.9);
        p.put("pro", 34.9);
        p.put("business", 59.9);
        out.setPlans(p);

        Map<String, PlanName> planNames = new LinkedHashMap<>();
        planNames.put("basic", new PlanName("Basic", "Osnovni"));
        planNames.put("pro", new PlanName("Pro", "Pro"));
        planNames.put("business", new PlanName("Business", "Poslovni"));
        out.setPlanNames(planNames);

        List<AddonItem> addOns = new ArrayList<>();
        addOns.add(new AddonItem("voice", "AI voice booking", "AI glasovne rezervacije", "Hands-free assistant for faster scheduling.", "Pomočnik brez rok za hitrejše naročanje terminov.", 12.0, true));
        addOns.add(new AddonItem("billing", "Billing & invoices", "Obračun in računi", "Invoices, payment records, and exports.", "Računi, evidence plačil in izvozi.", 8.0, true));
        addOns.add(new AddonItem("whitelabel", "Branded booking experience", "Blagovna znamka pri rezervacijah", "Custom colors, domain, and branded notifications.", "Barve, domena in obvestila v vaši blagovni znamki.", 10.0, true));
        out.setAddonItems(addOns);
        out.setAddons(addonMapFromItems(addOns));

        List<FeatureItem> features = new ArrayList<>();
        features.add(new FeatureItem("appointments", "Unlimited appointments", "Neomejeno terminov", "Accept bookings without monthly caps.", "Sprejemajte rezervacije brez mesečne omejitve.", "basic", true));
        features.add(new FeatureItem("staff", "Team members", "Člani ekipe", "Manage staff schedules and availability.", "Upravljajte urnike in razpoložljivost osebja.", "basic", true));
        features.add(new FeatureItem("group", "Group bookings", "Skupinske rezervacije", "Classes, sessions, workshops, and shared slots.", "Tečaji, delavnice in deljene kapacitete.", "pro", true));
        features.add(new FeatureItem("resources", "Resource scheduling", "Razporeditev virov", "Rooms, chairs, courts, equipment, and assets.", "Sobe, stoli, igrišča, oprema in drugi viri.", "pro", true));
        features.add(new FeatureItem("payments", "Online payments", "Spletna plačila", "Deposits and prepayments during booking.", "Akontacije in predplačila med rezervacijo.", "pro", true));
        features.add(new FeatureItem("reminders", "SMS & email reminders", "SMS in e-poštni opomniki", "Reduce no-shows automatically.", "Manj neprihodov z avtomatskimi opomniki.", "pro", true));
        features.add(new FeatureItem("ai", "AI booking assistant", "AI pomočnik za rezervacije", "Voice booking and intelligent scheduling help.", "Glasovne rezervacije in pametna pomoč pri urniku.", "pro", true));
        features.add(new FeatureItem("integrations", "Integrations", "Integracije", "Google, Outlook, Zoom, payments, automation.", "Google, Outlook, Zoom, plačila, avtomatizacija.", "pro", true));
        features.add(new FeatureItem("reporting", "Advanced reporting", "Napredno poročanje", "Revenue, utilization, and booking analytics.", "Prihodki, izkoriščenost in analitika rezervacij.", "business", true));
        features.add(new FeatureItem("multilocation", "Multi-location support", "Več lokacij", "Manage multiple branches in one account.", "Več podružnic v enem računu.", "business", true));
        out.setFeatureItems(features);

        out.setAnnualDiscountPercent(15.0);
        out.setAdditionalUserMonthly(9.9);
        out.setSmsPerMessage(0.05);
        out.setUsagePrices(new UsagePrices(9.9, 0.05));
        return out;
    }

    public static Map<String, Double> addonMapFromItems(List<AddonItem> items) {
        Map<String, Double> map = new LinkedHashMap<>();
        if (items == null) {
            return map;
        }
        for (AddonItem item : items) {
            if (item != null && item.getKey() != null && Boolean.FALSE != item.getActive()) {
                map.put(item.getKey(), item.getMonthly() == null ? 0.0 : item.getMonthly());
            }
        }
        return map;
    }

    public Map<String, Double> getPlans() { return plans; }
    public void setPlans(Map<String, Double> plans) { this.plans = plans; }
    public Map<String, PlanName> getPlanNames() { return planNames; }
    public void setPlanNames(Map<String, PlanName> planNames) { this.planNames = planNames; }
    public Map<String, Double> getAddons() { return addons; }
    public void setAddons(Map<String, Double> addons) { this.addons = addons; }
    public Double getAnnualDiscountPercent() { return annualDiscountPercent; }
    public void setAnnualDiscountPercent(Double annualDiscountPercent) { this.annualDiscountPercent = annualDiscountPercent; }
    public List<AddonItem> getAddonItems() { return addonItems; }
    public void setAddonItems(List<AddonItem> addonItems) { this.addonItems = addonItems; }
    public List<FeatureItem> getFeatureItems() { return featureItems; }
    public void setFeatureItems(List<FeatureItem> featureItems) { this.featureItems = featureItems; }
    public Double getAdditionalUserMonthly() { return additionalUserMonthly; }
    public void setAdditionalUserMonthly(Double additionalUserMonthly) { this.additionalUserMonthly = additionalUserMonthly; }
    public Double getSmsPerMessage() { return smsPerMessage; }
    public void setSmsPerMessage(Double smsPerMessage) { this.smsPerMessage = smsPerMessage; }
    public UsagePrices getUsagePrices() { return usagePrices; }
    public void setUsagePrices(UsagePrices usagePrices) { this.usagePrices = usagePrices; }
    public Map<String, Long> getPlanTransactionServiceIds() { return planTransactionServiceIds; }
    public void setPlanTransactionServiceIds(Map<String, Long> planTransactionServiceIds) { this.planTransactionServiceIds = planTransactionServiceIds; }
    public Long getAdditionalUserTransactionServiceId() { return additionalUserTransactionServiceId; }
    public void setAdditionalUserTransactionServiceId(Long additionalUserTransactionServiceId) { this.additionalUserTransactionServiceId = additionalUserTransactionServiceId; }
    public Long getSmsTransactionServiceId() { return smsTransactionServiceId; }
    public void setSmsTransactionServiceId(Long smsTransactionServiceId) { this.smsTransactionServiceId = smsTransactionServiceId; }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class PlanName {
        private String name;
        private String nameSl;

        public PlanName() {}
        public PlanName(String name, String nameSl) {
            this.name = name;
            this.nameSl = nameSl;
        }
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getNameSl() { return nameSl; }
        public void setNameSl(String nameSl) { this.nameSl = nameSl; }
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
        private Long transactionServiceId;

        public AddonItem() {}
        public AddonItem(String key, String name, String nameSl, String description, String descriptionSl, Double monthly, Boolean active) {
            this(key, name, nameSl, description, descriptionSl, monthly, active, null);
        }
        public AddonItem(String key, String name, String nameSl, String description, String descriptionSl, Double monthly, Boolean active, Long transactionServiceId) {
            this.key = key;
            this.name = name;
            this.nameSl = nameSl;
            this.description = description;
            this.descriptionSl = descriptionSl;
            this.monthly = monthly;
            this.active = active;
            this.transactionServiceId = transactionServiceId;
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
        public Long getTransactionServiceId() { return transactionServiceId; }
        public void setTransactionServiceId(Long transactionServiceId) { this.transactionServiceId = transactionServiceId; }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class FeatureItem {
        private String key;
        private String name;
        private String nameSl;
        private String description;
        private String descriptionSl;
        private String minPlan;
        private Boolean active;

        public FeatureItem() {}
        public FeatureItem(String key, String name, String nameSl, String description, String descriptionSl, String minPlan, Boolean active) {
            this.key = key;
            this.name = name;
            this.nameSl = nameSl;
            this.description = description;
            this.descriptionSl = descriptionSl;
            this.minPlan = minPlan;
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
        public String getMinPlan() { return minPlan; }
        public void setMinPlan(String minPlan) { this.minPlan = minPlan; }
        public Boolean getActive() { return active; }
        public void setActive(Boolean active) { this.active = active; }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class UsagePrices {
        private Double additionalUserMonthly;
        private Double smsPerMessage;
        private Long additionalUserTransactionServiceId;
        private Long smsTransactionServiceId;

        public UsagePrices() {}
        public UsagePrices(Double additionalUserMonthly, Double smsPerMessage) {
            this(additionalUserMonthly, smsPerMessage, null, null);
        }
        public UsagePrices(Double additionalUserMonthly, Double smsPerMessage, Long additionalUserTransactionServiceId, Long smsTransactionServiceId) {
            this.additionalUserMonthly = additionalUserMonthly;
            this.smsPerMessage = smsPerMessage;
            this.additionalUserTransactionServiceId = additionalUserTransactionServiceId;
            this.smsTransactionServiceId = smsTransactionServiceId;
        }
        public Double getAdditionalUserMonthly() { return additionalUserMonthly; }
        public void setAdditionalUserMonthly(Double additionalUserMonthly) { this.additionalUserMonthly = additionalUserMonthly; }
        public Double getSmsPerMessage() { return smsPerMessage; }
        public void setSmsPerMessage(Double smsPerMessage) { this.smsPerMessage = smsPerMessage; }
        public Long getAdditionalUserTransactionServiceId() { return additionalUserTransactionServiceId; }
        public void setAdditionalUserTransactionServiceId(Long additionalUserTransactionServiceId) { this.additionalUserTransactionServiceId = additionalUserTransactionServiceId; }
        public Long getSmsTransactionServiceId() { return smsTransactionServiceId; }
        public void setSmsTransactionServiceId(Long smsTransactionServiceId) { this.smsTransactionServiceId = smsTransactionServiceId; }
    }
}
