package com.example.app.stripe;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;

@Component
public class StripeWebhookVerifier {
    public boolean isValid(String payload, String stripeSignatureHeader, String webhookSecret) {
        if (payload == null || stripeSignatureHeader == null || webhookSecret == null || webhookSecret.isBlank()) {
            return false;
        }
        String timestamp = null;
        List<String> signatures = new ArrayList<>();
        for (String part : stripeSignatureHeader.split(",")) {
            String[] kv = part.split("=", 2);
            if (kv.length != 2) continue;
            String key = kv[0].trim();
            String val = kv[1].trim();
            if ("t".equals(key)) timestamp = val;
            if ("v1".equals(key)) signatures.add(val);
        }
        if (timestamp == null || signatures.isEmpty()) return false;
        String signedPayload = timestamp + "." + payload;
        String expected = hmacSha256Hex(webhookSecret, signedPayload);
        for (String candidate : signatures) {
            if (MessageDigest.isEqual(
                    expected.getBytes(StandardCharsets.UTF_8),
                    candidate.getBytes(StandardCharsets.UTF_8)
            )) {
                return true;
            }
        }
        return false;
    }

    private String hmacSha256Hex(String secret, String content) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] digest = mac.doFinal(content.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException("Cannot verify Stripe signature", e);
        }
    }
}
