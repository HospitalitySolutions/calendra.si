package com.example.app.security;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.ECDSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.interfaces.ECPrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.Date;

@Component
public class AppleOAuthClientSecretGenerator {

    private static final String APPLE_AUDIENCE = "https://appleid.apple.com";

    public String resolveClientSecret(Environment env, String clientId) {
        String configuredClientSecret = env.getProperty("APPLE_CLIENT_SECRET");
        if (StringUtils.hasText(configuredClientSecret)) {
            return configuredClientSecret.trim();
        }

        String teamId = require(env, "APPLE_TEAM_ID");
        String keyId = require(env, "APPLE_KEY_ID");
        String privateKey = firstNonBlank(
                env.getProperty("APPLE_PRIVATE_KEY"),
                env.getProperty("APPLE_PRIVATE_KEY_BASE64")
        );
        if (!StringUtils.hasText(privateKey)) {
            throw new IllegalStateException("Apple login is missing APPLE_PRIVATE_KEY or APPLE_PRIVATE_KEY_BASE64.");
        }

        return generate(teamId, keyId, clientId, privateKey);
    }

    private String generate(String teamId, String keyId, String clientId, String privateKeyPemOrBase64) {
        try {
            ECPrivateKey privateKey = parseEcPrivateKey(privateKeyPemOrBase64);
            Instant now = Instant.now();
            JWTClaimsSet claims = new JWTClaimsSet.Builder()
                    .issuer(teamId)
                    .issueTime(Date.from(now))
                    .expirationTime(Date.from(now.plus(180, ChronoUnit.DAYS)))
                    .audience(APPLE_AUDIENCE)
                    .subject(clientId)
                    .build();

            SignedJWT jwt = new SignedJWT(
                    new JWSHeader.Builder(JWSAlgorithm.ES256)
                            .keyID(keyId)
                            .build(),
                    claims
            );
            jwt.sign(new ECDSASigner(privateKey));
            return jwt.serialize();
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to generate Apple OAuth client secret. Check APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY.", ex);
        }
    }

    private ECPrivateKey parseEcPrivateKey(String raw) throws Exception {
        String value = raw.trim();
        if (!value.contains("BEGIN PRIVATE KEY") && looksBase64(value)) {
            String decoded = new String(Base64.getDecoder().decode(stripWhitespace(value)), StandardCharsets.UTF_8).trim();
            if (decoded.contains("BEGIN PRIVATE KEY")) {
                value = decoded;
            }
        }

        String base64 = value
                .replace("-----BEGIN PRIVATE KEY-----", "")
                .replace("-----END PRIVATE KEY-----", "")
                .replace("\\n", "")
                .replace("\\r", "")
                .replaceAll("\\s+", "");
        byte[] keyBytes = Base64.getDecoder().decode(base64);
        return (ECPrivateKey) KeyFactory.getInstance("EC").generatePrivate(new PKCS8EncodedKeySpec(keyBytes));
    }

    private static boolean looksBase64(String value) {
        String stripped = stripWhitespace(value);
        return stripped.length() > 100 && stripped.matches("^[A-Za-z0-9+/=]+$");
    }

    private static String stripWhitespace(String value) {
        return value == null ? "" : value.replaceAll("\\s+", "");
    }

    private static String require(Environment env, String key) {
        String value = env.getProperty(key);
        if (!StringUtils.hasText(value)) {
            throw new IllegalStateException("Apple login is missing " + key + ".");
        }
        return value.trim();
    }

    private static String firstNonBlank(String... values) {
        if (values == null) return "";
        for (String value : values) {
            if (StringUtils.hasText(value)) return value.trim();
        }
        return "";
    }
}
