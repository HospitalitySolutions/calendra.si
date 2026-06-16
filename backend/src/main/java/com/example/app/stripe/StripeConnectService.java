package com.example.app.stripe;

import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.user.User;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class StripeConnectService {
    private static final Logger log = LoggerFactory.getLogger(StripeConnectService.class);
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String STATUS_NOT_CONNECTED = "NOT_CONNECTED";
    private static final String STATUS_LINK_CREATED = "ONBOARDING_LINK_CREATED";
    private static final String STATUS_RESTRICTED = "RESTRICTED";
    private static final String STATUS_ENABLED = "ENABLED";

    private final AppSettingRepository settings;
    private final CompanyRepository companies;
    private final StripePlatformSettingsService platformSettings;
    private final StripeConfig legacyConfig;
    private final HttpClient httpClient = HttpClient.newHttpClient();

    public StripeConnectService(
            AppSettingRepository settings,
            CompanyRepository companies,
            StripePlatformSettingsService platformSettings,
            StripeConfig legacyConfig
    ) {
        this.settings = settings;
        this.companies = companies;
        this.platformSettings = platformSettings;
        this.legacyConfig = legacyConfig;
    }

    public TenantStripeConnectStatus readConfig(Company company) {
        StripeConnectMode activeMode = StripeConnectMode.fromRaw(get(company, SettingKey.STRIPE_CONNECT_MODE, StripeConnectMode.SANDBOX.apiValue()));
        String country = get(company, SettingKey.STRIPE_CONNECT_COUNTRY, defaultCountry());
        String businessType = get(company, SettingKey.STRIPE_CONNECT_BUSINESS_TYPE, "company");
        return new TenantStripeConnectStatus(
                activeMode.apiValue(),
                country,
                businessType,
                toAccountStatus(company, StripeConnectMode.SANDBOX),
                toAccountStatus(company, StripeConnectMode.PRODUCTION),
                platformSettings.modeSettings(StripeConnectMode.SANDBOX).enabled(),
                platformSettings.modeSettings(StripeConnectMode.PRODUCTION).enabled()
        );
    }

    @Transactional
    public TenantStripeConnectStatus saveTenantPreference(Company company, TenantStripePreferenceRequest request) {
        if (request == null) return readConfig(company);
        StripeConnectMode mode = StripeConnectMode.fromRaw(request.mode());
        put(company, SettingKey.STRIPE_CONNECT_MODE, mode.apiValue());
        if (request.country() != null) put(company, SettingKey.STRIPE_CONNECT_COUNTRY, normalizeCountry(request.country()));
        if (request.businessType() != null) put(company, SettingKey.STRIPE_CONNECT_BUSINESS_TYPE, normalizeBusinessType(request.businessType()));
        return readConfig(company);
    }

    @Transactional
    public TenantStripeOnboardingLink startOnboarding(Company company, User actor, TenantStripeOnboardingRequest request) {
        StripeConnectMode mode = StripeConnectMode.fromRaw(request == null ? null : request.mode());
        StripePlatformSettingsService.StripeModeSettings modeSettings = platformSettings.modeSettings(mode);
        if (!modeSettings.enabled()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Stripe " + mode.apiValue() + " is disabled in Platform Admin.");
        }
        if (modeSettings.secretKey() == null || modeSettings.secretKey().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Stripe " + mode.apiValue() + " secret key is not configured in Platform Admin.");
        }
        put(company, SettingKey.STRIPE_CONNECT_MODE, mode.apiValue());
        String country = normalizeCountry(firstNonBlank(request == null ? null : request.country(), get(company, SettingKey.STRIPE_CONNECT_COUNTRY, defaultCountry())));
        String businessType = normalizeBusinessType(firstNonBlank(request == null ? null : request.businessType(), get(company, SettingKey.STRIPE_CONNECT_BUSINESS_TYPE, "company")));
        put(company, SettingKey.STRIPE_CONNECT_COUNTRY, country);
        put(company, SettingKey.STRIPE_CONNECT_BUSINESS_TYPE, businessType);

        String accountId = get(company, accountIdKey(mode), "");
        if (accountId.isBlank()) {
            JsonNode account = createConnectedAccount(company, actor, modeSettings, country, businessType);
            accountId = account.path("id").asText("");
            if (accountId.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Stripe did not return a connected account id.");
            }
            put(company, accountIdKey(mode), accountId);
            applyAccountStatus(company, mode, account);
        } else {
            try {
                applyAccountStatus(company, mode, retrieveAccount(modeSettings, accountId));
            } catch (Exception ex) {
                log.warn("Could not refresh Stripe connected account before onboarding accountId={}: {}", accountId, ex.getMessage());
            }
        }

        String returnUrl = normalizeUrl(firstNonBlank(request == null ? null : request.returnUrl(), defaultOnboardingReturnUrl(mode)));
        String refreshUrl = normalizeUrl(firstNonBlank(request == null ? null : request.refreshUrl(), returnUrl));
        JsonNode link = createAccountLink(modeSettings, accountId, returnUrl, refreshUrl);
        String url = link.path("url").asText("");
        if (url.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Stripe did not return an onboarding URL.");
        }
        put(company, statusKey(mode), STATUS_LINK_CREATED);
        return new TenantStripeOnboardingLink(url, accountId, mode.apiValue());
    }

    @Transactional
    public TenantStripeConnectStatus refreshAccount(Company company, String rawMode) {
        StripeConnectMode mode = StripeConnectMode.fromRaw(rawMode);
        String accountId = get(company, accountIdKey(mode), "");
        if (accountId.isBlank()) return readConfig(company);
        StripePlatformSettingsService.StripeModeSettings modeSettings = platformSettings.modeSettings(mode);
        if (modeSettings.secretKey().isBlank()) return readConfig(company);
        applyAccountStatus(company, mode, retrieveAccount(modeSettings, accountId));
        return readConfig(company);
    }

    public ConnectedAccountRouting routingForCompany(Company company) {
        StripeConnectMode mode = StripeConnectMode.fromRaw(get(company, SettingKey.STRIPE_CONNECT_MODE, StripeConnectMode.SANDBOX.apiValue()));
        StripePlatformSettingsService.StripeModeSettings cfg = platformSettings.modeSettings(mode);
        String accountId = get(company, accountIdKey(mode), "");
        boolean chargesEnabled = "true".equalsIgnoreCase(get(company, chargesEnabledKey(mode), "false"));
        if (!cfg.enabled() || cfg.secretKey().isBlank() || accountId.isBlank() || !chargesEnabled) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Stripe Connect is not ready for this tenancy. Finish onboarding first.");
        }
        return new ConnectedAccountRouting(mode, accountId, cfg);
    }

    /**
     * Lightweight runtime check used by public guest surfaces before rendering Card as a selectable method.
     * It only reads the saved tenant/platform Stripe Connect state; it does not call Stripe.
     */
    public boolean isReadyForCompany(Company company) {
        if (company == null) return false;
        try {
            routingForCompany(company);
            return true;
        } catch (ResponseStatusException ex) {
            return false;
        } catch (RuntimeException ex) {
            log.warn("Could not evaluate Stripe Connect readiness for companyId={}: {}", company.getId(), ex.getMessage());
            return false;
        }
    }

    @Transactional
    public void handleAccountUpdated(String accountId, JsonNode accountNode) {
        if (accountId == null || accountId.isBlank()) return;
        List<AppSetting> sandbox = settings.findAllByKey(SettingKey.STRIPE_SANDBOX_ACCOUNT_ID).stream()
                .filter(s -> accountId.equals(s.getValue()))
                .toList();
        for (AppSetting row : sandbox) {
            applyAccountStatus(row.getCompany(), StripeConnectMode.SANDBOX, accountNode);
        }
        List<AppSetting> production = settings.findAllByKey(SettingKey.STRIPE_PRODUCTION_ACCOUNT_ID).stream()
                .filter(s -> accountId.equals(s.getValue()))
                .toList();
        for (AppSetting row : production) {
            applyAccountStatus(row.getCompany(), StripeConnectMode.PRODUCTION, accountNode);
        }
    }

    private JsonNode createConnectedAccount(Company company, User actor, StripePlatformSettingsService.StripeModeSettings cfg, String country, String businessType) {
        Map<String, String> form = new LinkedHashMap<>();
        form.put("type", "express");
        form.put("country", country);
        String email = actor == null ? "" : actor.getEmail();
        if (email != null && !email.isBlank()) form.put("email", email.trim());
        if (businessType != null && !businessType.isBlank()) form.put("business_type", businessType);
        form.put("capabilities[card_payments][requested]", "true");
        form.put("capabilities[transfers][requested]", "true");
        form.put("business_profile[name]", company.getName() == null ? "Calendra tenant" : company.getName());
        form.put("business_profile[product_description]", "Bookings, memberships, packs, tickets and service payments through Calendra.");
        return stripePost(cfg, "/v1/accounts", form, "stripe-connect-account-" + company.getId() + "-" + cfg.mode().apiValue());
    }

    private JsonNode createAccountLink(StripePlatformSettingsService.StripeModeSettings cfg, String accountId, String returnUrl, String refreshUrl) {
        Map<String, String> form = new LinkedHashMap<>();
        form.put("account", accountId);
        form.put("refresh_url", refreshUrl);
        form.put("return_url", returnUrl);
        form.put("type", "account_onboarding");
        form.put("collection_options[fields]", "eventually_due");
        return stripePost(cfg, "/v1/account_links", form, "stripe-account-link-" + accountId + "-" + System.currentTimeMillis());
    }

    private JsonNode retrieveAccount(StripePlatformSettingsService.StripeModeSettings cfg, String accountId) {
        String url = stripeUrl("/v1/accounts/" + urlEncode(accountId));
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Authorization", "Bearer " + cfg.secretKey())
                .GET()
                .build();
        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) {
                log.error("Stripe retrieve account failed status={} body={}", response.statusCode(), response.body());
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Stripe account lookup failed.");
            }
            return JSON.readTree(response.body());
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            log.error("Stripe account lookup request failed", ex);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Unable to retrieve Stripe account.");
        }
    }

    private JsonNode stripePost(StripePlatformSettingsService.StripeModeSettings cfg, String path, Map<String, String> form, String idempotencyKey) {
        String body = toFormData(form);
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(stripeUrl(path)))
                .header("Authorization", "Bearer " + cfg.secretKey())
                .header("Content-Type", "application/x-www-form-urlencoded")
                .header("Idempotency-Key", idempotencyKey)
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) {
                log.error("Stripe POST failed path={} status={} body={}", path, response.statusCode(), response.body());
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Stripe request failed.");
            }
            return JSON.readTree(response.body());
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            log.error("Stripe POST failed path={}", path, ex);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Unable to call Stripe.");
        }
    }

    private void applyAccountStatus(Company company, StripeConnectMode mode, JsonNode account) {
        if (account == null || account.isMissingNode()) return;
        String accountId = account.path("id").asText("");
        if (!accountId.isBlank()) put(company, accountIdKey(mode), accountId);
        boolean chargesEnabled = account.path("charges_enabled").asBoolean(false);
        boolean payoutsEnabled = account.path("payouts_enabled").asBoolean(false);
        boolean detailsSubmitted = account.path("details_submitted").asBoolean(false);
        put(company, chargesEnabledKey(mode), String.valueOf(chargesEnabled));
        put(company, payoutsEnabledKey(mode), String.valueOf(payoutsEnabled));
        put(company, detailsSubmittedKey(mode), String.valueOf(detailsSubmitted));
        put(company, requirementsKey(mode), requirementsJson(account.path("requirements")));
        String status = chargesEnabled ? STATUS_ENABLED : (detailsSubmitted ? STATUS_RESTRICTED : get(company, statusKey(mode), STATUS_NOT_CONNECTED));
        put(company, statusKey(mode), status);
    }

    private TenantStripeAccountStatus toAccountStatus(Company company, StripeConnectMode mode) {
        String accountId = get(company, accountIdKey(mode), "");
        boolean connected = !accountId.isBlank();
        boolean chargesEnabled = "true".equalsIgnoreCase(get(company, chargesEnabledKey(mode), "false"));
        boolean payoutsEnabled = "true".equalsIgnoreCase(get(company, payoutsEnabledKey(mode), "false"));
        boolean detailsSubmitted = "true".equalsIgnoreCase(get(company, detailsSubmittedKey(mode), "false"));
        String status = get(company, statusKey(mode), connected ? STATUS_RESTRICTED : STATUS_NOT_CONNECTED);
        return new TenantStripeAccountStatus(
                mode.apiValue(),
                connected ? accountId : "",
                connected,
                status,
                chargesEnabled,
                payoutsEnabled,
                detailsSubmitted,
                get(company, requirementsKey(mode), "[]")
        );
    }

    private String requirementsJson(JsonNode requirements) {
        try {
            Map<String, List<String>> out = new LinkedHashMap<>();
            out.put("currently_due", nodeTextArray(requirements.path("currently_due")));
            out.put("eventually_due", nodeTextArray(requirements.path("eventually_due")));
            out.put("past_due", nodeTextArray(requirements.path("past_due")));
            out.put("pending_verification", nodeTextArray(requirements.path("pending_verification")));
            return JSON.writeValueAsString(out);
        } catch (Exception ex) {
            return "{}";
        }
    }

    private List<String> nodeTextArray(JsonNode node) {
        List<String> out = new ArrayList<>();
        if (node != null && node.isArray()) node.forEach(item -> out.add(item.asText("")));
        return out.stream().filter(v -> !v.isBlank()).toList();
    }

    private SettingKey accountIdKey(StripeConnectMode mode) {
        return mode == StripeConnectMode.PRODUCTION ? SettingKey.STRIPE_PRODUCTION_ACCOUNT_ID : SettingKey.STRIPE_SANDBOX_ACCOUNT_ID;
    }

    private SettingKey statusKey(StripeConnectMode mode) {
        return mode == StripeConnectMode.PRODUCTION ? SettingKey.STRIPE_PRODUCTION_ONBOARDING_STATUS : SettingKey.STRIPE_SANDBOX_ONBOARDING_STATUS;
    }

    private SettingKey chargesEnabledKey(StripeConnectMode mode) {
        return mode == StripeConnectMode.PRODUCTION ? SettingKey.STRIPE_PRODUCTION_CHARGES_ENABLED : SettingKey.STRIPE_SANDBOX_CHARGES_ENABLED;
    }

    private SettingKey payoutsEnabledKey(StripeConnectMode mode) {
        return mode == StripeConnectMode.PRODUCTION ? SettingKey.STRIPE_PRODUCTION_PAYOUTS_ENABLED : SettingKey.STRIPE_SANDBOX_PAYOUTS_ENABLED;
    }

    private SettingKey detailsSubmittedKey(StripeConnectMode mode) {
        return mode == StripeConnectMode.PRODUCTION ? SettingKey.STRIPE_PRODUCTION_DETAILS_SUBMITTED : SettingKey.STRIPE_SANDBOX_DETAILS_SUBMITTED;
    }

    private SettingKey requirementsKey(StripeConnectMode mode) {
        return mode == StripeConnectMode.PRODUCTION ? SettingKey.STRIPE_PRODUCTION_REQUIREMENTS_JSON : SettingKey.STRIPE_SANDBOX_REQUIREMENTS_JSON;
    }

    private String get(Company company, SettingKey key, String fallback) {
        return settings.findByCompanyIdAndKey(company.getId(), key)
                .map(AppSetting::getValue)
                .map(v -> v == null ? "" : v.trim())
                .filter(v -> !v.isBlank())
                .orElse(fallback == null ? "" : fallback);
    }

    private void put(Company company, SettingKey key, String value) {
        AppSetting row = settings.findByCompanyIdAndKey(company.getId(), key).orElseGet(() -> {
            AppSetting created = new AppSetting();
            created.setCompany(company);
            created.setKey(key.name());
            return created;
        });
        row.setValue(value == null ? "" : value.trim());
        settings.save(row);
    }

    private String stripeUrl(String path) {
        String base = legacyConfig.baseUrl();
        if (base == null || base.isBlank()) base = "https://api.stripe.com";
        while (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        if (base.endsWith("/v1") && path.startsWith("/v1/")) return base + path.substring(3);
        if (!path.startsWith("/")) path = "/" + path;
        return base + path;
    }

    private String defaultOnboardingReturnUrl(StripeConnectMode mode) {
        String base = legacyConfig.appBaseUrl();
        if (base == null || base.isBlank()) base = "http://localhost:5173";
        while (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        return base + "/configuration?tab=guestApp&subtab=paymentMethods&stripeMode=" + mode.apiValue();
    }

    private String defaultCountry() {
        String country = System.getenv("APP_STRIPE_DEFAULT_COUNTRY");
        if (country == null || country.isBlank()) return "SI";
        return normalizeCountry(country);
    }

    private static String normalizeCountry(String raw) {
        String value = raw == null ? "" : raw.trim().toUpperCase(Locale.ROOT);
        return value.matches("[A-Z]{2}") ? value : "SI";
    }

    private static String normalizeBusinessType(String raw) {
        String value = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
        if (List.of("individual", "company", "non_profit", "government_entity").contains(value)) return value;
        return "company";
    }

    private static String normalizeUrl(String raw) {
        String value = raw == null ? "" : raw.trim();
        if (value.startsWith("http://") || value.startsWith("https://") || value.contains("://")) return value;
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A valid Stripe onboarding URL is required.");
    }

    private static String firstNonBlank(String... values) {
        if (values == null) return "";
        for (String value : values) {
            if (value != null && !value.trim().isBlank()) return value.trim();
        }
        return "";
    }

    private static String toFormData(Map<String, String> map) {
        StringBuilder sb = new StringBuilder();
        boolean first = true;
        for (Map.Entry<String, String> e : map.entrySet()) {
            if (!first) sb.append("&");
            first = false;
            sb.append(urlEncode(e.getKey()));
            sb.append("=");
            sb.append(urlEncode(e.getValue() == null ? "" : e.getValue()));
        }
        return sb.toString();
    }

    private static String urlEncode(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
    }

    public record TenantStripePreferenceRequest(String mode, String country, String businessType) {}
    public record TenantStripeOnboardingRequest(String mode, String country, String businessType, String returnUrl, String refreshUrl) {}
    public record TenantStripeOnboardingLink(String url, String accountId, String mode) {}
    public record TenantStripeConnectStatus(
            String activeMode,
            String country,
            String businessType,
            TenantStripeAccountStatus sandbox,
            TenantStripeAccountStatus production,
            boolean sandboxPlatformEnabled,
            boolean productionPlatformEnabled
    ) {}
    public record TenantStripeAccountStatus(
            String mode,
            String accountId,
            boolean connected,
            String onboardingStatus,
            boolean chargesEnabled,
            boolean payoutsEnabled,
            boolean detailsSubmitted,
            String requirementsJson
    ) {}
    public record ConnectedAccountRouting(StripeConnectMode mode, String accountId, StripePlatformSettingsService.StripeModeSettings modeSettings) {}
}
