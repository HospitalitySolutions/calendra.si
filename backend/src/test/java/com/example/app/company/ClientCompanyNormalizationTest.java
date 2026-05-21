package com.example.app.company;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.api.Test;

class ClientCompanyNormalizationTest {

    @Test
    void normalizeVatIdStorage_nullAndBlank() {
        assertNull(ClientCompany.normalizeVatIdStorage(null));
        assertNull(ClientCompany.normalizeVatIdStorage(""));
        assertNull(ClientCompany.normalizeVatIdStorage("   "));
    }

    @Test
    void normalizeVatIdStorage_collapsesWhitespaceAndCase() {
        assertEquals("SI10550631", ClientCompany.normalizeVatIdStorage("si 10550 631"));
        assertEquals("10550631", ClientCompany.normalizeVatIdStorage("10550631"));
    }
}
