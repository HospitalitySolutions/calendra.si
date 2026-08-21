package com.example.app.auth;

import com.example.app.admin.TenantPresenceService;
import com.example.app.user.User;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthPresenceController {
    private final TenantPresenceService tenantPresenceService;

    public AuthPresenceController(TenantPresenceService tenantPresenceService) {
        this.tenantPresenceService = tenantPresenceService;
    }

    @PostMapping("/presence")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> presence(@AuthenticationPrincipal User user) {
        tenantPresenceService.markActive(user);
        return ResponseEntity.noContent().build();
    }
}
