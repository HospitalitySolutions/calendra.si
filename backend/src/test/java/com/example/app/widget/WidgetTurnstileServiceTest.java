package com.example.app.widget;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.example.app.company.Company;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingsCryptoService;
import com.example.app.settings.SettingKey;
import java.net.http.HttpClient;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class WidgetTurnstileServiceTest {
    private AppSettingRepository settings;
    private SettingsCryptoService crypto;
    private Company company;

    @BeforeEach
    void setUp() {
        settings = mock(AppSettingRepository.class);
        crypto = mock(SettingsCryptoService.class);
        company = new Company();
        company.setId(42L);
        company.setTenantCode("21HQ");

        when(settings.findByCompanyIdAndKey(42L, SettingKey.WIDGET_TURNSTILE_SITE_KEY))
                .thenReturn(Optional.empty());
        when(settings.findByCompanyIdAndKey(42L, SettingKey.WIDGET_TURNSTILE_SECRET_KEY))
                .thenReturn(Optional.empty());
    }

    @Test
    void incompleteTenantOverrideFallsBackToCompleteGlobalPair() {
        when(settings.findByCompanyIdAndKey(42L, SettingKey.WIDGET_TURNSTILE_SITE_KEY))
                .thenReturn(Optional.of(setting("tenant-site")));

        WidgetTurnstileService service = service("global-site", "global-secret", true);

        assertTrue(service.isEnabled(company));
        assertEquals("global-site", service.siteKey(company));
    }

    @Test
    void completeTenantPairIsUsedTogether() {
        when(settings.findByCompanyIdAndKey(42L, SettingKey.WIDGET_TURNSTILE_SITE_KEY))
                .thenReturn(Optional.of(setting("tenant-site")));
        when(settings.findByCompanyIdAndKey(42L, SettingKey.WIDGET_TURNSTILE_SECRET_KEY))
                .thenReturn(Optional.of(setting("tenant-secret")));
        when(crypto.decryptIfEncrypted("tenant-secret")).thenReturn("tenant-secret");

        WidgetTurnstileService service = service("global-site", "global-secret", true);

        assertTrue(service.isEnabled(company));
        assertEquals("tenant-site", service.siteKey(company));
    }

    @Test
    void partialTenantAndIncompleteGlobalConfigurationDoesNotExposeMismatchedSiteKey() {
        when(settings.findByCompanyIdAndKey(42L, SettingKey.WIDGET_TURNSTILE_SITE_KEY))
                .thenReturn(Optional.of(setting("tenant-site")));

        WidgetTurnstileService service = service("", "global-secret", true);

        assertFalse(service.isEnabled(company));
        assertEquals("", service.siteKey(company));

        WidgetTurnstileException error = assertThrows(
                WidgetTurnstileException.class,
                () -> service.verifyForPublicAction(company, "token", "127.0.0.1")
        );
        assertEquals("WIDGET_TURNSTILE_MISCONFIGURED", error.getCode());
    }

    private WidgetTurnstileService service(String globalSiteKey, String globalSecretKey, boolean required) {
        return new WidgetTurnstileService(
                settings,
                crypto,
                globalSiteKey,
                globalSecretKey,
                required,
                mock(HttpClient.class)
        );
    }

    private AppSetting setting(String value) {
        AppSetting setting = new AppSetting();
        setting.setCompany(company);
        setting.setValue(value);
        return setting;
    }
}
