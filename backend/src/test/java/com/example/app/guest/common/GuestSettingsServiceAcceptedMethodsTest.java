package com.example.app.guest.common;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class GuestSettingsServiceAcceptedMethodsTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Test
    void parseAcceptedPaymentMethods_mapsConfigIdsToRuntimeTypes() throws Exception {
        JsonNode node = JSON.readTree("[\"online_card\", \"bank_transfer\", \"paypal\", \"gift_card\"]");

        var result = GuestSettingsService.parseAcceptedPaymentMethods(node);

        assertThat(result).containsExactly("CARD", "BANK_TRANSFER", "PAYPAL", "GIFT_CARD");
    }

    @Test
    void parseAcceptedPaymentMethods_dropsLegacyCashAndCardOnLocation() throws Exception {
        JsonNode node = JSON.readTree("[\"cash\", \"card_on_location\", \"online_card\"]");

        var result = GuestSettingsService.parseAcceptedPaymentMethods(node);

        assertThat(result).containsExactly("CARD");
    }

    @Test
    void parseAcceptedPaymentMethods_returnsAllDefaultsWhenInputMissingOrEmpty() throws Exception {
        var nullResult = GuestSettingsService.parseAcceptedPaymentMethods(null);
        var emptyResult = GuestSettingsService.parseAcceptedPaymentMethods(JSON.readTree("[]"));
        var legacyOnly = GuestSettingsService.parseAcceptedPaymentMethods(JSON.readTree("[\"cash\"]"));

        assertThat(nullResult).containsExactly("CARD", "BANK_TRANSFER", "PAYPAL", "GIFT_CARD");
        assertThat(emptyResult).containsExactly("CARD", "BANK_TRANSFER", "PAYPAL", "GIFT_CARD");
        assertThat(legacyOnly).containsExactly("CARD", "BANK_TRANSFER", "PAYPAL", "GIFT_CARD");
    }

    @Test
    void parseAcceptedPaymentMethods_isCaseInsensitiveAndDeduplicates() throws Exception {
        JsonNode node = JSON.readTree("[\"ONLINE_CARD\", \"online_card\", \"PAYPAL\", \"paypal\"]");

        var result = GuestSettingsService.parseAcceptedPaymentMethods(node);

        assertThat(result).containsExactly("CARD", "PAYPAL");
    }
}
