package com.example.app.fiscal;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class FiscalEnvironmentTest {

    @Test
    void defaultsToTestForNullAndInvalidValues() {
        assertEquals(FiscalEnvironment.TEST, FiscalEnvironment.fromRaw(null));
        assertEquals(FiscalEnvironment.TEST, FiscalEnvironment.fromRaw(""));
        assertEquals(FiscalEnvironment.TEST, FiscalEnvironment.fromRaw("something"));
    }

    @Test
    void parsesKnownValuesCaseInsensitive() {
        assertEquals(FiscalEnvironment.TEST, FiscalEnvironment.fromRaw("test"));
        assertEquals(FiscalEnvironment.PROD, FiscalEnvironment.fromRaw("PROD"));
    }
}
