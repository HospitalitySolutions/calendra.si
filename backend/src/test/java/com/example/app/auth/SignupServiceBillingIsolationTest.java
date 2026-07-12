package com.example.app.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import com.example.app.company.Company;
import com.example.app.company.CompanyProvisioningService;
import com.example.app.company.CompanyRepository;
import com.example.app.security.AuthCookieService;
import com.example.app.securitycenter.SecurityCenterService;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.crypto.password.PasswordEncoder;

@ExtendWith(MockitoExtension.class)
class SignupServiceBillingIsolationTest {
    @Mock private UserRepository users;
    @Mock private PasswordEncoder passwordEncoder;
    @Mock private CompanyProvisioningService companyProvisioningService;
    @Mock private CompanyRepository companies;
    @Mock private AppSettingRepository settings;
    @Mock private SecurityCenterService securityCenterService;
    @Mock private AuthCookieService authCookieService;
    @Mock private SignupEmailIntentRepository signupEmailIntents;

    private SignupService service;
    private final AtomicLong userIds = new AtomicLong(100L);
    private final Map<String, AppSetting> settingStore = new HashMap<>();

    @BeforeEach
    void setUp() {
        service = new SignupService(
                users,
                passwordEncoder,
                companyProvisioningService,
                companies,
                settings,
                securityCenterService,
                authCookieService,
                signupEmailIntents,
                new ObjectMapper(),
                null,
                "",
                "",
                ""
        );

        when(passwordEncoder.encode(any())).thenAnswer(inv -> "enc:" + inv.getArgument(0));
        when(users.findAllByEmailIgnoreCase(any())).thenReturn(List.of());
        when(signupEmailIntents.findAllByEmailIgnoreCaseAndActiveTrue(any())).thenReturn(List.of());
        when(users.save(any(User.class))).thenAnswer(inv -> {
            User row = inv.getArgument(0);
            if (row.getId() == null) row.setId(userIds.incrementAndGet());
            return row;
        });
        when(authCookieService.isNativeClient(any(HttpServletRequest.class))).thenReturn(false);
        when(securityCenterService.issueSession(any(User.class), any(HttpServletRequest.class), any()))
                .thenReturn(new SecurityCenterService.IssuedSession("signup-token", "session-key", false));

        when(settings.findByCompanyIdAndKey(anyLong(), any(SettingKey.class))).thenAnswer(inv -> {
            Long companyId = inv.getArgument(0);
            SettingKey key = inv.getArgument(1);
            return Optional.ofNullable(settingStore.get(key(companyId, key.name())));
        });
        when(settings.save(any(AppSetting.class))).thenAnswer(inv -> {
            AppSetting row = inv.getArgument(0);
            settingStore.put(key(row.getCompany().getId(), row.getKey()), row);
            return row;
        });
    }

    @Test
    void signupAndBillingDetails_keepDueAmountAtZeroWithoutPlatformAutobilling() {
        Company company = new Company();
        company.setId(10L);
        company.setTenantCode("acme");
        company.setName("Acme");
        when(companyProvisioningService.createWithTenantCode(any())).thenReturn(company);
        when(companies.findByIdForUpdate(10L)).thenReturn(Optional.of(company));

        AuthController.SignupRequest signup = new AuthController.SignupRequest(
                "Acme Ltd",
                "Ana",
                "Admin",
                "ana@example.com",
                "+38640111222",
                "StrongPass1",
                "PROFESSIONAL",
                3,
                50,
                5,
                "MONTHLY",
                false,
                null
        );

        HttpServletRequest httpRequest = new MockHttpServletRequest();
        HttpServletResponse httpResponse = new MockHttpServletResponse();
        ResponseEntity<?> signupResponse = service.provisionNewTenant(signup, "ana@example.com", httpRequest, httpResponse, false);
        assertTrue(signupResponse.getStatusCode().is2xxSuccessful());

        User owner = users.findAllByEmailIgnoreCase("ana@example.com").stream().findFirst().orElseGet(() -> {
            User created = new User();
            created.setId(userIds.get());
            created.setCompany(company);
            created.setEmail("ana@example.com");
            return created;
        });
        when(users.findById(eq(owner.getId()))).thenReturn(Optional.of(owner));

        String beforeDetailsStart = settingValue(10L, SettingKey.BILLING_SUBSCRIPTION_START);
        assertEquals("0.00", settingValue(10L, SettingKey.BILLING_SUBSCRIPTION_DUE_AMOUNT));

        AuthController.SignupBillingDetailsRequest billing = new AuthController.SignupBillingDetailsRequest(
                "Ana",
                "Admin",
                "Acme d.o.o.",
                "SI12345678",
                "Main street 1",
                "1000",
                "Ljubljana",
                "salon",
                "PROFESSIONAL",
                "YEARLY",
                "CARD"
        );
        ResponseEntity<?> billingResponse = service.saveSignupBillingDetails(owner, billing);
        assertTrue(billingResponse.getStatusCode().is2xxSuccessful());

        assertEquals("0.00", settingValue(10L, SettingKey.BILLING_SUBSCRIPTION_DUE_AMOUNT));
        assertEquals(beforeDetailsStart, settingValue(10L, SettingKey.BILLING_SUBSCRIPTION_START));
    }

    private String settingValue(Long companyId, SettingKey key) {
        AppSetting setting = settingStore.get(key(companyId, key.name()));
        return setting == null ? null : setting.getValue();
    }

    private String key(Long companyId, String settingKey) {
        return companyId + ":" + settingKey;
    }
}
