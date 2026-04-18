package com.example.app.settings;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class SettingsCryptoService {
    private static final String PREFIX = "ENC:";
    private static final int IV_LENGTH = 12;
    private static final int GCM_TAG_BITS = 128;
    private final byte[] keyBytes;
    private final SecureRandom random = new SecureRandom();

    public SettingsCryptoService(@Value("${app.settings.encryption-key:}") String configuredKey) {
        this.keyBytes = deriveKey(configuredKey);
    }

    public String encrypt(String raw) {
        if (raw == null || raw.isBlank()) return "";
        try {
            byte[] iv = new byte[IV_LENGTH];
            random.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(keyBytes, "AES"), new GCMParameterSpec(GCM_TAG_BITS, iv));
            byte[] encrypted = cipher.doFinal(raw.getBytes(StandardCharsets.UTF_8));
            String packed = Base64.getEncoder().encodeToString(iv) + ":" + Base64.getEncoder().encodeToString(encrypted);
            return PREFIX + packed;
        } catch (Exception e) {
            throw new IllegalStateException("Unable to encrypt settings value.", e);
        }
    }

    public String decryptIfEncrypted(String value) {
        if (value == null || value.isBlank()) return "";
        if (!value.startsWith(PREFIX)) return value;
        try {
            String[] parts = value.substring(PREFIX.length()).split(":");
            if (parts.length != 2) return "";
            byte[] iv = Base64.getDecoder().decode(parts[0]);
            byte[] encrypted = Base64.getDecoder().decode(parts[1]);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(keyBytes, "AES"), new GCMParameterSpec(GCM_TAG_BITS, iv));
            return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("Unable to decrypt settings value.", e);
        }
    }

    private byte[] deriveKey(String configuredKey) {
        try {
            String source = (configuredKey == null || configuredKey.isBlank())
                    ? "calendra-default-settings-key-change-me"
                    : configuredKey;
            return MessageDigest.getInstance("SHA-256").digest(source.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException("Unable to derive settings encryption key.", e);
        }
    }
}
