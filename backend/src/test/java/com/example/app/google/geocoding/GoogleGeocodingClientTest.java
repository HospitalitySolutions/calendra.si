package com.example.app.google.geocoding;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.queryParam;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class GoogleGeocodingClientTest {
    @Test
    void geocodesAddressWithServerSideApiKey() {
        GoogleGeocodingProperties properties = properties();
        RestClient.Builder builder = RestClient.builder().baseUrl("https://geocode.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        GoogleGeocodingClient client = new GoogleGeocodingClient(properties, builder.build());

        server.expect(requestTo(startsWith("https://geocode.test/maps/api/geocode/json")))
                .andExpect(method(HttpMethod.GET))
                .andExpect(queryParam("address", "Gosposka ulica 1, Maribor"))
                .andExpect(queryParam("key", "test-key"))
                .andExpect(queryParam("language", "sl"))
                .andExpect(queryParam("region", "si"))
                .andRespond(withSuccess("""
                        {"status":"OK","results":[{"formatted_address":"Gosposka ulica 1, 2000 Maribor, Slovenia","place_id":"abc","geometry":{"location":{"lat":46.5581,"lng":15.6459}}}]}
                        """, MediaType.APPLICATION_JSON));

        var result = client.geocodeTenantAddress("Gosposka ulica 1, Maribor").orElseThrow();
        assertThat(result.latitude()).isEqualTo(46.5581);
        assertThat(result.longitude()).isEqualTo(15.6459);
        assertThat(result.placeId()).isEqualTo("abc");
        server.verify();
    }

    @Test
    void zeroResultsIsNotAnError() {
        GoogleGeocodingProperties properties = properties();
        RestClient.Builder builder = RestClient.builder().baseUrl("https://geocode.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        GoogleGeocodingClient client = new GoogleGeocodingClient(properties, builder.build());

        server.expect(requestTo(startsWith("https://geocode.test/maps/api/geocode/json")))
                .andRespond(withSuccess("{\"status\":\"ZERO_RESULTS\",\"results\":[]}", MediaType.APPLICATION_JSON));

        assertThat(client.geocodeSearch("not a real address")).isEmpty();
        server.verify();
    }

    private static GoogleGeocodingProperties properties() {
        GoogleGeocodingProperties properties = new GoogleGeocodingProperties();
        properties.setApiKey("test-key");
        properties.setBaseUrl("https://geocode.test");
        properties.setConnectTimeout(Duration.ofSeconds(1));
        properties.setReadTimeout(Duration.ofSeconds(1));
        return properties;
    }
}
