package com.example.app.guest.auth;

import com.example.app.guest.common.GuestDtos;
import com.example.app.guest.model.GuestUser;
import com.example.app.security.ratelimit.AuthRateLimiter;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/guest")
public class GuestAuthController {
    private final GuestAuthService authService;
    private final GuestAuthContextService authContextService;
    private final AuthRateLimiter authRateLimiter;
    private final GuestPasswordResetService passwordResetService;
    private final GuestAccountDeletionService accountDeletionService;

    public GuestAuthController(
            GuestAuthService authService,
            GuestAuthContextService authContextService,
            AuthRateLimiter authRateLimiter,
            GuestPasswordResetService passwordResetService,
            GuestAccountDeletionService accountDeletionService
    ) {
        this.authService = authService;
        this.authContextService = authContextService;
        this.authRateLimiter = authRateLimiter;
        this.passwordResetService = passwordResetService;
        this.accountDeletionService = accountDeletionService;
    }

    @PostMapping("/auth/signup")
    public GuestDtos.GuestSessionResponse signup(@RequestBody GuestDtos.SignupRequest request, HttpServletRequest httpRequest) {
        authRateLimiter.checkGuestSignup(httpRequest, request.email());
        return authService.signup(request);
    }

    @PostMapping("/auth/signup/start")
    public GuestDtos.SignupChallengeResponse signupStart(@RequestBody GuestDtos.SignupStartRequest request, HttpServletRequest httpRequest) {
        authRateLimiter.checkGuestSignup(httpRequest, request.email());
        return authService.signupStart(request);
    }

    @PostMapping("/auth/signup/verify-code")
    public GuestDtos.GuestSessionResponse verifySignupCode(@RequestBody GuestDtos.VerifySignupCodeRequest request, HttpServletRequest httpRequest) {
        authRateLimiter.checkGuestSignup(httpRequest, request.challengeId());
        return authService.verifySignupCode(request);
    }

    @PostMapping("/auth/signup/resend-code")
    public GuestDtos.SignupChallengeResponse resendSignupCode(@RequestBody GuestDtos.ResendSignupCodeRequest request, HttpServletRequest httpRequest) {
        authRateLimiter.checkGuestSignup(httpRequest, request.challengeId());
        return authService.resendSignupCode(request);
    }


    @PostMapping("/auth/forgot-password")
    public java.util.Map<String, String> forgotPassword(@RequestBody GuestDtos.GuestForgotPasswordRequest request, HttpServletRequest httpRequest) {
        String email = request == null ? null : request.email();
        authRateLimiter.checkPasswordReset(httpRequest, email);
        String locale = request == null ? null : (request.locale() != null ? request.locale() : request.language());
        // Keep the response identical for existing and non-existing emails to avoid account enumeration.
        passwordResetService.requestReset(email, locale);
        return java.util.Map.of("message", "If this email exists, a verification code has been sent.");
    }

    @PostMapping("/auth/forgot-password/verify-code")
    public GuestDtos.GuestPasswordResetCodeResponse verifyForgotPasswordCode(@RequestBody GuestDtos.GuestVerifyPasswordResetCodeRequest request, HttpServletRequest httpRequest) {
        String email = request == null ? null : request.email();
        authRateLimiter.checkPasswordReset(httpRequest, email);
        String code = request == null ? null : request.code();
        GuestPasswordResetService.VerifiedResetSession session = passwordResetService.verifyCode(email, code)
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "Invalid or expired verification code."));
        return new GuestDtos.GuestPasswordResetCodeResponse(true, session.email(), session.resetToken());
    }

    @GetMapping("/auth/reset-password/validate")
    public GuestDtos.GuestResetPasswordValidateResponse validateResetPasswordToken(@RequestParam("token") String token) {
        return passwordResetService.findEmailForUsableResetToken(token)
                .map(email -> new GuestDtos.GuestResetPasswordValidateResponse(true, email))
                .orElseGet(() -> new GuestDtos.GuestResetPasswordValidateResponse(false, null));
    }

    @PostMapping("/auth/reset-password")
    public java.util.Map<String, String> resetPassword(@RequestBody GuestDtos.GuestResetPasswordRequest request) {
        String passwordValidationMessage = validatePasswordStrength(request == null ? null : request.password());
        if (passwordValidationMessage != null) {
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, passwordValidationMessage);
        }
        String token = request == null ? null : request.token();
        String password = request == null ? null : request.password();
        boolean ok = passwordResetService.resetPassword(token, password);
        if (!ok) {
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "Invalid or expired reset session.");
        }
        return java.util.Map.of("message", "Password has been reset.");
    }

    @PostMapping("/auth/login")
    public GuestDtos.GuestSessionResponse login(@RequestBody GuestDtos.LoginRequest request, HttpServletRequest httpRequest) {
        authRateLimiter.checkGuestLogin(httpRequest, request.email());
        return authService.login(request);
    }

    @PostMapping("/auth/google/token")
    public GuestDtos.GuestSessionResponse google(@RequestBody GuestDtos.SocialTokenRequest request, HttpServletRequest httpRequest) {
        authRateLimiter.checkGuestSocialLogin(httpRequest);
        return authService.loginWithGoogle(request.idToken());
    }

    @PostMapping("/auth/apple/token")
    public GuestDtos.GuestSessionResponse apple(@RequestBody GuestDtos.SocialTokenRequest request, HttpServletRequest httpRequest) {
        authRateLimiter.checkGuestSocialLogin(httpRequest);
        return authService.loginWithApple(request.idToken());
    }

    @GetMapping("/me")
    public GuestDtos.GuestProfileResponse me(HttpServletRequest request) {
        GuestUser guestUser = authContextService.requireGuest(request);
        return authService.me(guestUser);
    }

    @PostMapping("/account/delete")
    public GuestDtos.DeleteGuestAccountResponse deleteAccount(
            @RequestBody(required = false) GuestDtos.DeleteGuestAccountRequest request,
            HttpServletRequest httpRequest
    ) {
        GuestUser guestUser = authContextService.requireGuest(httpRequest);
        boolean confirmed = request != null && Boolean.TRUE.equals(request.confirm());
        accountDeletionService.deleteGuestAccount(guestUser, confirmed);
        return new GuestDtos.DeleteGuestAccountResponse(true);
    }

    private static String validatePasswordStrength(String password) {
        if (password == null || password.length() < 8) {
            return "Password must contain at least 8 characters.";
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
}
