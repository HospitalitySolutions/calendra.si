package com.example.app.guest.auth;

import com.example.app.guest.model.GuestUser;
import com.example.app.guest.model.GuestUserRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class GuestAuthContextService {
    private final GuestTokenService guestTokenService;
    private final GuestUserRepository guestUsers;

    public GuestAuthContextService(GuestTokenService guestTokenService, GuestUserRepository guestUsers) {
        this.guestTokenService = guestTokenService;
        this.guestUsers = guestUsers;
    }

    public GuestUser requireGuest(HttpServletRequest request) {
        String auth = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (auth == null || !auth.startsWith("Bearer ")) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Guest authentication required.");
        }
        String token = auth.substring("Bearer ".length()).trim();
        try {
            Long guestUserId = guestTokenService.parseGuestUserId(token);
            return guestUsers.findById(guestUserId)
                    .filter(GuestUser::isActive)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Guest session not found."));
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid guest session.");
        }
    }
}
