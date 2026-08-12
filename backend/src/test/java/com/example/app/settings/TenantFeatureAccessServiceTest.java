package com.example.app.settings;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class TenantFeatureAccessServiceTest {

    @Mock private AppSettingRepository settings;

    private TenantFeatureAccessService service;

    @BeforeEach
    void setUp() {
        service = new TenantFeatureAccessService(settings);
    }

    @Test
    void legacyBusinessPackageIsTreatedAsPremiumForWaitlist() {
        when(settings.findByCompanyIdAndKey(12L, SettingKey.SIGNUP_PACKAGE_NAME))
                .thenReturn(Optional.of(setting("BUSINESS")));
        when(settings.findByCompanyIdAndKey(12L, SettingKey.WAITLIST_ENABLED))
                .thenReturn(Optional.of(setting("true")));

        assertTrue(service.isWaitlistEnabled(12L));
    }

    @Test
    void legacyBusinessPackageIsTreatedAsPremiumForConsumables() {
        when(settings.findByCompanyIdAndKey(12L, SettingKey.SIGNUP_PACKAGE_NAME))
                .thenReturn(Optional.of(setting("BUSINESS")));
        when(settings.findByCompanyIdAndKey(12L, SettingKey.CONSUMABLES_ENABLED))
                .thenReturn(Optional.of(setting("true")));

        assertTrue(service.areConsumablesEnabled(12L));
    }

    @Test
    void professionalPackageCannotEnablePremiumModulesWithTenantSwitchAlone() {
        when(settings.findByCompanyIdAndKey(12L, SettingKey.SIGNUP_PACKAGE_NAME))
                .thenReturn(Optional.of(setting("PROFESSIONAL")));

        assertFalse(service.isWaitlistEnabled(12L));
        assertFalse(service.areConsumablesEnabled(12L));
    }

    @Test
    void customPackageUsesSelectedFeatureKeys() {
        when(settings.findByCompanyIdAndKey(12L, SettingKey.SIGNUP_PACKAGE_NAME))
                .thenReturn(Optional.of(setting("CUSTOM")));
        when(settings.findByCompanyIdAndKey(12L, SettingKey.BILLING_SUBSCRIPTION_CUSTOM_FEATURE_KEYS))
                .thenReturn(Optional.of(setting("WAITLIST_ENABLED CONSUMABLES_ENABLED")));
        when(settings.findByCompanyIdAndKey(12L, SettingKey.WAITLIST_ENABLED))
                .thenReturn(Optional.of(setting("true")));
        when(settings.findByCompanyIdAndKey(12L, SettingKey.CONSUMABLES_ENABLED))
                .thenReturn(Optional.of(setting("true")));

        assertTrue(service.isWaitlistEnabled(12L));
        assertTrue(service.areConsumablesEnabled(12L));
    }

    private static AppSetting setting(String value) {
        AppSetting setting = new AppSetting();
        setting.setValue(value);
        return setting;
    }
}
