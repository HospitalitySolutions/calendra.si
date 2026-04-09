package com.example.app.mfa;

import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.security.JwtService;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.yubico.webauthn.AssertionRequest;
import com.yubico.webauthn.AssertionResult;
import com.yubico.webauthn.FinishAssertionOptions;
import com.yubico.webauthn.FinishRegistrationOptions;
import com.yubico.webauthn.RegisteredCredential;
import com.yubico.webauthn.RegistrationResult;
import com.yubico.webauthn.RelyingParty;
import com.yubico.webauthn.StartAssertionOptions;
import com.yubico.webauthn.StartRegistrationOptions;
import com.yubico.webauthn.exception.AssertionFailedException;
import com.yubico.webauthn.exception.RegistrationFailedException;
import com.yubico.webauthn.data.AuthenticatorAssertionResponse;
import com.yubico.webauthn.data.AuthenticatorAttestationResponse;
import com.yubico.webauthn.data.ByteArray;
import com.yubico.webauthn.data.ClientAssertionExtensionOutputs;
import com.yubico.webauthn.data.ClientRegistrationExtensionOutputs;
import com.yubico.webauthn.data.PublicKeyCredential;
import com.yubico.webauthn.data.PublicKeyCredentialCreationOptions;
import com.yubico.webauthn.data.RelyingPartyIdentity;
import com.yubico.webauthn.data.UserIdentity;
import com.yubico.webauthn.data.AuthenticatorTransport;
import com.yubico.webauthn.data.exception.Base64UrlException;
import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.net.URI;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.SortedSet;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class WebAuthnService {

    public record PrimaryLoginResult(boolean mfaRequired, String pendingToken) {}
    public record RegistrationStartResult(String pendingToken, JsonNode publicKey) {}
    public record RegistrationFinishResult(List<String> recoveryCodes) {}
    public record StatusResult(boolean webauthnEnabled, int recoveryCodesRemaining, List<Map<String, Object>> credentials) {}

    private static final int RECOVERY_CODE_COUNT = 10;

    private final WebAuthnCredentialRepository credentialRepository;
    private final RecoveryCodeRepository recoveryCodeRepository;
    private final UserRepository userRepository;
    private final WebAuthnUserCredentialRepository webAuthnUserCredentialRepository;
    private final PasswordEncoder passwordEncoder;
    private final ObjectMapper objectMapper;
    private final JwtService jwtService;
    private final AppSettingRepository settings;
    private final SecureRandom secureRandom = new SecureRandom();
    private final String frontendUrl;
    private final String configuredRpId;
    private final String configuredRpName;
    private final String configuredOrigins;

    private RelyingParty relyingParty;

    public WebAuthnService(
            WebAuthnCredentialRepository credentialRepository,
            RecoveryCodeRepository recoveryCodeRepository,
            UserRepository userRepository,
            WebAuthnUserCredentialRepository webAuthnUserCredentialRepository,
            PasswordEncoder passwordEncoder,
            ObjectMapper objectMapper,
            JwtService jwtService,
            AppSettingRepository settings,
            @Value("${app.auth.frontend-url:http://localhost:3000}") String frontendUrl,
            @Value("${app.webauthn.rp-id:}") String configuredRpId,
            @Value("${app.webauthn.rp-name:Calendra}") String configuredRpName,
            @Value("${app.webauthn.allowed-origins:}") String configuredOrigins
    ) {
        this.credentialRepository = credentialRepository;
        this.recoveryCodeRepository = recoveryCodeRepository;
        this.userRepository = userRepository;
        this.webAuthnUserCredentialRepository = webAuthnUserCredentialRepository;
        this.passwordEncoder = passwordEncoder;
        this.objectMapper = objectMapper;
        this.jwtService = jwtService;
        this.settings = settings;
        this.frontendUrl = frontendUrl;
        this.configuredRpId = configuredRpId;
        this.configuredRpName = configuredRpName;
        this.configuredOrigins = configuredOrigins;
    }

    @PostConstruct
    void init() {
        String rpId = configuredRpId == null || configuredRpId.isBlank()
                ? deriveRpId(frontendUrl)
                : configuredRpId.trim();

        Set<String> origins;
        if (configuredOrigins != null && !configuredOrigins.isBlank()) {
            origins = withLocalhostLoopbackTwins(
                    Arrays.stream(configuredOrigins.split(","))
                            .map(String::trim)
                            .filter(value -> !value.isBlank())
                            .collect(Collectors.toCollection(LinkedHashSet::new)));
        } else {
            origins = expandLocalhostOrigins(normalizeOrigin(frontendUrl));
        }

        boolean allowLenientLoopbackPorts =
                !origins.isEmpty() && origins.stream().allMatch(WebAuthnService::isLoopbackOrigin);

        this.relyingParty = RelyingParty.builder()
                .identity(RelyingPartyIdentity.builder()
                        .id(rpId)
                        .name(configuredRpName == null || configuredRpName.isBlank() ? "Calendra" : configuredRpName.trim())
                        .build())
                .credentialRepository(webAuthnUserCredentialRepository)
                .origins(origins)
                .allowOriginPort(allowLenientLoopbackPorts)
                .build();
    }

    public boolean isWebAuthnEnabled(User user) {
        return credentialRepository.existsByUser(user);
    }

    public PrimaryLoginResult startLoginChallenge(User user) {
        if (!isWebAuthnEnabled(user)) {
            return new PrimaryLoginResult(false, null);
        }
        AssertionRequest request = relyingParty.startAssertion(StartAssertionOptions.builder()
                .username(webAuthnUserCredentialRepository.webAuthnUsername(user))
                .build());
        return new PrimaryLoginResult(true, jwtService.generateMfaToken(user.getId(), "login-assertion", uncheckIo(request::toJson)));
    }

    public JsonNode getLoginChallengeOptions(String pendingToken) {
        JwtService.MfaTokenPayload payload = jwtService.parseMfaToken(pendingToken);
        if (!"login-assertion".equals(payload.flow())) {
            throw new IllegalArgumentException("Invalid MFA flow.");
        }
        AssertionRequest request = uncheckIo(() -> AssertionRequest.fromJson(payload.requestJson()));
        return readJsonTree(uncheckIo(request::toCredentialsGetJson));
    }

    @Transactional
    public User finishLoginWithAssertion(String pendingToken, String credentialJson) {
        JwtService.MfaTokenPayload payload = jwtService.parseMfaToken(pendingToken);
        if (!"login-assertion".equals(payload.flow())) {
            throw new IllegalArgumentException("Invalid MFA flow.");
        }
        User user = userRepository.findById(payload.userId())
                .orElseThrow(() -> new IllegalArgumentException("User not found."));

        AssertionRequest request = uncheckIo(() -> AssertionRequest.fromJson(payload.requestJson()));
        PublicKeyCredential<AuthenticatorAssertionResponse, ClientAssertionExtensionOutputs> response =
                uncheckIo(() -> PublicKeyCredential.parseAssertionResponseJson(credentialJson));

        AssertionResult result;
        try {
            result = relyingParty.finishAssertion(FinishAssertionOptions.builder()
                    .request(request)
                    .response(response)
                    .build());
        } catch (AssertionFailedException e) {
            throw new IllegalArgumentException("WebAuthn assertion was not accepted.", e);
        }

        if (!result.isSuccess()) {
            throw new IllegalArgumentException("WebAuthn assertion was not accepted.");
        }

        updateCredentialAfterAssertion(result);
        return user;
    }

    @Transactional
    public User finishLoginWithRecoveryCode(String pendingToken, String recoveryCode) {
        JwtService.MfaTokenPayload payload = jwtService.parseMfaToken(pendingToken);
        if (!"login-assertion".equals(payload.flow())) {
            throw new IllegalArgumentException("Invalid MFA flow.");
        }
        User user = userRepository.findById(payload.userId())
                .orElseThrow(() -> new IllegalArgumentException("User not found."));

        String canonicalCode = canonicalizeRecoveryCode(recoveryCode);
        if (canonicalCode.isBlank()) {
            throw new IllegalArgumentException("Recovery code is required.");
        }

        RecoveryCode match = recoveryCodeRepository.findAllByUserOrderByCreatedAtAsc(user).stream()
                .filter(code -> code.getUsedAt() == null)
                .filter(code -> passwordEncoder.matches(canonicalCode, code.getCodeHash()))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Invalid recovery code."));

        match.setUsedAt(Instant.now());
        recoveryCodeRepository.save(match);
        return user;
    }

    @Transactional
    public RegistrationStartResult startRegistration(User user) {
        ensureUserHandle(user);
        PublicKeyCredentialCreationOptions request = relyingParty.startRegistration(StartRegistrationOptions.builder()
                .user(UserIdentity.builder()
                        .name(webAuthnUserCredentialRepository.webAuthnUsername(user))
                        .displayName(displayNameFor(user))
                        .id(requireByteArrayFromBase64Url(user.getWebauthnUserHandle(), "Invalid WebAuthn user handle"))
                        .build())
                .build());
        String pendingToken = jwtService.generateMfaToken(user.getId(), "register", uncheckIo(request::toJson));
        return new RegistrationStartResult(pendingToken, readJsonTree(uncheckIo(request::toCredentialsCreateJson)));
    }

    @Transactional
    public RegistrationFinishResult finishRegistration(User user, String pendingToken, String credentialJson, String label) {
        JwtService.MfaTokenPayload payload = jwtService.parseMfaToken(pendingToken);
        if (!"register".equals(payload.flow()) || !user.getId().equals(payload.userId())) {
            throw new IllegalArgumentException("Invalid registration token.");
        }

        PublicKeyCredentialCreationOptions request = uncheckIo(() -> PublicKeyCredentialCreationOptions.fromJson(payload.requestJson()));
        PublicKeyCredential<AuthenticatorAttestationResponse, ClientRegistrationExtensionOutputs> response =
                uncheckIo(() -> PublicKeyCredential.parseRegistrationResponseJson(credentialJson));

        RegistrationResult result;
        try {
            result = relyingParty.finishRegistration(FinishRegistrationOptions.builder()
                    .request(request)
                    .response(response)
                    .build());
        } catch (RegistrationFailedException e) {
            throw new IllegalArgumentException(registrationFailureDetail(e), e);
        }

        String credentialId = result.getKeyId().getId().getBase64Url();
        if (credentialRepository.findByCredentialId(credentialId).isPresent()) {
            throw new IllegalArgumentException("This passkey is already registered.");
        }

        WebAuthnCredential credential = new WebAuthnCredential();
        credential.setUser(user);
        credential.setCredentialId(credentialId);
        credential.setPublicKeyCose(result.getPublicKeyCose().getBase64());
        credential.setSignatureCount(result.getSignatureCount());
        credential.setDiscoverable(result.isDiscoverable().orElse(false));
        credential.setBackupEligible(result.isBackupEligible());
        credential.setBackupState(result.isBackedUp());
        credential.setLabel(normalizeCredentialLabel(label, user));
        credential.setTransportsJson(extractTransports(response));
        credentialRepository.save(credential);

        List<String> recoveryCodes = List.of();
        if (recoveryCodeRepository.countByUserAndUsedAtIsNull(user) == 0) {
            recoveryCodes = regenerateRecoveryCodesInternal(user);
        }

        return new RegistrationFinishResult(recoveryCodes);
    }

    @Transactional(readOnly = true)
    public StatusResult getStatus(User user) {
        List<Map<String, Object>> credentials = credentialRepository.findAllByUserOrderByCreatedAtAsc(user).stream()
                .map(credential -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("credentialId", credential.getCredentialId());
                    row.put("label", credential.getLabel());
                    row.put("discoverable", credential.isDiscoverable());
                    row.put("createdAt", credential.getCreatedAt());
                    row.put("lastUsedAt", credential.getLastUsedAt());
                    return row;
                })
                .toList();
        return new StatusResult(!credentials.isEmpty(), (int) recoveryCodeRepository.countByUserAndUsedAtIsNull(user), credentials);
    }

    @Transactional
    public List<String> regenerateRecoveryCodes(User user) {
        if (!credentialRepository.existsByUser(user)) {
            throw new IllegalArgumentException("Register a passkey before generating recovery codes.");
        }
        return regenerateRecoveryCodesInternal(user);
    }

    @Transactional
    public void deleteCredential(User user, String credentialId) {
        credentialRepository.deleteByCredentialIdAndUser(credentialId, user);
    }

    public String packageTypeFor(User user) {
        return settings.findByCompanyIdAndKey(user.getCompany().getId(), SettingKey.SIGNUP_PACKAGE_NAME)
                .map(AppSetting::getValue)
                .map(value -> normalizePackageType(value, "CUSTOM"))
                .orElse("CUSTOM");
    }

    private void updateCredentialAfterAssertion(AssertionResult result) {
        RegisteredCredential registeredCredential = result.getCredential();
        String credentialId = registeredCredential.getCredentialId().getBase64Url();
        credentialRepository.findByCredentialId(credentialId).ifPresent(credential -> {
            credential.setSignatureCount(result.getSignatureCount());
            credential.setBackupState(result.isBackedUp());
            credential.setBackupEligible(result.isBackupEligible());
            credential.setLastUsedAt(Instant.now());
            credentialRepository.save(credential);
        });
    }

    private List<String> regenerateRecoveryCodesInternal(User user) {
        recoveryCodeRepository.deleteAllByUser(user);
        List<String> rawCodes = new ArrayList<>();
        for (int i = 0; i < RECOVERY_CODE_COUNT; i++) {
            String code = generateRecoveryCode();
            RecoveryCode recoveryCode = new RecoveryCode();
            recoveryCode.setUser(user);
            recoveryCode.setCodeHash(passwordEncoder.encode(canonicalizeRecoveryCode(code)));
            recoveryCode.setCodeHint(code.substring(code.length() - 4));
            recoveryCodeRepository.save(recoveryCode);
            rawCodes.add(code);
        }
        return rawCodes;
    }

    private void ensureUserHandle(User user) {
        if (user.getWebauthnUserHandle() != null && !user.getWebauthnUserHandle().isBlank()) {
            return;
        }
        byte[] bytes = new byte[32];
        secureRandom.nextBytes(bytes);
        user.setWebauthnUserHandle(Base64.getUrlEncoder().withoutPadding().encodeToString(bytes));
        userRepository.save(user);
    }

    private String extractTransports(PublicKeyCredential<AuthenticatorAttestationResponse, ClientRegistrationExtensionOutputs> response) {
        try {
            SortedSet<AuthenticatorTransport> transports = response.getResponse().getTransports();
            if (transports == null || transports.isEmpty()) {
                return "[]";
            }
            return objectMapper.writeValueAsString(new ArrayList<>(transports));
        } catch (Exception e) {
            return "[]";
        }
    }

    private static ByteArray requireByteArrayFromBase64Url(String value, String message) {
        try {
            return ByteArray.fromBase64Url(value);
        } catch (Base64UrlException e) {
            throw new IllegalArgumentException(message, e);
        }
    }

    private String displayNameFor(User user) {
        String name = (String.valueOf(user.getFirstName()) + " " + String.valueOf(user.getLastName())).trim();
        return name.isBlank() ? user.getEmail() : name;
    }

    private String normalizeCredentialLabel(String label, User user) {
        String trimmed = label == null ? "" : label.trim();
        if (!trimmed.isBlank()) {
            return trimmed.length() > 255 ? trimmed.substring(0, 255) : trimmed;
        }
        return displayNameFor(user) + " passkey";
    }

    private String generateRecoveryCode() {
        final String alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        StringBuilder out = new StringBuilder(9);
        for (int i = 0; i < 8; i++) {
            if (i == 4) out.append('-');
            out.append(alphabet.charAt(secureRandom.nextInt(alphabet.length())));
        }
        return out.toString();
    }

    private String canonicalizeRecoveryCode(String value) {
        if (value == null) return "";
        return value.replaceAll("[^A-Za-z0-9]", "").toUpperCase(Locale.ROOT);
    }

    private JsonNode readJsonTree(String json) {
        try {
            return objectMapper.readTree(json);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Could not serialize WebAuthn request.", e);
        }
    }

    @FunctionalInterface
    private interface IoCall<T> {
        T get() throws IOException;
    }

    private static <T> T uncheckIo(IoCall<T> call) {
        try {
            return call.get();
        } catch (IOException e) {
            throw new IllegalStateException("WebAuthn data processing failed.", e);
        }
    }

    private String deriveRpId(String url) {
        String host = URI.create(url).getHost();
        if (host == null || host.isBlank()) {
            throw new IllegalStateException("Could not derive WebAuthn RP ID from app.auth.frontend-url.");
        }
        return host;
    }

    private String normalizeOrigin(String url) {
        URI uri = URI.create(url);
        String scheme = uri.getScheme();
        String host = uri.getHost();
        int port = uri.getPort();
        if (scheme == null || host == null) {
            throw new IllegalStateException("Invalid app.auth.frontend-url for WebAuthn origin.");
        }
        String origin = scheme + "://" + host;
        if (port > 0 && port != 80 && port != 443) {
            origin += ":" + port;
        }
        return origin;
    }

    private static Set<String> expandLocalhostOrigins(String primaryOrigin) {
        return withLocalhostLoopbackTwins(Set.of(primaryOrigin));
    }

    private static Set<String> withLocalhostLoopbackTwins(Set<String> origins) {
        Set<String> out = new LinkedHashSet<>(origins);
        for (String o : origins) {
            String twin = localhostOriginTwin(o);
            if (twin != null) {
                out.add(twin);
            }
        }
        return out;
    }

    private static boolean isLoopbackOrigin(String origin) {
        try {
            URI uri = URI.create(origin.endsWith("/") ? origin : origin + "/");
            String host = uri.getHost();
            return host != null && ("127.0.0.1".equals(host) || "localhost".equalsIgnoreCase(host));
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    private static String localhostOriginTwin(String origin) {
        try {
            URI uri = URI.create(origin.endsWith("/") ? origin : origin + "/");
            String scheme = uri.getScheme();
            String host = uri.getHost();
            if (scheme == null || host == null) {
                return null;
            }
            int port = uri.getPort();
            String otherHost = null;
            if ("localhost".equalsIgnoreCase(host)) {
                otherHost = "127.0.0.1";
            } else if ("127.0.0.1".equals(host)) {
                otherHost = "localhost";
            } else {
                return null;
            }
            String twin = scheme + "://" + otherHost;
            if (port > 0 && port != 80 && port != 443) {
                twin += ":" + port;
            }
            return twin;
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static String registrationFailureDetail(RegistrationFailedException e) {
        Throwable c = e.getCause();
        if (c != null && c.getMessage() != null && !c.getMessage().isBlank()) {
            return c.getMessage();
        }
        return "WebAuthn registration was rejected. For local dev, set APP_AUTH_FRONTEND_URL to the same origin as in the browser (including localhost vs 127.0.0.1) and port; optionally set APP_WEBAUTHN_ALLOWED_ORIGINS.";
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
}
