package com.example.app.settings;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class EntitlementsModuleAccessServiceTest {

    @Mock private AppSettingRepository settings;

    private EntitlementsModuleAccessService service;

    @BeforeEach
    void setUp() {
        service = new EntitlementsModuleAccessService(settings);
    }

    @Test
    void missingSettingDefaultsToEnabledForExistingTenants() {
        when(settings.findByCompanyIdAndKey(12L, SettingKey.ENTITLEMENTS_ENABLED))
                .thenReturn(Optional.empty());

        assertTrue(service.isEnabled(12L));
        assertDoesNotThrow(() -> service.assertEnabled(12L));
    }

    @Test
    void falseSettingDisablesEntitlementsAndRejectsUsage() {
        when(settings.findByCompanyIdAndKey(12L, SettingKey.ENTITLEMENTS_ENABLED))
                .thenReturn(Optional.of(setting("false")));

        assertFalse(service.isEnabled(12L));
        ResponseStatusException error = assertThrows(
                ResponseStatusException.class,
                () -> service.assertEnabled(12L)
        );
        assertTrue(error.getStatusCode().isSameCodeAs(HttpStatus.FORBIDDEN));
    }

    @Test
    void trueSettingEnablesEntitlements() {
        when(settings.findByCompanyIdAndKey(12L, SettingKey.ENTITLEMENTS_ENABLED))
                .thenReturn(Optional.of(setting("true")));

        assertTrue(service.isEnabled(12L));
    }

    private static AppSetting setting(String value) {
        AppSetting setting = new AppSetting();
        setting.setValue(value);
        return setting;
    }
}
