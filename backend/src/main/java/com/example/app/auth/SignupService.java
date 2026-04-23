package com.example.app.auth;

import com.example.app.billing.TaxRate;
import com.example.app.billing.TransactionService;
import com.example.app.billing.TransactionServiceRepository;
import com.example.app.company.Company;
import com.example.app.company.CompanyProvisioningService;
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
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SignupService {
    private static final Logger log = LoggerFactory.getLogger(SignupService.class);
    private static final long INTENT_TTL_SECONDS = 60L * 15L;
    private static final int INTENT_TOKEN_BYTES = 32;

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final CompanyProvisioningService companyProvisioningService;
    private final AppSettingRepository settings;
    private final TransactionServiceRepository txServices;
    private final PasswordResetService passwordResetService;
    private final SecurityCenterService securityCenterService;
    private final AuthCookieService authCookieService;
    private final SignupEmailIntentRepository signupEmailIntents;
    private final ObjectMapper objectMapper;
    private final JavaMailSender mailSender;
    private final String mailFrom;
    private final String frontendBaseUrl;
    private final boolean mailConfigured;
    private final SecureRandom secureRandom = new SecureRandom();

    public SignupService(
            UserRepository users,
            PasswordEncoder passwordEncoder,
            CompanyProvisioningService companyProvisioningService,
            AppSettingRepository settings,
            TransactionServiceRepository txServices,
            PasswordResetService passwordResetService,
            SecurityCenterService securityCenterService,
            AuthCookieService authCookieService,
            SignupEmailIntentRepository signupEmailIntents,
            ObjectMapper objectMapper,
            @Autowired(required = false) JavaMailSender mailSender,
            @Value("${app.mail.from:}") String mailFrom,
            @Value("${spring.mail.host:}") String mailHost,
            @Value("${spring.mail.username:}") String mailUsername,
            @Value("${app.auth.frontend-url:http://localhost:3000}") String frontendBaseUrl
    ) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.companyProvisioningService = companyProvisioningService;
        this.settings = settings;
        this.txServices = txServices;
        this.passwordResetService = passwordResetService;
        this.securityCenterService = securityCenterService;
        this.authCookieService = authCookieService;
        this.signupEmailIntents = signupEmailIntents;
        this.objectMapper = objectMapper;
        this.mailSender = mailSender;
        this.mailFrom = mailFrom == null ? "" : mailFrom;
        this.frontendBaseUrl = sanitizeBase(frontendBaseUrl);
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
        return provisionNewTenant(request, normalizedEmail, httpRequest, httpResponse);
    }

    public ResponseEntity<?> beginEmailSignupIntent(AuthController.SignupRequest request, String normalizedEmail) {
        deactivateSignupIntentsForEmail(normalizedEmail);
        String token = generateIntentToken();
        String json;
        try {
            json = objectMapper.writeValueAsString(intentPayloadMap(request, normalizedEmail));
        } catch (Exception e) {
            log.warn("Failed serializing signup intent: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("message", "Could not start signup."));
        }
        SignupEmailIntent row = new SignupEmailIntent();
        row.setToken(token);
        row.setEmail(normalizedEmail);
        row.setPayloadJson(json);
        row.setExpiresAt(Instant.now().plusSeconds(INTENT_TTL_SECONDS));
        row.setActive(true);
        signupEmailIntents.save(row);
        sendSignupConfirmationEmail(normalizedEmail, token);
        return ResponseEntity.ok(Map.of(
                "message", "We sent a link to confirm your email and create your account.",
                "requiresEmailVerification", true,
                "pendingAccountCreation", true,
                "email", normalizedEmail
        ));
    }

    @Transactional
    public ResponseEntity<?> resendEmailSignupIntent(String normalizedEmail) {
        if (normalizedEmail == null || normalizedEmail.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Email is required."));
        }
        if (!users.findAllByEmailIgnoreCase(normalizedEmail).isEmpty()) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", "An account already exists for this email."));
        }
        List<SignupEmailIntent> all = signupEmailIntents.findAllByEmailIgnoreCaseOrderByCreatedAtDesc(normalizedEmail);
        if (all.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", "No pending signup found for this email."));
        }
        SignupEmailIntent latest = all.get(0);
        AuthController.SignupRequest parsed;
        try {
            parsed = parseSignupRequestFromIntentJson(latest.getPayloadJson());
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("message", "Could not resend signup email."));
        }
        deactivateSignupIntentsForEmail(normalizedEmail);
        return beginEmailSignupIntent(parsed, normalizedEmail);
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
                request.billingInterval(),
                request.fiscalizationNeeded(),
                request.returnSearch()
        );
        ResponseEntity<?> provisioned = provisionNewTenant(finalized, normalizedEmail, httpRequest, httpResponse);
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

    public ResponseEntity<?> provisionNewTenant(
            AuthController.SignupRequest request,
            String normalizedEmail,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse
    ) {
        deactivateSignupIntentsForEmail(normalizedEmail);
        String normalizedPackageType = normalizePackageType(request.packageName(), "PROFESSIONAL");
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

        seedTenantDefaults(company, companyName);
        seedSetting(company, SettingKey.COMPANY_EMAIL, normalizedEmail);
        if (phone != null) {
            seedSetting(company, SettingKey.COMPANY_TELEPHONE, phone);
        }
        seedSetting(company, SettingKey.SIGNUP_PACKAGE_NAME, normalizedPackageType);
        seedSetting(company, SettingKey.SIGNUP_USER_COUNT, String.valueOf(Math.max(1, request.userCount() == null ? 1 : request.userCount())));
        seedSetting(company, SettingKey.SIGNUP_SMS_COUNT, String.valueOf(Math.max(0, request.smsCount() == null ? 0 : request.smsCount())));
        seedSetting(company, SettingKey.SIGNUP_FISCALIZATION_REQUIRED, String.valueOf(Boolean.TRUE.equals(request.fiscalizationNeeded())));
        int spaceQuota = Math.max(1, request.spaceCount() == null ? 5 : request.spaceCount());
        seedSetting(company, SettingKey.TENANCY_SPACE_QUOTA, String.valueOf(spaceQuota));
        seedSetting(company, SettingKey.TENANCY_SMS_SENT_COUNT, "0");
        String interval = request.billingInterval() == null ? "MONTHLY" : request.billingInterval().trim().toUpperCase(Locale.ROOT);
        if (!"MONTHLY".equals(interval) && !"YEARLY".equals(interval)) {
            interval = "MONTHLY";
        }
        LocalDate subStart = LocalDate.now(ZoneId.systemDefault());
        LocalDate subEnd = "TRIAL".equals(normalizedPackageType)
                ? subStart.plusDays(7)
                : ("YEARLY".equals(interval) ? subStart.plusYears(1) : subStart.plusMonths(1));
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_START, subStart.toString());
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_END, subEnd.toString());
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_INTERVAL, interval);
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_DUE_AMOUNT, "0.00");

        if (!passwordProvided) {
            seedSetting(company, SettingKey.SIGNUP_OWNER_PASSWORD_PENDING, "true");
            passwordResetService.requestReset(normalizedEmail);
            return ResponseEntity.ok(Map.of(
                    "message", "Signup created. A password setup email has been sent.",
                    "requiresPasswordSetup", true,
                    "requiresEmailVerification", true,
                    "email", normalizedEmail
            ));
        }

        String sessionToken = securityCenterService.issueSession(owner, httpRequest, "New account sign-in").token();
        authCookieService.writeAuthCookie(httpRequest, httpResponse, sessionToken);
        return ResponseEntity.ok(authSuccessResponse(owner, sessionToken, httpRequest));
    }

    private void deactivateSignupIntentsForEmail(String normalizedEmail) {
        for (SignupEmailIntent i : signupEmailIntents.findAllByEmailIgnoreCaseAndActiveTrue(normalizedEmail)) {
            i.setActive(false);
            signupEmailIntents.save(i);
        }
    }

    private Map<String, Object> intentPayloadMap(AuthController.SignupRequest request, String normalizedEmail) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("companyName", request.companyName());
        m.put("firstName", request.firstName());
        m.put("lastName", request.lastName());
        m.put("email", normalizedEmail);
        m.put("phone", request.phone());
        m.put("password", request.password());
        m.put("packageName", request.packageName());
        m.put("userCount", request.userCount());
        m.put("smsCount", request.smsCount());
        m.put("spaceCount", request.spaceCount());
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
                stringVal(map.get("billingInterval")),
                boolVal(map.get("fiscalizationNeeded")),
                stringVal(map.get("returnSearch"))
        );
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

    private void sendSignupConfirmationEmail(String email, String token) {
        if (!mailConfigured) {
            log.warn("Signup confirmation for {} skipped: mail is not configured.", email);
            return;
        }
        String confirmUrl = frontendBaseUrl
                + "/confirm-email?token="
                + URLEncoder.encode(token, StandardCharsets.UTF_8)
                + "&email="
                + URLEncoder.encode(email, StandardCharsets.UTF_8);
        String subject = "Confirm your email to create your Calendra account";
        String body = """
                Hello,

                You started creating a Calendra account. Confirm your email to finish creating your workspace:

                %s

                This link expires in 15 minutes.
                If you did not request this, you can ignore this email.
                """.formatted(confirmUrl);
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, StandardCharsets.UTF_8.name());
            helper.setFrom(mailFrom);
            helper.setTo(email);
            helper.setSubject(subject);
            helper.setText(body, false);
            mailSender.send(message);
            log.info("Signup confirmation email sent to {}", email);
        } catch (Exception e) {
            log.warn("Failed sending signup confirmation to {}: {}", email, e.getMessage());
        }
    }

    private String sanitizeBase(String raw) {
        String base = (raw == null || raw.isBlank()) ? "http://localhost:3000" : raw.trim();
        return base.endsWith("/") ? base.substring(0, base.length() - 1) : base;
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
        var request = new AuthController.SignupRequest(
                pending.companyName(),
                fn,
                ln,
                normalizedEmail,
                trimToNull(pending.phone()),
                null,
                pending.packageName(),
                pending.userCount(),
                pending.smsCount(),
                pending.spaceCount(),
                pending.billingInterval(),
                pending.fiscalizationNeeded(),
                returnSearch
        );
        return provisionNewTenant(request, normalizedEmail, httpRequest, httpResponse);
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
        return settings.findByCompanyIdAndKey(company.getId(), SettingKey.SIGNUP_PACKAGE_NAME)
                .map(AppSetting::getValue)
                .map(value -> normalizePackageType(value, "CUSTOM"))
                .orElse("CUSTOM");
    }

    private void seedTenantDefaults(Company company, String companyName) {
        seedSetting(company, SettingKey.SPACES_ENABLED, "true");
        seedSetting(company, SettingKey.TYPES_ENABLED, "true");
        seedSetting(company, SettingKey.BOOKABLE_ENABLED, "true");
        seedSetting(company, SettingKey.PERSONAL_ENABLED, "true");
        seedSetting(company, SettingKey.TODOS_ENABLED, "true");
        seedSetting(company, SettingKey.MULTIPLE_SESSIONS_PER_SPACE_ENABLED, "false");
        seedSetting(company, SettingKey.MULTIPLE_CLIENTS_PER_SESSION_ENABLED, "false");
        seedSetting(company, SettingKey.GROUP_BOOKING_ENABLED, "false");
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

        TransactionService tx = new TransactionService();
        tx.setCompany(company);
        tx.setCode("CONSULT-001");
        tx.setDescription("Consultation");
        tx.setTaxRate(TaxRate.VAT_22);
        tx.setNetPrice(new BigDecimal("50.00"));
        txServices.save(tx);
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
}
