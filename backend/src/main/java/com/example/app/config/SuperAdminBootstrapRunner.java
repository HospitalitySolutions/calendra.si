package com.example.app.config;

import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.company.CompanyProvisioningService;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import jakarta.transaction.Transactional;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * One-time, production-safe bootstrap for the first platform superadmin.
 *
 * Unlike DataSeeder, this runner does not seed demo tenants and does not reset
 * existing passwords. It is disabled by default and must be explicitly enabled
 * through environment variables or Secrets Manager.
 */
@Component
@ConditionalOnProperty(prefix = "app.bootstrap.superadmin", name = "enabled", havingValue = "true")
public class SuperAdminBootstrapRunner implements CommandLineRunner {
    private static final Logger log = LoggerFactory.getLogger(SuperAdminBootstrapRunner.class);

    private final SuperAdminBootstrapProperties properties;
    private final UserRepository users;
    private final CompanyRepository companies;
    private final CompanyProvisioningService companyProvisioningService;
    private final PasswordEncoder passwordEncoder;

    public SuperAdminBootstrapRunner(
            SuperAdminBootstrapProperties properties,
            UserRepository users,
            CompanyRepository companies,
            CompanyProvisioningService companyProvisioningService,
            PasswordEncoder passwordEncoder
    ) {
        this.properties = properties;
        this.users = users;
        this.companies = companies;
        this.companyProvisioningService = companyProvisioningService;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public void run(String... args) {
        String email = normalizeEmail(properties.getEmail());
        String password = properties.getPassword();
        validateBootstrapInput(email, password);

        var existingSuperAdmins = users.findAllByRoleOrderByIdAsc(Role.SUPER_ADMIN);
        if (!existingSuperAdmins.isEmpty()) {
            boolean hasActiveSuperAdmin = existingSuperAdmins.stream().anyMatch(User::isActive);
            if (!hasActiveSuperAdmin) {
                throw new IllegalStateException(
                        "Superadmin bootstrap refused: SUPER_ADMIN account(s) already exist but all are inactive. "
                                + "Resolve this manually instead of creating a second platform admin account."
                );
            }
            log.info("Superadmin bootstrap skipped: {} SUPER_ADMIN account(s) already exist.", existingSuperAdmins.size());
            return;
        }

        var existingUsersWithEmail = users.findAllByEmailIgnoreCase(email);
        if (!existingUsersWithEmail.isEmpty()) {
            throw new IllegalStateException(
                    "Superadmin bootstrap refused: an account with APP_BOOTSTRAP_SUPERADMIN_EMAIL already exists "
                            + "but no SUPER_ADMIN account exists. To avoid silently promoting or resetting an existing tenant user, "
                            + "resolve this manually or use a different bootstrap email."
            );
        }

        Company platformCompany = findOrCreatePlatformCompany();

        var superAdmin = new User();
        superAdmin.setCompany(platformCompany);
        superAdmin.setFirstName(defaultIfBlank(properties.getFirstName(), "Platform"));
        superAdmin.setLastName(defaultIfBlank(properties.getLastName(), "Admin"));
        superAdmin.setEmail(email);
        superAdmin.setPasswordHash(passwordEncoder.encode(password));
        superAdmin.setRole(Role.SUPER_ADMIN);
        superAdmin.setActive(true);
        superAdmin.setConsultant(false);
        users.save(superAdmin);

        log.info("Initial SUPER_ADMIN account created for {}. Disable APP_BOOTSTRAP_SUPERADMIN_ENABLED after first login.", maskEmail(email));
    }

    private Company findOrCreatePlatformCompany() {
        String platformCompanyName = defaultIfBlank(properties.getPlatformCompanyName(), "Platform Admin");
        return companies.findAllByNameContainingIgnoreCase(platformCompanyName).stream()
                .filter(company -> company.getName() != null && company.getName().trim().equalsIgnoreCase(platformCompanyName))
                .findFirst()
                .map(companyProvisioningService::ensureTenantCode)
                .orElseGet(() -> companyProvisioningService.createWithTenantCode(platformCompanyName));
    }

    private void validateBootstrapInput(String email, String password) {
        if (email.isBlank()) {
            throw new IllegalStateException("APP_BOOTSTRAP_SUPERADMIN_EMAIL must be set when superadmin bootstrap is enabled.");
        }
        if (!email.contains("@") || email.startsWith("@") || email.endsWith("@")) {
            throw new IllegalStateException("APP_BOOTSTRAP_SUPERADMIN_EMAIL must be a valid email address.");
        }
        if (password == null || password.isBlank()) {
            throw new IllegalStateException("APP_BOOTSTRAP_SUPERADMIN_PASSWORD must be set when superadmin bootstrap is enabled.");
        }
        if (password.length() < 16) {
            throw new IllegalStateException("APP_BOOTSTRAP_SUPERADMIN_PASSWORD must be at least 16 characters long.");
        }
        if ("Admin123!".equals(password)) {
            throw new IllegalStateException("APP_BOOTSTRAP_SUPERADMIN_PASSWORD must not use the old demo password.");
        }
        if (!containsUppercase(password) || !containsLowercase(password) || !containsDigit(password) || !containsNonAlphanumeric(password)) {
            throw new IllegalStateException(
                    "APP_BOOTSTRAP_SUPERADMIN_PASSWORD must include uppercase, lowercase, digit, and special characters."
            );
        }
    }

    private static boolean containsUppercase(String value) {
        return value.chars().anyMatch(Character::isUpperCase);
    }

    private static boolean containsLowercase(String value) {
        return value.chars().anyMatch(Character::isLowerCase);
    }

    private static boolean containsDigit(String value) {
        return value.chars().anyMatch(Character::isDigit);
    }

    private static boolean containsNonAlphanumeric(String value) {
        return value.chars().anyMatch(ch -> !Character.isLetterOrDigit(ch));
    }

    private static String normalizeEmail(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }

    private static String defaultIfBlank(String value, String fallback) {
        return value == null || value.trim().isBlank() ? fallback : value.trim();
    }

    private static String maskEmail(String email) {
        int at = email.indexOf('@');
        if (at <= 1) {
            return "***" + email.substring(Math.max(at, 0));
        }
        return email.charAt(0) + "***" + email.substring(at);
    }
}
