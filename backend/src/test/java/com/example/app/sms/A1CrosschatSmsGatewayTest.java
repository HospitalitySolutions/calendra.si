package com.example.app.sms;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class A1CrosschatSmsGatewayTest {

    @Test
    void normalizesLocalSlovenianNumbersToPlus386() {
        assertEquals("+38641234567", A1CrosschatSmsGateway.normalizeMsisdn("041 234 567"));
        assertEquals("+38641234567", A1CrosschatSmsGateway.normalizeMsisdn("38641234567"));
        assertEquals("+38641234567", A1CrosschatSmsGateway.normalizeMsisdn("+386 41 234 567"));
        assertEquals("+38641234567", A1CrosschatSmsGateway.normalizeMsisdn("0038641234567"));
    }

    @Test
    void rejectsNonSlovenianNumbers() {
        assertThrows(IllegalArgumentException.class, () -> A1CrosschatSmsGateway.normalizeMsisdn("+38591234567"));
    }

    @Test
    void trimsCustomIdToProviderLimit() {
        assertEquals("123456789012345678901234567890123456", A1CrosschatSmsGateway.sanitizeCustomId("1234567890123456789012345678901234567890"));
    }

    @Test
    void usesShorterLimitForNonAsciiText() {
        String longAscii = "a".repeat(700);
        String longUnicode = "č".repeat(400);
        assertEquals(640, A1CrosschatSmsGateway.sanitizeText(longAscii).length());
        assertEquals(320, A1CrosschatSmsGateway.sanitizeText(longUnicode).length());
    }
}
