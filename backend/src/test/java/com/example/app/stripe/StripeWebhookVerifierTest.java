package com.example.app.stripe;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;

class StripeWebhookVerifierTest {
    private final StripeWebhookVerifier verifier = new StripeWebhookVerifier();
    private final String secret = "whsec_unit_test";
    private final String payload = "{\"id\":\"evt_test\"}";

    @Test
    void acceptsValidSignatureWithinTolerance() throws Exception {
        long timestamp = Instant.now().getEpochSecond();
        assertTrue(verifier.isValid(payload, signature(timestamp), secret, 300));
    }

    @Test
    void rejectsReplayOutsideToleranceEvenWithValidHmac() throws Exception {
        long timestamp = Instant.now().minusSeconds(600).getEpochSecond();
        assertFalse(verifier.isValid(payload, signature(timestamp), secret, 300));
    }

    @Test
    void rejectsMalformedTimestamp() {
        assertFalse(verifier.isValid(payload, "t=not-a-number,v1=abc", secret, 300));
    }

    private String signature(long timestamp) throws Exception {
        String signedPayload = timestamp + "." + payload;
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        byte[] digest = mac.doFinal(signedPayload.getBytes(StandardCharsets.UTF_8));
        StringBuilder hex = new StringBuilder();
        for (byte b : digest) hex.append(String.format("%02x", b));
        return "t=" + timestamp + ",v1=" + hex;
    }
}
