package com.example.app.paypal;

import com.example.app.company.Company;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import org.springframework.core.env.Environment;

@Service
public class PayPalOnboardingService {
    private static final String STATUS_NOT_CONNECTED = "NOT_CONNECTED";
    private static final String STATUS_LINK_CREATED = "ONBOARDING_LINK_CREATED";
    private static final String STATUS_RETURNED = "ONBOARDING_RETURNED";

    private final AppSettingRepository settings;
    private final Environment environment;
    private final ObjectMapper objectMapper;
    private final RestTemplate restTemplate = new RestTemplate();

    public PayPalOnboardingService(AppSettingRepository settings, Environment environment, ObjectMapper objectMapper) {
        this.settings = settings;
        this.environment = environment;
        this.objectMapper = objectMapper;
    }

    public PayPalOnboardingStatus readConfig(Company company) {
        String merchantId = get(company, SettingKey.PAYPAL_MERCHANT_ID);
        String trackingId = get(company, SettingKey.PAYPAL_TRACKING_ID);
        String status = get(company, SettingKey.PAYPAL_ONBOARDING_STATUS);
        if (status == null || status.isBlank()) {
            status = merchantId == null || merchantId.isBlank() ? STATUS_NOT_CONNECTED : STATUS_RETURNED;
        }
        return new PayPalOnboardingStatus(
                merchantId,
                trackingId,
                status,
                credentialsConfigured(),
                merchantId != null && !merchantId.isBlank()
        );
    }

    @Transactional
    public PayPalOnboardingStatus saveManualConfig(Company company, String merchantId, String trackingId) {
        put(company, SettingKey.PAYPAL_MERCHANT_ID, blankToNull(merchantId));
        put(company, SettingKey.PAYPAL_TRACKING_ID, blankToNull(trackingId));
        put(company, SettingKey.PAYPAL_ONBOARDING_STATUS,
                blankToNull(merchantId) == null ? STATUS_NOT_CONNECTED : STATUS_RETURNED);
        return readConfig(company);
    }

    @Transactional
    public PayPalOnboardingLink createOnboardingLink(Company company, String returnUrl) {
        if (!credentialsConfigured()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "PayPal credentials are not configured on the backend.");
        }
        String normalizedReturnUrl = blankToNull(returnUrl);
        if (normalizedReturnUrl == null || !(normalizedReturnUrl.startsWith("http://") || normalizedReturnUrl.startsWith("https://"))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A valid PayPal return URL is required.");
        }

        String trackingId = Optional.ofNullable(get(company, SettingKey.PAYPAL_TRACKING_ID))
                .filter(v -> !v.isBlank())
                .orElseGet(() -> UUID.randomUUID().toString());

        String accessToken = fetchAccessToken();
        String actionUrl = createPartnerReferral(accessToken, trackingId, normalizedReturnUrl);

        put(company, SettingKey.PAYPAL_TRACKING_ID, trackingId);
        put(company, SettingKey.PAYPAL_ONBOARDING_STATUS, STATUS_LINK_CREATED);

