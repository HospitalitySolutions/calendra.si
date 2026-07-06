package com.example.app.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.company.CompanyProvisioningService;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.security.crypto.password.PasswordEncoder;

@ExtendWith(MockitoExtension.class)
class SuperAdminBootstrapRunnerTest {

    @Mock private UserRepository users;
    @Mock private CompanyRepository companies;
    @Mock private CompanyProvisioningService companyProvisioningService;
    @Mock private PasswordEncoder passwordEncoder;

    private SuperAdminBootstrapProperties properties;
    private SuperAdminBootstrapRunner runner;

    @BeforeEach
    void setUp() {
        properties = new SuperAdminBootstrapProperties();
        properties.setEnabled(true);
        properties.setEmail("Info@Calendra.si");
        properties.setPassword("VeryStrongTemp123!");
        runner = new SuperAdminBootstrapRunner(properties, users, companies, companyProvisioningService, passwordEncoder);
    }

    @Test
    void beanIsNotRegisteredWhenBootstrapIsDisabled() {
        new ApplicationContextRunner()
                .withUserConfiguration(SuperAdminBootstrapRunner.class)
                .run(context -> assertFalse(context.containsBean("superAdminBootstrapRunner")));
    }

    @Test
    void createsInitialSuperAdminWhenNoSuperAdminExists() throws Exception {
        Company platform = new Company();
        platform.setId(10L);
        platform.setName("Platform Admin");
        platform.setTenantCode("PLATFORM-ADMIN");

        when(users.findAllByRoleOrderByIdAsc(Role.SUPER_ADMIN)).thenReturn(List.of());
        when(users.findAllByEmailIgnoreCase("info@calendra.si")).thenReturn(List.of());
        when(companies.findAllByNameContainingIgnoreCase("Platform Admin")).thenReturn(List.of());
        when(companyProvisioningService.createWithTenantCode("Platform Admin")).thenReturn(platform);
        when(passwordEncoder.encode("VeryStrongTemp123!")).thenReturn("encoded-temp-password");

        runner.run();

        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        verify(users).save(captor.capture());
        User saved = captor.getValue();
        assertEquals(platform, saved.getCompany());
        assertEquals("info@calendra.si", saved.getEmail());
        assertEquals("Platform", saved.getFirstName());
        assertEquals("Admin", saved.getLastName());
        assertEquals("encoded-temp-password", saved.getPasswordHash());
        assertEquals(Role.SUPER_ADMIN, saved.getRole());
        assertFalse(saved.isConsultant());
    }

    @Test
    void skipsWhenSuperAdminAlreadyExistsAndDoesNotResetPasswords() throws Exception {
        User existing = new User();
        existing.setRole(Role.SUPER_ADMIN);
        existing.setEmail("info@calendra.si");

        when(users.findAllByRoleOrderByIdAsc(Role.SUPER_ADMIN)).thenReturn(List.of(existing));

        runner.run();

        verify(users, never()).save(any(User.class));
        verify(passwordEncoder, never()).encode(any());
        verify(companies, never()).findAllByNameContainingIgnoreCase(anyString());
    }


    @Test
    void refusesWhenOnlyInactiveSuperAdminAccountsExist() {
        User existing = new User();
        existing.setRole(Role.SUPER_ADMIN);
        existing.setEmail("info@calendra.si");
        existing.setActive(false);

        when(users.findAllByRoleOrderByIdAsc(Role.SUPER_ADMIN)).thenReturn(List.of(existing));

        assertThrows(IllegalStateException.class, () -> runner.run());

        verify(users, never()).save(any(User.class));
        verify(passwordEncoder, never()).encode(any());
    }

    @Test
    void refusesToReuseExistingNonSuperAdminEmail() {
        User tenantUser = new User();
        tenantUser.setEmail("info@calendra.si");
        tenantUser.setRole(Role.ADMIN);

        when(users.findAllByRoleOrderByIdAsc(Role.SUPER_ADMIN)).thenReturn(List.of());
        when(users.findAllByEmailIgnoreCase("info@calendra.si")).thenReturn(List.of(tenantUser));

        assertThrows(IllegalStateException.class, () -> runner.run());

        verify(users, never()).save(any(User.class));
        verify(passwordEncoder, never()).encode(any());
    }

    @Test
    void rejectsWeakBootstrapPassword() {
        properties.setPassword("Admin123!");

        assertThrows(IllegalStateException.class, () -> runner.run());

        verify(users, never()).save(any(User.class));
        verify(passwordEncoder, never()).encode(any());
    }
}
