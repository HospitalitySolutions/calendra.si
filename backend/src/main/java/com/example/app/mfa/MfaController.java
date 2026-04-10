package com.example.app.mfa;

import com.example.app.security.JwtService;
import com.example.app.securitycenter.SecurityCenterService;
import com.example.app.user.User;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@RestController
@RequestMapping("/api/auth/mfa")
@CrossOrigin(origins = "*")
public class MfaController {

    private static final Logger log = LoggerFactory.getLogger(MfaController.class);

    private final WebAuthnService webAuthnService;
    private final JwtService jwtService;
    private final SecurityCenterService securityCenterService;

    public MfaController(WebAuthnService webAuthnService, JwtService jwtService, SecurityCenterService securityCenterService) {
        this.webAuthnService = webAuthnService;
        this.jwtService = jwtService;
        this.securityCenterService = securityCenterService;
    }

    @GetMapping("/status")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> status(Authentication authentication) {
        User user = requireUser(authentication);
        WebAuthnService.StatusResult status = webAuthnService.getStatus(user);
        return ResponseEntity.ok(Map.of(
                "webauthnEnabled", status.webauthnEnabled(),
                "recoveryCodesRemaining", status.recoveryCodesRemaining(),
                "credentials", status.credentials()
        ));
    }

    @PostMapping("/webauthn/register/start")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> startRegistration(Authentication authentication) {
        User user = requireUser(authentication);
        WebAuthnService.RegistrationStartResult result = webAuthnService.startRegistration(user);
        return ResponseEntity.ok(Map.of(
                "pendingToken", result.pendingToken(),
                "publicKey", result.publicKey()
        ));
    }

    @PostMapping("/webauthn/register/finish")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> finishRegistration(Authentication authentication, @RequestBody FinishRegistrationRequest request) {
        try {
            User user = requireUser(authentication);
            WebAuthnService.RegistrationFinishResult result = webAuthnService.finishRegistration(user, request.pendingToken(), request.credentialJson(), request.label());
            return ResponseEntity.ok(Map.of(
                    "message", "Passkey registered successfully.",
                    "recoveryCodes", result.recoveryCodes()
            ));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", ex.getMessage()));
        } catch (IllegalStateException ex) {
            log.warn("Passkey registration failed: {}", ex.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", ex.getMessage()));
        } catch (Exception ex) {
            log.warn("Passkey registration failed", ex);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", "Passkey registration failed."));
        }
    }

    @PostMapping("/webauthn/options")
    public ResponseEntity<?> loginOptions(@RequestBody PendingTokenRequest request) {
        try {
            return ResponseEntity.ok(Map.of("publicKey", webAuthnService.getLoginChallengeOptions(request.pendingToken())));
        } catch (Exception ex) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", "The sign-in challenge is invalid or expired."));
        }
    }

    @PostMapping("/webauthn/verify")
    public ResponseEntity<?> verifyAssertion(@RequestBody VerifyAssertionRequest request, HttpServletRequest httpRequest) {
        try {
            User user = webAuthnService.finishLoginWithAssertion(request.pendingToken(), request.credentialJson());
            return ResponseEntity.ok(authResponse(user, httpRequest));
        } catch (Exception ex) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("message", "Passkey verification failed."));
        }
    }

    @PostMapping("/recovery/verify")
    public ResponseEntity<?> verifyRecoveryCode(@RequestBody VerifyRecoveryCodeRequest request, HttpServletRequest httpRequest) {
        try {
            User user = webAuthnService.finishLoginWithRecoveryCode(request.pendingToken(), request.code());
            return ResponseEntity.ok(authResponse(user, httpRequest));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("message", ex.getMessage()));
        }
    }

    @PostMapping("/recovery/regenerate")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> regenerateRecoveryCodes(Authentication authentication) {
        try {
            User user = requireUser(authentication);
            List<String> recoveryCodes = webAuthnService.regenerateRecoveryCodes(user);
            return ResponseEntity.ok(Map.of("recoveryCodes", recoveryCodes));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", ex.getMessage()));
        }
    }

    @DeleteMapping("/webauthn/credentials/{credentialId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> deleteCredential(Authentication authentication, @PathVariable String credentialId) {
        User user = requireUser(authentication);
        webAuthnService.deleteCredential(user, credentialId);
        return ResponseEntity.noContent().build();
    }

    private Map<String, Object> authResponse(User user, HttpServletRequest request) {
        String token = securityCenterService.issueSession(user, request, "Passkey sign-in").token();
        return Map.of(
                "token", token,
                "user", Map.of(
                        "id", user.getId(),
                        "firstName", user.getFirstName(),
                        "lastName", user.getLastName(),
                        "email", user.getEmail(),
                        "role", user.getRole().name(),
                        "companyId", user.getCompany().getId(),
                        "packageType", webAuthnService.packageTypeFor(user)
                )
        );
    }

    private User requireUser(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof User user)) {
            throw new IllegalStateException("Not authenticated.");
        }
        return user;
    }

    public record PendingTokenRequest(@NotBlank String pendingToken) {}
    public record FinishRegistrationRequest(@NotBlank String pendingToken, @NotBlank String credentialJson, String label) {}
    public record VerifyAssertionRequest(@NotBlank String pendingToken, @NotBlank String credentialJson) {}
    public record VerifyRecoveryCodeRequest(@NotBlank String pendingToken, @NotBlank String code) {}
}
