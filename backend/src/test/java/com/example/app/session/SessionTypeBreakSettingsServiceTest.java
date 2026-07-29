package com.example.app.session;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class SessionTypeBreakSettingsServiceTest {
    @Mock private AppSettingRepository settings;
    @Mock private SessionTypeRepository sessionTypes;

    private SessionTypeBreakSettingsService service;

    @BeforeEach
    void setUp() {
        service = new SessionTypeBreakSettingsService(settings, sessionTypes);
    }

    @Test
    void applyDefault_updatesOnlyServicesThatInheritTheTenantDefault() {
        SessionType inherited = new SessionType();
        inherited.setBreakMinutes(0);
        inherited.setBreakMinutesOverridden(false);
        SessionType overridden = new SessionType();
        overridden.setBreakMinutes(15);
        overridden.setBreakMinutesOverridden(true);
        when(sessionTypes.findAllByCompanyId(7L)).thenReturn(List.of(inherited, overridden));

        int normalized = service.applyDefaultToInheritedServices(7L, "12");

        assertEquals(10, normalized);
        assertEquals(10, inherited.getBreakMinutes());
        assertEquals(15, overridden.getBreakMinutes());
        verify(sessionTypes).saveAll(List.of(inherited));
    }

    @Test
    void defaultBreak_readsAndNormalizesTheTenantSetting() {
        AppSetting setting = new AppSetting();
        setting.setValue("17");
        when(settings.findByCompanyIdAndKey(7L, SettingKey.DEFAULT_SERVICE_BREAK_MINUTES))
                .thenReturn(Optional.of(setting));

        assertEquals(15, service.defaultBreakMinutes(7L));
    }

    @Test
    void applyDefault_withMissingCompanyDoesNotWriteServices() {
        assertEquals(20, service.applyDefaultToInheritedServices(null, "18"));
        verify(sessionTypes, never()).saveAll(anyList());
    }
}
