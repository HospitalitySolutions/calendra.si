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
        return createOneTimeSession(new StripeCheckoutSessionCreateRequest(
                config.secretKey(),
                config.successUrl(),
                config.cancelUrl(),
                "Therapy bill " + billNumber,
                amount,
                currency,
                customerEmail,
                metadata,
                Map.of(),
                null,
                0L,
                "bill-checkout-" + metadata.getOrDefault("bill_id", UUID.randomUUID().toString()) + "-" + System.currentTimeMillis()
        ));
    }

    public StripeCheckoutSessionResult createOneTimeSession(StripeCheckoutSessionCreateRequest input) {
        if (input == null || input.secretKey() == null || input.secretKey().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Stripe secret key is not configured.");
        }
        if (input.successUrl() == null || input.successUrl().isBlank() || input.cancelUrl() == null || input.cancelUrl().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Stripe success/cancel URL is not configured.");
        }
        if (input.amount() == null || input.amount().compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Stripe amount must be positive.");
        }
        long amountInMinorUnits = input.amount().multiply(BigDecimal.valueOf(100))
                .setScale(0, RoundingMode.HALF_UP)
                .longValueExact();

        Map<String, String> metadata = input.metadata() == null ? Map.of() : input.metadata();
        Map<String, String> paymentIntentMetadata = input.paymentIntentMetadata() == null ? Map.of() : input.paymentIntentMetadata();
        Map<String, String> form = new LinkedHashMap<>();
        form.put("mode", "payment");
        form.put("success_url", input.successUrl());
        form.put("cancel_url", input.cancelUrl());
        if (input.customerEmail() != null && !input.customerEmail().isBlank()) {
            form.put("customer_email", input.customerEmail().trim());
        }
        form.put("line_items[0][quantity]", "1");
        form.put("line_items[0][price_data][currency]", normalizeCurrency(input.currency()));
        form.put("line_items[0][price_data][unit_amount]", String.valueOf(amountInMinorUnits));
        form.put("line_items[0][price_data][product_data][name]", input.productName() == null || input.productName().isBlank() ? "Calendra payment" : input.productName().trim());
        metadata.forEach((k, v) -> form.put("metadata[" + k + "]", v == null ? "" : v));
        paymentIntentMetadata.forEach((k, v) -> form.put("payment_intent_data[metadata][" + k + "]", v == null ? "" : v));
        String connectedAccountId = input.connectedAccountId() == null ? "" : input.connectedAccountId().trim();
        if (!connectedAccountId.isBlank() && input.applicationFeeAmount() != null && input.applicationFeeAmount() > 0) {
            form.put("payment_intent_data[application_fee_amount]", String.valueOf(Math.min(input.applicationFeeAmount(), amountInMinorUnits)));
        }

        String body = toFormData(form);
        String sessionsUrl = normalizeSessionsUrl(config.baseUrl());
        HttpRequest.Builder requestBuilder = HttpRequest.newBuilder()
                .uri(URI.create(sessionsUrl))
                .header("Authorization", "Bearer " + input.secretKey().trim())
                .header("Content-Type", "application/x-www-form-urlencoded")
                .header("Idempotency-Key", input.idempotencyKey() == null || input.idempotencyKey().isBlank() ? "checkout-" + UUID.randomUUID() : input.idempotencyKey());
        if (!connectedAccountId.isBlank()) {
            // Direct charge: the Checkout Session and resulting charge are created on the
            // connected Stripe account, so that account is responsible for Stripe fees.
            // Keep application_fee_amount to collect the platform fee without falling back
            // to destination charges on the platform account.
            requestBuilder.header("Stripe-Account", connectedAccountId);
        }
        HttpRequest request = requestBuilder
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

    private String normalizeCurrency(String currency) {
        String value = currency == null ? "" : currency.trim().toLowerCase();
        return value.isBlank() ? config.currency() : value;
    }

    public record StripeCheckoutSessionCreateRequest(
            String secretKey,
            String successUrl,
            String cancelUrl,
            String productName,
            BigDecimal amount,
            String currency,
            String customerEmail,
            Map<String, String> metadata,
            Map<String, String> paymentIntentMetadata,
            String connectedAccountId,
            Long applicationFeeAmount,
            String idempotencyKey
    ) {}
}
