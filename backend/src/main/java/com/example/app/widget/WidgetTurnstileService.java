package com.example.app.widget;

import com.example.app.company.Company;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingsCryptoService;
import com.example.app.settings.SettingKey;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class WidgetTurnstileService {
    private static final Logger log = LoggerFactory.getLogger(WidgetTurnstileService.class);
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final URI VERIFY_URI = URI.create("https://challenges.cloudflare.com/turnstile/v0/siteverify");

    private final AppSettingRepository settings;
    private final SettingsCryptoService crypto;
    private final HttpClient httpClient;
    private final String globalSiteKey;
    private final String globalSecretKey;
    private final boolean requiredForPublicActions;

    @Autowired
    public WidgetTurnstileService(
            AppSettingRepository settings,
            SettingsCryptoService crypto,
            @Value("${app.widget.turnstile.site-key:}") String globalSiteKey,
            @Value("${app.widget.turnstile.secret-key:}") String globalSecretKey,
            @Value("${app.widget.turnstile.required-for-public-actions:false}") boolean requiredForPublicActions
    ) {
        this(
                settings,
                crypto,
                globalSiteKey,
                globalSecretKey,
                requiredForPublicActions,
                HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()
        );
    }

    WidgetTurnstileService(
            AppSettingRepository settings,
            SettingsCryptoService crypto,
            String globalSiteKey,
            String globalSecretKey,
            boolean requiredForPublicActions,
            HttpClient httpClient
    ) {
        this.settings = settings;
        this.crypto = crypto;
        this.globalSiteKey = clean(globalSiteKey);
        this.globalSecretKey = clean(globalSecretKey);
        this.requiredForPublicActions = requiredForPublicActions;
        this.httpClient = httpClient;
    }

    public String siteKey(Company company) {
        return credentials(company).siteKey();
    }

    public boolean isEnabled(Company company) {
        return credentials(company).configured();
    }

    public void verifyForPublicAction(Company company, String token, String remoteIp) {
        Credentials credentials = credentials(company);
        if (!credentials.configured()) {
            if (requiredForPublicActions) {
                throw new WidgetTurnstileException(
                        HttpStatus.SERVICE_UNAVAILABLE,
                        "WIDGET_TURNSTILE_MISCONFIGURED",
                        "Booking verification is temporarily unavailable. Please try again later."
                );
            }
            return;
        }
        verifyToken(company, credentials, token, remoteIp);
    }

    public void verifyIfEnabled(Company company, String token, String remoteIp) {
        Credentials credentials = credentials(company);
        if (!credentials.configured()) {
            return;
        }
        verifyToken(company, credentials, token, remoteIp);
    }

    private void verifyToken(Company company, Credentials credentials, String token, String remoteIp) {
        if (token == null || token.isBlank()) {
            throw new WidgetTurnstileException(
                    HttpStatus.BAD_REQUEST,
                    "WIDGET_TURNSTILE_REQUIRED",
                    "Please complete the verification challenge."
            );
        }

        try {
            String body = "secret=" + url(credentials.secretKey())
                    + "&response=" + url(token)
                    + (remoteIp == null || remoteIp.isBlank() ? "" : "&remoteip=" + url(remoteIp));
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(VERIFY_URI)
                    .timeout(Duration.ofSeconds(8))
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                log.warn(
                        "Turnstile verification HTTP failure for tenantId={}, tenantCode={}, credentialSource={}, status={}",
                        company == null ? null : company.getId(),
                        company == null ? null : company.getTenantCode(),
                        credentials.source(),
                        response.statusCode()
                );
                throw unavailable();
            }

            JsonNode json = JSON.readTree(response.body());
            if (json.path("success").asBoolean(false)) {
                return;
            }

            List<String> errorCodes = errorCodes(json);
            log.warn(
                    "Turnstile verification rejected for tenantId={}, tenantCode={}, credentialSource={}, errors={}, hostname={}",
                    company == null ? null : company.getId(),
                    company == null ? null : company.getTenantCode(),
                    credentials.source(),
                    errorCodes,
                    clean(json.path("hostname").asText(""))
            );

            if (errorCodes.contains("invalid-input-secret") || errorCodes.contains("missing-input-secret")) {
                throw new WidgetTurnstileException(
                        HttpStatus.SERVICE_UNAVAILABLE,
                        "WIDGET_TURNSTILE_MISCONFIGURED",
                        "Booking verification is temporarily unavailable. Please try again later."
                );
            }
            if (errorCodes.contains("timeout-or-duplicate")) {
                throw new WidgetTurnstileException(
                        HttpStatus.BAD_REQUEST,
                        "WIDGET_TURNSTILE_EXPIRED",
                        "Verification expired or was already used. Please complete it again."
                );
            }
            if (errorCodes.contains("internal-error")) {
                throw unavailable();
            }
            throw new WidgetTurnstileException(
                    HttpStatus.BAD_REQUEST,
                    "WIDGET_TURNSTILE_FAILED",
                    "Verification failed. Please complete it again."
            );
        } catch (WidgetTurnstileException ex) {
            throw ex;
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            log.warn(
                    "Turnstile verification interrupted for tenantId={}, tenantCode={}",
                    company == null ? null : company.getId(),
                    company == null ? null : company.getTenantCode()
            );
            throw unavailable();
        } catch (Exception ex) {
            log.warn(
                    "Turnstile verification could not be completed for tenantId={}, tenantCode={}: {}",
                    company == null ? null : company.getId(),
                    company == null ? null : company.getTenantCode(),
                    ex.getMessage()
            );
            throw unavailable();
        }
    }

    /**
     * A site key and secret key must always come from the same configuration source.
     * A partially configured tenant override is ignored rather than mixing it with
     * the global counterpart, which Cloudflare correctly rejects.
     */
    private Credentials credentials(Company company) {
        String tenantSiteKey = tenantValue(company, SettingKey.WIDGET_TURNSTILE_SITE_KEY);
        String tenantSecretKey = tenantSecretValue(company);
        boolean hasTenantSiteKey = !tenantSiteKey.isBlank();
        boolean hasTenantSecretKey = !tenantSecretKey.isBlank();

        if (hasTenantSiteKey && hasTenantSecretKey) {
            return new Credentials(tenantSiteKey, tenantSecretKey, "tenant");
        }

        if (hasTenantSiteKey != hasTenantSecretKey) {
            log.warn(
                    "Ignoring incomplete tenant Turnstile override for tenantId={}, tenantCode={}; falling back to one complete global credential pair",
                    company == null ? null : company.getId(),
                    company == null ? null : company.getTenantCode()
            );
        }

        if (!globalSiteKey.isBlank() && !globalSecretKey.isBlank()) {
            return new Credentials(globalSiteKey, globalSecretKey, "global");
        }

        return Credentials.empty();
    }

    private String tenantValue(Company company, SettingKey key) {
        if (company == null || company.getId() == null) {
            return "";
        }
        return settings.findByCompanyIdAndKey(company.getId(), key)
                .map(setting -> clean(setting.getValue()))
                .orElse("");
    }

    private String tenantSecretValue(Company company) {
        String raw = tenantValue(company, SettingKey.WIDGET_TURNSTILE_SECRET_KEY);
        if (raw.isBlank()) {
            return "";
        }
        try {
            return clean(crypto.decryptIfEncrypted(raw));
        } catch (RuntimeException ex) {
            log.warn(
                    "Tenant Turnstile secret could not be decrypted for tenantId={}, tenantCode={}: {}",
                    company == null ? null : company.getId(),
                    company == null ? null : company.getTenantCode(),
                    ex.getMessage()
            );
            return "";
        }
    }

    private static List<String> errorCodes(JsonNode json) {
        List<String> result = new ArrayList<>();
        JsonNode errors = json.path("error-codes");
        if (errors.isArray()) {
            errors.forEach(node -> {
                String value = clean(node.asText(""));
                if (!value.isBlank()) {
                    result.add(value);
                }
            });
        }
        return result;
    }

    private static WidgetTurnstileException unavailable() {
        return new WidgetTurnstileException(
                HttpStatus.BAD_GATEWAY,
                "WIDGET_TURNSTILE_UNAVAILABLE",
                "Verification could not be completed. Please try again."
        );
    }

    private static String clean(String value) {
        return value == null ? "" : value.trim();
    }

    private static String url(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private record Credentials(String siteKey, String secretKey, String source) {
        private static Credentials empty() {
            return new Credentials("", "", "none");
        }

        private boolean configured() {
            return !siteKey.isBlank() && !secretKey.isBlank();
        }
    }
}
