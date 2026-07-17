package com.example.app.register;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

class RegisterCatalogServicePricingMigrationTest {
    @Test
    void upgradesOnlyLegacyDefaultPricesAndNamesToTheCurrentCatalog() {
        AppSettingRepository settings = mock(AppSettingRepository.class);
        AppSetting row = new AppSetting();
        row.setUpdatedAt(Instant.parse("2026-07-17T10:00:00Z"));
        row.setValue("""
                {
                  "plans":{"basic":18.9,"pro":34.9,"business":59.9},
                  "planNames":{
                    "basic":{"name":"Basic","nameSl":"Osnovni"},
                    "pro":{"name":"Pro","nameSl":"Pro"},
                    "business":{"name":"Business","nameSl":"Poslovni"}
                  },
                  "additionalUserMonthly":9.9,
                  "additionalUserMonthlyAfterFive":6.9
                }
                """);
        when(settings.findAllByKey(SettingKey.PLATFORM_REGISTER_PRICE_JSON)).thenReturn(List.of(row));

        RegisterCatalogService service = new RegisterCatalogService(settings, new ObjectMapper());
        RegisterPriceCatalog catalog = service.mergedCatalog();

        assertThat(catalog.getCatalogVersion()).isEqualTo(2);
        assertThat(catalog.getPlans())
                .containsEntry("basic", 17.9)
                .containsEntry("pro", 34.9)
                .containsEntry("business", 54.9);
        assertThat(catalog.getPlanNames().get("basic").getNameSl()).isEqualTo("Osnovno");
        assertThat(catalog.getPlanNames().get("pro").getName()).isEqualTo("Professional");
        assertThat(catalog.getPlanNames().get("business").getName()).isEqualTo("Premium");
    }

    @Test
    void preservesCustomLegacyPrices() {
        AppSettingRepository settings = mock(AppSettingRepository.class);
        AppSetting row = new AppSetting();
        row.setUpdatedAt(Instant.parse("2026-07-17T10:00:00Z"));
        row.setValue("""
                {"plans":{"basic":16.5,"pro":33.0,"business":52.0}}
                """);
        when(settings.findAllByKey(SettingKey.PLATFORM_REGISTER_PRICE_JSON)).thenReturn(List.of(row));

        RegisterCatalogService service = new RegisterCatalogService(settings, new ObjectMapper());
        RegisterPriceCatalog catalog = service.mergedCatalog();

        assertThat(catalog.getPlans())
                .containsEntry("basic", 16.5)
                .containsEntry("pro", 33.0)
                .containsEntry("business", 52.0);
    }
}
