package com.example.app.auth;

import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.mfa.WebAuthnService;
import com.example.app.securitycenter.SecurityCenterService;
import com.example.app.security.AuthCookieService;
import com.example.app.security.JwtService;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.csrf.CsrfToken;
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
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Arrays;
import java.util.Locale;
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
    private final PasswordResetService passwordResetService;
    private final SignupService signupService;
    private final WebAuthnService webAuthnService;
    private final SecurityCenterService securityCenterService;
    private final AuthCookieService authCookieService;

    public AuthController(
            UserRepository users,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
                        Environment environment,
                        @org.springframework.beans.factory.annotation.Autowired(required = false)
                        ClientRegistrationRepository clientRegistrationRepository,
            CompanyRepository companies,
            AppSettingRepository settings,
            PasswordResetService passwordResetService,
            SignupService signupService,
            WebAuthnService webAuthnService,
            SecurityCenterService securityCenterService,
            AuthCookieService authCookieService
    ) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
                this.environment = environment;
                this.clientRegistrationRepository = Optional.ofNullable(clientRegistrationRepository);
                this.authorizationRequestRepository = new HttpSessionOAuth2AuthorizationRequestRepository();
        this.companies = companies;
        this.settings = settings;
        this.passwordResetService = passwordResetService;
        this.signupService = signupService;
        this.webAuthnService = webAuthnService;
        this.securityCenterService = securityCenterService;
        this.authCookieService = authCookieService;
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

                if ("1".equals(request.getParameter("register"))) {
                        HttpSession session = request.getSession(false);
                        if (session == null || session.getAttribute("SIGNUP_PENDING") == null) {
                                redirectOauthError(response, "Your signup session expired. Return to account setup and try again.");
                                return;
                        }
                        session.setAttribute("OAUTH_GOOGLE_SIGNUP_ACTIVE", Boolean.TRUE);
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
                String frontendBaseUrl = environment.getProperty("APP_AUTH_FRONTEND_URL", "http://localhost:3000");
                response.sendRedirect(frontendBaseUrl + "/login?oauth_error=" + encoded);
        }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest request, HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
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

        WebAuthnService.PrimaryLoginResult mfa = webAuthnService.startLoginChallenge(user);
        if (mfa.mfaRequired()) {
            return ResponseEntity.ok(Map.of(
                    "mfaRequired", true,
                    "pendingToken", mfa.pendingToken(),
                    "availableMethods", List.of("webauthn", "recovery_code"),
                    "user", Map.of(
                            "email", user.getEmail(),
                            "firstName", user.getFirstName(),
                            "lastName", user.getLastName()
                    )
            ));
        }

        String token = securityCenterService.issueSession(user, httpRequest, "Password sign-in").token();
        authCookieService.writeAuthCookie(httpRequest, httpResponse, token);

        return ResponseEntity.ok(authSuccessResponse(user, token, httpRequest));
    }

    @GetMapping("/csrf")
    public ResponseEntity<?> csrf(CsrfToken csrfToken) {
        return ResponseEntity.ok(Map.of(
                "headerName", csrfToken.getHeaderName(),
                "parameterName", csrfToken.getParameterName(),
                "token", csrfToken.getToken()
        ));
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof User user)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "Not authenticated."));
        }

        return ResponseEntity.ok(Map.of(
                "user", serializeUser(user, packageTypeForCompany(user.getCompany())),
                "authorities", authentication.getAuthorities().stream()
                        .map(a -> a.getAuthority())
                        .collect(Collectors.toList())
        ));
    }

    private Map<String, Object> serializeUser(User user, String packageType) {
        Company company = user.getCompany();
        String tenantCode = company.getTenantCode();
        return Map.of(
                "id", user.getId(),
                "firstName", user.getFirstName(),
                "lastName", user.getLastName(),
                "email", user.getEmail(),
                "role", user.getRole().name(),
                "companyId", company.getId(),
                "packageType", packageType,
                "tenantCode", tenantCode != null && !tenantCode.isBlank() ? tenantCode : "");
    }

    @PostMapping("/signup")
    public ResponseEntity<?> signup(@RequestBody SignupRequest request, HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        return signupService.signup(request, httpRequest, httpResponse);
    }

    @GetMapping("/signup/email-available")
    public ResponseEntity<?> signupEmailAvailable(@RequestParam("email") String email) {
        if (email == null || email.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Email is required.", "available", false));
        }
        String normalized = email.trim().toLowerCase();
        if (normalized.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Email is required.", "available", false));
        }
        SignupService.SignupEmailCheck check = signupService.evaluateSignupEmail(normalized);
        if (check.available()) {
            return ResponseEntity.ok(Map.of("available", true));
        }
        if (check.pendingVerification()) {
            return ResponseEntity.ok(Map.of(
                    "available", false,
                    "pendingVerification", true,
                    "registeredAccountExists", false,
                    "email", normalized
            ));
        }
        if (check.registeredAccountExists()) {
            return ResponseEntity.ok(Map.of(
                    "available", false,
                    "pendingVerification", false,
                    "registeredAccountExists", true,
                    "email", normalized
            ));
        }
        return ResponseEntity.badRequest().body(Map.of("available", false, "message", check.takenMessage()));
    }

    public record SignupValidateEmailRequest(@NotBlank String token) {
    }

    public record SignupCompleteEmailRequest(@NotBlank String token, @NotBlank String password) {
    }

    public record SignupResendIntentRequest(@NotBlank @Email String email) {
    }

    @GetMapping("/signup/validate-email-intent")
    public ResponseEntity<?> validateSignupEmailIntent(@RequestParam("token") String token) {
        if (token == null || token.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Token is required."));
        }
        return signupService.validateEmailSignupIntent(token.trim());
    }

    @PostMapping("/signup/complete-email")
    public ResponseEntity<?> completeSignupEmail(@Valid @RequestBody SignupCompleteEmailRequest body, HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        String passwordValidationMessage = validatePasswordStrength(body.password());
        if (passwordValidationMessage != null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("message", passwordValidationMessage));
        }
        return signupService.completeEmailSignupIntent(body.token().trim(), body.password(), httpRequest, httpResponse);
    }

    @PostMapping("/signup/resend-email-intent")
    public ResponseEntity<?> resendSignupEmailIntent(@Valid @RequestBody SignupResendIntentRequest body) {
        return signupService.resendEmailSignupIntent(body.email().trim().toLowerCase());
    }

    @PostMapping("/signup/pending-session")
    public ResponseEntity<?> saveSignupPendingSession(@RequestBody SignupPendingSession body, HttpSession session) {
        // Email may be blank when the user will complete Google OAuth; the provider supplies the address.
        session.setAttribute("SIGNUP_PENDING", body);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    public record SignupBillingDetailsRequest(
            @NotBlank String firstName,
            @NotBlank String lastName,
            String companyName,
            String vatId,
            String address,
            String postalCode,
            String city,
            String packageName,
            /** MONTHLY or YEARLY */
            String billingInterval,
            String paymentMethod
    ) {}

    @PostMapping("/signup/billing-details")
    public ResponseEntity<?> saveSignupBillingDetails(@Valid @RequestBody SignupBillingDetailsRequest body, Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof User user)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("message", "Not authenticated."));
        }
        return signupService.saveSignupBillingDetails(user, body);
    }

    private String normalizePackageType(String rawValue, String fallback) {
        String normalizedFallback = fallback == null || fallback.isBlank() ? "PROFESSIONAL" : fallback.trim().toUpperCase(Locale.ROOT);
        if (rawValue == null || rawValue.isBlank()) return normalizedFallback;
        String normalized = rawValue.trim().toUpperCase(Locale.ROOT).replace(' ', '_').replace('-', '_');
        if ("PRO".equals(normalized)) return "PROFESSIONAL";
        if ("TRIAL".equals(normalized) || "BASIC".equals(normalized) || "PROFESSIONAL".equals(normalized) || "PREMIUM".equals(normalized) || "CUSTOM".equals(normalized)) {
            return normalized;
        }
        return normalizedFallback;
    }

    private String packageTypeForCompany(Company company) {
        return settings.findByCompanyIdAndKey(company.getId(), SettingKey.SIGNUP_PACKAGE_NAME)
                .map(AppSetting::getValue)
                .map(value -> normalizePackageType(value, "CUSTOM"))
                .orElse("CUSTOM");
    }

    private String validatePasswordStrength(String password) {
        if (password == null || password.length() < 8) {
            return "Password must be at least 8 characters.";
        }
        if (!password.chars().anyMatch(Character::isDigit)) {
            return "Password must contain at least one number.";
        }
        if (!password.chars().anyMatch(Character::isUpperCase)) {
            return "Password must contain at least one uppercase letter.";
        }
        if (!password.chars().anyMatch(Character::isLowerCase)) {
            return "Password must contain at least one lowercase letter.";
        }
        return null;
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
        return passwordResetService
                .findEmailForUsableResetToken(token.trim())
                .map(email -> ResponseEntity.<Object>ok(Map.of("valid", true, "email", email)))
                .orElseGet(() -> ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", "Invalid or expired token.")));
    }

    @PostMapping("/reset-password")
    public ResponseEntity<?> resetPassword(@RequestBody ResetPasswordRequest request) {
        String passwordValidationMessage = validatePasswordStrength(request.password());
        if (passwordValidationMessage != null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("message", passwordValidationMessage));
        }
        boolean ok = passwordResetService.resetPassword(request.token(), request.password());
        if (!ok) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("message", "Invalid or expired token."));
        }
        return ResponseEntity.ok(Map.of("message", "Password has been reset."));
    }

    public record SignupRequest(
            String companyName,
            String firstName,
            String lastName,
            @NotBlank @Email String email,
            String phone,
            String password,
            String packageName,
            Integer userCount,
            Integer smsCount,
            Integer spaceCount,
            /** MONTHLY or YEARLY */
            String billingInterval,
            Boolean fiscalizationNeeded,
            /** Optional: {@code location.search} from the register flow for redirects after email confirmation. */
            String returnSearch
    ) {
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logout(Authentication authentication, HttpServletRequest request, HttpServletResponse response) {
        try {
            String token = authCookieService.resolveTokenFromHeaderOrCookie(request);
            if (authentication != null && authentication.getPrincipal() instanceof User user && token != null && !token.isBlank()) {
                String sessionId = jwtService.extractSessionId(token);
                if (sessionId != null && !sessionId.isBlank()) {
                    securityCenterService.revokeSession(user, sessionId, request);
                }
            }
        } catch (Exception ex) {
            log.warn("Logout session revocation skipped: {}", ex.getMessage());
        } finally {
            SecurityContextHolder.clearContext();
        }

        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }

        authCookieService.clearAuthCookie(request, response);

        ResponseCookie jsessionCookie = ResponseCookie.from("JSESSIONID", "")
                .path("/")
                .httpOnly(true)
                .maxAge(0)
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, jsessionCookie.toString());

        ResponseCookie xsrfCookie = ResponseCookie.from("XSRF-TOKEN", "")
                .path("/")
                .httpOnly(false)
                .maxAge(0)
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, xsrfCookie.toString());

        return ResponseEntity.ok(Map.of("message", "Signed out."));
    }

    private Map<String, Object> authSuccessResponse(User user, String token, HttpServletRequest request) {
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        if (authCookieService.isNativeClient(request)) {
            body.put("token", token);
        }
        body.put("user", serializeUser(user, packageTypeForCompany(user.getCompany())));
        return body;
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