package com.example.app.fiscal;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.LinkedHashMap;
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

            ParsedFursResponse parsed = parseFursResponseBody(response.body());
            JsonNode responseJson = parsed.payloadJson() == null ? parsed.outerJson() : parsed.payloadJson();
            String responseBodyForStorage = parsed.payloadText() == null || parsed.payloadText().isBlank()
                    ? response.body()
                    : parsed.payloadText();

            String messageId = firstText(responseJson, "MessageID", "messageId");
            String error = extractFiscalError(responseJson);
            if (error != null && !error.isBlank()) {
                return new FiscalResponse(false, null, null, null, messageId, error, body, responseBodyForStorage, response.statusCode());
            }

            // FURS returns invoice confirmation as a JWS token. UniqueInvoiceID is inside the decoded JWS payload.
            // In Calendra this is stored as EOR.
            String eor = firstText(responseJson, "UniqueInvoiceID", "uniqueInvoiceId", "EOR", "eor");
            String qr = firstText(responseJson, "QR", "qr");
            return new FiscalResponse(true, null, eor, qr, messageId, null, body, responseBodyForStorage, response.statusCode());
        } catch (Exception e) {
            return new FiscalResponse(false, null, null, null, null, buildErrorMessage(e), null, null, null);
        }
    }

    private ParsedFursResponse parseFursResponseBody(String rawBody) throws Exception {
        JsonNode outerJson = JSON.readTree(rawBody);
        String responseToken = firstText(outerJson, "token");
        if (responseToken == null || responseToken.isBlank()) {
            return new ParsedFursResponse(outerJson, null, null);
        }

        String payloadText = decodeJwsPayload(responseToken);
        if (payloadText == null || payloadText.isBlank()) {
            return new ParsedFursResponse(outerJson, null, null);
        }
        JsonNode payloadJson = JSON.readTree(payloadText);
        return new ParsedFursResponse(outerJson, payloadJson, payloadText);
    }

    private String decodeJwsPayload(String compactJws) {
        String[] parts = compactJws.split("\\.");
        if (parts.length < 2 || parts[1].isBlank()) {
            return null;
        }
        byte[] decoded = Base64.getUrlDecoder().decode(parts[1]);
        return new String(decoded, StandardCharsets.UTF_8);
    }

    private String extractFiscalError(JsonNode json) {
        if (json == null) return null;
        JsonNode error = json.findValue("Error");
        if (error == null || error.isNull()) return null;
        String code = firstText(error, "ErrorCode", "errorCode");
        String message = firstText(error, "ErrorMessage", "errorMessage");
        if ((code == null || code.isBlank()) && (message == null || message.isBlank())) {
            return error.asText(null);
        }
        if (code == null || code.isBlank()) return message;
        if (message == null || message.isBlank()) return code;
        return code + ": " + message;
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

    private record ParsedFursResponse(
            JsonNode outerJson,
            JsonNode payloadJson,
            String payloadText
    ) {}
}
