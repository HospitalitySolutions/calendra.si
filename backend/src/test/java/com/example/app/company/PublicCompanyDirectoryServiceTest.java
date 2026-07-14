package com.example.app.company;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.when;

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
class PublicCompanyDirectoryServiceTest {
    @Mock
    private AppSettingRepository settings;
    @Mock
    private GooglePlacesClient googlePlaces;

    private PublicCompanyDirectoryService service;

    @BeforeEach
    void setUp() {
        GooglePlacesProperties properties = new GooglePlacesProperties();
        properties.setMaxConcurrentLookups(2);
        service = new PublicCompanyDirectoryService(settings, googlePlaces, properties);
    }

    @AfterEach
    void tearDown() {
        service.shutdownGoogleLookupExecutor();
    }

    @Test
    void returnsOnlyOptedInCompaniesWithPhysicalAddressAndGoogleRating() {
        Company company = company(7L, "Studio Legal Name", "studio-lux");
        AppSetting enabled = setting(company, SettingKey.PUBLIC_DIRECTORY_ENABLED, "true");

        when(settings.findAllByKey(SettingKey.PUBLIC_DIRECTORY_ENABLED.name())).thenReturn(List.of(enabled));
        when(settings.findAllByCompanyIdsAndKeys(anyCollection(), anyCollection())).thenReturn(List.of(
                enabled,
                setting(company, SettingKey.GUEST_APP_SETTINGS_JSON,
                        "{\"publicName\":\"Studio LUX\",\"publicDescription\":\"Frizerski studio.\",\"tenantType\":\"salon\"}"),
                setting(company, SettingKey.COMPANY_LOGO_URL, "https://app.calendra.si/logo.png"),
                setting(company, SettingKey.COMPANY_PHYSICAL_ADDRESS, "Slovenska cesta 10"),
                setting(company, SettingKey.COMPANY_PHYSICAL_POSTAL_CODE, "1000"),
                setting(company, SettingKey.COMPANY_PHYSICAL_CITY, "Ljubljana"),
                setting(company, SettingKey.COMPANY_PHYSICAL_COUNTRY, "Slovenija"),
                setting(company, SettingKey.GOOGLE_PLACE_ID, "place-123")
        ));
        when(googlePlaces.isConfigured()).thenReturn(true);
        when(googlePlaces.lookup("place-123", "Studio LUX", "Slovenska cesta 10, 1000 Ljubljana, Slovenija"))
                .thenReturn(Optional.of(new GooglePlacesClient.PlaceReviewSummary(
                        4.9,
                        128L,
                        "https://maps.google.com/?cid=123",
                        "place-123"
                )));

        List<PublicCompanyDirectoryService.DirectoryCompanyResponse> result = service.list();

        assertThat(result).containsExactly(new PublicCompanyDirectoryService.DirectoryCompanyResponse(
                "studio-lux",
                "studio-lux",
                true,
                "Studio LUX",
                "Frizerski studio.",
                "https://app.calendra.si/logo.png",
                new PublicCompanyDirectoryService.PhysicalAddressResponse(
                        "Slovenska cesta 10",
                        "1000",
                        "Ljubljana"
                ),
                "salon",
                4.9,
                128L,
                "https://maps.google.com/?cid=123"
        ));
    }

    @Test
    void excludesOptedInCompanyWhenPublicNameIsMissing() {
        Company company = company(8L, "Private legal name", "private-company");
        AppSetting enabled = setting(company, SettingKey.PUBLIC_DIRECTORY_ENABLED, "true");
        when(settings.findAllByKey(SettingKey.PUBLIC_DIRECTORY_ENABLED.name())).thenReturn(List.of(enabled));
        when(settings.findAllByCompanyIdsAndKeys(anyCollection(), anyCollection())).thenReturn(List.of(
                enabled,
                setting(company, SettingKey.GUEST_APP_SETTINGS_JSON, "{\"publicDescription\":\"No public name\"}")
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

    private static AppSetting setting(Company company, SettingKey key, String value) {
        AppSetting setting = new AppSetting();
        setting.setCompany(company);
        setting.setKey(key.name());
        setting.setValue(value);
        return setting;
    }
}
