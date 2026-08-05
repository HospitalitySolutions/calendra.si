package com.example.app.settings;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.app.company.Company;
import com.example.app.stripe.StripeConnectService;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class GlobalPaymentProviderServiceTest {

    @Mock private AppSettingRepository settings;
    @Mock private UserRepository users;
    @Mock private StripeConnectService stripeConnectService;

    private Company platformCompany;
    private GlobalPaymentProviderService service;

    @BeforeEach
    void setUp() {
        platformCompany = new Company();
        platformCompany.setId(10L);
        User platformAdmin = new User();
        platformAdmin.setCompany(platformCompany);
        platformAdmin.setRole(Role.SUPER_ADMIN);
        when(users.findAllByRoleOrderByIdAsc(Role.SUPER_ADMIN)).thenReturn(List.of(platformAdmin));
        service = new GlobalPaymentProviderService(settings, users, stripeConnectService);
    }

    @Test
    void registrationStripeIsHiddenWhenPlatformAccountIsNotReady() {
        when(settings.findByCompanyIdAndKey(10L, SettingKey.GLOBAL_PAYMENTS_STRIPE_ENABLED))
                .thenReturn(Optional.of(setting("true")));
        when(stripeConnectService.isReadyForCompany(platformCompany)).thenReturn(false);

        assertFalse(service.isPlatformAdminStripeReady());
        assertTrue(service.isStripeEnabled());
    }

    @Test
    void registrationStripeIsShownWhenGloballyEnabledAndPlatformAccountIsReady() {
        when(settings.findByCompanyIdAndKey(10L, SettingKey.GLOBAL_PAYMENTS_STRIPE_ENABLED))
                .thenReturn(Optional.of(setting("true")));
        when(stripeConnectService.isReadyForCompany(platformCompany)).thenReturn(true);

        assertTrue(service.isPlatformAdminStripeReady());
    }

    @Test
    void registrationStripeIsHiddenWhenGloballyDisabled() {
        when(settings.findByCompanyIdAndKey(10L, SettingKey.GLOBAL_PAYMENTS_STRIPE_ENABLED))
                .thenReturn(Optional.of(setting("false")));

        assertFalse(service.isPlatformAdminStripeReady());
        verify(stripeConnectService, never()).isReadyForCompany(platformCompany);
    }

    private static AppSetting setting(String value) {
        AppSetting setting = new AppSetting();
        setting.setValue(value);
        return setting;
    }
}
