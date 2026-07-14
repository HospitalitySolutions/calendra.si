package com.example.app.google.places;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class GooglePlacesClientTest {
    @Test
    void resolvesRatingByStoredPlaceId() {
        GooglePlacesProperties properties = properties();
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        GooglePlacesClient client = new GooglePlacesClient(properties, builder.build());

        server.expect(requestTo("https://places.test/v1/places/place-123"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Goog-Api-Key", "test-key"))
                .andExpect(header("X-Goog-FieldMask", "rating,userRatingCount,googleMapsUri"))
                .andRespond(withSuccess(
                        "{\"rating\":4.8,\"userRatingCount\":55,\"googleMapsUri\":\"https://maps.google.com/place-123\"}",
                        MediaType.APPLICATION_JSON
                ));

        GooglePlacesClient.PlaceReviewSummary result = client
                .lookup("place-123", "Ignored", "Ignored")
                .orElseThrow();

        assertThat(result).isEqualTo(new GooglePlacesClient.PlaceReviewSummary(
                4.8,
                55L,
                "https://maps.google.com/place-123",
                "place-123"
        ));
        server.verify();
    }

    @Test
    void fallsBackToTextSearchUsingPublicNameAndPhysicalAddress() {
        GooglePlacesProperties properties = properties();
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        GooglePlacesClient client = new GooglePlacesClient(properties, builder.build());

        server.expect(requestTo("https://places.test/v1/places:searchText"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header(
                        "X-Goog-FieldMask",
                        "places.id,places.rating,places.userRatingCount,places.googleMapsUri"
                ))
                .andExpect(jsonPath("$.textQuery").value(
                        "Studio LUX, Slovenska cesta 10, 1000 Ljubljana, Slovenija"
                ))
                .andExpect(jsonPath("$.pageSize").value(1))
                .andExpect(jsonPath("$.languageCode").value("sl"))
                .andExpect(jsonPath("$.regionCode").value("SI"))
                .andRespond(withSuccess(
                        "{\"places\":[{\"id\":\"found-place\",\"rating\":4.7,\"userRatingCount\":42,\"googleMapsUri\":\"https://maps.google.com/found-place\"}]}",
                        MediaType.APPLICATION_JSON
                ));

        GooglePlacesClient.PlaceReviewSummary result = client
                .lookup(null, "Studio LUX", "Slovenska cesta 10, 1000 Ljubljana, Slovenija")
                .orElseThrow();

        assertThat(result.rating()).isEqualTo(4.7);
        assertThat(result.reviewCount()).isEqualTo(42L);
        assertThat(result.placeId()).isEqualTo("found-place");
        server.verify();
    }

    private static GooglePlacesProperties properties() {
        GooglePlacesProperties properties = new GooglePlacesProperties();
        properties.setApiKey("test-key");
        properties.setBaseUrl("https://places.test");
        properties.setConnectTimeout(Duration.ofSeconds(1));
        properties.setReadTimeout(Duration.ofSeconds(1));
        return properties;
    }
}
