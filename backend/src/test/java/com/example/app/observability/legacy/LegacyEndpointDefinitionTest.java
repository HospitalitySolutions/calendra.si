package com.example.app.observability.legacy;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import org.junit.jupiter.api.Test;

class LegacyEndpointDefinitionTest {

    @Test
    void idsAreUniqueAndSafeForMetricTags() {
        var definitions = Arrays.asList(LegacyEndpointDefinition.values());
        assertThat(definitions)
                .extracting(LegacyEndpointDefinition::id)
                .doesNotHaveDuplicates()
                .allMatch(id -> id.matches("[a-z0-9-]+"));
    }

    @Test
    void everyDefinitionDocumentsWhyItIsBeingObserved() {
        assertThat(Arrays.asList(LegacyEndpointDefinition.values()))
                .allSatisfy(endpoint -> {
                    assertThat(endpoint.category()).isNotBlank();
                    assertThat(endpoint.httpMethod()).isNotBlank();
                    assertThat(endpoint.path()).startsWith("/api/");
                    assertThat(endpoint.reason()).isNotBlank();
                });
    }
}
