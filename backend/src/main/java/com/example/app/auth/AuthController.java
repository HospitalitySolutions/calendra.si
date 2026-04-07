package com.example.app.auth;

import com.example.app.billing.TaxRate;
import com.example.app.billing.TransactionService;
import com.example.app.billing.TransactionServiceRepository;
import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.company.CompanyProvisioningService;
import com.example.app.security.JwtService;
import com.example.app.session.SessionType;
import com.example.app.session.SessionTypeRepository;
import com.example.app.session.TypeTransactionService;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.web.DefaultOAuth2AuthorizationRequestResolver;
import org.springframework.security.oauth2.client.web.HttpSessionOAuth2AuthorizationRequestRepository;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestResolver;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Arrays;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private static final Logger log = LoggerFactory.getLogger(AuthController.class);

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
        private final Environment environment;
        private final Optional<ClientRegistrationRepository> clientRegistrationRepository;
        private final HttpSessionOAuth2AuthorizationRequestRepository authorizationRequestRepository;

    private final CompanyRepository companies;
    private final AppSettingRepository settings;
    private final SessionTypeRepository types;
    private final TransactionServiceRepository txServices;
    private final PasswordResetService passwordResetService;
    private final CompanyProvisioningService companyProvisioningService;

    public AuthController(
            UserRepository users,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
                        Environment environment,
                        @org.springframework.beans.factory.annotation.Autowired(required = false)
                        ClientRegistrationRepository clientRegistrationRepository,
            CompanyRepository companies,
            AppSettingRepository settings,
            SessionTypeRepository types,
            TransactionServiceRepository txServices,
            PasswordResetService passwordResetService,
            CompanyProvisioningService companyProvisioningService
    ) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
                this.environment = environment;
                this.clientRegistrationRepository = Optional.ofNullable(clientRegistrationRepository);
                this.authorizationRequestRepository = new HttpSessionOAuth2AuthorizationRequestRepository();
        this.companies = companies;
        this.settings = settings;
        this.types = types;
        this.txServices = txServices;
        this.passwordResetService = passwordResetService;
        this.companyProvisioningService = companyProvisioningService;
    }

    /**
     * GET check from a browser or device to confirm the API is reachable.
     * {@code /login} is POST-only; opening it in a tab returns 405, which is expected.
     */
    @GetMapping("/ping")
    public Map<String, String> ping() {
        return Map.of(
                "status", "ok",
                "hint", "Login: POST /api/auth/login with JSON body { \"email\", \"password\" }"
        );
    }

        @GetMapping("/google")
        public void startGoogleLogin(HttpServletRequest request, HttpServletResponse response) throws IOException {
                log.info("Google OAuth start requested. path={}, query={}", request.getRequestURI(), request.getQueryString());

                if (clientRegistrationRepository.isEmpty()) {
                        log.warn("Google OAuth start blocked: ClientRegistrationRepository missing.");
                        redirectOauthError(response, "Google login is not configured. Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET.");
                        return;
                }

                OAuth2AuthorizationRequestResolver resolver =
                                new DefaultOAuth2AuthorizationRequestResolver(clientRegistrationRepository.get(), "/oauth2/authorization");
                OAuth2AuthorizationRequest authorizationRequest = resolver.resolve(request, "google");
                if (authorizationRequest == null) {
                        log.warn("Google OAuth start failed: resolver returned null authorization request.");
                        redirectOauthError(response, "Google login configuration is invalid.");
                        return;
                }

                String providerRedirectUri = extractQueryParam(authorizationRequest.getAuthorizationRequestUri(), "redirect_uri");
                log.info("Google OAuth redirecting to provider. registrationId=google, providerRedirectUri={}", providerRedirectUri);
                authorizationRequestRepository.saveAuthorizationRequest(authorizationRequest, request, response);
                response.sendRedirect(authorizationRequest.getAuthorizationRequestUri());
        }

        private void redirectOauthError(HttpServletResponse response, String message) throws IOException {
                String encoded = URLEncoder.encode(message, StandardCharsets.UTF_8);
                response.sendRedirect("/login?oauth_error=" + encoded);
        }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest request) {
        String normalizedEmail = request.email().trim().toLowerCase();
        List<User> candidates = users.findAllByEmailIgnoreCase(normalizedEmail);

        User user = candidates.stream()
                .filter(u -> passwordEncoder.matches(request.password(), u.getPasswordHash()))
                .findFirst()
                .orElse(null);

        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "Invalid email or password."));
        }

        String token = jwtService.generateToken(user.getId());

        return ResponseEntity.ok(Map.of(
                "token", token,
                "user", Map.of(
                        "id", user.getId(),
                        "firstName", user.getFirstName(),
                        "lastName", user.getLastName(),
                        "email", user.getEmail(),
                        "role", user.getRole().name(),
                        "companyId", user.getCompany().getId()
                )
        ));
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof User user)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "Not authenticated."));
        }

        return ResponseEntity.ok(Map.of(
                "user", Map.of(
                        "id", user.getId(),
                        "firstName", user.getFirstName(),
                        "lastName", user.getLastName(),
                        "email", user.getEmail(),
                        "role", user.getRole().name(),
                        "companyId", user.getCompany().getId()
                ),
                "authorities", authentication.getAuthorities().stream()
                        .map(a -> a.getAuthority())
                        .collect(Collectors.toList())
        ));
    }

    @PostMapping("/signup")
    public ResponseEntity<?> signup(@RequestBody SignupRequest request) {
        String normalizedEmail = request.email().trim().toLowerCase();
        if (!users.findAllByEmailIgnoreCase(normalizedEmail).isEmpty()) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("message", "An account with this email already exists."));
        }

        String companyName = request.companyName().trim();
        Company company = companyProvisioningService.createWithTenantCode(companyName);

        boolean passwordProvided = request.password() != null && !request.password().isBlank();
        String rawPassword = passwordProvided ? request.password() : "Temp#" + UUID.randomUUID().toString().replace("-", "");

        User owner = new User();
        owner.setCompany(company);
        owner.setFirstName(request.firstName().trim());
        owner.setLastName(request.lastName().trim());
        owner.setEmail(normalizedEmail);
        owner.setPasswordHash(passwordEncoder.encode(rawPassword));
        owner.setRole(Role.ADMIN);
        owner.setActive(true);
        owner.setConsultant(true);
        owner = users.save(owner);

        seedTenantDefaults(company, companyName);
        seedSetting(company, SettingKey.COMPANY_EMAIL, normalizedEmail);
        seedSetting(company, SettingKey.SIGNUP_PACKAGE_NAME, safeSignupValue(request.packageName(), "professional"));
        seedSetting(company, SettingKey.SIGNUP_USER_COUNT, String.valueOf(Math.max(1, request.userCount() == null ? 1 : request.userCount())));
        seedSetting(company, SettingKey.SIGNUP_SMS_COUNT, String.valueOf(Math.max(0, request.smsCount() == null ? 0 : request.smsCount())));
        seedSetting(company, SettingKey.SIGNUP_FISCALIZATION_REQUIRED, String.valueOf(Boolean.TRUE.equals(request.fiscalizationNeeded())));
        int spaceQuota = Math.max(1, request.spaceCount() == null ? 5 : request.spaceCount());
        seedSetting(company, SettingKey.TENANCY_SPACE_QUOTA, String.valueOf(spaceQuota));
        seedSetting(company, SettingKey.TENANCY_SMS_SENT_COUNT, "0");
        String interval = request.billingInterval() == null ? "MONTHLY" : request.billingInterval().trim().toUpperCase();
        if (!"MONTHLY".equals(interval) && !"YEARLY".equals(interval)) {
            interval = "MONTHLY";
        }
        LocalDate subStart = LocalDate.now(ZoneId.systemDefault());
        LocalDate subEnd = "YEARLY".equals(interval) ? subStart.plusYears(1) : subStart.plusMonths(1);
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_START, subStart.toString());
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_END, subEnd.toString());
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_INTERVAL, interval);
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_DUE_AMOUNT, "0.00");

        if (!passwordProvided) {
            passwordResetService.requestReset(normalizedEmail);
            return ResponseEntity.ok(Map.of(
                    "message", "Signup created. A password setup email has been sent.",
                    "requiresPasswordSetup", true,
                    "email", normalizedEmail
            ));
        }

        String token = jwtService.generateToken(owner.getId());
        return ResponseEntity.ok(Map.of(
                "token", token,
                "user", Map.of(
                        "id", owner.getId(),
                        "firstName", owner.getFirstName(),
                        "lastName", owner.getLastName(),
                        "email", owner.getEmail(),
                        "role", owner.getRole().name(),
                        "companyId", owner.getCompany().getId()
                )
        ));
    }

    private void seedTenantDefaults(Company company, String companyName) {
        // App/module settings for a tenant.
        seedSetting(company, SettingKey.SPACES_ENABLED, "true");
        seedSetting(company, SettingKey.TYPES_ENABLED, "true");
        seedSetting(company, SettingKey.BOOKABLE_ENABLED, "true");
        seedSetting(company, SettingKey.SESSION_LENGTH_MINUTES, "60");
        seedSetting(company, SettingKey.PERSONAL_TASK_PRESETS_JSON, "[]");
        seedSetting(company, SettingKey.INVOICE_COUNTER, "1");
        seedSetting(company, SettingKey.COMPANY_NAME, companyName);
        seedSetting(company, SettingKey.COMPANY_ADDRESS, "");
        seedSetting(company, SettingKey.COMPANY_POSTAL_CODE, "");
        seedSetting(company, SettingKey.COMPANY_CITY, "");
        seedSetting(company, SettingKey.COMPANY_VAT_ID, "");
        seedSetting(company, SettingKey.COMPANY_IBAN, "");
        seedSetting(company, SettingKey.COMPANY_EMAIL, "");
        seedSetting(company, SettingKey.COMPANY_TELEPHONE, "");
        seedSetting(company, SettingKey.PAYMENT_DEADLINE_DAYS, "15");

        // Default transaction service.
        TransactionService tx = new TransactionService();
        tx.setCompany(company);
        tx.setCode("CONSULT-001");
        tx.setDescription("Consultation");
        tx.setTaxRate(TaxRate.VAT_22);
        tx.setNetPrice(new BigDecimal("50.00"));
        tx = txServices.save(tx);

        // Default session type linked to the default service.
        SessionType type = new SessionType();
        type.setCompany(company);
        type.setName("THERAPY");
        type.setDescription("Default therapy type");
        type.setDurationMinutes(60);

        TypeTransactionService link = new TypeTransactionService();
        link.setSessionType(type);
        link.setTransactionService(tx);
        link.setPrice(null); // use TransactionService default netPrice

        type.getLinkedServices().add(link);
        types.save(type);
    }

    private void seedSetting(Company company, SettingKey key, String value) {
        var s = new AppSetting();
        s.setCompany(company);
        s.setKey(key.name());
        s.setValue(value);
        settings.save(s);
    }

    private String safeSignupValue(String rawValue, String fallback) {
        if (rawValue == null || rawValue.isBlank()) return fallback;
        return rawValue.trim();
    }

    public record LoginRequest(
            @NotBlank @Email String email,
            @NotBlank String password
    ) {
    }

    public record ForgotPasswordRequest(@NotBlank @Email String email) {}

    public record ResetPasswordRequest(@NotBlank String token, @NotBlank String password) {}

    /**
     * Browsers and tools often issue GET when opening the URL; without this, Spring falls through to
     * static resources and returns 404 "No static resource api/auth/forgot-password.".
     * Password reset must use POST (see {@link #forgotPassword}).
     */
    @GetMapping("/forgot-password")
    public ResponseEntity<Map<String, Object>> forgotPasswordGet() {
        return ResponseEntity.ok(Map.of(
                "message", "Use POST with JSON body {\"email\":\"you@example.com\"} to request a password reset.",
                "method", "POST",
                "path", "/api/auth/forgot-password"
        ));
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<?> forgotPassword(@RequestBody ForgotPasswordRequest request) {
        // Respond 200 regardless of user existence to avoid account enumeration.
        passwordResetService.requestReset(request.email());
        return ResponseEntity.ok(Map.of("message", "If this email exists, a reset link has been sent."));
    }

    @GetMapping("/reset-password/validate")
    public ResponseEntity<?> validateResetToken(@RequestParam("token") String token) {
        boolean valid = passwordResetService.isTokenUsable(token);
        if (!valid) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", "Invalid or expired token."));
        }
        return ResponseEntity.ok(Map.of("valid", true));
    }

    @PostMapping("/reset-password")
    public ResponseEntity<?> resetPassword(@RequestBody ResetPasswordRequest request) {
        if (request.password().length() < 8) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("message", "Password must be at least 8 characters."));
        }
        boolean ok = passwordResetService.resetPassword(request.token(), request.password());
        if (!ok) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("message", "Invalid or expired token."));
        }
        return ResponseEntity.ok(Map.of("message", "Password has been reset."));
    }

    public record SignupRequest(
            @NotBlank String companyName,
            @NotBlank String firstName,
            @NotBlank String lastName,
            @NotBlank @Email String email,
            String password,
            String packageName,
            Integer userCount,
            Integer smsCount,
            Integer spaceCount,
            /** MONTHLY or YEARLY */
            String billingInterval,
            Boolean fiscalizationNeeded
    ) {
    }

    @GetMapping("/oauth-status")
    public Map<String, Object> oauthStatus() {
        boolean clientConfigured = clientRegistrationRepository.isPresent();
        boolean oauthEnabled = clientConfigured;
        try {
            String clientId = clientConfigured ?
                    clientRegistrationRepository.get().findByRegistrationId("google").getClientId() :
                    "NOT_FOUND";
            String redirectUri = clientConfigured
                    ? clientRegistrationRepository.get().findByRegistrationId("google").getRedirectUri()
                    : environment.getProperty(
                            "spring.security.oauth2.client.registration.google.redirect-uri",
                            "NOT_SET"
                    );
            return Map.of(
                    "oauthEnabled", oauthEnabled,
                    "clientConfigured", clientConfigured,
                    "googleClientConfigured", !clientId.isEmpty() && !clientId.equals("NOT_FOUND"),
                    "googleRedirectUri", redirectUri,
                    "profile", environment.getActiveProfiles().length > 0 ? environment.getActiveProfiles()[0] : "default"
            );
        } catch (Exception e) {
            return Map.of(
                    "oauthEnabled", oauthEnabled,
                    "clientConfigured", clientConfigured,
                    "googleClientConfigured", false,
                    "googleRedirectUri", environment.getProperty(
                            "spring.security.oauth2.client.registration.google.redirect-uri",
                            "NOT_SET"
                    ),
                    "profile", environment.getActiveProfiles().length > 0 ? environment.getActiveProfiles()[0] : "default",
                    "error", e.getMessage()
            );
        }
    }

    private String extractQueryParam(String url, String key) {
        try {
            URI uri = URI.create(url);
            String query = uri.getRawQuery();
            if (query == null || query.isBlank()) return "UNAVAILABLE";
            for (String pair : query.split("&")) {
                int idx = pair.indexOf('=');
                if (idx <= 0) continue;
                String k = java.net.URLDecoder.decode(pair.substring(0, idx), StandardCharsets.UTF_8);
                if (!key.equals(k)) continue;
                return java.net.URLDecoder.decode(pair.substring(idx + 1), StandardCharsets.UTF_8);
            }
            return "MISSING";
        } catch (Exception ignored) {
            return "UNAVAILABLE";
        }
    }
}