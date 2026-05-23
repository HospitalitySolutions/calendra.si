package com.example.app.google.calendar;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class GoogleCalendarTokenCryptoTest {
    @Test
    void encryptsAndDecryptsWhenSecretIsConfigured() {
        GoogleCalendarConfig config = new GoogleCalendarConfig();
        config.setTokenEncryptionSecret("a-long-staging-secret-for-google-calendar-token-encryption");
        GoogleCalendarTokenCrypto crypto = new GoogleCalendarTokenCrypto(config);

        String encrypted = crypto.encrypt("access-token-123");

        assertNotEquals("access-token-123", encrypted);
        assertTrue(crypto.isEncrypted(encrypted));
        assertEquals("access-token-123", crypto.decrypt(encrypted));
    }

    @Test
    void keepsPlaintextReadableForExistingLocalData() {
        GoogleCalendarConfig config = new GoogleCalendarConfig();
        config.setTokenEncryptionSecret("a-long-staging-secret-for-google-calendar-token-encryption");
        GoogleCalendarTokenCrypto crypto = new GoogleCalendarTokenCrypto(config);

        assertEquals("legacy-token", crypto.decrypt("legacy-token"));
    }

    @Test
    void fallsBackToPlainStorageWhenNoSecretIsConfigured() {
        GoogleCalendarConfig config = new GoogleCalendarConfig();
        GoogleCalendarTokenCrypto crypto = new GoogleCalendarTokenCrypto(config);

        assertEquals("token", crypto.encrypt("token"));
        assertEquals("token", crypto.decrypt("token"));
    }
}
