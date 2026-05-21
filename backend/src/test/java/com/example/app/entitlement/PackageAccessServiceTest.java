package com.example.app.entitlement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.example.app.company.Company;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class PackageAccessServiceTest {
    private final AppSettingRepository settings = mock(AppSettingRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final PackageAccessService service = new PackageAccessService(settings, users);

    @Test
    void professionalCanUseBillingButNotInbox() {
        Company company = company(42L);
        when(settings.findByCompanyIdAndKey(42L, SettingKey.SIGNUP_PACKAGE_NAME)).thenReturn(Optional.of(setting("PROFESSIONAL")));

        User user = user(company, Role.ADMIN);

        assertThat(service.hasBillingAccess(user)).isTrue();
        assertThat(service.hasInboxAccess(user)).isFalse();
    }

    @Test
    void premiumCanUseBillingAndInbox() {
        Company company = company(43L);
        when(settings.findByCompanyIdAndKey(43L, SettingKey.SIGNUP_PACKAGE_NAME)).thenReturn(Optional.of(setting("PREMIUM")));

        User user = user(company, Role.ADMIN);

        assertThat(service.hasBillingAccess(user)).isTrue();
        assertThat(service.hasInboxAccess(user)).isTrue();
    }

    @Test
    void userQuotaUsesExplicitSignupUserCountWhenHigherThanPackageMinimum() {
        when(settings.findByCompanyIdAndKey(44L, SettingKey.SIGNUP_PACKAGE_NAME)).thenReturn(Optional.of(setting("BASIC")));
        when(settings.findByCompanyIdAndKey(44L, SettingKey.SIGNUP_USER_COUNT)).thenReturn(Optional.of(setting("5")));

        assertThat(service.userQuota(44L)).isEqualTo(5);
    }

    private static Company company(Long id) {
        Company company = new Company();
        company.setId(id);
        return company;
    }

    private static User user(Company company, Role role) {
        User user = new User();
        user.setId(7L);
        user.setCompany(company);
        user.setRole(role);
        return user;
    }

    private static AppSetting setting(String value) {
        AppSetting setting = new AppSetting();
        setting.setValue(value);
        return setting;
    }
}
