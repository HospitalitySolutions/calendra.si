package com.example.app.guest.auth;

import com.example.app.guest.common.GuestDtos;
import com.example.app.guest.model.GuestUser;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/guest")
public class GuestAuthController {
    private final GuestAuthService authService;
    private final GuestAuthContextService authContextService;

    public GuestAuthController(GuestAuthService authService, GuestAuthContextService authContextService) {
        this.authService = authService;
        this.authContextService = authContextService;
    }

    @PostMapping("/auth/signup")
    public GuestDtos.GuestSessionResponse signup(@RequestBody GuestDtos.SignupRequest request) {
        return authService.signup(request);
    }

    @PostMapping("/auth/login")
    public GuestDtos.GuestSessionResponse login(@RequestBody GuestDtos.LoginRequest request) {
        return authService.login(request);
    }

    @PostMapping("/auth/google/token")
    public GuestDtos.GuestSessionResponse google(@RequestBody GuestDtos.SocialTokenRequest request) {
        return authService.loginWithGoogle(request.idToken());
    }

    @PostMapping("/auth/apple/token")
    public GuestDtos.GuestSessionResponse apple(@RequestBody GuestDtos.SocialTokenRequest request) {
        return authService.loginWithApple(request.idToken());
    }

    @GetMapping("/me")
    public GuestDtos.GuestProfileResponse me(HttpServletRequest request) {
        GuestUser guestUser = authContextService.requireGuest(request);
        return authService.me(guestUser);
    }
}
