package com.example.app.paypal;

import com.example.app.guest.model.GuestOrder;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@Component
public class PayPalClient {
    private static final ObjectMapper JSON = new ObjectMapper();

    private final PayPalConfig config;
    private final RestClient restClient;

    public PayPalClient(PayPalConfig config) {
        this.config = config;
        this.restClient = RestClient.builder().build();
    }

    public PayPalOrderSession createOrder(GuestOrder order, String merchantId) {
        ensureConfigured();
        try {
            String accessToken = accessToken();
            String returnUrl = config.publicBaseUrl() + "/api/guest/paypal/return?orderId=" + order.getId();
            String cancelUrl = config.publicBaseUrl() + "/api/guest/paypal/cancel?orderId=" + order.getId();

            Map<String, Object> request = new LinkedHashMap<>();
            request.put("intent", "CAPTURE");
            request.put("purchase_units", List.of(Map.of(
                    "reference_id", "guest-order-" + order.getId(),
                    "custom_id", String.valueOf(order.getId()),
                    "invoice_id", order.getReferenceCode(),
                    "amount", Map.of(
                            "currency_code", order.getCurrency(),
                            "value", formatAmount(order.getTotalGross())
                    )
            )));
            request.put("payment_source", Map.of("paypal", Map.of("experience_context", Map.of(
                    "brand_name", config.brandName(),
                    "user_action", "PAY_NOW",
                    "shipping_preference", "NO_SHIPPING",
                    "return_url", returnUrl,
                    "cancel_url", cancelUrl
            ))));

            String payload = restClient.post()
                    .uri(config.baseUrl() + "/v2/checkout/orders")
                    .contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.APPLICATION_JSON)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                    .header("PayPal-Request-Id", "guest-order-" + order.getId() + "-" + Instant.now().toEpochMilli())
                    .header("PayPal-Auth-Assertion", authAssertion(config.clientId(), merchantId))
                    .headers(this::applyPartnerHeaders)
                    .body(request)
                    .retrieve()
                    .body(String.class);

            JsonNode root = JSON.readTree(payload == null ? "{}" : payload);
            String paypalOrderId = root.path("id").asText("");
            String approveUrl = null;
            for (JsonNode link : root.path("links")) {
                if ("approve".equalsIgnoreCase(link.path("rel").asText(""))) {
                    approveUrl = link.path("href").asText(null);
                    break;
                }
            }
            if (paypalOrderId.isBlank() || approveUrl == null || approveUrl.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "PayPal did not return an approval link.");
            }
            return new PayPalOrderSession(paypalOrderId, approveUrl);
        } catch (RestClientResponseException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, paypalErrorMessage(ex));
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Unable to create PayPal checkout.");
        }
    }

    public PayPalCaptureResult captureOrder(String paypalOrderId, String merchantId) {
        ensureConfigured();
        try {
            String accessToken = accessToken();
            String payload = restClient.post()
                    .uri(config.baseUrl() + "/v2/checkout/orders/{orderId}/capture", paypalOrderId)
                    .contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.APPLICATION_JSON)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                    .header("PayPal-Auth-Assertion", authAssertion(config.clientId(), merchantId))
                    .headers(this::applyPartnerHeaders)
                    .body(Map.of())
                    .retrieve()
                    .body(String.class);

            JsonNode root = JSON.readTree(payload == null ? "{}" : payload);
            String status = root.path("status").asText("");
            String captureId = root.path("purchase_units").isArray() && root.path("purchase_units").size() > 0
                    ? root.path("purchase_units").get(0).path("payments").path("captures").isArray() && root.path("purchase_units").get(0).path("payments").path("captures").size() > 0
                        ? root.path("purchase_units").get(0).path("payments").path("captures").get(0).path("id").asText(null)
                        : null
                    : null;
            if (!"COMPLETED".equalsIgnoreCase(status) && (captureId == null || captureId.isBlank())) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "PayPal capture did not complete successfully.");
            }
            return new PayPalCaptureResult(status, captureId);
        } catch (RestClientResponseException ex) {
            String body = ex.getResponseBodyAsString(StandardCharsets.UTF_8);
            if (ex.getStatusCode().value() == 422 && body != null && body.contains("ORDER_ALREADY_CAPTURED")) {
                return new PayPalCaptureResult("COMPLETED", null);
            }
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, paypalErrorMessage(ex));
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Unable to capture PayPal payment.");
        }
    }

    private String accessToken() {
        try {
            String payload = restClient.post()
                    .uri(config.baseUrl() + "/v1/oauth2/token")
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .accept(MediaType.APPLICATION_JSON)
                    .headers(headers -> headers.setBasicAuth(config.clientId(), config.clientSecret()))
                    .body("grant_type=client_credentials")
                    .retrieve()
                    .body(String.class);
            JsonNode root = JSON.readTree(payload == null ? "{}" : payload);
            String token = root.path("access_token").asText("");
            if (token.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "PayPal access token was empty.");
            }
            return token;
        } catch (RestClientResponseException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, paypalErrorMessage(ex));
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Unable to authenticate with PayPal.");
        }
    }

    private void ensureConfigured() {
        if (!config.isConfigured()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "PayPal is not configured on the server.");
        }
    }

    private void applyPartnerHeaders(HttpHeaders headers) {
        String partnerAttributionId = config.partnerAttributionId();
        if (partnerAttributionId != null && !partnerAttributionId.isBlank()) {
            headers.set("PayPal-Partner-Attribution-Id", partnerAttributionId);
        }
    }

    private static String authAssertion(String clientId, String merchantId) {
        String header = base64Url("{\"alg\":\"none\"}");
        String payload = base64Url("{\"iss\":\"" + escapeJson(clientId) + "\",\"payer_id\":\"" + escapeJson(merchantId) + "\"}");
        return header + "." + payload + ".";
    }

    private static String base64Url(String input) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(input.getBytes(StandardCharsets.UTF_8));
    }

    private static String escapeJson(String value) {
        return value == null ? "" : value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private static String formatAmount(BigDecimal value) {
        return value.setScale(2, java.math.RoundingMode.HALF_UP).toPlainString();
    }

    private static String paypalErrorMessage(RestClientResponseException ex) {
        String body = ex.getResponseBodyAsString(StandardCharsets.UTF_8);
        if (body != null && !body.isBlank()) {
            try {
                JsonNode root = JSON.readTree(body);
                String description = root.path("message").asText("");
                if (description.isBlank()) {
                    description = root.path("details").isArray() && root.path("details").size() > 0
                            ? root.path("details").get(0).path("description").asText("")
                            : "";
                }
                if (!description.isBlank()) {
                    return "PayPal error: " + description;
                }
            } catch (Exception ignore) {
            }
        }
        return "PayPal request failed.";
    }

    public record PayPalOrderSession(String paypalOrderId, String approveUrl) {}
    public record PayPalCaptureResult(String status, String captureId) {}
}
