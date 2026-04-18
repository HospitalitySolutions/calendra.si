package com.example.app.widget;

import com.example.app.company.Company;
import com.example.app.settings.AppSettingRepository;
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
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public class WidgetTurnstileService {
    private static final ObjectMapper JSON = new ObjectMapper();
    private final AppSettingRepository settings;
    private final HttpClient httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private final String globalSiteKey;
    private final String globalSecretKey;

    public WidgetTurnstileService(
            AppSettingRepository settings,
            @Value("${app.widget.turnstile.site-key:}") String globalSiteKey,
            @Value("${app.widget.turnstile.secret-key:}") String globalSecretKey
    ) {
        this.settings = settings;
        this.globalSiteKey = globalSiteKey == null ? "" : globalSiteKey.trim();
        this.globalSecretKey = globalSecretKey == null ? "" : globalSecretKey.trim();
    }

    public String siteKey(Company company) {
        return settings.findByCompanyIdAndKey(company.getId(), SettingKey.WIDGET_TURNSTILE_SITE_KEY)
                .map(s -> s.getValue())
                .filter(v -> v != null && !v.isBlank())
                .orElse(globalSiteKey);
    }

    public boolean isEnabled(Company company) {
        return !siteKey(company).isBlank() && !secretKey(company).isBlank();
    }

    public void verifyIfEnabled(Company company, String token, String remoteIp) {
        if (!isEnabled(company)) {
            return;
        }
        if (token == null || token.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Verification challenge is required.");
        }
        try {
            String body = "secret=" + url(secretKey(company))
                    + "&response=" + url(token)
                    + (remoteIp == null || remoteIp.isBlank() ? "" : "&remoteip=" + url(remoteIp));
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create("https://challenges.cloudflare.com/turnstile/v0/siteverify"))
                    .timeout(Duration.ofSeconds(8))
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            JsonNode json = JSON.readTree(response.body());
            if (!json.path("success").asBoolean(false)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Verification challenge failed.");
            }
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Verification challenge could not be completed.");
        }
    }

    private String secretKey(Company company) {
        return settings.findByCompanyIdAndKey(company.getId(), SettingKey.WIDGET_TURNSTILE_SECRET_KEY)
                .map(s -> s.getValue())
                .filter(v -> v != null && !v.isBlank())
                .orElse(globalSecretKey);
    }

    private static String url(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
