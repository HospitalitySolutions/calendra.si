package com.example.app.fiscal;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public class FursJsonClient {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final int MAX_ERROR_CAUSE_DEPTH = 6;
    private final FiscalHttpClientConfig httpClientConfig;

    public FursJsonClient(FiscalHttpClientConfig httpClientConfig) {
        this.httpClientConfig = httpClientConfig;
    }

    public FiscalResponse post(String url, String token, Long companyId, String certificatePassword) {
        try {
            HttpClient httpClient = httpClientConfig.buildClient(companyId, certificatePassword);
            String body = JSON.writeValueAsString(Map.of("token", token));
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(java.time.Duration.ofSeconds(30))
                    .header("Content-Type", "application/json; charset=UTF-8")
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                return new FiscalResponse(
                        false,
                        null,
                        null,
                        null,
                        null,
                        "HTTP " + response.statusCode() + ": " + response.body(),
                        body,
                        response.body(),
                        response.statusCode()
                );
            }
            JsonNode json = JSON.readTree(response.body());
            String eor = firstText(json, "EOR", "eor");
            String qr = firstText(json, "QR", "qr");
            String messageId = firstText(json, "MessageID", "messageId", "UniqueInvoiceID", "uniqueInvoiceId");
            return new FiscalResponse(true, null, eor, qr, messageId, null, body, response.body(), response.statusCode());
        } catch (Exception e) {
            return new FiscalResponse(false, null, null, null, null, buildErrorMessage(e), null, null, null);
        }
    }

    private String firstText(JsonNode node, String... fields) {
        if (node == null) return null;
        for (String field : fields) {
            JsonNode n = node.get(field);
            if (n != null && !n.isNull()) {
                String value = n.asText("");
                if (!value.isBlank()) return value;
            }
            JsonNode nested = node.findValue(field);
            if (nested != null && !nested.isNull()) {
                String value = nested.asText("");
                if (!value.isBlank()) return value;
            }
        }
        return null;
    }

    private String buildErrorMessage(Exception e) {
        StringBuilder sb = new StringBuilder();
        Throwable current = e;
        int depth = 0;
        while (current != null && depth < MAX_ERROR_CAUSE_DEPTH) {
            String message = current.getMessage();
            if (message != null && !message.isBlank()) {
                if (sb.length() > 0) {
                    sb.append(" | caused by: ");
                }
                sb.append(message.trim());
            }
            current = current.getCause();
            depth++;
        }
        if (sb.length() > 0) {
            return sb.toString();
        }
        return e.getClass().getSimpleName();
    }
}
