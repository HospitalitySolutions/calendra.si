package com.example.app.securitycenter;

import com.example.app.mfa.WebAuthnService;
import com.example.app.security.AuthCookieService;
import com.example.app.security.JwtService;
import com.example.app.user.User;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/security")
public class SecurityCenterController {

    private final SecurityCenterService securityCenterService;
    private final JwtService jwtService;
    private final AuthCookieService authCookieService;

    public SecurityCenterController(SecurityCenterService securityCenterService, JwtService jwtService, AuthCookieService authCookieService) {
        this.securityCenterService = securityCenterService;
        this.jwtService = jwtService;
        this.authCookieService = authCookieService;
    }

    @GetMapping("/overview")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> overview(Authentication authentication, HttpServletRequest request) {
        User user = requireUser(authentication);
        return ResponseEntity.ok(securityCenterService.getOverview(user, currentSessionId(request)));
    }

    @PostMapping("/reauth")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> reauthenticate(Authentication authentication, HttpServletRequest request, @RequestBody ReauthRequest body) {
        try {
            User user = requireUser(authentication);
            String token = securityCenterService.reauthenticate(user, body.password(), request);
            return ResponseEntity.ok(Map.of(
                    "reauthToken", token,
                    "expiresInSeconds", 600
            ));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("message", ex.getMessage()));
        }
    }

    @PutMapping("/alerts")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> updateAlerts(Authentication authentication,
                                          HttpServletRequest request,
                                          @RequestHeader(value = "X-Reauth-Token", required = false) String reauthToken,
                                          @RequestBody UpdateAlertsRequest body) {
        try {
            User user = requireUser(authentication);
            ResponseEntity<?> reauthFailure = requireReauth(user, reauthToken);
            if (reauthFailure != null) return reauthFailure;
            return ResponseEntity.ok(securityCenterService.updateAlertPreferences(
                    user,
                    body.factorChangeAlertsEnabled(),
                    body.suspiciousSignInAlertsEnabled(),
                    request
            ));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("message", ex.getMessage()));
        }
    }

    @PostMapping("/passkeys/register/start")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> startPasskeyRegistration(Authentication authentication,
                                                      @RequestHeader(value = "X-Reauth-Token", required = false) String reauthToken) {
        try {
            User user = requireUser(authentication);
            ResponseEntity<?> reauthFailure = requireReauth(user, reauthToken);
            if (reauthFailure != null) return reauthFailure;
            WebAuthnService.RegistrationStartResult result = securityCenterService.startPasskeyRegistration(user);
            return ResponseEntity.ok(Map.of(
                    "pendingToken", result.pendingToken(),
                    "publicKey", result.publicKey()
            ));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("message", ex.getMessage()));
        }
    }

    @PostMapping("/passkeys/register/finish")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> finishPasskeyRegistration(Authentication authentication,
                                                       HttpServletRequest request,
                                                       @RequestHeader(value = "X-Reauth-Token", required = false) String reauthToken,
                                                       @RequestBody FinishRegistrationRequest body) {
        try {
            User user = requireUser(authentication);
            ResponseEntity<?> reauthFailure = requireReauth(user, reauthToken);
            if (reauthFailure != null) return reauthFailure;
            WebAuthnService.RegistrationFinishResult result = securityCenterService.finishPasskeyRegistration(
                    user,
                    body.pendingToken(),
                    body.credentialJson(),
                    body.label(),
                    request
            );
            return ResponseEntity.ok(Map.of(
                    "message", "Passkey registered successfully.",
                    "recoveryCodes", result.recoveryCodes()
            ));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", ex.getMessage()));
        }
    }

    @PatchMapping("/passkeys/{credentialId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> renamePasskey(Authentication authentication,
                                           HttpServletRequest request,
                                           @RequestHeader(value = "X-Reauth-Token", required = false) String reauthToken,
                                           @PathVariable String credentialId,
                                           @RequestBody RenamePasskeyRequest body) {
        try {
            User user = requireUser(authentication);
            ResponseEntity<?> reauthFailure = requireReauth(user, reauthToken);
            if (reauthFailure != null) return reauthFailure;
            securityCenterService.renamePasskey(user, credentialId, body.label(), request);
            return ResponseEntity.ok(Map.of("message", "Passkey renamed."));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", ex.getMessage()));
        }
    }

    @DeleteMapping("/passkeys/{credentialId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> removePasskey(Authentication authentication,
                                           HttpServletRequest request,
                                           @RequestHeader(value = "X-Reauth-Token", required = false) String reauthToken,
                                           @PathVariable String credentialId) {
        try {
            User user = requireUser(authentication);
            ResponseEntity<?> reauthFailure = requireReauth(user, reauthToken);
            if (reauthFailure != null) return reauthFailure;
            securityCenterService.removePasskey(user, credentialId, request);
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", ex.getMessage()));
        }
    }

    @PostMapping("/recovery/regenerate")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> regenerateRecoveryCodes(Authentication authentication,
                                                     HttpServletRequest request,
                                                     @RequestHeader(value = "X-Reauth-Token", required = false) String reauthToken) {
        try {
            User user = requireUser(authentication);
            ResponseEntity<?> reauthFailure = requireReauth(user, reauthToken);
            if (reauthFailure != null) return reauthFailure;
            List<String> recoveryCodes = securityCenterService.regenerateRecoveryCodes(user, request);
            return ResponseEntity.ok(Map.of("recoveryCodes", recoveryCodes));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", ex.getMessage()));
        }
    }

    @DeleteMapping("/sessions/{sessionKey}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> revokeSession(Authentication authentication,
                                           HttpServletRequest request,
                                           @RequestHeader(value = "X-Reauth-Token", required = false) String reauthToken,
                                           @PathVariable String sessionKey) {
        try {
            User user = requireUser(authentication);
            ResponseEntity<?> reauthFailure = requireReauth(user, reauthToken);
            if (reauthFailure != null) return reauthFailure;
            securityCenterService.revokeSession(user, sessionKey, request);
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", ex.getMessage()));
        }
    }

    @PostMapping("/sessions/revoke-others")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> revokeOtherSessions(Authentication authentication,
                                                 HttpServletRequest request,
                                                 @RequestHeader(value = "X-Reauth-Token", required = false) String reauthToken) {
        try {
            User user = requireUser(authentication);
            ResponseEntity<?> reauthFailure = requireReauth(user, reauthToken);
            if (reauthFailure != null) return reauthFailure;
            securityCenterService.revokeOtherSessions(user, currentSessionId(request), request);
            return ResponseEntity.ok(Map.of("message", "Other sessions revoked."));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", ex.getMessage()));
        }
    }

    private User requireUser(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof User user)) {
            throw new IllegalStateException("Not authenticated.");
        }
        return user;
    }

    private ResponseEntity<?> requireReauth(User user, String reauthToken) {
        try {
            securityCenterService.requireRecentReauth(user, reauthToken);
            return null;
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("message", ex.getMessage()));
        }
    }

    private String currentSessionId(HttpServletRequest request) {
        String token = authCookieService.resolveTokenFromHeaderOrCookie(request);
        if (token == null || token.isBlank()) {
            return null;
        }
        try {
            return jwtService.extractSessionId(token);
        } catch (Exception ex) {
            return null;
        }
    }

    public record ReauthRequest(@NotBlank String password) {}
    public record UpdateAlertsRequest(boolean factorChangeAlertsEnabled, boolean suspiciousSignInAlertsEnabled) {}
    public record FinishRegistrationRequest(@NotBlank String pendingToken, @NotBlank String credentialJson, String label) {}
    public record RenamePasskeyRequest(@NotBlank String label) {}
}
