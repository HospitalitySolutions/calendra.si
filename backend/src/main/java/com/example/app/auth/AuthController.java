package com.example.app.auth;

import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.workspace.Workspace;
import com.example.app.workspacesubscription.WorkspaceSubscriptionService;
import com.example.app.workspacehardening.WorkspaceRolloutProperties;
import com.example.app.mfa.WebAuthnService;
import com.example.app.observability.legacy.LegacyEndpointDefinition;
import com.example.app.observability.legacy.TrackLegacyEndpoint;
import com.example.app.securitycenter.SecurityCenterService;
import com.example.app.security.AuthCookieService;
import com.example.app.security.JwtService;
import com.example.app.security.SecurityUtils;
import com.example.app.security.ratelimit.AuthRateLimiter;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Locale;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private static final Logger log = LoggerFactory.getLogger(AuthController.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    private final UserRepository users;
    private final LoginAccountService loginAccountService;
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
    private final AuthRateLimiter authRateLimiter;
    private WorkspaceSubscriptionService workspaceSubscriptions;
    private WorkspaceRolloutProperties workspaceRollout;

    public AuthController(
            UserRepository users,
            LoginAccountService loginAccountService,
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
            AuthCookieService authCookieService,
            AuthRateLimiter authRateLimiter
    ) {
        this.users = users;
        this.loginAccountService = loginAccountService;
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
        this.authRateLimiter = authRateLimiter;
    }

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    void configureWorkspaceSubscriptions(WorkspaceSubscriptionService workspaceSubscriptions) {
        this.workspaceSubscriptions = workspaceSubscriptions;
    }

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    void configureWorkspaceRollout(WorkspaceRolloutProperties workspaceRollout) {
        this.workspaceRollout = workspaceRollout;
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
                startOAuthLogin("google", "Google", request, response);
        }

        @GetMapping("/apple")
        public void startAppleLogin(HttpServletRequest request, HttpServletResponse response) throws IOException {
                startOAuthLogin("apple", "Apple", request, response);
        }

        private void startOAuthLogin(String registrationId, String providerName, HttpServletRequest request, HttpServletResponse response) throws IOException {
                log.info("{} OAuth start requested. path={}, query={}", providerName, request.getRequestURI(), request.getQueryString());

                if (clientRegistrationRepository.isEmpty()) {
                        log.warn("{} OAuth start blocked: ClientRegistrationRepository missing.", providerName);
                        redirectOauthError(response, providerName + " login is not configured. Check the OAuth environment variables.");
                        return;
                }

                if ("1".equals(request.getParameter("register"))) {
                        if (!"google".equals(registrationId)) {
                                redirectOauthError(response, providerName + " signup is not enabled yet. Use email/password or Google signup.");
                                return;
                        }
                        HttpSession session = request.getSession(false);
                        if (session == null || session.getAttribute("SIGNUP_PENDING") == null) {
                                redirectOauthError(response, "Your signup session expired. Return to account setup and try again.");
                                return;
                        }
                        session.setAttribute("OAUTH_GOOGLE_SIGNUP_ACTIVE", Boolean.TRUE);
                }

                OAuth2AuthorizationRequestResolver resolver =
                                new DefaultOAuth2AuthorizationRequestResolver(clientRegistrationRepository.get(), "/oauth2/authorization");
                OAuth2AuthorizationRequest authorizationRequest = resolver.resolve(request, registrationId);
                if (authorizationRequest == null) {
                        log.warn("{} OAuth start failed: resolver returned null authorization request for registrationId={}.", providerName, registrationId);
                        redirectOauthError(response, providerName + " login configuration is invalid or missing.");
                        return;
                }

                String providerRedirectUri = extractQueryParam(authorizationRequest.getAuthorizationRequestUri(), "redirect_uri");
                log.info("{} OAuth redirecting to provider. registrationId={}, providerRedirectUri={}", providerName, registrationId, providerRedirectUri);
                authorizationRequestRepository.saveAuthorizationRequest(authorizationRequest, request, response);
                response.sendRedirect(authorizationRequest.getAuthorizationRequestUri());
        }

        private void redirectOauthError(HttpServletResponse response, String message) throws IOException {
                String encoded = URLEncoder.encode(message, StandardCharsets.UTF_8);
                String frontendBaseUrl = environment.getProperty("APP_AUTH_FRONTEND_URL", environment.getProperty("APP_PUBLIC_BASE_URL", "http://localhost:3000"));
                response.sendRedirect(frontendBaseUrl + "/login?oauth_error=" + encoded);
        }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest request, HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        authRateLimiter.checkStaffLogin(httpRequest, request.email());
        String normalizedEmail = request.email().trim().toLowerCase();
        List<LoginAccount> candidates = loginAccountService.findLoginCandidates(normalizedEmail);
        List<LoginAccount> passwordMatches = candidates.stream()
                .filter(LoginAccount::isActive)
                .filter(account -> passwordEncoder.matches(request.password(), account.getPasswordHash()))
                .toList();
        LoginSelection selection = chooseStaffLoginCandidate(normalizedEmail, passwordMatches);
        User user = selection == null ? null : selection.membership();
        if (user != null && tenantLoginBlocked(user)) {
            user = loginAccountService.activeMemberships(selection.account()).stream()
                    .filter(candidate -> !tenantLoginBlocked(candidate))
                    .findFirst()
                    .orElse(user);
        }

        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "Invalid email or password."));
        }
        if (tenantLoginBlocked(user)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("message", "This tenant account is suspended or cancelled. Please contact Calendra support."));
        }
        loginAccountService.rememberSelectedUnit(selection.account(), user.getCompany().getId());

        WebAuthnService.PrimaryLoginResult mfa = webAuthnService.startLoginChallenge(user);
        if (mfa.mfaRequired()) {
            return ResponseEntity.ok(Map.of(
                    "mfaRequired", true,
                    "pendingToken", mfa.pendingToken(),
                    "availableMethods", List.of("webauthn", "recovery_code"),
                    "user", Map.of(
                            "email", selection.account().getEmail(),
                            "firstName", user.getFirstName(),
                            "lastName", user.getLastName()
                    )
            ));
        }

        String token = securityCenterService.issueSession(user, httpRequest, "Password sign-in").token();
        authCookieService.writeAuthCookie(httpRequest, httpResponse, token);

        return ResponseEntity.ok(authSuccessResponse(user, token, httpRequest));
    }

    private LoginSelection chooseStaffLoginCandidate(String normalizedEmail, List<LoginAccount> passwordMatches) {
        List<LoginSelection> selectable = passwordMatches.stream()
                .map(account -> new LoginSelection(account, loginAccountService.resolveDefaultMembership(account)))
                .filter(selection -> selection.membership() != null)
                .toList();
        if (selectable.isEmpty()) {
            return null;
        }
        if (selectable.size() > 1) {
            log.warn(
                    "Multiple login accounts matched one staff email. email={}, count={}. Selecting the preferred active membership.",
                    normalizedEmail,
                    selectable.size()
            );
        }
        return selectable.stream()
                .min(Comparator
                        .comparing((LoginSelection selection) -> selection.membership().getRole() == Role.SUPER_ADMIN ? 0 : 1)
                        .thenComparing(selection -> selection.account().getId()))
                .orElse(selectable.get(0));
    }

    private record LoginSelection(LoginAccount account, User membership) {}

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

        if (tenantLoginBlocked(user)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("message", "This tenant account is suspended or cancelled. Please contact Calendra support."));
        }

        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("user", serializeUser(user, packageTypeForCompany(user.getCompany())));
        body.put("authorities", authentication.getAuthorities().stream()
                .map(a -> a.getAuthority())
                .collect(Collectors.toList()));
        return ResponseEntity.ok(body);
    }

    private Map<String, Object> serializeUser(User user, String packageType) {
        Company company = user.getCompany();
        LoginAccount account = loginAccountService.ensureForUser(user);
        Workspace workspace = company == null ? null : company.getWorkspace();
        String tenantCode = company == null ? null : company.getTenantCode();
        String avatarPath = (user.getAvatarS3Key() == null || user.getAvatarS3Key().isBlank())
                ? ""
                : ("/api/users/" + user.getId() + "/avatar?v=" + (user.getUpdatedAt() == null ? 0 : user.getUpdatedAt().toEpochMilli()));

        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("id", user.getId());
        out.put("loginAccountId", account.getId());
        out.put("firstName", user.getFirstName());
        out.put("lastName", user.getLastName());
        out.put("email", account.getEmail());
        out.put("role", user.getRole().name());
        out.put("companyId", company == null ? null : company.getId());
        out.put("activeUnitId", company == null ? null : company.getId());
        out.put("activeUnitName", company == null ? "" : company.getName());
        out.put("workspaceId", workspace == null ? null : workspace.getId());
        out.put("workspaceName", workspace == null ? "" : workspace.getName());
        out.put("packageType", packageType);
        out.put("tenantCode", tenantCode != null && !tenantCode.isBlank() ? tenantCode : "");
        out.put("avatarPath", avatarPath);
        out.put("permissions", SecurityUtils.permissionsForClientResponse(user.getPermissionsJson()));
        out.put("units", loginAccountService.activeMemberships(account).stream().map(this::serializeUnit).toList());
        out.put("workspaceRolloutFeatures", workspaceRollout == null
                ? WorkspaceRolloutProperties.allFeatureKeys()
                : workspaceRollout.enabledFeatureKeys());
        if (workspaceSubscriptions != null) {
            try {
                var entitlement = workspaceSubscriptions.entitlementSnapshot(user);
                out.put("workspaceSubscriptionStatus", entitlement.status());
                out.put("workspaceFeatures", entitlement.features());
                out.put("workspaceLimits", entitlement.limits());
            } catch (Exception ignored) {
                // Keep authentication compatible while a migration is still being applied.
            }
        }
        return out;
    }

    private Map<String, Object> serializeUnit(User membership) {
        Company unit = membership.getCompany();
        Workspace workspace = unit == null ? null : unit.getWorkspace();
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("id", unit == null ? null : unit.getId());
        out.put("name", unit == null ? "" : unit.getName());
        out.put("tenantCode", unit == null || unit.getTenantCode() == null ? "" : unit.getTenantCode());
        out.put("workspaceId", workspace == null ? null : workspace.getId());
        out.put("workspaceName", workspace == null ? "" : workspace.getName());
        out.put("membershipId", membership.getId());
        out.put("role", membership.getRole().name());
        out.put("permissions", SecurityUtils.permissionsForClientResponse(membership.getPermissionsJson()));
        return out;
    }

    public record ActiveUnitRequest(Long companyId) {}

    @PostMapping("/active-unit")
    public ResponseEntity<?> selectActiveUnit(@RequestBody ActiveUnitRequest request, Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof User user)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("message", "Not authenticated."));
        }
        Long activeCompanyId = user.getCompany() == null ? null : user.getCompany().getId();
        if (request == null || request.companyId() == null || !request.companyId().equals(activeCompanyId)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of(
                    "message", "Send the target unit in both companyId and X-Calendra-Unit-Id."
            ));
        }
        if (tenantLoginBlocked(user)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
                    "message", "This tenant account is suspended or cancelled. Please contact Calendra support."
            ));
        }
        LoginAccount account = loginAccountService.ensureForUser(user);
        loginAccountService.rememberSelectedUnit(account, request.companyId());
        return ResponseEntity.ok(Map.of(
                "user", serializeUser(user, packageTypeForCompany(user.getCompany())),
                "message", "Active unit changed."
        ));
    }

    @PostMapping("/signup")
    public ResponseEntity<?> signup(@RequestBody SignupRequest request, HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        authRateLimiter.checkStaffSignup(httpRequest, request.email());
        return signupService.signup(request, httpRequest, httpResponse);
    }

    public record SignupVerifyCodeRequest(
            @NotBlank String challengeId,
            @NotBlank String code,
            @NotBlank String password
    ) {
    }

    public record SignupResendCodeRequest(
            String challengeId,
            @Email String email
    ) {
    }

    @PostMapping("/signup/verify-code")
    public ResponseEntity<?> verifySignupCode(
            @Valid @RequestBody SignupVerifyCodeRequest body,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse
    ) {
        authRateLimiter.checkStaffSignup(httpRequest, body.challengeId());
        String passwordValidationMessage = validatePasswordStrength(body.password());
        if (passwordValidationMessage != null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", passwordValidationMessage));
        }
        return signupService.verifySignupCode(body.challengeId().trim(), body.code().trim(), body.password(), httpRequest, httpResponse);
    }

    @PostMapping("/signup/resend-code")
    public ResponseEntity<?> resendSignupCode(@RequestBody SignupResendCodeRequest body, HttpServletRequest httpRequest) {
        String identity = body.challengeId() != null && !body.challengeId().isBlank() ? body.challengeId() : body.email();
        authRateLimiter.checkStaffSignup(httpRequest, identity == null ? "" : identity);
        return signupService.resendSignupCode(body.challengeId(), body.email());
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
    @TrackLegacyEndpoint(LegacyEndpointDefinition.AUTH_SIGNUP_EMAIL_INTENT_VALIDATE)
    public ResponseEntity<?> validateSignupEmailIntent(@RequestParam("token") String token) {
        if (token == null || token.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Token is required."));
        }
        return signupService.validateEmailSignupIntent(token.trim());
    }

    @PostMapping("/signup/complete-email")
    @TrackLegacyEndpoint(LegacyEndpointDefinition.AUTH_SIGNUP_EMAIL_INTENT_COMPLETE)
    public ResponseEntity<?> completeSignupEmail(@Valid @RequestBody SignupCompleteEmailRequest body, HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        String passwordValidationMessage = validatePasswordStrength(body.password());
        if (passwordValidationMessage != null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("message", passwordValidationMessage));
        }
        return signupService.completeEmailSignupIntent(body.token().trim(), body.password(), httpRequest, httpResponse);
    }

    @PostMapping("/signup/resend-email-intent")
    @TrackLegacyEndpoint(LegacyEndpointDefinition.AUTH_SIGNUP_EMAIL_INTENT_RESEND)
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
            String tenantType,
            String packageName,
            Integer userCount,
            Integer smsCount,
            List<String> addonKeys,
            /** MONTHLY or YEARLY */
            String billingInterval,
            String paymentMethod
    ) {
        /** Backwards-compatible constructor for tests/callers from before usage add-ons were added. */
        public SignupBillingDetailsRequest(
                String firstName,
                String lastName,
                String companyName,
                String vatId,
                String address,
                String postalCode,
                String city,
                String tenantType,
                String packageName,
                String billingInterval,
                String paymentMethod
        ) {
            this(
                    firstName,
                    lastName,
                    companyName,
                    vatId,
                    address,
                    postalCode,
                    city,
                    tenantType,
                    packageName,
                    null,
                    null,
                    List.of(),
                    billingInterval,
                    paymentMethod
            );
        }
    }

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
        if (company == null) return "CUSTOM";
        if (workspaceSubscriptions != null && company.getWorkspace() != null) {
            try {
                return normalizePackageType(
                        workspaceSubscriptions.requireForWorkspace(company.getWorkspace().getId()).getPlanKey(), "CUSTOM");
            } catch (Exception ignored) {
                // Fall through to the legacy company projection during rolling upgrades.
            }
        }
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

    public record ForgotPasswordRequest(@NotBlank @Email String email, String locale, String language) {}

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
    public ResponseEntity<?> forgotPassword(@RequestBody ForgotPasswordRequest request, HttpServletRequest httpRequest) {
        authRateLimiter.checkPasswordReset(httpRequest, request.email());
        String locale = request.locale() != null ? request.locale() : request.language();
        // Respond 200 regardless of user existence to avoid account enumeration.
        passwordResetService.requestReset(request.email(), locale);
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
            List<String> addonKeys,
            /** MONTHLY or YEARLY */
            String billingInterval,
            Boolean fiscalizationNeeded,
            /** Optional: {@code location.search} from the register flow for redirects after email confirmation. */
            String returnSearch
    ) {
        /** Backwards-compatible constructor for tests/callers from before package add-ons were added. */
        public SignupRequest(
                String companyName,
                String firstName,
                String lastName,
                String email,
                String phone,
                String password,
                String packageName,
                Integer userCount,
                Integer smsCount,
                Integer spaceCount,
                String billingInterval,
                Boolean fiscalizationNeeded,
                String returnSearch
        ) {
            this(
                    companyName,
                    firstName,
                    lastName,
                    email,
                    phone,
                    password,
                    packageName,
                    userCount,
                    smsCount,
                    spaceCount,
                    List.of(),
                    billingInterval,
                    fiscalizationNeeded,
                    returnSearch
            );
        }
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logout(Authentication authentication, HttpServletRequest request, HttpServletResponse response) {
        try {
            String token = authCookieService.resolveTokenFromHeaderOrCookie(request);
            if (authentication != null && token != null && !token.isBlank()) {
                String sessionId = jwtService.extractSessionId(token);
                if (sessionId != null && !sessionId.isBlank()) {
                    if (authentication.getPrincipal() instanceof User user) {
                        securityCenterService.revokeSession(user, sessionId, request);
                    } else if (authentication.getPrincipal() instanceof LoginAccount account) {
                        securityCenterService.revokeSession(account, sessionId, request);
                    }
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

    private boolean tenantLoginBlocked(User user) {
        if (user == null || user.getCompany() == null || user.getRole() == com.example.app.user.Role.SUPER_ADMIN) {
            return false;
        }
        String status = settings.findByCompanyIdAndKey(user.getCompany().getId(), SettingKey.TENANCY_ACCESS_STATUS)
                .map(AppSetting::getValue)
                .orElse("ACTIVE");
        String normalized = status == null ? "ACTIVE" : status.trim().toUpperCase(java.util.Locale.ROOT);
        return "SUSPENDED".equals(normalized) || "CANCELLED".equals(normalized);
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
    @TrackLegacyEndpoint(LegacyEndpointDefinition.AUTH_OAUTH_STATUS)
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