        return new PayPalOnboardingLink(actionUrl, trackingId);
    }

    @Transactional
    public PayPalOnboardingStatus completeOnboarding(Company company, String merchantId, String trackingId) {
        if (blankToNull(trackingId) != null) {
            put(company, SettingKey.PAYPAL_TRACKING_ID, trackingId.trim());
        }
        if (blankToNull(merchantId) != null) {
            put(company, SettingKey.PAYPAL_MERCHANT_ID, merchantId.trim());
            put(company, SettingKey.PAYPAL_ONBOARDING_STATUS, STATUS_RETURNED);
        }
        return readConfig(company);
    }

    private String createPartnerReferral(String accessToken, String trackingId, String returnUrl) {
        String requestUrl = paypalBaseUrl() + "/v2/customer/partner-referrals";

        Map<String, Object> payload = Map.of(
                "tracking_id", trackingId,
                "partner_config_override", Map.of(
                        "return_url", returnUrl,
                        "return_url_description", "Return to Calendra configuration"
                ),
                "operations", List.of(
                        Map.of(
                                "operation", "API_INTEGRATION",
                                "api_integration_preference", Map.of(
                                        "rest_api_integration", Map.of(
                                                "integration_method", "PAYPAL",
                                                "integration_type", "THIRD_PARTY",
                                                "third_party_details", Map.of(
                                                        "features", List.of("PAYMENT", "REFUND")
                                                )
                                        )
                                )
                        )
                ),
                "products", List.of("PPCP"),
                "legal_consents", List.of(
                        Map.of("type", "SHARE_DATA_CONSENT", "granted", true)
                )
        );

        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(accessToken);
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setAccept(List.of(MediaType.APPLICATION_JSON));

        ResponseEntity<String> response = restTemplate.exchange(
                requestUrl,
                HttpMethod.POST,
                new HttpEntity<>(payload, headers),
                String.class
        );

        try {
            JsonNode root = objectMapper.readTree(response.getBody());
            if (root.has("links") && root.get("links").isArray()) {
                for (JsonNode link : root.get("links")) {
                    String rel = link.path("rel").asText("");
                    String href = link.path("href").asText("");
                    if (("action_url".equalsIgnoreCase(rel) || "approve".equalsIgnoreCase(rel)) && !href.isBlank()) {
                        return href;
                    }
                }
                for (JsonNode link : root.get("links")) {
                    String href = link.path("href").asText("");
                    if (!href.isBlank()) return href;
                }
            }
        } catch (Exception ignored) {
            // handled below
        }
        throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "PayPal onboarding link was not returned by PayPal.");
    }

    private String fetchAccessToken() {
        String clientId = requiredEnv("PAYPAL_CLIENT_ID");
        String clientSecret = requiredEnv("PAYPAL_CLIENT_SECRET");

        String basic = Base64.getEncoder()
                .encodeToString((clientId + ":" + clientSecret).getBytes(StandardCharsets.UTF_8));

        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.AUTHORIZATION, "Basic " + basic);
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
        headers.setAccept(List.of(MediaType.APPLICATION_JSON));

        MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
        body.add("grant_type", "client_credentials");

        ResponseEntity<String> response = restTemplate.exchange(
                paypalBaseUrl() + "/v1/oauth2/token",
                HttpMethod.POST,
                new HttpEntity<>(body, headers),
                String.class
        );

        try {
            JsonNode root = objectMapper.readTree(response.getBody());
            String token = root.path("access_token").asText("");
            if (!token.isBlank()) return token;
        } catch (Exception ignored) {
            // handled below
        }
        throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Failed to obtain PayPal access token.");
    }

    private boolean credentialsConfigured() {
        return blankToNull(environment.getProperty("PAYPAL_CLIENT_ID")) != null
                && blankToNull(environment.getProperty("PAYPAL_CLIENT_SECRET")) != null;
    }

    private String paypalBaseUrl() {
        String override = blankToNull(environment.getProperty("PAYPAL_BASE_URL"));
        if (override != null) return override;
        String env = blankToNull(environment.getProperty("PAYPAL_ENV"));
        if (env != null && env.equalsIgnoreCase("live")) {
            return "https://api-m.paypal.com";
        }
        return "https://api-m.sandbox.paypal.com";
    }

    private String requiredEnv(String key) {
        String value = blankToNull(environment.getProperty(key));
        if (value == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing backend PayPal configuration: " + key);
        }
        return value;
    }

    private String get(Company company, SettingKey key) {
        return settings.findByCompanyIdAndKey(company.getId(), key)
                .map(AppSetting::getValue)
                .map(this::blankToNull)
                .orElse(null);
    }

    private void put(Company company, SettingKey key, String value) {
        AppSetting row = settings.findByCompanyIdAndKey(company.getId(), key).orElseGet(() -> {
            AppSetting created = new AppSetting();
            created.setCompany(company);
            created.setKey(key.name());
            return created;
        });
        row.setValue(value == null ? "" : value);
        settings.save(row);
    }

    private String blankToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    public record PayPalOnboardingStatus(
            String merchantId,
            String trackingId,
            String status,
            boolean credentialsConfigured,
            boolean connected
    ) {}

    public record PayPalOnboardingLink(
            String actionUrl,
            String trackingId
    ) {}
}
