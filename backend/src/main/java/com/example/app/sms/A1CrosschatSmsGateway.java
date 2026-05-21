package com.example.app.sms;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.client.RestTemplate;

@Service
public class A1CrosschatSmsGateway implements SmsGateway {
    static final String TEST_URL = "https://a1-test.crosschat.si/api/sms/send";
    static final String PRODUCTION_URL = "https://a1.crosschat.si/api/sms/send";

    private static final Logger log = LoggerFactory.getLogger(A1CrosschatSmsGateway.class);

    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper;
    private final String authToken;
    private final boolean useTestEnvironment;

    public A1CrosschatSmsGateway(
            ObjectMapper objectMapper,
            @Value("${app.sms.a1.auth-token:}") String authToken,
            @Value("${app.sms.a1.use-test-environment:true}") boolean useTestEnvironment
    ) {
        this.objectMapper = objectMapper;
        this.authToken = authToken == null ? "" : authToken.trim();
        this.useTestEnvironment = useTestEnvironment;
    }

    @Override
    public boolean isConfigured() {
        return !authToken.isBlank();
    }

    @Override
    public SmsSendResult send(SmsSendRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("SMS request is required.");
        }
        if (!isConfigured()) {
            throw new IllegalStateException("A1 Crosschat SMS is not configured (set A1_CROSSCHAT_SMS_AUTH_TOKEN).");
        }

        String msisdn = normalizeMsisdn(request.msisdn());
        String text = sanitizeText(request.text());
        String customId = sanitizeCustomId(request.customId());

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("AuthToken", authToken);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("Msisdn", msisdn);
        payload.put("Text", text);
        if (customId != null) {
            payload.put("CustomId", customId);
        }

        String url = useTestEnvironment ? TEST_URL : PRODUCTION_URL;
        try {
            ResponseEntity<String> response = restTemplate.postForEntity(url, new HttpEntity<>(payload, headers), String.class);
            JsonNode root = response.getBody() == null || response.getBody().isBlank()
                    ? objectMapper.createObjectNode()
                    : objectMapper.readTree(response.getBody());
            boolean success = root.path("Success").asBoolean(false);
            Integer messageId = root.hasNonNull("MessageId") ? root.path("MessageId").asInt() : null;
            String responseCustomId = root.hasNonNull("CustomId") ? root.path("CustomId").asText(null) : customId;
            int parts = Math.max(1, root.path("Parts").asInt(1));
            String error = root.hasNonNull("Error") ? root.path("Error").asText(null) : null;
            SmsSendResult result = new SmsSendResult(success, messageId, responseCustomId, parts, error);
            if (!success) {
                throw new IllegalStateException(error == null || error.isBlank() ? "A1 Crosschat SMS send failed." : error);
            }
            log.debug("A1 SMS accepted for queueing (messageId={}, customId={}, parts={}, companyId={}, env={})",
                    messageId, responseCustomId, parts, request.companyId(), useTestEnvironment ? "test" : "production");
            return result;
        } catch (RestClientResponseException ex) {
            throw new IllegalStateException("A1 Crosschat SMS returned " + ex.getRawStatusCode() + ": " + safeBody(ex.getResponseBodyAsString()), ex);
        } catch (Exception ex) {
            throw new IllegalStateException("A1 Crosschat SMS send failed: " + ex.getMessage(), ex);
        }
    }

    static String normalizeMsisdn(String value) {
        if (value == null) {
            throw new IllegalArgumentException("Recipient phone number is required.");
        }
        String cleaned = value.replaceAll("[^0-9+]", "").trim();
        if (cleaned.isBlank()) {
            throw new IllegalArgumentException("Recipient phone number is required.");
        }
        if (cleaned.startsWith("00")) {
            cleaned = "+" + cleaned.substring(2);
        }
        String digitsOnly = cleaned.replaceAll("[^0-9]", "");
        if (cleaned.startsWith("+")) {
            if (!cleaned.startsWith("+386")) {
                throw new IllegalArgumentException("A1 Crosschat requires Slovenian numbers in +386 format.");
            }
            return validateNormalized("+" + digitsOnly);
        }
        if (digitsOnly.startsWith("386")) {
            return validateNormalized("+" + digitsOnly);
        }
        if (digitsOnly.startsWith("0") && digitsOnly.length() >= 8) {
            return validateNormalized("+386" + digitsOnly.substring(1));
        }
        if (digitsOnly.length() >= 8 && digitsOnly.length() <= 9) {
            return validateNormalized("+386" + digitsOnly);
        }
        throw new IllegalArgumentException("A1 Crosschat requires Slovenian numbers in +386 format.");
    }

    private static String validateNormalized(String normalized) {
        if (!normalized.matches("\\+386\\d{6,9}")) {
            throw new IllegalArgumentException("A1 Crosschat requires Slovenian numbers in +386 format.");
        }
        return normalized;
    }

    static String sanitizeText(String value) {
        String trimmed = value == null ? "" : value.trim();
        if (trimmed.isBlank()) {
            throw new IllegalArgumentException("SMS text is required.");
        }
        int maxLength = containsNonAscii(trimmed) ? 320 : 640;
        if (trimmed.length() <= maxLength) {
            return trimmed;
        }
        return trimmed.substring(0, maxLength);
    }

    static String sanitizeCustomId(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        return trimmed.length() <= 36 ? trimmed : trimmed.substring(0, 36);
    }

    private static boolean containsNonAscii(String value) {
        return value != null && value.codePoints().anyMatch(cp -> cp > 127);
    }

    private static String safeBody(String body) {
        if (body == null) {
            return "";
        }
        String trimmed = body.replaceAll("\\s+", " ").trim();
        return trimmed.length() <= 500 ? trimmed : trimmed.substring(0, 500) + "…";
    }
}
