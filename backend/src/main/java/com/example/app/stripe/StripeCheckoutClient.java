package com.example.app.stripe;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class StripeCheckoutClient {
    private static final Logger log = LoggerFactory.getLogger(StripeCheckoutClient.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    private final StripeConfig config;
    private final HttpClient httpClient = HttpClient.newHttpClient();

    public StripeCheckoutClient(StripeConfig config) {
        this.config = config;
    }

    public StripeCheckoutSessionResult createOneTimeSession(
            String billNumber,
            BigDecimal amount,
            String currency,
            String customerEmail,
            Map<String, String> metadata
    ) {
        if (config.secretKey().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Stripe secret key is not configured.");
        }
        if (config.successUrl().isBlank() || config.cancelUrl().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Stripe success/cancel URL is not configured.");
        }
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bill amount must be positive.");
        }
        long amountInMinorUnits = amount.multiply(BigDecimal.valueOf(100))
                .setScale(0, RoundingMode.HALF_UP)
                .longValueExact();

        Map<String, String> form = new LinkedHashMap<>();
        form.put("mode", "payment");
        form.put("success_url", config.successUrl());
        form.put("cancel_url", config.cancelUrl());
        if (customerEmail != null && !customerEmail.isBlank()) {
            form.put("customer_email", customerEmail.trim());
        }
        form.put("line_items[0][quantity]", "1");
        form.put("line_items[0][price_data][currency]", currency);
        form.put("line_items[0][price_data][unit_amount]", String.valueOf(amountInMinorUnits));
        form.put("line_items[0][price_data][product_data][name]", "Therapy bill " + billNumber);
        metadata.forEach((k, v) -> form.put("metadata[" + k + "]", v == null ? "" : v));

        String body = toFormData(form);
        String sessionsUrl = normalizeSessionsUrl(config.baseUrl());
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(sessionsUrl))
                .header("Authorization", "Bearer " + config.secretKey())
                .header("Content-Type", "application/x-www-form-urlencoded")
                .header("Idempotency-Key", "bill-checkout-" + metadata.getOrDefault("bill_id", UUID.randomUUID().toString()) + "-" + System.currentTimeMillis())
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();

        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) {
                log.error("Stripe create session failed url={} status={} body={}", sessionsUrl, response.statusCode(), response.body());
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Stripe session creation failed.");
            }
            JsonNode node = JSON.readTree(response.body());
            String id = node.path("id").asText("");
            String url = node.path("url").asText("");
            String status = node.path("status").asText("");
            long expiresAtEpoch = node.path("expires_at").asLong(0L);
            OffsetDateTime expiresAt = expiresAtEpoch > 0
                    ? OffsetDateTime.ofInstant(Instant.ofEpochSecond(expiresAtEpoch), ZoneOffset.UTC)
                    : null;
            if (id.isBlank() || url.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Stripe session response is missing id/url.");
            }
            return new StripeCheckoutSessionResult(id, url, status, expiresAt);
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            log.error("Stripe session request failed", ex);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Unable to create Stripe checkout session.");
        }
    }

    private String toFormData(Map<String, String> map) {
        StringBuilder sb = new StringBuilder();
        boolean first = true;
        for (Map.Entry<String, String> e : map.entrySet()) {
            if (!first) sb.append("&");
            first = false;
            sb.append(URLEncoder.encode(e.getKey(), StandardCharsets.UTF_8));
            sb.append("=");
            sb.append(URLEncoder.encode(e.getValue() == null ? "" : e.getValue(), StandardCharsets.UTF_8));
        }
        return sb.toString();
    }

    private String normalizeSessionsUrl(String rawBaseUrl) {
        String base = (rawBaseUrl == null || rawBaseUrl.isBlank()) ? "https://api.stripe.com" : rawBaseUrl.trim();
        if (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        if (base.endsWith("/v1")) return base + "/checkout/sessions";
        return base + "/v1/checkout/sessions";
    }
}
