package com.example.app.email;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.example.app.company.Company;
import com.example.app.settings.AppSettingRepository;
import org.junit.jupiter.api.Test;

class TenantEmailLayoutRendererLocationIdentityTest {

    @Test
    void explicitLocationIdentityOverridesGenericCompanyHeaderAndFooter() {
        TenantEmailLayoutRenderer renderer = new TenantEmailLayoutRenderer(mock(AppSettingRepository.class));
        Company company = new Company();
        company.setId(1L);
        company.setName("Generic Company");

        String html = renderer.render(
                company,
                "Your slot is available.",
                "Calendra Koper",
                "https://app.calendra.test/api/public/widget/location-assets?key=koper-logo"
        );

        assertThat(html).contains("Calendra Koper");
        assertThat(html).contains("koper-logo");
        assertThat(html).contains("To sporočilo vam je poslal/a Calendra Koper prek platforme Calendra.");
        assertThat(html).doesNotContain("alt=\"Generic Company\"");
    }
}
