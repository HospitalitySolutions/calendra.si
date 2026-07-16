package com.example.app.auth;

import com.example.app.admin.TenantCreatedAdminEmailService;
import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.company.CompanyProvisioningService;
import com.example.app.logging.LogSanitizer;
import com.example.app.referral.ReferralService;
import com.example.app.register.PlatformSubscriptionBillingService;
import com.example.app.security.AuthCookieService;
import com.example.app.securitycenter.SecurityCenterService;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.mail.internet.MimeMessage;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.math.BigDecimal;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.ArrayList;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SignupService {
    private static final Logger log = LoggerFactory.getLogger(SignupService.class);
    /** When present in {@link SignupEmailIntent} JSON, completing the intent only sets the owner's password (tenant already provisioned). */
    private static final String POST_PROVISION_OWNER_USER_ID = "postProvisionOwnerUserId";
    private static final String SIGNUP_CODE_KEY = "signupCode";
    private static final long SIGNUP_CODE_TTL_MINUTES = 60L;
    private static final String CALENDRA_LOGO_CONTENT_ID = "calendraSignupVerificationLogo";
    private static final String CALENDRA_LOGO_CLASSPATH = "static/widget/calendra-transparent-logo.png";
    private static final int INTENT_TOKEN_BYTES = 32;

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final CompanyProvisioningService companyProvisioningService;
    private final CompanyRepository companies;
    private final AppSettingRepository settings;
    private final SecurityCenterService securityCenterService;
    private final AuthCookieService authCookieService;
    private final SignupEmailIntentRepository signupEmailIntents;
    private final PlatformSubscriptionBillingService platformSubscriptionBillingService;
    private final ObjectMapper objectMapper;
    private final JavaMailSender mailSender;
    private final String mailFrom;
    private final boolean mailConfigured;
    private final SignupWelcomeEmailService welcomeEmailService;
    private final ReferralService referralService;

    @Autowired(required = false)
    private TenantCreatedAdminEmailService tenantCreatedAdminEmailService;
    private final SecureRandom secureRandom = new SecureRandom();

    /**
     * Backwards-compatible constructor used by existing unit tests and any manual
     * instantiation that still uses the pre-platform-billing signature. Runtime
     * Spring wiring uses the constructor below with PlatformSubscriptionBillingService.
     */
    public SignupService(
            UserRepository users,
            PasswordEncoder passwordEncoder,
            CompanyProvisioningService companyProvisioningService,
            CompanyRepository companies,
            AppSettingRepository settings,
            SecurityCenterService securityCenterService,
            AuthCookieService authCookieService,
            SignupEmailIntentRepository signupEmailIntents,
            ObjectMapper objectMapper,
            @Autowired(required = false) JavaMailSender mailSender,
            @Value("${app.mail.from:}") String mailFrom,
            @Value("${spring.mail.host:}") String mailHost,
            @Value("${spring.mail.username:}") String mailUsername
    ) {
        this(
                users,
                passwordEncoder,
                companyProvisioningService,
                companies,
                settings,
                securityCenterService,
                authCookieService,
                signupEmailIntents,
                null,
                objectMapper,
                null,
                null,
                mailSender,
                mailFrom,
                mailHost,
                mailUsername
        );
    }

    @Autowired
    public SignupService(
            UserRepository users,
            PasswordEncoder passwordEncoder,
            CompanyProvisioningService companyProvisioningService,
            CompanyRepository companies,
            AppSettingRepository settings,
            SecurityCenterService securityCenterService,
            AuthCookieService authCookieService,
            SignupEmailIntentRepository signupEmailIntents,
            PlatformSubscriptionBillingService platformSubscriptionBillingService,
            ObjectMapper objectMapper,
            @Autowired(required = false) SignupWelcomeEmailService welcomeEmailService,
            @Autowired(required = false) ReferralService referralService,
            @Autowired(required = false) JavaMailSender mailSender,
            @Value("${app.mail.from:}") String mailFrom,
            @Value("${spring.mail.host:}") String mailHost,
            @Value("${spring.mail.username:}") String mailUsername
    ) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.companyProvisioningService = companyProvisioningService;
        this.companies = companies;
        this.settings = settings;
        this.securityCenterService = securityCenterService;
        this.authCookieService = authCookieService;
        this.signupEmailIntents = signupEmailIntents;
        this.platformSubscriptionBillingService = platformSubscriptionBillingService;
        this.objectMapper = objectMapper;
        this.welcomeEmailService = welcomeEmailService;
        this.referralService = referralService;
        this.mailSender = mailSender;
        this.mailFrom = mailFrom == null ? "" : mailFrom;
        this.mailConfigured = mailSender != null
                && mailHost != null && !mailHost.isBlank()
                && mailUsername != null && !mailUsername.isBlank();
    }

    /**
     * Result of checking whether an address can be used for a new self-serve signup.
     */
    public record SignupEmailCheck(boolean available, boolean pendingVerification, boolean registeredAccountExists, String takenMessage) {
        public static SignupEmailCheck ok() {
            return new SignupEmailCheck(true, false, false, null);
        }

        public static SignupEmailCheck pending() {
            return new SignupEmailCheck(false, true, false, null);
        }

        public static SignupEmailCheck registered() {
            return new SignupEmailCheck(false, false, true, null);
        }

        public static SignupEmailCheck invalid(String message) {
            return new SignupEmailCheck(false, false, false, message);
        }
    }

    public SignupEmailCheck evaluateSignupEmail(String rawEmail) {
        if (rawEmail == null || rawEmail.isBlank()) {
            return SignupEmailCheck.invalid("Email is required.");
        }
        String normalized = rawEmail.trim().toLowerCase();
        List<User> matches = users.findAllByEmailIgnoreCase(normalized);
        if (!matches.isEmpty()) {
            User u = matches.get(0);
            if (isOwnerAwaitingPasswordSetup(u)) {
                return SignupEmailCheck.pending();
            }
            return SignupEmailCheck.registered();
        }
        if (hasActiveSignupEmailIntent(normalized)) {
            return SignupEmailCheck.pending();
        }
        return SignupEmailCheck.ok();
    }

    public boolean hasPendingSignupVerificationForEmail(String normalizedEmail) {
        if (normalizedEmail == null || normalizedEmail.isBlank()) {
            return false;
        }
        String n = normalizedEmail.trim().toLowerCase();
        List<User> matches = users.findAllByEmailIgnoreCase(n);
        if (!matches.isEmpty() && isOwnerAwaitingPasswordSetup(matches.get(0))) {
            return true;
        }
        return hasActiveSignupEmailIntent(n);
    }

    private boolean hasActiveSignupEmailIntent(String normalizedEmail) {
        return !signupEmailIntents
                .findAllByEmailIgnoreCaseAndActiveTrueAndExpiresAtAfter(normalizedEmail, Instant.now())
                .isEmpty();
    }

    private boolean isOwnerAwaitingPasswordSetup(User user) {
        if (user.getRole() != Role.ADMIN) {
            return false;
        }
        return settings.findByCompanyIdAndKey(user.getCompany().getId(), SettingKey.SIGNUP_OWNER_PASSWORD_PENDING)
                .map(s -> "true".equalsIgnoreCase(s.getValue()))
                .orElse(false);
    }

    private ResponseEntity<?> conflictResponseForExistingEmail(String normalizedEmail) {
        List<User> existing = users.findAllByEmailIgnoreCase(normalizedEmail);
        if (existing.isEmpty()) {
            return null;
        }
        User u = existing.get(0);
        if (isOwnerAwaitingPasswordSetup(u)) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of(
                            "message", "This email already has a signup awaiting verification.",
                            "pendingVerification", true,
                            "registeredAccountExists", false,
                            "email", normalizedEmail
                    ));
        }
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of(
                        "message", "An account with this email already exists.",
                        "pendingVerification", false,
                        "registeredAccountExists", true,
                        "email", normalizedEmail
                ));
    }

    @Transactional
    public ResponseEntity<?> signup(AuthController.SignupRequest request, HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        String normalizedEmail = request.email().trim().toLowerCase();
        ResponseEntity<?> conflict = conflictResponseForExistingEmail(normalizedEmail);
        if (conflict != null) {
            return conflict;
        }

        boolean passwordProvided = request.password() != null && !request.password().isBlank();
        if (!passwordProvided) {
            return beginEmailSignupIntent(request, normalizedEmail);
        }
        return provisionNewTenant(request, normalizedEmail, httpRequest, httpResponse, false);
    }

    public ResponseEntity<?> beginEmailSignupIntent(AuthController.SignupRequest request, String normalizedEmail) {
        deactivateSignupIntentsForEmail(normalizedEmail);
        String challengeId = generateIntentToken();
        String code = generateCode();
        Instant expiresAt = Instant.now().plus(SIGNUP_CODE_TTL_MINUTES, ChronoUnit.MINUTES);
        Map<String, Object> payload = intentPayloadMap(request, normalizedEmail);
        payload.put(SIGNUP_CODE_KEY, code);
        String json;
        try {
            json = objectMapper.writeValueAsString(payload);
        } catch (Exception e) {
            log.warn("Failed serializing signup intent: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("message", "Could not start signup."));
        }
        SignupEmailIntent row = new SignupEmailIntent();
        row.setToken(challengeId);
        row.setEmail(normalizedEmail);
        row.setPayloadJson(json);
        row.setExpiresAt(expiresAt);
        row.setActive(true);
        signupEmailIntents.save(row);
        sendSignupCodeEmail(
                normalizedEmail,
                code,
                request.firstName(),
                localeFromSignupRequest(request),
                challengeId,
                request.returnSearch()
        );
        return ResponseEntity.ok(Map.of(
                "message", "We sent a verification code to your email.",
                "requiresEmailVerification", true,
                "pendingAccountCreation", true,
                "email", normalizedEmail,
                "challengeId", challengeId,
                "expiresAt", expiresAt.toString()
        ));
    }

    @Transactional
    public ResponseEntity<?> resendEmailSignupIntent(String normalizedEmail) {
        return resendSignupCode(null, normalizedEmail);
    }

    @Transactional
    public ResponseEntity<?> resendSignupCode(String challengeIdRaw, String emailRaw) {
        String challengeId = trimToNull(challengeIdRaw);
        String normalizedEmail = trimToNull(emailRaw) == null ? null : emailRaw.trim().toLowerCase(Locale.ROOT);
        if (challengeId == null && normalizedEmail == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "Challenge or email is required."));
        }
        if (challengeId != null) {
            SignupEmailIntent row = signupEmailIntents.findByTokenAndActiveTrue(challengeId).orElse(null);
            if (row != null) {
                return refreshAndSendCode(row);
            }
            // Stale/expired challenge can still be recovered when caller provides email.
            if (normalizedEmail == null || normalizedEmail.isBlank()) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", "Signup challenge is not valid."));
            }
        }
        if (normalizedEmail == null || normalizedEmail.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Email is required."));
        }
        List<User> existingUsers = users.findAllByEmailIgnoreCase(normalizedEmail);
        if (!existingUsers.isEmpty()) {
            User u = existingUsers.get(0);
            if (isOwnerAwaitingPasswordSetup(u)) {
                return resendPostProvisionSignupIntent(normalizedEmail, u);
            }
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", "An account already exists for this email."));
        }
        List<SignupEmailIntent> all = signupEmailIntents.findAllByEmailIgnoreCaseOrderByCreatedAtDesc(normalizedEmail);
        if (all.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", "No pending signup found for this email."));
        }
        return refreshAndSendCode(all.get(0));
    }

    @Transactional
    public ResponseEntity<?> verifySignupCode(
            String challengeId,
            String code,
            String password,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse
    ) {
        if (challengeId == null || challengeId.isBlank() || code == null || code.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Challenge and code are required."));
        }
        SignupEmailIntent row = signupEmailIntents.findByTokenAndActiveTrue(challengeId).orElse(null);
        if (row == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of(
                    "message", "This verification code is no longer valid.",
                    "invalidVerificationCode", true
            ));
        }
        String rowEmail = row.getEmail() == null ? "" : row.getEmail().trim().toLowerCase(Locale.ROOT);
        if (row.getExpiresAt() == null || row.getExpiresAt().isBefore(Instant.now())) {
            row.setActive(false);
            signupEmailIntents.save(row);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of(
                    "message", "This verification code has expired.",
                    "invalidVerificationCode", true,
                    "email", rowEmail
            ));
        }
        Map<String, Object> payloadMap;
        try {
            payloadMap = objectMapper.readValue(row.getPayloadJson(), new TypeReference<>() {
            });
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of(
                    "message", "This verification code is no longer valid.",
                    "invalidVerificationCode", true
            ));
        }
        String expected = stringVal(payloadMap.get(SIGNUP_CODE_KEY));
        if (expected == null || !expected.equals(code.trim())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("message", "Invalid verification code."));
        }
        Long postProvisionOwnerId = longVal(payloadMap.get(POST_PROVISION_OWNER_USER_ID));
        if (postProvisionOwnerId != null) {
            return completePostProvisionEmailIntent(row, postProvisionOwnerId, password, httpRequest, httpResponse);
        }

        AuthController.SignupRequest request;
        try {
            request = parseSignupRequestFromIntentJson(row.getPayloadJson());
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of(
                    "message", "This verification code is no longer valid.",
                    "invalidVerificationCode", true
            ));
        }
        String normalizedEmail = request.email().trim().toLowerCase(Locale.ROOT);
        row.setActive(false);
        signupEmailIntents.save(row);
        deactivateSignupIntentsForEmail(normalizedEmail);

        ResponseEntity<?> conflict = conflictResponseForExistingEmail(normalizedEmail);
        if (conflict != null) {
            return conflict;
        }
        AuthController.SignupRequest finalized = new AuthController.SignupRequest(
                request.companyName(),
                request.firstName(),
                request.lastName(),
                request.email(),
                request.phone(),
                password,
                request.packageName(),
                request.userCount(),
                request.smsCount(),
                request.spaceCount(),
                request.addonKeys(),
                request.billingInterval(),
                request.fiscalizationNeeded(),
                request.returnSearch()
        );
        ResponseEntity<?> provisioned = provisionNewTenant(finalized, normalizedEmail, httpRequest, httpResponse, false);
        if (!provisioned.getStatusCode().is2xxSuccessful() || !(provisioned.getBody() instanceof Map<?, ?> body)) {
            return provisioned;
        }
        String rs = request.returnSearch() == null ? "" : request.returnSearch().trim();
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<?, ?> e : body.entrySet()) {
            out.put(String.valueOf(e.getKey()), e.getValue());
        }
        out.put("returnSearch", rs);
        return ResponseEntity.status(provisioned.getStatusCode()).body(out);
    }

    public ResponseEntity<?> validateEmailSignupIntent(String token) {
        SignupEmailIntent row = signupEmailIntents.findByToken(token).orElse(null);
        if (row == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of(
                    "message", "This verification link is no longer valid.",
                    "invalidVerificationLink", true
            ));
        }
        String email = row.getEmail() == null ? "" : row.getEmail().trim().toLowerCase();
        if (!row.isActive() || row.getExpiresAt() == null || row.getExpiresAt().isBefore(Instant.now())) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of(
                    "message", "This verification link is no longer valid.",
                    "invalidVerificationLink", true,
                    "email", email
            ));
        }
        return ResponseEntity.ok(Map.of("valid", true, "email", email));
    }

    @Transactional
    public ResponseEntity<?> completeEmailSignupIntent(String token, String password, HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        SignupEmailIntent row = signupEmailIntents.findByTokenAndActiveTrue(token).orElse(null);
        if (row == null) {
            String email = signupEmailIntents.findByToken(token).map(SignupEmailIntent::getEmail).orElse(null);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of(
                    "message", "This verification link is no longer valid.",
                    "invalidVerificationLink", true,
                    "email", email == null ? "" : email
            ));
        }
        if (row.getExpiresAt() == null || row.getExpiresAt().isBefore(Instant.now())) {
            String email = row.getEmail() == null ? "" : row.getEmail().trim().toLowerCase();
            row.setActive(false);
            signupEmailIntents.save(row);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of(
                    "message", "This verification link is no longer valid.",
                    "invalidVerificationLink", true,
                    "email", email
            ));
        }
        Map<String, Object> payloadMap;
        try {
            payloadMap = objectMapper.readValue(row.getPayloadJson(), new TypeReference<>() {
            });
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of(
                    "message", "This verification link is no longer valid.",
                    "invalidVerificationLink", true
            ));
        }
        Long postProvisionOwnerId = longVal(payloadMap.get(POST_PROVISION_OWNER_USER_ID));
        if (postProvisionOwnerId != null) {
            return completePostProvisionEmailIntent(row, postProvisionOwnerId, password, httpRequest, httpResponse);
        }

        AuthController.SignupRequest request;
        try {
            request = parseSignupRequestFromIntentJson(row.getPayloadJson());
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of(
                    "message", "This verification link is no longer valid.",
                    "invalidVerificationLink", true
            ));
        }
        String normalizedEmail = request.email().trim().toLowerCase();
        row.setActive(false);
        signupEmailIntents.save(row);
        deactivateSignupIntentsForEmail(normalizedEmail);

        ResponseEntity<?> conflict = conflictResponseForExistingEmail(normalizedEmail);
        if (conflict != null) {
            return conflict;
        }
        AuthController.SignupRequest finalized = new AuthController.SignupRequest(
                request.companyName(),
                request.firstName(),
                request.lastName(),
                request.email(),
                request.phone(),
                password,
                request.packageName(),
                request.userCount(),
                request.smsCount(),
                request.spaceCount(),
                request.addonKeys(),
                request.billingInterval(),
                request.fiscalizationNeeded(),
                request.returnSearch()
        );
        ResponseEntity<?> provisioned = provisionNewTenant(finalized, normalizedEmail, httpRequest, httpResponse, false);
        if (!provisioned.getStatusCode().is2xxSuccessful() || !(provisioned.getBody() instanceof Map<?, ?> body)) {
            return provisioned;
        }
        String rs = request.returnSearch() == null ? "" : request.returnSearch().trim();
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<?, ?> e : body.entrySet()) {
            out.put(String.valueOf(e.getKey()), e.getValue());
        }
        out.put("returnSearch", rs);
        return ResponseEntity.status(provisioned.getStatusCode()).body(out);
    }

    /**
     * @param skipPostProvisionConfirmationEmail when {@code true}, creates the post-provision signup intent but does not
     *                                           send the confirmation email (used after Google OAuth so the browser can open
     *                                           {@code /confirm-email} directly).
     */
    public ResponseEntity<?> provisionNewTenant(
            AuthController.SignupRequest request,
            String normalizedEmail,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse,
            boolean skipPostProvisionConfirmationEmail
    ) {
        deactivateSignupIntentsForEmail(normalizedEmail);
        String normalizedPackageType = normalizePackageType(request.packageName(), "PROFESSIONAL");
        String interval = normalizeBillingInterval(request.billingInterval());
        boolean basicMonthlyTrial = isBasicMonthlyTrial(normalizedPackageType, interval);
        int selectedUserCount = basicMonthlyTrial
                ? 1
                : Math.max(1, request.userCount() == null ? 1 : request.userCount());
        int selectedSmsCount = basicMonthlyTrial
                ? 0
                : Math.max(0, request.smsCount() == null ? 0 : request.smsCount());
        List<String> selectedAddonKeys = basicMonthlyTrial
                ? List.of()
                : resolveSelectedAddonKeys(request);
        String companyName = resolveCompanyName(request);
        Company company = companyProvisioningService.createWithTenantCode(companyName);

        boolean passwordProvided = request.password() != null && !request.password().isBlank();
        String rawPassword = passwordProvided ? request.password() : "Temp#" + UUID.randomUUID().toString().replace("-", "");

        User owner = new User();
        owner.setCompany(company);
        owner.setFirstName(signupFirstName(request, normalizedEmail));
        owner.setLastName(signupLastName(request));
        owner.setEmail(normalizedEmail);
        owner.setPasswordHash(passwordEncoder.encode(rawPassword));
        String phone = trimToNull(request.phone());
        owner.setPhone(phone);
        owner.setWhatsappSenderNumber(phone);
        owner.setWhatsappPhoneNumberId(phone);
        owner.setRole(Role.ADMIN);
        owner.setActive(true);
        owner.setConsultant(true);
        owner = users.save(owner);

        registerReferralIfPresent(request, company, normalizedEmail);

        seedTenantDefaults(company, companyName);
        companyProvisioningService.ensureDefaultPaymentMethods(company);
        seedSetting(company, SettingKey.COMPANY_EMAIL, normalizedEmail);
        if (phone != null) {
            seedSetting(company, SettingKey.COMPANY_TELEPHONE, phone);
        }
        seedSetting(company, SettingKey.SIGNUP_PACKAGE_NAME, normalizedPackageType);
        seedSetting(company, SettingKey.SIGNUP_USER_COUNT, String.valueOf(selectedUserCount));
        seedSetting(company, SettingKey.SIGNUP_SMS_COUNT, String.valueOf(selectedSmsCount));
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_CURRENT_USER_ADD_COUNT, "0");
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_CURRENT_SMS_ADD_COUNT, "0");
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_CURRENT_ADDON_KEYS, "");
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_NEXT_USER_COUNT, String.valueOf(selectedUserCount));
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_NEXT_SMS_COUNT, String.valueOf(selectedSmsCount));
        seedSetting(company, SettingKey.SIGNUP_ADDON_KEYS, String.join(",", selectedAddonKeys));
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_NEXT_ADDON_KEYS, String.join(",", selectedAddonKeys));
        seedSetting(company, SettingKey.SIGNUP_FISCALIZATION_REQUIRED, String.valueOf(Boolean.TRUE.equals(request.fiscalizationNeeded())));
        int spaceQuota = Math.max(1, request.spaceCount() == null ? 5 : request.spaceCount());
        seedSetting(company, SettingKey.TENANCY_SPACE_QUOTA, String.valueOf(spaceQuota));
        seedSetting(company, SettingKey.TENANCY_SMS_SENT_COUNT, "0");
        LocalDate subStart = LocalDate.now(ZoneId.systemDefault());
        LocalDate subEnd = "TRIAL".equals(normalizedPackageType)
                ? subStart.plusDays(7)
                : ("YEARLY".equals(interval) ? subStart.plusYears(1) : subStart.plusMonths(1));
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_START, subStart.toString());
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_END, subEnd.toString());
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_INTERVAL, interval);
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_PAYMENT_METHOD, "");
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_DUE_AMOUNT, "0.00");
        tryEnsurePlatformSubscriptionOpenBill(
                company,
                owner,
                companyName,
                null,
                null,
                null,
                null,
                normalizedPackageType,
                interval,
                null,
                selectedUserCount,
                selectedSmsCount,
                selectedAddonKeys
        );

        if (!passwordProvided) {
            seedSetting(company, SettingKey.SIGNUP_OWNER_PASSWORD_PENDING, "true");
            final String setupToken;
            try {
                setupToken = createPostProvisionEmailIntent(
                        request,
                        normalizedEmail,
                        owner.getId(),
                        !skipPostProvisionConfirmationEmail
                );
            } catch (java.io.IOException e) {
                log.warn("Failed to create post-provision signup intent for {}: {}", LogSanitizer.emailHash(normalizedEmail), e.getMessage());
                throw new IllegalStateException("Could not create email verification intent", e);
            }
            Map<String, Object> body = new LinkedHashMap<>();
            body.put(
                    "message",
                    skipPostProvisionConfirmationEmail
                            ? "Continue to set your password to finish creating your account."
                            : "We sent a verification code to your email to finish setting up your account."
            );
            body.put("requiresPasswordSetup", true);
            body.put("requiresEmailVerification", true);
            body.put("pendingAccountCreation", true);
            body.put("email", normalizedEmail);
            body.put("challengeId", setupToken);
            body.put("expiresAt", Instant.now().plus(SIGNUP_CODE_TTL_MINUTES, ChronoUnit.MINUTES).toString());
            if (skipPostProvisionConfirmationEmail) {
                body.put("emailSetupToken", setupToken);
            }
            return ResponseEntity.ok(body);
        }

        sendRegisteredTenantWelcomeEmailSafely(owner, companyName, normalizedPackageType, localeFromSignupRequest(request));
        String sessionToken = securityCenterService.issueSession(owner, httpRequest, "New account sign-in").token();
        authCookieService.writeAuthCookie(httpRequest, httpResponse, sessionToken);
        return ResponseEntity.ok(authSuccessResponse(owner, sessionToken, httpRequest));
    }

    /**
     * Attributes this new tenant to a referrer when the register flow carried a {@code ref} code in its
     * return-search string. Best-effort: it never blocks or fails signup.
     */
    private void registerReferralIfPresent(AuthController.SignupRequest request, Company newCompany, String ownerEmail) {
        if (referralService == null || request == null) {
            return;
        }
        String refCode = ReferralService.parseRefFromReturnSearch(request.returnSearch());
        if (refCode == null || refCode.isBlank()) {
            return;
        }
        try {
            referralService.registerReferral(refCode, newCompany, ownerEmail);
        } catch (Exception e) {
            log.warn("Referral attribution skipped for company {}: {}", newCompany == null ? null : newCompany.getId(), e.getMessage());
        }
    }

    @Transactional
    public ResponseEntity<?> saveSignupBillingDetails(User authenticatedUser, AuthController.SignupBillingDetailsRequest request) {
        if (authenticatedUser == null || authenticatedUser.getId() == null || authenticatedUser.getCompany() == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("message", "Not authenticated."));
        }
        String firstName = trimToNull(request.firstName());
        String lastName = trimToNull(request.lastName());
        if (firstName == null || lastName == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "First and last name are required."));
        }

        Long companyId = authenticatedUser.getCompany().getId();
        Company company = companies.findByIdForUpdate(companyId)
                .orElse(authenticatedUser.getCompany());
        User owner = users.findById(authenticatedUser.getId()).orElse(authenticatedUser);

        owner.setFirstName(firstName);
        owner.setLastName(lastName);
        users.save(owner);

        String companyName = trimToNull(request.companyName());
        if (companyName != null) {
            company.setName(companyName);
            companies.save(company);
            seedSetting(company, SettingKey.COMPANY_NAME, companyName);
        }

        seedSetting(company, SettingKey.COMPANY_VAT_ID, stringOrEmpty(request.vatId()));
        seedSetting(company, SettingKey.COMPANY_ADDRESS, stringOrEmpty(request.address()));
        seedSetting(company, SettingKey.COMPANY_POSTAL_CODE, stringOrEmpty(request.postalCode()));
        seedSetting(company, SettingKey.COMPANY_CITY, stringOrEmpty(request.city()));

        String normalizedPackageType = normalizePackageType(request.packageName(), "PROFESSIONAL");
        String interval = normalizeBillingInterval(request.billingInterval());
        boolean basicMonthlyTrial = isBasicMonthlyTrial(normalizedPackageType, interval);
        seedSetting(company, SettingKey.SIGNUP_PACKAGE_NAME, normalizedPackageType);
        int selectedUserCount = basicMonthlyTrial
                ? 1
                : Math.max(1, request.userCount() == null ? parsePositiveIntSetting(company.getId(), SettingKey.SIGNUP_USER_COUNT, 1) : request.userCount());
        int selectedSmsCount = basicMonthlyTrial
                ? 0
                : Math.max(0, request.smsCount() == null ? parsePositiveIntSetting(company.getId(), SettingKey.SIGNUP_SMS_COUNT, 0) : request.smsCount());
        List<String> selectedAddonKeys = basicMonthlyTrial
                ? List.of()
                : (request.addonKeys() == null
                        ? parseAddonKeyCsv(settings.findByCompanyIdAndKey(company.getId(), SettingKey.SIGNUP_ADDON_KEYS).map(AppSetting::getValue).orElse(""))
                        : sanitizeAddonKeys(request.addonKeys()));
        seedSetting(company, SettingKey.SIGNUP_USER_COUNT, String.valueOf(selectedUserCount));
        seedSetting(company, SettingKey.SIGNUP_SMS_COUNT, String.valueOf(selectedSmsCount));
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_CURRENT_USER_ADD_COUNT, "0");
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_CURRENT_SMS_ADD_COUNT, "0");
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_CURRENT_ADDON_KEYS, "");
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_NEXT_USER_COUNT, String.valueOf(selectedUserCount));
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_NEXT_SMS_COUNT, String.valueOf(selectedSmsCount));
        seedSetting(company, SettingKey.SIGNUP_ADDON_KEYS, String.join(",", selectedAddonKeys));
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_NEXT_ADDON_KEYS, String.join(",", selectedAddonKeys));

        String normalizedTenantType = normalizeTenantConfigType(request.tenantType());
        seedSetting(company, SettingKey.MODULE_CONFIG_TYPE, normalizedTenantType);
        seedGuestAppTenantType(company, normalizedTenantType);
        applyModuleConfigPreset(company, normalizedTenantType, normalizedPackageType);

        boolean firstBillingDetailsCompletion = settingValue(company, SettingKey.BILLING_SUBSCRIPTION_PAYMENT_METHOD, "").isBlank();
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_INTERVAL, interval);
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_PAYMENT_METHOD, stringOrEmpty(request.paymentMethod()));
        tryEnsurePlatformSubscriptionOpenBill(
                company,
                owner,
                companyName,
                request.vatId(),
                request.address(),
                request.postalCode(),
                request.city(),
                normalizedPackageType,
                interval,
                request.paymentMethod(),
                selectedUserCount,
                selectedSmsCount,
                selectedAddonKeys
        );

        PlatformSubscriptionBillingService.SignupBillingInvoiceResult invoice = tryCreateSignupSubscriptionInvoice(company);
        if (firstBillingDetailsCompletion) {
            notifyPlatformAdminTenantCreated(
                    company,
                    owner,
                    normalizedTenantType,
                    normalizedPackageType,
                    interval,
                    request.paymentMethod()
            );
        }
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("ok", true);
        response.put("packageType", normalizedPackageType);
        response.put("billingInterval", interval);
        if (invoice.billId() != null) response.put("billId", invoice.billId());
        if (invoice.billNumber() != null) response.put("billNumber", invoice.billNumber());
        if (invoice.paymentStatus() != null) response.put("paymentStatus", invoice.paymentStatus());
        if (invoice.checkoutUrl() != null && !invoice.checkoutUrl().isBlank()) response.put("checkoutUrl", invoice.checkoutUrl());
        return ResponseEntity.ok(response);
    }

    private void tryEnsurePlatformSubscriptionOpenBill(
            Company company,
            User owner,
            String billingCompanyName,
            String vatId,
            String address,
            String postalCode,
            String city,
            String packageName,
            String billingInterval,
            String paymentMethod,
            Integer userCount,
            Integer smsCount,
            List<String> addonKeys
    ) {
        if (platformSubscriptionBillingService == null) {
            log.debug("Platform subscription open bill creation skipped because platform billing service is not wired.");
            return;
        }
        try {
            platformSubscriptionBillingService.ensureForSignupTenant(
                    company,
                    owner,
                    billingCompanyName,
                    vatId,
                    address,
                    postalCode,
                    city,
                    packageName,
                    billingInterval,
                    paymentMethod,
                    userCount,
                    smsCount,
                    addonKeys
            );
        } catch (Exception e) {
            log.warn("Platform subscription open bill creation skipped for signup company {}: {}",
                    company == null ? null : company.getId(),
                    e.getMessage());
        }
    }

    private PlatformSubscriptionBillingService.SignupBillingInvoiceResult tryCreateSignupSubscriptionInvoice(Company company) {
        if (platformSubscriptionBillingService == null) {
            return new PlatformSubscriptionBillingService.SignupBillingInvoiceResult(null, null, null, null);
        }
        try {
            return platformSubscriptionBillingService.createInvoiceForSignupTenantIfDue(company);
        } catch (Exception e) {
            log.warn("Platform subscription invoice creation skipped for signup company {}: {}",
                    company == null ? null : company.getId(),
                    e.getMessage());
            return new PlatformSubscriptionBillingService.SignupBillingInvoiceResult(null, null, null, null);
        }
    }


    private void notifyPlatformAdminTenantCreated(
            Company company,
            User owner,
            String tenantType,
            String packageName,
            String billingInterval,
            String paymentMethod
    ) {
        if (tenantCreatedAdminEmailService == null || company == null) return;
        String ownerName = owner == null
                ? ""
                : ((owner.getFirstName() == null ? "" : owner.getFirstName().trim()) + " "
                + (owner.getLastName() == null ? "" : owner.getLastName().trim())).trim();
        tenantCreatedAdminEmailService.notifyAfterCommit(new TenantCreatedAdminEmailService.TenantCreatedDetails(
                company.getId(),
                company.getName(),
                company.getTenantCode(),
                tenantType,
                company.getCreatedAt(),
                "Registracija (spletni obrazec)",
                ownerName,
                owner == null ? "" : owner.getEmail(),
                packageName,
                billingInterval,
                paymentMethod,
                settingValue(company, SettingKey.TENANCY_ACCESS_STATUS, "ACTIVE"),
                settingValue(company, SettingKey.BILLING_SUBSCRIPTION_STATUS, "PENDING_PAYMENT")
        ));
    }

    private String settingValue(Company company, SettingKey key, String fallback) {
        if (company == null || company.getId() == null) return fallback;
        return settings.findByCompanyIdAndKey(company.getId(), key)
                .map(AppSetting::getValue)
                .filter(value -> value != null && !value.isBlank())
                .orElse(fallback);
    }

    private void sendRegisteredTenantWelcomeEmailSafely(User owner, String companyName, String packageName, String localeCode) {
        if (welcomeEmailService == null || owner == null || owner.getEmail() == null || owner.getEmail().isBlank()) {
            return;
        }
        try {
            welcomeEmailService.sendRegisteredTenantWelcomeEmail(
                    owner.getEmail(),
                    owner.getFirstName(),
                    companyName == null || companyName.isBlank()
                            ? (owner.getCompany() == null ? "" : owner.getCompany().getName())
                            : companyName,
                    packageName,
                    localeCode
            );
        } catch (Exception e) {
            log.warn("Tenant welcome email skipped for {}: {}", LogSanitizer.emailHash(owner.getEmail()), e.getMessage());
        }
    }

    private String localeFromSignupRequest(AuthController.SignupRequest request) {
        return localeFromReturnSearch(request == null ? null : request.returnSearch());
    }

    private String localeFromReturnSearch(String returnSearch) {
        if (returnSearch == null || returnSearch.isBlank()) {
            return null;
        }

        String normalizedSearch = returnSearch.startsWith("?")
                ? returnSearch.substring(1)
                : returnSearch;
        String fallbackLocale = null;
        for (String pair : normalizedSearch.split("&")) {
            if (pair.isBlank()) continue;
            int separator = pair.indexOf('=');
            String encodedKey = separator >= 0 ? pair.substring(0, separator) : pair;
            String encodedValue = separator >= 0 ? pair.substring(separator + 1) : "";
            String key = URLDecoder.decode(encodedKey, StandardCharsets.UTF_8).trim().toLowerCase(Locale.ROOT);
            String locale = supportedSignupLocale(URLDecoder.decode(encodedValue, StandardCharsets.UTF_8));
            if (locale == null) continue;
            if ("locale".equals(key)) return locale;
            if (fallbackLocale == null && ("lang".equals(key) || "language".equals(key))) {
                fallbackLocale = locale;
            }
        }
        return fallbackLocale;
    }

    private String supportedSignupLocale(String rawLocale) {
        if (rawLocale == null) return null;
        String normalized = rawLocale.trim().toLowerCase(Locale.ROOT);
        return switch (normalized) {
            case "sl", "sr", "en" -> normalized;
            default -> null;
        };
    }

    private void deactivateSignupIntentsForEmail(String normalizedEmail) {
        for (SignupEmailIntent i : signupEmailIntents.findAllByEmailIgnoreCaseAndActiveTrue(normalizedEmail)) {
            i.setActive(false);
            signupEmailIntents.save(i);
        }
    }

    private ResponseEntity<?> completePostProvisionEmailIntent(
            SignupEmailIntent row,
            long ownerUserId,
            String password,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse
    ) {
        String rowEmail = row.getEmail() == null ? "" : row.getEmail().trim().toLowerCase();
        User owner = users.findById(ownerUserId).orElse(null);
        if (owner == null || owner.getEmail() == null || !owner.getEmail().trim().equalsIgnoreCase(rowEmail)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of(
                    "message", "This verification link is no longer valid.",
                    "invalidVerificationLink", true,
                    "email", rowEmail
            ));
        }
        if (!isOwnerAwaitingPasswordSetup(owner)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of(
                    "message", "This verification link is no longer valid.",
                    "invalidVerificationLink", true,
                    "email", rowEmail
            ));
        }
        row.setActive(false);
        signupEmailIntents.save(row);
        deactivateSignupIntentsForEmail(rowEmail);
        owner.setPasswordHash(passwordEncoder.encode(password));
        users.save(owner);
        clearSignupOwnerPasswordPending(owner);
        String signupLocale = null;
        try {
            Map<String, Object> signupPayload = objectMapper.readValue(row.getPayloadJson(), new TypeReference<>() {
            });
            signupLocale = localeFromReturnSearch(stringVal(signupPayload.get("returnSearch")));
        } catch (Exception e) {
            // Locale is best-effort; the welcome email service falls back to English.
        }
        sendRegisteredTenantWelcomeEmailSafely(owner, owner.getCompany() == null ? null : owner.getCompany().getName(), packageTypeForCompany(owner.getCompany()), signupLocale);
        String sessionToken = securityCenterService.issueSession(owner, httpRequest, "Email verified sign-in").token();
        authCookieService.writeAuthCookie(httpRequest, httpResponse, sessionToken);
        Map<String, Object> out = new LinkedHashMap<>(authSuccessResponse(owner, sessionToken, httpRequest));
        try {
            Map<String, Object> payload = objectMapper.readValue(row.getPayloadJson(), new TypeReference<>() {
            });
            putIfPresent(out, "returnSearch", payload.get("returnSearch"));
            putIfPresent(out, "packageName", payload.get("packageName"));
            putIfPresent(out, "billingInterval", payload.get("billingInterval"));
        } catch (Exception e) {
            // The account is verified and signed in; missing selection metadata should not block login.
        }
        return ResponseEntity.ok(out);
    }

    /**
     * @return the intent token (same as in {@code /confirm-email?token=})
     */
    private String createPostProvisionEmailIntent(
            AuthController.SignupRequest request,
            String normalizedEmail,
            long ownerUserId,
            boolean sendConfirmationEmail
    ) throws java.io.IOException {
        String token = generateIntentToken();
        String code = generateCode();
        Map<String, Object> payload = intentPayloadMap(request, normalizedEmail);
        payload.put(POST_PROVISION_OWNER_USER_ID, ownerUserId);
        payload.put(SIGNUP_CODE_KEY, code);
        String json = objectMapper.writeValueAsString(payload);
        SignupEmailIntent intentRow = new SignupEmailIntent();
        intentRow.setToken(token);
        intentRow.setEmail(normalizedEmail);
        intentRow.setPayloadJson(json);
        intentRow.setExpiresAt(Instant.now().plus(SIGNUP_CODE_TTL_MINUTES, ChronoUnit.MINUTES));
        intentRow.setActive(true);
        signupEmailIntents.save(intentRow);
        if (sendConfirmationEmail) {
            sendSignupCodeEmail(
                    normalizedEmail,
                    code,
                    request.firstName(),
                    localeFromSignupRequest(request),
                    token,
                    request.returnSearch()
            );
        }
        return token;
    }

    private void clearSignupOwnerPasswordPending(User user) {
        Long companyId = user.getCompany().getId();
        settings.findByCompanyIdAndKey(companyId, SettingKey.SIGNUP_OWNER_PASSWORD_PENDING).ifPresent(s -> {
            s.setValue("false");
            settings.save(s);
        });
    }

    private ResponseEntity<?> resendPostProvisionSignupIntent(String normalizedEmail, User owner) {
        AuthController.SignupRequest request;
        try {
            List<SignupEmailIntent> all = signupEmailIntents.findAllByEmailIgnoreCaseOrderByCreatedAtDesc(normalizedEmail);
            if (!all.isEmpty()) {
                Map<String, Object> map = objectMapper.readValue(all.get(0).getPayloadJson(), new TypeReference<>() {
                });
                Long oid = longVal(map.get(POST_PROVISION_OWNER_USER_ID));
                if (oid != null && oid.equals(owner.getId())) {
                    request = parseSignupRequestFromIntentJson(all.get(0).getPayloadJson());
                } else {
                    request = rebuildSignupRequestFromProvisionedOwner(owner, normalizedEmail);
                }
            } else {
                request = rebuildSignupRequestFromProvisionedOwner(owner, normalizedEmail);
            }
        } catch (Exception e) {
            log.warn("Failed to parse stored intent for resend: {}", e.getMessage());
            request = rebuildSignupRequestFromProvisionedOwner(owner, normalizedEmail);
        }
        deactivateSignupIntentsForEmail(normalizedEmail);
        String challengeId;
        try {
            challengeId = createPostProvisionEmailIntent(request, normalizedEmail, owner.getId(), true);
        } catch (Exception e) {
            log.warn("Failed to resend post-provision signup code: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("message", "Could not resend signup code."));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("message", "We sent a verification code to your email.");
        out.put("challengeId", challengeId);
        out.put("email", normalizedEmail);
        out.put("expiresAt", Instant.now().plus(SIGNUP_CODE_TTL_MINUTES, ChronoUnit.MINUTES).toString());
        putIfPresent(out, "returnSearch", request.returnSearch());
        putIfPresent(out, "packageName", request.packageName());
        putIfPresent(out, "billingInterval", request.billingInterval());
        return ResponseEntity.ok(out);
    }

    private AuthController.SignupRequest rebuildSignupRequestFromProvisionedOwner(User owner, String normalizedEmail) {
        Company c = owner.getCompany();
        Long cid = c.getId();
        String companyName = settings.findByCompanyIdAndKey(cid, SettingKey.COMPANY_NAME).map(AppSetting::getValue).orElse("");
        if (companyName.isBlank()) {
            String tc = c.getTenantCode();
            companyName = tc != null && !tc.isBlank() ? tc : "Workspace";
        }
        String pkg = settings.findByCompanyIdAndKey(cid, SettingKey.SIGNUP_PACKAGE_NAME).map(AppSetting::getValue).orElse("PROFESSIONAL");
        Integer userCount = Math.max(1, parsePositiveIntSetting(cid, SettingKey.SIGNUP_USER_COUNT, 1));
        Integer smsCount = parsePositiveIntSetting(cid, SettingKey.SIGNUP_SMS_COUNT, 0);
        Integer spaceCount = Math.max(1, parsePositiveIntSetting(cid, SettingKey.TENANCY_SPACE_QUOTA, 5));
        List<String> addonKeys = parseAddonKeyCsv(settings.findByCompanyIdAndKey(cid, SettingKey.SIGNUP_ADDON_KEYS).map(AppSetting::getValue).orElse(""));
        String interval = settings.findByCompanyIdAndKey(cid, SettingKey.BILLING_SUBSCRIPTION_INTERVAL).map(AppSetting::getValue).orElse("MONTHLY");
        Boolean fiscal = settings.findByCompanyIdAndKey(cid, SettingKey.SIGNUP_FISCALIZATION_REQUIRED)
                .map(s -> "true".equalsIgnoreCase(s.getValue()))
                .orElse(false);
        return new AuthController.SignupRequest(
                companyName,
                owner.getFirstName(),
                owner.getLastName(),
                normalizedEmail,
                owner.getPhone(),
                null,
                pkg,
                userCount,
                smsCount,
                spaceCount,
                addonKeys,
                interval,
                fiscal,
                null
        );
    }

    private Integer parsePositiveIntSetting(Long companyId, SettingKey key, int defaultVal) {
        return settings.findByCompanyIdAndKey(companyId, key)
                .map(AppSetting::getValue)
                .map(v -> {
                    try {
                        int n = Integer.parseInt(v.trim());
                        return Math.max(0, n);
                    } catch (NumberFormatException e) {
                        return defaultVal;
                    }
                })
                .orElse(defaultVal);
    }

    private static void putIfPresent(Map<String, Object> out, String key, Object value) {
        if (value != null) {
            out.put(key, value);
        }
    }

    private static Long longVal(Object o) {
        if (o == null) {
            return null;
        }
        if (o instanceof Number n) {
            return n.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(o));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private Map<String, Object> intentPayloadMap(AuthController.SignupRequest request, String normalizedEmail) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("companyName", request.companyName());
        m.put("firstName", request.firstName());
        m.put("lastName", request.lastName());
        m.put("email", normalizedEmail);
        m.put("phone", request.phone());
        m.put("packageName", request.packageName());
        m.put("userCount", request.userCount());
        m.put("smsCount", request.smsCount());
        m.put("spaceCount", request.spaceCount());
        m.put("addonKeys", sanitizeAddonKeys(request.addonKeys()));
        m.put("billingInterval", request.billingInterval());
        m.put("fiscalizationNeeded", request.fiscalizationNeeded());
        m.put("returnSearch", request.returnSearch());
        return m;
    }

    private AuthController.SignupRequest parseSignupRequestFromIntentJson(String json) throws java.io.IOException {
        Map<String, Object> map = objectMapper.readValue(json, new TypeReference<>() {
        });
        return new AuthController.SignupRequest(
                stringVal(map.get("companyName")),
                stringVal(map.get("firstName")),
                stringVal(map.get("lastName")),
                stringVal(map.get("email")),
                stringVal(map.get("phone")),
                stringVal(map.get("password")),
                stringVal(map.get("packageName")),
                intVal(map.get("userCount")),
                intVal(map.get("smsCount")),
                intVal(map.get("spaceCount")),
                stringListVal(map.get("addonKeys")),
                stringVal(map.get("billingInterval")),
                boolVal(map.get("fiscalizationNeeded")),
                stringVal(map.get("returnSearch"))
        );
    }

    private static List<String> stringListVal(Object value) {
        if (value == null) {
            return List.of();
        }
        if (value instanceof List<?> list) {
            List<String> out = new ArrayList<>();
            for (Object item : list) {
                if (item != null) {
                    out.add(String.valueOf(item));
                }
            }
            return sanitizeAddonKeys(out);
        }
        return parseAddonKeyCsv(String.valueOf(value));
    }

    private static List<String> parseAddonKeyCsv(String csv) {
        if (csv == null || csv.isBlank()) {
            return List.of();
        }
        List<String> raw = new ArrayList<>();
        for (String part : csv.split(",")) {
            raw.add(part);
        }
        return sanitizeAddonKeys(raw);
    }

    private static List<String> sanitizeAddonKeys(List<String> keys) {
        if (keys == null || keys.isEmpty()) {
            return List.of();
        }
        List<String> out = new ArrayList<>();
        for (String key : keys) {
            if (key == null) continue;
            String cleaned = key.trim().toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("^-|-$", "");
            if (!cleaned.isBlank() && !out.contains(cleaned)) {
                out.add(cleaned);
            }
        }
        return out;
    }

    private static List<String> parseAddonKeysFromReturnSearch(String returnSearch) {
        if (returnSearch == null || returnSearch.isBlank()) {
            return List.of();
        }
        String q = returnSearch.trim();
        if (q.startsWith("?")) {
            q = q.substring(1);
        }
        List<String> out = new ArrayList<>();
        for (String part : q.split("&")) {
            if (part.isBlank()) continue;
            String[] kv = part.split("=", 2);
            String key = urlDecode(kv[0]);
            String value = kv.length > 1 ? urlDecode(kv[1]) : "";
            if ("addon".equalsIgnoreCase(key)) {
                out.add(value);
            }
        }
        return sanitizeAddonKeys(out);
    }

    private static String urlDecode(String value) {
        try {
            return java.net.URLDecoder.decode(value == null ? "" : value, java.nio.charset.StandardCharsets.UTF_8);
        } catch (Exception e) {
            return value == null ? "" : value;
        }
    }

    private static List<String> resolveSelectedAddonKeys(AuthController.SignupRequest request) {
        List<String> merged = new ArrayList<>();
        if (request != null) {
            if (request.addonKeys() != null) {
                merged.addAll(request.addonKeys());
            }
            merged.addAll(parseAddonKeysFromReturnSearch(request.returnSearch()));
        }
        return sanitizeAddonKeys(merged);
    }

    private static String stringVal(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private static Integer intVal(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) {
            return n.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(o));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static Boolean boolVal(Object o) {
        if (o == null) return null;
        if (o instanceof Boolean b) {
            return b;
        }
        return Boolean.parseBoolean(String.valueOf(o));
    }

    private String generateIntentToken() {
        byte[] bytes = new byte[INTENT_TOKEN_BYTES];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String generateCode() {
        int value = secureRandom.nextInt(1_000_000);
        return String.format(Locale.ROOT, "%06d", value);
    }

    private ResponseEntity<?> refreshAndSendCode(SignupEmailIntent row) {
        String email = row.getEmail() == null ? "" : row.getEmail().trim().toLowerCase(Locale.ROOT);
        if (email.isBlank()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", "Signup challenge is not valid."));
        }
        Map<String, Object> payload;
        try {
            payload = objectMapper.readValue(row.getPayloadJson(), new TypeReference<>() {
            });
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", "Signup challenge is not valid."));
        }
        String code = generateCode();
        Instant expiresAt = Instant.now().plus(SIGNUP_CODE_TTL_MINUTES, ChronoUnit.MINUTES);
        payload.put(SIGNUP_CODE_KEY, code);
        try {
            row.setPayloadJson(objectMapper.writeValueAsString(payload));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("message", "Could not refresh signup code."));
        }
        deactivateSignupIntentsForEmail(email);
        row.setEmail(email);
        row.setExpiresAt(expiresAt);
        row.setActive(true);
        signupEmailIntents.save(row);
        sendSignupCodeEmail(
                email,
                code,
                stringVal(payload.get("firstName")),
                localeFromReturnSearch(stringVal(payload.get("returnSearch"))),
                row.getToken(),
                stringVal(payload.get("returnSearch"))
        );
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("message", "We sent a verification code to your email.");
        out.put("challengeId", row.getToken());
        out.put("email", email);
        out.put("expiresAt", expiresAt.toString());
        putIfPresent(out, "returnSearch", payload.get("returnSearch"));
        putIfPresent(out, "packageName", payload.get("packageName"));
        putIfPresent(out, "billingInterval", payload.get("billingInterval"));
        return ResponseEntity.ok(out);
    }

    private void sendSignupCodeEmail(
            String email,
            String code,
            String firstName,
            String localeCode,
            String challengeId,
            String returnSearch
    ) {
        if (!mailConfigured) {
            log.warn("Signup code for {} skipped: mail is not configured.", LogSanitizer.emailHash(email));
            return;
        }

        String locale = "sl".equals(supportedSignupLocale(localeCode)) ? "sl" : "en";
        VerificationEmailCopy copy = verificationEmailCopy(locale);
        String displayName = firstName == null || firstName.isBlank()
                ? copy.greetingFallback()
                : firstName.trim();
        String html = buildSignupVerificationHtml(copy, displayName, code);
        String plainText = buildSignupVerificationPlainText(copy, displayName, code);

        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, StandardCharsets.UTF_8.name());
            helper.setFrom(mailFrom, "sl".equals(locale) ? "Calendra ekipa" : "Calendra team");
            helper.setTo(email);
            helper.setSubject(copy.subject());
            helper.setText(plainText, html);
            helper.addInline(
                    CALENDRA_LOGO_CONTENT_ID,
                    new ClassPathResource(CALENDRA_LOGO_CLASSPATH),
                    "image/png"
            );
            mailSender.send(message);
            log.info("Signup verification code email sent to {}", LogSanitizer.emailHash(email));
        } catch (Exception e) {
            log.warn("Failed sending signup verification code to {}: {}", LogSanitizer.emailHash(email), e.getMessage());
        }
    }

    private record VerificationEmailCopy(
            String subject,
            String previewText,
            String badge,
            String title,
            String greetingPrefix,
            String greetingFallback,
            String intro,
            String expiry,
            String ignore,
            String nextTitle,
            String stepOneTitle,
            String stepOneText,
            String stepTwoTitle,
            String stepTwoText,
            String stepThreeTitle,
            String stepThreeText,
            String footer
    ) {
    }

    private VerificationEmailCopy verificationEmailCopy(String locale) {
        if ("sl".equals(locale)) {
            return new VerificationEmailCopy(
                    "Vaša potrditvena koda za Calendro",
                    "Uporabite potrditveno kodo za nadaljevanje ustvarjanja računa Calendra.",
                    "Potrditev e-pošte",
                    "Potrdite svoj e-poštni naslov",
                    "Pozdravljeni",
                    "uporabnik",
                    "Začeli ste ustvarjati račun Calendra. S spodnjo kodo potrdite svoj e-poštni naslov in nadaljujte.",
                    "Ta koda poteče čez 1 uro.",
                    "Če tega niste zahtevali, lahko to sporočilo prezrete.",
                    "Kaj sledi?",
                    "1. Potrdite e-pošto",
                    "Vnesite zgornjo kodo in potrdite svoj e-poštni naslov.",
                    "2. Dokončajte račun",
                    "Nastavite geslo ter dokončajte podatke svojega računa.",
                    "3. Začnite uporabljati Calendro",
                    "Upravljajte termine, stranke in poslovne nastavitve na enem mestu.",
                    "To je informativno sporočilo platforme Calendra."
            );
        }
        return new VerificationEmailCopy(
                "Your Calendra verification code",
                "Use your verification code to continue creating your Calendra account.",
                "Email verification",
                "Verify your email",
                "Hello",
                "there",
                "You started creating a Calendra account. Use the code below to verify your email and continue.",
                "This code expires in 1 hour.",
                "If you did not request this, you can ignore this email.",
                "What happens next?",
                "1. Verify your email",
                "Enter the code above to confirm your email address.",
                "2. Complete your account",
                "Set your password and finish your account details.",
                "3. Start using Calendra",
                "Manage appointments, clients and business settings in one place.",
                "This is an informational email from Calendra."
        );
    }

    private String buildSignupVerificationHtml(
            VerificationEmailCopy copy,
            String displayName,
            String code
    ) {
        String safeName = escapeHtml(displayName);
        String safeCode = escapeHtml(code);
        String greeting = escapeHtml(copy.greetingPrefix()) + " " + safeName + ",";
        return """
                <!doctype html>
                <html lang="en">
                <head>
                  <meta charset="UTF-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <meta name="color-scheme" content="light">
                  <meta name="supported-color-schemes" content="light">
                  <style>
                    @media only screen and (max-width: 640px) {
                      .email-shell { padding: 16px 8px !important; }
                      .email-content { padding: 28px 20px 24px !important; }
                      .email-title { font-size: 30px !important; line-height: 1.18 !important; }
                      .email-logo { width: 180px !important; max-width: 72%% !important; }
                      .code-box { padding: 24px 12px !important; }
                      .verification-code { font-size: 42px !important; letter-spacing: 8px !important; }
                      .step-copy { padding-left: 12px !important; }
                    }
                  </style>
                </head>
                <body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,'Helvetica Neue',sans-serif;color:#111827;">
                  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">%s</div>
                  <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0" style="width:100%%;background:#f4f7fb;">
                    <tr>
                      <td class="email-shell" align="center" style="padding:28px 14px;">
                        <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0" style="max-width:720px;background:#ffffff;border:1px solid #dfe7f3;border-radius:28px;overflow:hidden;box-shadow:0 14px 40px rgba(31,72,125,.08);">
                          <tr>
                            <td class="email-content" style="padding:42px 44px 34px;">
                              <img class="email-logo" src="cid:%s" alt="Calendra" width="205" style="display:block;width:205px;max-width:75%%;height:auto;border:0;margin:0 0 26px;">
                              <span style="display:inline-block;padding:7px 14px;border-radius:999px;background:#edf4ff;color:#2563eb;font-size:14px;line-height:1.2;font-weight:700;">%s</span>
                              <h1 class="email-title" style="margin:24px 0 20px;font-size:38px;line-height:1.18;letter-spacing:-.7px;color:#111827;font-weight:800;">%s</h1>
                              <p style="margin:0 0 24px;font-size:18px;line-height:1.55;color:#52627a;">%s</p>
                              <p style="margin:0 0 30px;font-size:18px;line-height:1.65;color:#52627a;">%s</p>

                              <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0" class="code-box" style="width:100%%;border:1px solid #cdddf7;border-radius:18px;background:#f8fbff;">
                                <tr>
                                  <td align="center" style="padding:30px 18px;">
                                    <div class="verification-code" style="font-size:54px;line-height:1;font-weight:800;letter-spacing:12px;color:#2563eb;">%s</div>
                                  </td>
                                </tr>
                              </table>

                              <p style="margin:20px 0 12px;text-align:center;font-size:16px;line-height:1.5;color:#64748b;">&#128339;&nbsp; %s</p>
                              <p style="margin:0 0 30px;text-align:center;font-size:15px;line-height:1.55;color:#6b7b91;">%s</p>

                              <div style="height:1px;background:#e7edf5;margin:0 0 26px;"></div>
                              <h2 style="margin:0 0 18px;font-size:23px;line-height:1.3;color:#172033;font-weight:800;">%s</h2>

                              %s
                              %s
                              %s

                              <div style="height:1px;background:#e7edf5;margin:28px 0 22px;"></div>
                              <p style="margin:0;font-size:14px;line-height:1.5;color:#94a3b8;">%s</p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </body>
                </html>
                """.formatted(
                escapeHtml(copy.previewText()),
                CALENDRA_LOGO_CONTENT_ID,
                escapeHtml(copy.badge()),
                escapeHtml(copy.title()),
                greeting,
                escapeHtml(copy.intro()),
                safeCode,
                escapeHtml(copy.expiry()),
                escapeHtml(copy.ignore()),
                escapeHtml(copy.nextTitle()),
                verificationStepHtml("&#9993;", copy.stepOneTitle(), copy.stepOneText()),
                verificationStepHtml("&#128100;", copy.stepTwoTitle(), copy.stepTwoText()),
                verificationStepHtml("&#128197;", copy.stepThreeTitle(), copy.stepThreeText()),
                escapeHtml(copy.footer())
        );
    }

    private String verificationStepHtml(String icon, String title, String text) {
        return """
                <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0" style="width:100%%;margin:0 0 12px;border:1px solid #dfe7f3;border-radius:16px;background:#ffffff;">
                  <tr>
                    <td width="58" valign="middle" style="padding:15px 0 15px 16px;">
                      <div style="width:40px;height:40px;border-radius:50%%;background:#edf4ff;color:#2563eb;text-align:center;line-height:40px;font-size:19px;">%s</div>
                    </td>
                    <td class="step-copy" valign="middle" style="padding:14px 16px 14px 10px;">
                      <div style="font-size:17px;line-height:1.35;font-weight:800;color:#2563eb;margin:0 0 3px;">%s</div>
                      <div style="font-size:14px;line-height:1.5;color:#718096;">%s</div>
                    </td>
                    <td width="26" valign="middle" align="center" style="padding-right:14px;color:#94a3b8;font-size:24px;">&#8250;</td>
                  </tr>
                </table>
                """.formatted(icon, escapeHtml(title), escapeHtml(text));
    }

    private String buildSignupVerificationPlainText(
            VerificationEmailCopy copy,
            String displayName,
            String code
    ) {
        return """
                %s %s,

                %s

                %s

                %s

                %s

                %s
                - %s: %s
                - %s: %s
                - %s: %s

                %s
                """.formatted(
                copy.greetingPrefix(),
                displayName,
                copy.intro(),
                code,
                copy.expiry(),
                copy.ignore(),
                copy.nextTitle(),
                copy.stepOneTitle(),
                copy.stepOneText(),
                copy.stepTwoTitle(),
                copy.stepTwoText(),
                copy.stepThreeTitle(),
                copy.stepThreeText(),
                copy.footer()
        );
    }

    private static String escapeHtml(String value) {
        if (value == null) return "";
        return value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }

    /**
     * Same provisioning as {@link #signup} but uses Google-provided names when the pending session left them blank.
     */
    @Transactional
    public ResponseEntity<?> signupFromGooglePending(
            SignupPendingSession pending,
            String googleEmail,
            String googleFirstName,
            String googleLastName,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse
    ) {
        String normalizedEmail = googleEmail.trim().toLowerCase();
        deactivateSignupIntentsForEmail(normalizedEmail);
        ResponseEntity<?> conflict = conflictResponseForExistingEmail(normalizedEmail);
        if (conflict != null) {
            return conflict;
        }
        String fn = trimToNull(pending.firstName());
        String ln = trimToNull(pending.lastName());
        if (fn == null || fn.isBlank()) {
            fn = googleFirstName == null || googleFirstName.isBlank() ? signupFirstNameFromEmail(normalizedEmail) : googleFirstName.trim();
        }
        if (ln == null || ln.isBlank()) {
            ln = googleLastName == null || googleLastName.isBlank() ? "Account" : googleLastName.trim();
        }
        String returnSearch = pending.returnSearch() == null ? "" : pending.returnSearch();
        String generatedPassword = "Google#" + UUID.randomUUID().toString().replace("-", "") + "Aa1";
        var request = new AuthController.SignupRequest(
                pending.companyName(),
                fn,
                ln,
                normalizedEmail,
                trimToNull(pending.phone()),
                generatedPassword,
                pending.packageName(),
                pending.userCount(),
                pending.smsCount(),
                pending.spaceCount(),
                pending.addonKeys(),
                pending.billingInterval(),
                pending.fiscalizationNeeded(),
                returnSearch
        );
        ResponseEntity<?> provisioned = provisionNewTenant(request, normalizedEmail, httpRequest, httpResponse, false);
        if (!provisioned.getStatusCode().is2xxSuccessful() || !(provisioned.getBody() instanceof Map<?, ?> body)) {
            return provisioned;
        }
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<?, ?> e : body.entrySet()) {
            out.put(String.valueOf(e.getKey()), e.getValue());
        }
        out.put("returnSearch", returnSearch);
        putIfPresent(out, "packageName", pending.packageName());
        putIfPresent(out, "billingInterval", pending.billingInterval());
        return ResponseEntity.status(provisioned.getStatusCode()).body(out);
    }

    @Transactional
    public ResponseEntity<?> finalizeGooglePendingOwnerSignup(
            String normalizedEmail,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse,
            String returnSearch,
            String packageName,
            String billingInterval
    ) {
        if (normalizedEmail == null || normalizedEmail.isBlank()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", "Email is required."));
        }
        List<User> matches = users.findAllByEmailIgnoreCase(normalizedEmail.trim().toLowerCase(Locale.ROOT));
        if (matches.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", "Account not found."));
        }
        User owner = matches.get(0);
        if (!isOwnerAwaitingPasswordSetup(owner)) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", "No pending signup verification for this email."));
        }
        clearSignupOwnerPasswordPending(owner);
        deactivateSignupIntentsForEmail(normalizedEmail.trim().toLowerCase(Locale.ROOT));
        sendRegisteredTenantWelcomeEmailSafely(owner, owner.getCompany() == null ? null : owner.getCompany().getName(), packageTypeForCompany(owner.getCompany()), localeFromReturnSearch(returnSearch));
        String sessionToken = securityCenterService.issueSession(owner, httpRequest, "Google signup completion").token();
        authCookieService.writeAuthCookie(httpRequest, httpResponse, sessionToken);
        Map<String, Object> out = new LinkedHashMap<>(authSuccessResponse(owner, sessionToken, httpRequest));
        putIfPresent(out, "returnSearch", returnSearch);
        putIfPresent(out, "packageName", packageName);
        putIfPresent(out, "billingInterval", billingInterval);
        return ResponseEntity.ok(out);
    }

    private Map<String, Object> authSuccessResponse(User user, String token, HttpServletRequest request) {
        Map<String, Object> body = new LinkedHashMap<>();
        if (authCookieService.isNativeClient(request)) {
            body.put("token", token);
        }
        body.put("user", serializeUser(user, packageTypeForCompany(user.getCompany())));
        return body;
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

    private String packageTypeForCompany(Company company) {
        if (company == null || company.getId() == null) {
            return "CUSTOM";
        }
        return settings.findByCompanyIdAndKey(company.getId(), SettingKey.SIGNUP_PACKAGE_NAME)
                .map(AppSetting::getValue)
                .map(value -> normalizePackageType(value, "CUSTOM"))
                .orElse("CUSTOM");
    }

    private String normalizeTenantConfigType(String rawValue) {
        if (rawValue == null || rawValue.isBlank()) return "salon";
        String normalized = rawValue.trim().toLowerCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
        return switch (normalized) {
            case "gym", "therapy", "spa", "personal_training" -> normalized;
            default -> "salon";
        };
    }

    private int packageRank(String packageType) {
        return switch (normalizePackageType(packageType, "BASIC")) {
            case "CUSTOM", "PREMIUM" -> 3;
            case "PROFESSIONAL", "TRIAL" -> 2;
            default -> 1;
        };
    }

    private boolean hasMinPackage(String packageType, String minPackage) {
        return packageRank(packageType) >= packageRank(minPackage);
    }

    private void applyModuleConfigPreset(Company company, String tenantType, String packageType) {
        String normalizedTenantType = normalizeTenantConfigType(tenantType);
        boolean basicAllowed = hasMinPackage(packageType, "BASIC");
        boolean proAllowed = hasMinPackage(packageType, "PROFESSIONAL");
        boolean supportsOnlineSessions = "therapy".equals(normalizedTenantType) || "personal_training".equals(normalizedTenantType);
        boolean supportsGroupBookings = "gym".equals(normalizedTenantType) || "personal_training".equals(normalizedTenantType);

        seedSetting(company, SettingKey.ONLINE_SESSION_BOOKING_ENABLED, Boolean.toString(basicAllowed && supportsOnlineSessions));
        seedSetting(company, SettingKey.NO_SHOW_ENABLED, "true");
        seedSetting(company, SettingKey.BILLING_ADVANCE_ENABLED, "true");
        seedSetting(company, SettingKey.BILLING_FISCAL_CASH_REGISTER_ENABLED, "false");
        seedSetting(company, SettingKey.SPACES_ENABLED, Boolean.toString(proAllowed));
        seedSetting(company, SettingKey.MULTIPLE_SESSIONS_PER_SPACE_ENABLED, Boolean.toString(proAllowed && supportsGroupBookings));
        seedSetting(company, SettingKey.GROUP_BOOKING_ENABLED, Boolean.toString(proAllowed && supportsGroupBookings));
        seedSetting(company, SettingKey.MULTIPLE_CLIENTS_PER_SESSION_ENABLED, Boolean.toString(proAllowed && supportsGroupBookings));
        seedSetting(company, SettingKey.AI_BOOKING_ENABLED, "false");
        seedDefaultEmailSenderSettings(company);
    }

    private void seedGuestAppTenantType(Company company, String tenantType) {
        String normalizedTenantType = normalizeTenantConfigType(tenantType);
        Map<String, Object> guestSettings = new LinkedHashMap<>();
        settings.findByCompanyIdAndKey(company.getId(), SettingKey.GUEST_APP_SETTINGS_JSON)
                .map(AppSetting::getValue)
                .filter(value -> value != null && !value.isBlank())
                .ifPresent(value -> {
                    try {
                        Map<String, Object> parsed = objectMapper.readValue(value, new TypeReference<Map<String, Object>>() {});
                        if (parsed != null) guestSettings.putAll(parsed);
                    } catch (Exception ignored) {
                        // Keep the new tenant type even if an older malformed JSON value exists.
                    }
                });
        guestSettings.put("tenantType", normalizedTenantType);
        try {
            seedSetting(company, SettingKey.GUEST_APP_SETTINGS_JSON, objectMapper.writeValueAsString(guestSettings));
        } catch (Exception e) {
            log.warn("Could not save guest app tenant type for company {}: {}", company == null ? null : company.getId(), e.getMessage());
        }
    }

    private void seedTenantDefaults(Company company, String companyName) {
        seedSetting(company, SettingKey.SPACES_ENABLED, "true");
        seedSetting(company, SettingKey.TYPES_ENABLED, "true");
        seedSetting(company, SettingKey.BOOKABLE_ENABLED, "true");
        seedSetting(company, SettingKey.ONLINE_SESSION_BOOKING_ENABLED, "true");
        seedSetting(company, SettingKey.NO_SHOW_ENABLED, "true");
        seedSetting(company, SettingKey.BILLING_ADVANCE_ENABLED, "true");
        seedSetting(company, SettingKey.MODULE_CONFIG_TYPE, "salon");
        seedSetting(company, SettingKey.PERSONAL_ENABLED, "true");
        seedSetting(company, SettingKey.TODOS_ENABLED, "true");
        seedSetting(company, SettingKey.MULTIPLE_SESSIONS_PER_SPACE_ENABLED, "false");
        seedSetting(company, SettingKey.MULTIPLE_CLIENTS_PER_SESSION_ENABLED, "false");
        seedSetting(company, SettingKey.GROUP_BOOKING_ENABLED, "false");
        seedSetting(company, SettingKey.SESSION_LENGTH_MINUTES, "60");
        seedSetting(company, SettingKey.PERSONAL_TASK_PRESETS_JSON, "[]");
        seedSetting(company, SettingKey.INVOICE_COUNTER, "1");
        seedSetting(company, SettingKey.ORDER_COUNTER, "1");
        seedSetting(company, SettingKey.COMPANY_NAME, companyName);
        seedSetting(company, SettingKey.COMPANY_ADDRESS, "");
        seedSetting(company, SettingKey.COMPANY_POSTAL_CODE, "");
        seedSetting(company, SettingKey.COMPANY_CITY, "");
        seedSetting(company, SettingKey.COMPANY_VAT_ID, "");
        seedSetting(company, SettingKey.COMPANY_IBAN, "");
        seedSetting(company, SettingKey.COMPANY_EMAIL, "");
        seedSetting(company, SettingKey.COMPANY_TELEPHONE, "");
        seedSetting(company, SettingKey.PAYMENT_DEADLINE_DAYS, "15");
        seedDefaultEmailSenderSettings(company);
    }

    private void seedDefaultEmailSenderSettings(Company company) {
        seedSetting(company, SettingKey.EMAIL_SENDER_MODE, "DEFAULT_CALENDRA");
        seedSetting(company, SettingKey.EMAIL_CUSTOM_FROM_NAME, "");
        seedSetting(company, SettingKey.EMAIL_CUSTOM_FROM_EMAIL, "");
        seedSetting(company, SettingKey.EMAIL_CUSTOM_REPLY_TO_EMAIL, "");
        seedSetting(company, SettingKey.EMAIL_CUSTOM_DOMAIN, "");
        seedSetting(company, SettingKey.EMAIL_CUSTOM_DOMAIN_VERIFICATION_STATUS, "NOT_VERIFIED");
    }

    private void seedSetting(Company company, SettingKey key, String value) {
        settings.findByCompanyIdAndKey(company.getId(), key).ifPresentOrElse(existing -> {
            existing.setValue(value);
            settings.save(existing);
        }, () -> {
            var s = new AppSetting();
            s.setCompany(company);
            s.setKey(key.name());
            s.setValue(value);
            settings.save(s);
        });
    }

    private static String normalizeBillingInterval(String rawValue) {
        if (rawValue == null || rawValue.isBlank()) return "MONTHLY";
        return "YEARLY".equals(rawValue.trim().toUpperCase(Locale.ROOT)) ? "YEARLY" : "MONTHLY";
    }

    private static boolean isBasicMonthlyTrial(String normalizedPackageType, String normalizedBillingInterval) {
        return "BASIC".equals(normalizedPackageType) && "MONTHLY".equals(normalizedBillingInterval);
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

    private String resolveCompanyName(AuthController.SignupRequest request) {
        String companyName = trimToNull(request.companyName());
        if (companyName != null) return companyName;

        String fullName = ((request.firstName() == null ? "" : request.firstName().trim()) + " " + (request.lastName() == null ? "" : request.lastName().trim())).trim();
        if (!fullName.isBlank()) return fullName;

        String email = trimToNull(request.email());
        if (email != null && email.contains("@")) {
            return email.substring(0, email.indexOf('@'));
        }
        return "New tenancy";
    }

    private String signupFirstName(AuthController.SignupRequest request, String normalizedEmail) {
        if (request.firstName() != null && !request.firstName().isBlank()) {
            return request.firstName().trim();
        }
        return signupFirstNameFromEmail(normalizedEmail);
    }

    private String signupFirstNameFromEmail(String normalizedEmail) {
        if (normalizedEmail != null && normalizedEmail.contains("@")) {
            String local = normalizedEmail.substring(0, normalizedEmail.indexOf('@'));
            String cleaned = local.replaceAll("[^a-zA-Z0-9._-]", "");
            if (!cleaned.isBlank()) {
                return cleaned.length() > 120 ? cleaned.substring(0, 120) : cleaned;
            }
        }
        return "User";
    }

    private String signupLastName(AuthController.SignupRequest request) {
        if (request.lastName() != null && !request.lastName().isBlank()) {
            return request.lastName().trim();
        }
        return "Account";
    }

    private String trimToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isBlank() ? null : trimmed;
    }

    private String stringOrEmpty(String value) {
        return value == null ? "" : value.trim();
    }
}
