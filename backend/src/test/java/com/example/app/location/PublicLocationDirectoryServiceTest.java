package com.example.app.location;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.when;

import com.example.app.company.Company;
import com.example.app.google.places.GooglePlacesClient;
import com.example.app.google.places.GooglePlacesProperties;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class PublicLocationDirectoryServiceTest {
    @Mock
    private LocationRepository locations;
    @Mock
    private AppSettingRepository settings;
    @Mock
    private GooglePlacesClient googlePlaces;

    private PublicLocationDirectoryService service;

    @BeforeEach
    void setUp() {
        GooglePlacesProperties properties = new GooglePlacesProperties();
        properties.setMaxConcurrentLookups(2);
        service = new PublicLocationDirectoryService(
                locations,
                settings,
                new LocationPublicPresentationService(settings),
                googlePlaces,
                properties
        );
    }

    @AfterEach
    void tearDown() {
        service.shutdownGoogleLookupExecutor();
    }

    @Test
    void returnsEachOptedInLocationWithItsOwnPresentationAndGoogleRating() {
        Company company = company(7L, "Studio Legal Name", "STUDIO-LUX");
        Location ljubljana = location(31L, company, "Ljubljana", "Slovenska cesta 10", "1000", "Ljubljana");
        ljubljana.setPublicName("Studio LUX Ljubljana");
        ljubljana.setPublicDescription("Frizerski studio v Ljubljani.");
        ljubljana.setPublicBusinessType("psychology_counselling");
        ljubljana.setPublicDirectoryEnabled(true);
        ljubljana.setPublicBookingEnabled(true);
        ljubljana.setGooglePlaceId("place-lj");

        Location maribor = location(32L, company, "Maribor", "Gosposka ulica 5", "2000", "Maribor");
        maribor.setPublicName("Studio LUX Maribor");
        maribor.setPublicDirectoryEnabled(true);
        maribor.setPublicBookingEnabled(false);
        maribor.setPublicLogoS3Key("public-locations/7/32/logo.png");

        when(locations.findAllByActiveTrueAndPublicDirectoryEnabledTrueOrderByCompanyIdAscNameAscIdAsc())
                .thenReturn(List.of(ljubljana, maribor));
        when(settings.findAllByCompanyIdsAndKeys(anyCollection(), anyCollection())).thenReturn(List.of(
                setting(company, SettingKey.MODULE_CONFIG_TYPE, "salon"),
                setting(company, SettingKey.COMPANY_LOGO_URL, "https://app.calendra.si/logo.png")
        ));
        when(googlePlaces.isConfigured()).thenReturn(true);
        when(googlePlaces.lookup("place-lj", "Studio LUX Ljubljana", "Slovenska cesta 10, 1000, Ljubljana, SI"))
                .thenReturn(Optional.of(new GooglePlacesClient.PlaceReviewSummary(
                        4.9,
                        128L,
                        "https://maps.google.com/?cid=123",
                        "place-lj",
                        46.0569,
                        14.5058,
                        "Slovenska cesta 10, Ljubljana"
                )));
        when(googlePlaces.lookup(null, "Studio LUX Maribor", "Gosposka ulica 5, 2000, Maribor, SI"))
                .thenReturn(Optional.empty());

        List<PublicLocationDirectoryService.DirectoryLocationResponse> result = service.list();

        assertThat(result).hasSize(2);
        assertThat(result.get(0).locationId()).isEqualTo(31L);
        assertThat(result.get(0).publicName()).isEqualTo("Studio LUX Ljubljana");
        assertThat(result.get(0).logoUrl()).isEqualTo("https://app.calendra.si/logo.png");
        assertThat(result.get(0).bookingUrl()).isEqualTo("/narocanje/STUDIO-LUX?locationId=31");
        assertThat(result.get(0).category()).isEqualTo("psychology_counselling");
        assertThat(result.get(0).googleRating()).isEqualTo(4.9);
        assertThat(result.get(0).googleReviewCount()).isEqualTo(128L);
        assertThat(result.get(1).locationId()).isEqualTo(32L);
        assertThat(result.get(1).logoUrl()).contains("/api/public/widget/location-assets");
        assertThat(result.get(1).logoUrl()).contains("key=");
        assertThat(result.get(1).category()).isEqualTo("hair_salon");
        assertThat(result.get(1).publicBookingEnabled()).isFalse();
        assertThat(result.get(1).bookingUrl()).isEmpty();
    }

    @Test
    void findsPublicLocationsNearEnteredAddressAndOrdersByDistance() {
        Company company = company(7L, "Studio Legal Name", "STUDIO-LUX");
        Location maribor = location(32L, company, "Maribor", "Gosposka ulica 5", "2000", "Maribor");
        maribor.setPublicName("Studio LUX Maribor");
        maribor.setPublicDirectoryEnabled(true);

        Location ljubljana = location(31L, company, "Ljubljana", "Slovenska cesta 10", "1000", "Ljubljana");
        ljubljana.setPublicName("Studio LUX Ljubljana");
        ljubljana.setPublicDirectoryEnabled(true);

        when(locations.findAllByActiveTrueAndPublicDirectoryEnabledTrueOrderByCompanyIdAscNameAscIdAsc())
                .thenReturn(List.of(ljubljana, maribor));
        when(settings.findAllByCompanyIdsAndKeys(anyCollection(), anyCollection())).thenReturn(List.of(
                setting(company, SettingKey.MODULE_CONFIG_TYPE, "salon")
        ));
        when(googlePlaces.isConfigured()).thenReturn(true);
        when(googlePlaces.geocode("Gosposka ulica 1, Maribor, Slovenia"))
                .thenReturn(Optional.of(new GooglePlacesClient.GeocodedPlace(
                        46.5576, 15.6459, "Gosposka ulica 1, 2000 Maribor, Slovenia", "query-place"
                )));
        when(googlePlaces.lookup(null, "Studio LUX Maribor", "Gosposka ulica 5, 2000, Maribor, SI"))
                .thenReturn(Optional.of(new GooglePlacesClient.PlaceReviewSummary(
                        4.9, 20L, null, "maribor-place", 46.5580, 15.6462, "Gosposka ulica 5, Maribor"
                )));
        when(googlePlaces.lookup(null, "Studio LUX Ljubljana", "Slovenska cesta 10, 1000, Ljubljana, SI"))
                .thenReturn(Optional.of(new GooglePlacesClient.PlaceReviewSummary(
                        4.8, 30L, null, "ljubljana-place", 46.0569, 14.5058, "Slovenska cesta 10, Ljubljana"
                )));

        PublicLocationDirectoryService.NearbySearchResponse result = service.searchNearby(
                "Gosposka ulica 1, Maribor", 25d, 10
        );

        assertThat(result.resolvedAddress()).contains("Maribor");
        assertThat(result.locations()).hasSize(1);
        assertThat(result.locations().getFirst().publicName()).isEqualTo("Studio LUX Maribor");
        assertThat(result.locations().getFirst().distanceKm()).isLessThan(1d);
    }

    @Test
    void returnsOneLocationByCanonicalLocationSlug() {
        Company company = company(7L, "Studio Legal Name", "STUDIO-LUX");
        Location location = location(31L, company, "Ljubljana", "Slovenska cesta 10", "1000", "Ljubljana");
        location.setPublicName("Studio LUX Ljubljana");
        location.setPublicDirectoryEnabled(true);
        location.setPublicBookingEnabled(true);

        when(locations.findById(31L)).thenReturn(Optional.of(location));
        when(settings.findAllByCompanyIdsAndKeys(anyCollection(), anyCollection())).thenReturn(List.of(
                setting(company, SettingKey.MODULE_CONFIG_TYPE, "salon")
        ));

        Optional<PublicLocationDirectoryService.DirectoryLocationResponse> result = service.findBySlug("studio-lux-31");

        assertThat(result).isPresent();
        assertThat(result.orElseThrow().locationId()).isEqualTo(31L);
        assertThat(result.orElseThrow().slug()).isEqualTo("studio-lux-31");
        assertThat(result.orElseThrow().bookingUrl()).isEqualTo("/narocanje/STUDIO-LUX?locationId=31");
    }

    @Test
    void rejectsLocationDetailWhenSlugPrefixDoesNotMatchCanonicalTenantSlug() {
        Company company = company(7L, "Studio Legal Name", "STUDIO-LUX");
        Location location = location(31L, company, "Ljubljana", "Slovenska cesta 10", "1000", "Ljubljana");
        location.setPublicDirectoryEnabled(true);

        when(locations.findById(31L)).thenReturn(Optional.of(location));
        when(settings.findAllByCompanyIdsAndKeys(anyCollection(), anyCollection())).thenReturn(List.of());

        assertThat(service.findBySlug("wrong-provider-31")).isEmpty();
    }

    @Test
    void excludesLocationsBelongingToSuspendedTenant() {
        Company company = company(8L, "Suspended", "SUSPENDED");
        Location location = location(40L, company, "Main", "Main 1", "1000", "Ljubljana");
        location.setPublicDirectoryEnabled(true);

        when(locations.findAllByActiveTrueAndPublicDirectoryEnabledTrueOrderByCompanyIdAscNameAscIdAsc())
                .thenReturn(List.of(location));
        when(settings.findAllByCompanyIdsAndKeys(anyCollection(), anyCollection())).thenReturn(List.of(
                setting(company, SettingKey.TENANCY_ACCESS_STATUS, "SUSPENDED")
        ));

        assertThat(service.list()).isEmpty();
    }

    private static Company company(Long id, String name, String tenantCode) {
        Company company = new Company();
        company.setId(id);
        company.setName(name);
        company.setTenantCode(tenantCode);
        return company;
    }

    private static Location location(Long id, Company company, String name, String address, String postalCode, String city) {
        Location location = new Location();
        location.setId(id);
        location.setCompany(company);
        location.setName(name);
        location.setAddress(address);
        location.setPostalCode(postalCode);
        location.setCity(city);
        location.setCountry("SI");
        location.setActive(true);
        location.setWebsitePresentationEnabled(true);
        return location;
    }

    private static AppSetting setting(Company company, SettingKey key, String value) {
        AppSetting setting = new AppSetting();
        setting.setCompany(company);
        setting.setKey(key.name());
        setting.setValue(value);
        return setting;
    }
}
