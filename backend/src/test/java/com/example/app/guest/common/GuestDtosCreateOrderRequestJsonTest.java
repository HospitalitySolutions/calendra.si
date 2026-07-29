package com.example.app.guest.common;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class GuestDtosCreateOrderRequestJsonTest {
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void legacyServiceIdsAreConvertedToCanonicalOrderedServices() throws Exception {
        String json = """
                {
                  "companyId": "7",
                  "productId": "session-11",
                  "slotId": "slot",
                  "paymentMethodType": "PAY_AT_VENUE",
                  "serviceIds": ["11", "12"]
                }
                """;

        GuestDtos.CreateOrderRequest request = objectMapper.readValue(
                json,
                GuestDtos.CreateOrderRequest.class
        );

        assertEquals(2, request.services().size());
        assertEquals("11", request.services().get(0).sessionTypeId());
        assertEquals("session-12", request.services().get(1).productId());
        assertEquals(1, request.services().get(1).position());
    }
}
