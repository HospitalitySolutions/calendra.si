package com.example.app.guest.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.example.app.company.Company;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.GlobalPaymentProviderService;
import com.example.app.settings.TenantGeneralSettingsService;
import com.example.app.settings.SettingKey;
import java.util.List;
import org.junit.jupiter.api.Test;

class GuestSettingsServicePaymentRulesTest {

    @Test
    void bookingRules_prefersExplicitRequireOnlinePaymentFromBookingRulesJson() {
        AppSettingRepository repo = mock(AppSettingRepository.class);
        GuestSettingsService service = new GuestSettingsService(repo, mock(GlobalPaymentProviderService.class), mock(TenantGeneralSettingsService.class));
        when(repo.findAllByCompanyId(10L)).thenReturn(List.of(
                setting(10L, SettingKey.GUEST_BOOKING_RULES_JSON.name(), "{\"requireOnlinePayment\":false}"),
                setting(10L, SettingKey.GUEST_APP_SETTINGS_JSON.name(), "{\"paymentOnLocation\":false}")
        ));

        var rules = service.bookingRules(10L);

        assertThat(rules.requireOnlinePayment()).isFalse();
    }

    @Test
    void bookingRules_usesPaymentOnLocationFallbackWhenRequireOnlinePaymentMissing() {
        AppSettingRepository repo = mock(AppSettingRepository.class);
        GuestSettingsService service = new GuestSettingsService(repo, mock(GlobalPaymentProviderService.class), mock(TenantGeneralSettingsService.class));
        when(repo.findAllByCompanyId(11L)).thenReturn(List.of(
                setting(11L, SettingKey.GUEST_BOOKING_RULES_JSON.name(), "{\"paymentRequirement\":\"deposit\"}"),
                setting(11L, SettingKey.GUEST_APP_SETTINGS_JSON.name(), "{\"paymentOnLocation\":false}")
        ));

        var rules = service.bookingRules(11L);

        assertThat(rules.requireOnlinePayment()).isTrue();
    }

    @Test
    void bookingRules_usesPaymentOnLocationFallbackForPayAtVenue() {
        AppSettingRepository repo = mock(AppSettingRepository.class);
        GuestSettingsService service = new GuestSettingsService(repo, mock(GlobalPaymentProviderService.class), mock(TenantGeneralSettingsService.class));
        when(repo.findAllByCompanyId(12L)).thenReturn(List.of(
                setting(12L, SettingKey.GUEST_BOOKING_RULES_JSON.name(), "{\"paymentRequirement\":\"none\"}"),
                setting(12L, SettingKey.GUEST_APP_SETTINGS_JSON.name(), "{\"paymentOnLocation\":true}")
        ));

        var rules = service.bookingRules(12L);

        assertThat(rules.requireOnlinePayment()).isFalse();
    }

    @Test
    void bookingRules_defaultsToRequireOnlinePaymentWhenBothFieldsMissing() {
        AppSettingRepository repo = mock(AppSettingRepository.class);
        GuestSettingsService service = new GuestSettingsService(repo, mock(GlobalPaymentProviderService.class), mock(TenantGeneralSettingsService.class));
        when(repo.findAllByCompanyId(13L)).thenReturn(List.of(
                setting(13L, SettingKey.GUEST_BOOKING_RULES_JSON.name(), "{}")
        ));

        var rules = service.bookingRules(13L);

        assertThat(rules.requireOnlinePayment()).isTrue();
        assertThat(rules.paymentRequirement()).isEqualTo("full");
        assertThat(rules.depositPercent()).isEqualTo(20);
    }

    @Test
    void bookingRules_readsDepositRequirementAndPercent() {
        AppSettingRepository repo = mock(AppSettingRepository.class);
        GuestSettingsService service = new GuestSettingsService(repo, mock(GlobalPaymentProviderService.class), mock(TenantGeneralSettingsService.class));
        when(repo.findAllByCompanyId(14L)).thenReturn(List.of(
                setting(14L, SettingKey.GUEST_BOOKING_RULES_JSON.name(), "{\"paymentRequirement\":\"deposit\",\"depositPercent\":35}")
        ));

        var rules = service.bookingRules(14L);

        assertThat(rules.paymentRequirement()).isEqualTo("deposit");
        assertThat(rules.depositPercent()).isEqualTo(35);
    }

    @Test
    void bookingRules_clampsDepositPercentRange() {
        AppSettingRepository repo = mock(AppSettingRepository.class);
        GuestSettingsService service = new GuestSettingsService(repo, mock(GlobalPaymentProviderService.class), mock(TenantGeneralSettingsService.class));
        when(repo.findAllByCompanyId(15L)).thenReturn(List.of(
                setting(15L, SettingKey.GUEST_BOOKING_RULES_JSON.name(), "{\"paymentRequirement\":\"deposit\",\"depositPercent\":0}")
        ));

        var rules = service.bookingRules(15L);

        assertThat(rules.depositPercent()).isEqualTo(1);
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
