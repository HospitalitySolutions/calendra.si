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

    public GuestAuthController(GuestAuthService authService, GuestAuthContextService authContextService, AuthRateLimiter authRateLimiter) {
        this.authService = authService;
        this.authContextService = authContextService;
        this.authRateLimiter = authRateLimiter;
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
}
