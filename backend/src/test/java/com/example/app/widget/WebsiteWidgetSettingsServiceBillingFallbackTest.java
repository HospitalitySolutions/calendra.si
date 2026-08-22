package com.example.app.widget;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.example.app.company.Company;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.GlobalPaymentProviderService;
import com.example.app.settings.SettingKey;
import java.util.List;
import org.junit.jupiter.api.Test;

class WebsiteWidgetSettingsServiceBillingFallbackTest {

    @Test
    void widgetSettings_forcesPayAtVenueWhenBillingIsDisabledWithoutChangingStoredChoice() {
        AppSettingRepository repo = mock(AppSettingRepository.class);
        WebsiteWidgetSettingsService service = new WebsiteWidgetSettingsService(
                repo,
                mock(GlobalPaymentProviderService.class)
        );
        when(repo.findAllByCompanyId(10L)).thenReturn(List.of(
                setting(10L, SettingKey.BILLING_ENABLED.name(), "false"),
                setting(10L, SettingKey.WEBSITE_WIDGET_SETTINGS_JSON.name(),
                        "{\"paymentOnLocation\":false,\"acceptedPaymentMethodIds\":[\"online_card\",\"bank_transfer\"]}"),
                setting(10L, SettingKey.WEBSITE_BOOKING_RULES_JSON.name(),
                        "{\"paymentRequirement\":\"full\"}")
        ));

        var widget = service.widgetSettings(10L);
        var rules = service.bookingRules(10L);

        assertThat(widget.paymentOnLocation()).isTrue();
        assertThat(widget.acceptedPaymentMethodIds()).isEmpty();
        assertThat(rules.requireOnlinePayment()).isFalse();
        assertThat(rules.paymentRequirement()).isEqualTo("none");
        assertThat(service.acceptedPaymentMethods(10L)).isEmpty();
    }

    @Test
    void widgetSettings_restoresConfiguredOnlineChoiceWhenBillingIsEnabled() {
        AppSettingRepository repo = mock(AppSettingRepository.class);
        WebsiteWidgetSettingsService service = new WebsiteWidgetSettingsService(
                repo,
                mock(GlobalPaymentProviderService.class)
        );
        when(repo.findAllByCompanyId(11L)).thenReturn(List.of(
                setting(11L, SettingKey.BILLING_ENABLED.name(), "true"),
                setting(11L, SettingKey.WEBSITE_WIDGET_SETTINGS_JSON.name(),
                        "{\"paymentOnLocation\":false,\"acceptedPaymentMethodIds\":[\"online_card\",\"bank_transfer\"]}"),
                setting(11L, SettingKey.WEBSITE_BOOKING_RULES_JSON.name(),
                        "{\"paymentRequirement\":\"full\"}")
        ));

        var widget = service.widgetSettings(11L);

        assertThat(widget.paymentOnLocation()).isFalse();
        assertThat(widget.acceptedPaymentMethodIds()).containsExactly("online_card", "bank_transfer");
    }

    private static AppSetting setting(Long companyId, String key, String value) {
        AppSetting setting = new AppSetting();
        Company company = new Company();
        company.setId(companyId);
        setting.setCompany(company);
        setting.setKey(key);
        setting.setValue(value);
        return setting;
    }
}
