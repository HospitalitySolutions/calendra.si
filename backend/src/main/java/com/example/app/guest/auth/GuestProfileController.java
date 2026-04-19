package com.example.app.guest.auth;

import com.example.app.guest.common.GuestDtos;
import com.example.app.guest.model.GuestUser;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/guest/profile")
public class GuestProfileController {
    private final GuestAuthContextService authContextService;
    private final GuestProfileService profileService;

    public GuestProfileController(GuestAuthContextService authContextService, GuestProfileService profileService) {
        this.authContextService = authContextService;
        this.profileService = profileService;
    }

    @GetMapping("/settings")
    public GuestDtos.GuestProfileSettingsResponse settings(
            @RequestParam(required = false) String companyId,
            HttpServletRequest request
    ) {
        GuestUser guestUser = authContextService.requireGuest(request);
        return profileService.settings(guestUser, companyId);
    }

    @PutMapping("/settings")
    public GuestDtos.GuestProfileSettingsResponse update(
            @RequestBody GuestDtos.UpdateGuestProfileSettingsRequest updateRequest,
            HttpServletRequest request
    ) {
        GuestUser guestUser = authContextService.requireGuest(request);
        return profileService.update(guestUser, updateRequest);
    }
}
