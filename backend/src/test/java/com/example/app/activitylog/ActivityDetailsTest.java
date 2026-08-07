package com.example.app.activitylog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Map;
import org.junit.jupiter.api.Test;

class ActivityDetailsTest {

    @Test
    void omitsNullBlankAndBlankKeyValuesButPreservesOrder() {
        Map<String, Object> details = ActivityDetails.of(
                "clientId", 42L,
                "blank", "   ",
                "nullValue", null,
                "  locationId  ", 7L,
                "", "ignored",
                null, "ignored"
        );

        assertThat(details).containsExactly(
                Map.entry("clientId", 42L),
                Map.entry("locationId", 7L)
        );
    }

    @Test
    void rejectsOddNumberOfArguments() {
        assertThatThrownBy(() -> ActivityDetails.of("clientId", 42L, "dangling"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("key/value pairs");
    }
}
