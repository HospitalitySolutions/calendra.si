package com.example.app.settings;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

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
}
