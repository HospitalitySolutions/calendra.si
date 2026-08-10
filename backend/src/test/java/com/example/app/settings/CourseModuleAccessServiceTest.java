package com.example.app.settings;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

import com.example.app.course.CourseRepository;
import com.example.app.guest.model.GuestProductRepository;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class CourseModuleAccessServiceTest {

    @Mock private AppSettingRepository settings;
    @Mock private CourseRepository courses;
    @Mock private GuestProductRepository products;
    @Mock private EntitlementsModuleAccessService entitlements;

    private CourseModuleAccessService service;

    @BeforeEach
    void setUp() {
        service = new CourseModuleAccessService(settings, courses, products, entitlements);
    }

    @Test
    void parentEntitlementsSwitchForcesCoursesOff() {
        when(entitlements.isEnabled(20L)).thenReturn(false);

        assertFalse(service.isEnabled(20L));
    }

    @Test
    void courseSettingIsUsedWhenEntitlementsAreEnabled() {
        when(entitlements.isEnabled(20L)).thenReturn(true);
        when(settings.findByCompanyIdAndKey(20L, SettingKey.COURSES_ENABLED))
                .thenReturn(Optional.of(setting("true")));

        assertTrue(service.isEnabled(20L));
    }

    @Test
    void missingCourseSettingStillDefaultsToEnabledWhenParentIsEnabled() {
        when(entitlements.isEnabled(20L)).thenReturn(true);
        when(settings.findByCompanyIdAndKey(20L, SettingKey.COURSES_ENABLED))
                .thenReturn(Optional.empty());

        assertTrue(service.isEnabled(20L));
    }

    private static AppSetting setting(String value) {
        AppSetting setting = new AppSetting();
        setting.setValue(value);
        return setting;
    }
}
