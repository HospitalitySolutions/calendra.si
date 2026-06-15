package com.example.app.settings;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class SettingsCryptoServiceTest {

    @Test
    void encryptDecryptRoundtripWorks() {
        SettingsCryptoService crypto = new SettingsCryptoService("test-master-key");
        String encrypted = crypto.encrypt("super-secret");
        assertNotEquals("super-secret", encrypted);
        assertEquals("super-secret", crypto.decryptIfEncrypted(encrypted));
    }

    @Test
    void decryptIfEncryptedKeepsPlainTextValue() {
        SettingsCryptoService crypto = new SettingsCryptoService("test-master-key");
        assertEquals("plain", crypto.decryptIfEncrypted("plain"));
    }

    @Test
    void productionProfileRequiresExplicitStrongSecret() {
        MockEnvironment environment = new MockEnvironment().withProperty("spring.profiles.active", "production");
        environment.setActiveProfiles("production");

        assertThrows(IllegalStateException.class, () -> new SettingsCryptoService("", environment));
        assertThrows(IllegalStateException.class, () -> new SettingsCryptoService("short", environment));
    }
}
