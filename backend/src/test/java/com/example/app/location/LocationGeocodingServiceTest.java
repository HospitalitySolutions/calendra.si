package com.example.app.location;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.app.google.geocoding.GoogleGeocodingClient;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class LocationGeocodingServiceTest {
    @Test
    void addressWriteStoresCoordinatesFromPhysicalLocation() {
        GoogleGeocodingClient client = mock(GoogleGeocodingClient.class);
        when(client.isConfigured()).thenReturn(true);
        when(client.geocodeTenantAddress("Gosposka ulica 1, 2000, Maribor, SI"))
                .thenReturn(Optional.of(new GoogleGeocodingClient.GeocodeResult(46.5581, 15.6459, "ignored", "place")));
        LocationGeocodingService service = new LocationGeocodingService(client);
        Location location = location();

        service.refreshAfterAddressWrite(location);

        assertThat(location.getLatitude()).isEqualTo(46.5581);
        assertThat(location.getLongitude()).isEqualTo(15.6459);
        assertThat(location.getGeocodeSourceAddress()).isEqualTo("Gosposka ulica 1, 2000, Maribor, SI");
        assertThat(location.getGeocodeStatus()).isEqualTo("OK");
        assertThat(location.getGeocodedAt()).isNotNull();
        verify(client).geocodeTenantAddress("Gosposka ulica 1, 2000, Maribor, SI");
    }

    @Test
    void freshCoordinatesAreReusedUntilRefreshWindow() {
        GoogleGeocodingClient client = mock(GoogleGeocodingClient.class);
        when(client.isConfigured()).thenReturn(true);
        LocationGeocodingService service = new LocationGeocodingService(client);
        Location location = location();
        location.setGeocodeSourceAddress("Gosposka ulica 1, 2000, Maribor, SI");
        location.setLatitude(46.5581);
        location.setLongitude(15.6459);
        location.setGeocodedAt(Instant.now().minusSeconds(3600));

        assertThat(service.refreshIfRequired(location)).isFalse();
        assertThat(service.hasUsableCoordinates(location)).isTrue();
    }

    @Test
    void oldCoordinatesAreNotUsableAfterThirtyDays() {
        GoogleGeocodingClient client = mock(GoogleGeocodingClient.class);
        LocationGeocodingService service = new LocationGeocodingService(client);
        Location location = location();
        location.setLatitude(46.5581);
        location.setLongitude(15.6459);
        location.setGeocodedAt(Instant.now().minusSeconds(31L * 24 * 3600));

        assertThat(service.hasUsableCoordinates(location)).isFalse();
    }

    private static Location location() {
        Location location = new Location();
        location.setAddress("Gosposka ulica 1");
        location.setPostalCode("2000");
        location.setCity("Maribor");
        location.setCountry("SI");
        return location;
    }
}
