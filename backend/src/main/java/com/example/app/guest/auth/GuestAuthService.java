package com.example.app.guest.auth;

import com.example.app.auth.SignupEmailIntent;
import com.example.app.auth.SignupEmailIntentRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.example.app.guest.common.GuestDtos;
import com.example.app.guest.common.GuestMapper;
import com.example.app.guest.model.GuestTenantLinkRepository;
import com.example.app.guest.model.GuestUser;
import com.example.app.guest.model.GuestUserRepository;
import com.example.app.guest.tenant.GuestTenantService;
import jakarta.mail.internet.MimeMessage;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.Locale;
import java.util.Map;
import java.security.SecureRandom;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class GuestAuthService {
    private static final long SIGNUP_CODE_TTL_MINUTES = 15;
    private static final int INTENT_TOKEN_BYTES = 32;
    private final GuestUserRepository guestUsers;
    private final GuestPasswordService passwords;
    private final GuestTokenService tokens;
    private final GuestTenantService tenantService;
    private final GuestSocialTokenVerifier socialTokenVerifier;
    private final SignupEmailIntentRepository signupEmailIntents;
    private final ObjectMapper objectMapper;
    private final JavaMailSender mailSender;
    private final String mailFrom;
    private final boolean mailConfigured;
    private final SecureRandom secureRandom = new SecureRandom();

    public GuestAuthService(
            GuestUserRepository guestUsers,
            GuestPasswordService passwords,
            GuestTokenService tokens,
            GuestTenantService tenantService,
            GuestSocialTokenVerifier socialTokenVerifier,
            SignupEmailIntentRepository signupEmailIntents,
            ObjectMapper objectMapper,
            @Autowired(required = false) JavaMailSender mailSender,
            @Value("${app.mail.from:}") String mailFrom,
            @Value("${spring.mail.host:}") String mailHost,
            @Value("${spring.mail.username:}") String mailUsername
    ) {
        this.guestUsers = guestUsers;
        this.passwords = passwords;
        this.tokens = tokens;
        this.tenantService = tenantService;
        this.socialTokenVerifier = socialTokenVerifier;
        this.signupEmailIntents = signupEmailIntents;
        this.objectMapper = objectMapper;
        this.mailSender = mailSender;
        this.mailFrom = mailFrom == null ? "" : mailFrom;
        this.mailConfigured = mailSender != null
                && mailHost != null && !mailHost.isBlank()
                && mailUsername != null && !mailUsername.isBlank();
    }

    private record PendingGuestSignupPayload(
            String email,
            String passwordHash,
            String firstName,
            String lastName,
            String phone,
            String language,
            String code
    ) {}

    @Transactional
    public GuestDtos.GuestSessionResponse signup(GuestDtos.SignupRequest request) {
        String email = normalizeEmail(request.email());
        if (email == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Email is required.");
        if (guestUsers.existsByEmailIgnoreCase(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A guest account with this email already exists.");
        }
        GuestUser guestUser = new GuestUser();
        guestUser.setEmail(email);
        guestUser.setPasswordHash(passwords.hash(request.password()));
        guestUser.setFirstName(requiredName(request.firstName(), "First name is required."));
        guestUser.setLastName(requiredName(request.lastName(), "Last name is required."));
        guestUser.setPhone(blankToNull(request.phone()));
        guestUser.setLanguage(blankToDefault(request.language(), "sl"));
        guestUser.setActive(true);
        guestUser.setLastLoginAt(Instant.now());
        guestUser = guestUsers.save(guestUser);
        return session(guestUser);
    }

    @Transactional
    public GuestDtos.SignupChallengeResponse signupStart(GuestDtos.SignupStartRequest request) {
        String email = normalizeEmail(request.email());
        if (email == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Email is required.");
        if (guestUsers.existsByEmailIgnoreCase(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A guest account with this email already exists.");
        }

        deactivateIntentsForEmail(email);

        String challengeId = generateIntentToken();
        String code = generateCode();
        Instant expiresAt = Instant.now().plus(SIGNUP_CODE_TTL_MINUTES, ChronoUnit.MINUTES);
        PendingGuestSignupPayload payload = new PendingGuestSignupPayload(
                email,
                passwords.hash(request.password()),
                request.firstName(),
                request.lastName(),
                request.phone(),
                request.language(),
                code
        );

        SignupEmailIntent intent = new SignupEmailIntent();
        intent.setToken(challengeId);
        intent.setEmail(email);
        intent.setPayloadJson(writePayload(payload));
        intent.setExpiresAt(expiresAt);
        intent.setActive(true);
        signupEmailIntents.save(intent);

        sendSignupCodeEmail(email, code);
        return new GuestDtos.SignupChallengeResponse(challengeId, email, expiresAt.toString());
    }

    @Transactional
    public GuestDtos.GuestSessionResponse verifySignupCode(GuestDtos.VerifySignupCodeRequest request) {
        String challengeId = request == null ? null : blankToNull(request.challengeId());
        String submittedCode = request == null ? null : blankToNull(request.code());
        if (challengeId == null || submittedCode == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Challenge and code are required.");
        }
        SignupEmailIntent intent = signupEmailIntents.findByTokenAndActiveTrue(challengeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Signup challenge is not valid."));
        if (intent.getExpiresAt() == null || intent.getExpiresAt().isBefore(Instant.now())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Signup code expired.");
        }

        PendingGuestSignupPayload payload = parsePayload(intent.getPayloadJson());
        if (!submittedCode.equals(payload.code())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid signup verification code.");
        }
        if (guestUsers.existsByEmailIgnoreCase(payload.email())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A guest account with this email already exists.");
        }

        GuestUser guestUser = new GuestUser();
        guestUser.setEmail(payload.email());
        guestUser.setPasswordHash(requiredPasswordHash(payload));
        guestUser.setFirstName(requiredName(payload.firstName(), "First name is required."));
        guestUser.setLastName(requiredName(payload.lastName(), "Last name is required."));
        guestUser.setPhone(blankToNull(payload.phone()));
        guestUser.setLanguage(blankToDefault(payload.language(), "sl"));
        guestUser.setActive(true);
        guestUser.setEmailVerified(true);
        guestUser.setLastLoginAt(Instant.now());
        guestUser = guestUsers.save(guestUser);

        deactivateIntentsForEmail(payload.email());
        return session(guestUser);
    }

    @Transactional
    public GuestDtos.SignupChallengeResponse resendSignupCode(GuestDtos.ResendSignupCodeRequest request) {
        String challengeId = request == null ? null : blankToNull(request.challengeId());
        if (challengeId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Challenge is required.");
        }
        SignupEmailIntent intent = signupEmailIntents.findByTokenAndActiveTrue(challengeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Signup challenge is not valid."));

        PendingGuestSignupPayload oldPayload = parsePayload(intent.getPayloadJson());
        String code = generateCode();
        Instant expiresAt = Instant.now().plus(SIGNUP_CODE_TTL_MINUTES, ChronoUnit.MINUTES);
        PendingGuestSignupPayload refreshed = new PendingGuestSignupPayload(
                oldPayload.email(),
                requiredPasswordHash(oldPayload),
                oldPayload.firstName(),
                oldPayload.lastName(),
                oldPayload.phone(),
                oldPayload.language(),
                code
        );
        intent.setPayloadJson(writePayload(refreshed));
        intent.setExpiresAt(expiresAt);
        intent.setActive(true);
        signupEmailIntents.save(intent);
        sendSignupCodeEmail(oldPayload.email(), code);
        return new GuestDtos.SignupChallengeResponse(intent.getToken(), oldPayload.email(), expiresAt.toString());
    }

    @Transactional
    public GuestDtos.GuestSessionResponse login(GuestDtos.LoginRequest request) {
        String email = normalizeEmail(request.email());
        GuestUser guestUser = guestUsers.findByEmailIgnoreCase(email)
                .filter(GuestUser::isActive)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid guest credentials."));
        if (!passwords.matches(request.password(), guestUser.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid guest credentials.");
        }
        guestUser.setLastLoginAt(Instant.now());
        guestUser = guestUsers.save(guestUser);
        return session(guestUser);
    }

    @Transactional
    public GuestDtos.GuestSessionResponse loginWithGoogle(String idToken) {
        GuestSocialTokenVerifier.SocialClaims claims = socialTokenVerifier.verifyGoogleIdToken(idToken);
        GuestUser guestUser = guestUsers.findByGoogleSubject(claims.subject())
                .orElseGet(() -> guestUsers.findByEmailIgnoreCase(normalizeEmail(claims.email())).orElseGet(GuestUser::new));
        hydrateFromSocial(guestUser, claims.email(), claims.givenName(), claims.familyName(), "sl");
        guestUser.setGoogleSubject(claims.subject());
        guestUser.setLastLoginAt(Instant.now());
        guestUser = guestUsers.save(guestUser);
        return session(guestUser);
    }

    @Transactional
    public GuestDtos.GuestSessionResponse loginWithApple(String idToken) {
        GuestSocialTokenVerifier.SocialClaims claims = socialTokenVerifier.verifyAppleIdToken(idToken);
        GuestUser guestUser = guestUsers.findByAppleSubject(claims.subject())
                .orElseGet(() -> claims.email() == null ? new GuestUser() : guestUsers.findByEmailIgnoreCase(normalizeEmail(claims.email())).orElseGet(GuestUser::new));
        hydrateFromSocial(guestUser, claims.email(), claims.givenName(), claims.familyName(), "sl");
        guestUser.setAppleSubject(claims.subject());
        guestUser.setLastLoginAt(Instant.now());
        guestUser = guestUsers.save(guestUser);
        return session(guestUser);
    }

    @Transactional(readOnly = true)
    public GuestDtos.GuestProfileResponse me(GuestUser guestUser) {
        return new GuestDtos.GuestProfileResponse(GuestMapper.toGuestUser(guestUser), tenantService.linkedTenants(guestUser));
    }

    private GuestDtos.GuestSessionResponse session(GuestUser guestUser) {
        return new GuestDtos.GuestSessionResponse(tokens.issueToken(guestUser.getId()), GuestMapper.toGuestUser(guestUser), tenantService.linkedTenants(guestUser));
    }

    private void hydrateFromSocial(GuestUser guestUser, String email, String firstName, String lastName, String defaultLanguage) {
        String normalizedEmail = normalizeEmail(email);
        if (guestUser.getEmail() == null) guestUser.setEmail(normalizedEmail);
        if (normalizedEmail != null) guestUser.setEmailVerified(true);
        if (guestUser.getFirstName() == null || guestUser.getFirstName().isBlank()) guestUser.setFirstName(firstName == null || firstName.isBlank() ? "Guest" : firstName.trim());
        if (guestUser.getLastName() == null || guestUser.getLastName().isBlank()) guestUser.setLastName(lastName == null || lastName.isBlank() ? "User" : lastName.trim());
        if (guestUser.getLanguage() == null || guestUser.getLanguage().isBlank()) guestUser.setLanguage(defaultLanguage);
        guestUser.setActive(true);
    }

    private static String requiredName(String value, String message) {
        if (value == null || value.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
        return value.trim();
    }

    private static String normalizeEmail(String value) {
        return value == null || value.isBlank() ? null : value.trim().toLowerCase(Locale.ROOT);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String blankToDefault(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private void deactivateIntentsForEmail(String email) {
        for (SignupEmailIntent row : signupEmailIntents.findAllByEmailIgnoreCaseAndActiveTrue(email)) {
            row.setActive(false);
            signupEmailIntents.save(row);
        }
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

    private PendingGuestSignupPayload parsePayload(String raw) {
        try {
            Map<String, Object> map = objectMapper.readValue(raw, new TypeReference<>() {});
            String passwordHash = blankToNull(stringValue(map, "passwordHash"));
            if (passwordHash == null) {
                String legacyRawPassword = blankToNull(stringValue(map, "password"));
                if (legacyRawPassword != null) {
                    // Backward-compatible read for already-created, short-lived signup challenges.
                    // New and refreshed challenges only persist passwordHash and never raw passwords.
                    passwordHash = passwords.hash(legacyRawPassword);
                }
            }
            return new PendingGuestSignupPayload(
                    normalizeEmail(stringValue(map, "email")),
                    passwordHash,
                    stringValue(map, "firstName"),
                    stringValue(map, "lastName"),
                    stringValue(map, "phone"),
                    stringValue(map, "language"),
                    blankToNull(stringValue(map, "code"))
            );
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Signup challenge payload is invalid.");
        }
    }

    private String requiredPasswordHash(PendingGuestSignupPayload payload) {
        String passwordHash = payload == null ? null : blankToNull(payload.passwordHash());
        if (passwordHash == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Signup challenge payload is invalid.");
        }
        return passwordHash;
    }

    private static String stringValue(Map<String, Object> values, String key) {
        if (values == null) return null;
        Object value = values.get(key);
        return value == null ? null : String.valueOf(value);
    }

    private String writePayload(PendingGuestSignupPayload payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not persist signup challenge.");
        }
    }

    private void sendSignupCodeEmail(String email, String code) {
        if (!mailConfigured) {
            return;
        }
        String subject = "Your Calendra guest verification code";
        String body = """
                Hello,

                Use this verification code to finish creating your Calendra guest account:

                %s

                This code expires in %d minutes.
                If you did not request this, you can ignore this email.
                """.formatted(code, SIGNUP_CODE_TTL_MINUTES);
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, "UTF-8");
            helper.setFrom(mailFrom);
            helper.setTo(email);
            helper.setSubject(subject);
            helper.setText(body, false);
            mailSender.send(message);
        } catch (Exception ignored) {
            // Keep API behavior deterministic even when outbound email is unavailable.
        }
    }
}
