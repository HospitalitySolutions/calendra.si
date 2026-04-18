package com.example.app.fiscal;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class FiscalSignatureServiceTest {
    @Test
    void computeZoiReturnsStableMd5Hex() {
        FiscalSignatureService service = new FiscalSignatureService(null);
        String zoi = service.computeZoi("abc");
        assertEquals("900150983cd24fb0d6963f7d28e17f72", zoi);
    }
}
