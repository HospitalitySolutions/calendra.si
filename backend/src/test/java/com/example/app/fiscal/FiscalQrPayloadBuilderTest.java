package com.example.app.fiscal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class FiscalQrPayloadBuilderTest {

    @Test
    void buildsSixtyDigitPayloadWithModuloTenControlDigit() {
        String payload = FiscalQrPayloadBuilder.build(
                "3024e56bf1ddd2e7eeb5715c6859a913",
                "12345678",
                "2015-08-15T10:13:32"
        );

        assertEquals("063994519708649896901260100447252359443123456781508151013320", payload);
    }

    @Test
    void acceptsSiPrefixedTaxNumberAndOffsetDateTime() {
        String payload = FiscalQrPayloadBuilder.build(
                "3024e56bf1ddd2e7eeb5715c6859a913",
                "SI12345678",
                "2015-08-15T10:13:32Z"
        );

        assertEquals("063994519708649896901260100447252359443123456781508151013320", payload);
    }

    @Test
    void rejectsInvalidZoi() {
        assertThrows(IllegalArgumentException.class, () ->
                FiscalQrPayloadBuilder.build("not-a-zoi", "12345678", "2015-08-15T10:13:32")
        );
    }
}
