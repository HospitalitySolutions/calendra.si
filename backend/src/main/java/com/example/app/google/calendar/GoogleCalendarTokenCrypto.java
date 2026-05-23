package com.example.app.google.calendar;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;

/**
 * Encrypts Google OAuth tokens before they are persisted. Existing plaintext values remain readable
 * so local/staging databases created before this hardening step can reconnect without manual cleanup.
 */
@Component
public class GoogleCalendarTokenCrypto {
    private static final String PREFIX = "enc:v1:";
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;

    private final GoogleCalendarConfig config;
    private final SecureRandom secureRandom = new SecureRandom();

    public GoogleCalendarTokenCrypto(GoogleCalendarConfig config) {
        this.config = config;
    }

    public String encrypt(String plainText) {
        if (plainText == null || plainText.isBlank() || plainText.startsWith(PREFIX) || !hasSecret()) {
            return plainText;
        }
        try {
            byte[] iv = new byte[IV_BYTES];
            secureRandom.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key(), new GCMParameterSpec(TAG_BITS, iv));
            byte[] cipherText = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));
            byte[] combined = new byte[iv.length + cipherText.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(cipherText, 0, combined, iv.length, cipherText.length);
            return PREFIX + Base64.getUrlEncoder().withoutPadding().encodeToString(combined);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to encrypt Google Calendar token.", e);
        }
    }

    public String decrypt(String storedValue) {
        if (storedValue == null || storedValue.isBlank() || !storedValue.startsWith(PREFIX)) {
            return storedValue;
        }
        if (!hasSecret()) {
            throw new IllegalStateException("Google Calendar token is encrypted but GOOGLE_CALENDAR_TOKEN_ENCRYPTION_SECRET is not configured.");
        }
        try {
            byte[] combined = Base64.getUrlDecoder().decode(storedValue.substring(PREFIX.length()));
            if (combined.length <= IV_BYTES) throw new IllegalArgumentException("Encrypted token payload is too short.");
            byte[] iv = Arrays.copyOfRange(combined, 0, IV_BYTES);
            byte[] cipherText = Arrays.copyOfRange(combined, IV_BYTES, combined.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(TAG_BITS, iv));
            return new String(cipher.doFinal(cipherText), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to decrypt Google Calendar token. Check GOOGLE_CALENDAR_TOKEN_ENCRYPTION_SECRET.", e);
        }
    }

    public boolean isEncrypted(String value) {
        return value != null && value.startsWith(PREFIX);
    }

    private boolean hasSecret() {
        String secret = config.effectiveTokenEncryptionSecret();
        return secret != null && !secret.isBlank();
    }

    private SecretKeySpec key() throws Exception {
        String secret = config.effectiveTokenEncryptionSecret();
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(secret.getBytes(StandardCharsets.UTF_8));
        return new SecretKeySpec(digest, "AES");
    }
}
