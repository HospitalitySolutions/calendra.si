package com.example.app.widget;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

import com.example.app.company.Company;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.server.ResponseStatusException;

import static org.mockito.Mockito.mock;

class WidgetOriginValidatorTest {
    @Test
    void blocksPublicWidgetWhenProductionRequiresTenantAllowlistAndNoneExists() {
        AppSettingRepository settings = mock(AppSettingRepository.class);
        WidgetSecurityProperties properties = new WidgetSecurityProperties();
        properties.setRequireAllowedOrigin(true);
        WidgetOriginValidator validator = new WidgetOriginValidator(settings, properties);
        Company company = company(42L);
        when(settings.findByCompanyIdAndKey(42L, SettingKey.WIDGET_ALLOWED_ORIGINS.name())).thenReturn(Optional.empty());

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> validator.validate(company, new MockHttpServletRequest()));

        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
    }

    @Test
    void allowsConfiguredOrigin() {
        AppSettingRepository settings = mock(AppSettingRepository.class);
        WidgetSecurityProperties properties = new WidgetSecurityProperties();
        WidgetOriginValidator validator = new WidgetOriginValidator(settings, properties);
        Company company = company(42L);
        when(settings.findByCompanyIdAndKey(42L, SettingKey.WIDGET_ALLOWED_ORIGINS.name()))
                .thenReturn(Optional.of(setting("https://allowed.example")));
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Origin", "https://allowed.example");

        assertDoesNotThrow(() -> validator.validate(company, request));
    }

    @Test
    void rejectsUnconfiguredOrigin() {
        AppSettingRepository settings = mock(AppSettingRepository.class);
        WidgetSecurityProperties properties = new WidgetSecurityProperties();
        WidgetOriginValidator validator = new WidgetOriginValidator(settings, properties);
        Company company = company(42L);
        when(settings.findByCompanyIdAndKey(42L, SettingKey.WIDGET_ALLOWED_ORIGINS.name()))
                .thenReturn(Optional.of(setting("https://allowed.example")));
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Origin", "https://evil.example");

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> validator.validate(company, request));

        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
    }

    @Test
    void doesNotTrustRefererByDefaultWhenOriginIsMissing() {
        AppSettingRepository settings = mock(AppSettingRepository.class);
        WidgetSecurityProperties properties = new WidgetSecurityProperties();
        WidgetOriginValidator validator = new WidgetOriginValidator(settings, properties);
        Company company = company(42L);
        when(settings.findByCompanyIdAndKey(42L, SettingKey.WIDGET_ALLOWED_ORIGINS.name()))
                .thenReturn(Optional.of(setting("https://allowed.example")));
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Referer", "https://allowed.example/widget-page");

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> validator.validate(company, request));

        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
    }

    @Test
    void allowsSameOriginStandaloneBookingRequestUsingForwardedHost() {
        AppSettingRepository settings = mock(AppSettingRepository.class);
        WidgetSecurityProperties properties = new WidgetSecurityProperties();
        properties.setAllowedOrigins(java.util.List.of("https://calendra.si"));
        WidgetOriginValidator validator = new WidgetOriginValidator(settings, properties);
        Company company = company(42L);
        when(settings.findByCompanyIdAndKey(42L, SettingKey.WIDGET_ALLOWED_ORIGINS.name()))
                .thenReturn(Optional.empty());
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Forwarded-Proto", "https");
        request.addHeader("X-Forwarded-Host", "calendra.si");

        assertDoesNotThrow(() -> validator.validate(company, request));
    }

    private static Company company(Long id) {
        Company company = new Company();
        company.setId(id);
        company.setName("Tenant");
        company.setTenantCode("tenant");
        return company;
    }

    private static AppSetting setting(String value) {
        AppSetting setting = new AppSetting();
        setting.setKey(SettingKey.WIDGET_ALLOWED_ORIGINS.name());
        setting.setValue(value);
        return setting;
    }
}
