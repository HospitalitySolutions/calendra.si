package com.example.app.location;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

import com.example.app.billing.BillRepository;
import com.example.app.billingissuer.CompanyLegalEntityRepository;
import com.example.app.billingissuer.InvoiceSeriesRepository;
import com.example.app.company.Company;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.SpaceRepository;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.waitlist.WaitlistRequestRepository;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class LocationControllerFeatureGateTest {

    @Mock private LocationRepository locations;
    @Mock private SpaceRepository spaces;
    @Mock private SessionBookingRepository bookings;
    @Mock private WaitlistRequestRepository waitlists;
    @Mock private BillRepository bills;
    @Mock private CompanyLegalEntityRepository issuerAssignments;
    @Mock private InvoiceSeriesRepository invoiceSeries;
    @Mock private AppSettingRepository settings;

    private LocationController controller;
    private User tenantAdmin;

    @BeforeEach
    void setUp() {
        controller = new LocationController(
                locations,
                spaces,
                bookings,
                waitlists,
                bills,
                issuerAssignments,
                invoiceSeries,
                settings
        );
        Company company = new Company();
        company.setId(10L);
        tenantAdmin = new User();
        tenantAdmin.setCompany(company);
        tenantAdmin.setRole(Role.ADMIN);
        when(locations.countByCompanyId(10L)).thenReturn(1L);
    }

    @Test
    void professionalTenantCannotSelfEnableAdditionalLocations() {
        setting(SettingKey.LOCATIONS_ENABLED, "true");
        setting(SettingKey.SIGNUP_PACKAGE_NAME, "PROFESSIONAL");

        ResponseStatusException error = assertThrows(
                ResponseStatusException.class,
                () -> controller.create(null, tenantAdmin)
        );

        assertEquals(HttpStatus.FORBIDDEN, error.getStatusCode());
    }

    @Test
    void premiumTenantCanDisableAdditionalLocations() {
        setting(SettingKey.LOCATIONS_ENABLED, "false");
        setting(SettingKey.SIGNUP_PACKAGE_NAME, "PREMIUM");

        ResponseStatusException error = assertThrows(
                ResponseStatusException.class,
                () -> controller.create(null, tenantAdmin)
        );

        assertEquals(HttpStatus.FORBIDDEN, error.getStatusCode());
    }

    @Test
    void customTenantRequiresPlatformAssignedLocationFeature() {
        setting(SettingKey.LOCATIONS_ENABLED, "true");
        setting(SettingKey.SIGNUP_PACKAGE_NAME, "CUSTOM");
        setting(SettingKey.BILLING_SUBSCRIPTION_CUSTOM_FEATURE_KEYS, "INBOX_ENABLED,SPACES_ENABLED");

        ResponseStatusException error = assertThrows(
                ResponseStatusException.class,
                () -> controller.create(null, tenantAdmin)
        );

        assertEquals(HttpStatus.FORBIDDEN, error.getStatusCode());
    }

    @Test
    void customTenantWithAssignedFeaturePassesTheLocationGate() {
        setting(SettingKey.LOCATIONS_ENABLED, "true");
        setting(SettingKey.SIGNUP_PACKAGE_NAME, "CUSTOM");
        setting(SettingKey.BILLING_SUBSCRIPTION_CUSTOM_FEATURE_KEYS, "LOCATIONS_ENABLED,SPACES_ENABLED");

        ResponseStatusException error = assertThrows(
                ResponseStatusException.class,
                () -> controller.create(null, tenantAdmin)
        );

        assertEquals(HttpStatus.BAD_REQUEST, error.getStatusCode());
    }

    private void setting(SettingKey key, String value) {
        AppSetting setting = new AppSetting();
        setting.setValue(value);
        when(settings.findByCompanyIdAndKey(10L, key)).thenReturn(Optional.of(setting));
    }
}
