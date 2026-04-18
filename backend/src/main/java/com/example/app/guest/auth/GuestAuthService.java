package com.example.app.guest.auth;

import com.example.app.guest.common.GuestDtos;
import com.example.app.guest.common.GuestMapper;
import com.example.app.guest.model.GuestTenantLinkRepository;
import com.example.app.guest.model.GuestUser;
import com.example.app.guest.model.GuestUserRepository;
import com.example.app.guest.tenant.GuestTenantService;
import java.time.Instant;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class GuestAuthService {
    private final GuestUserRepository guestUsers;
    private final GuestPasswordService passwords;
    private final GuestTokenService tokens;
    private final GuestTenantService tenantService;
    private final GuestSocialTokenVerifier socialTokenVerifier;

    public GuestAuthService(
            GuestUserRepository guestUsers,
            GuestPasswordService passwords,
            GuestTokenService tokens,
            GuestTenantService tenantService,
            GuestSocialTokenVerifier socialTokenVerifier
    ) {
        this.guestUsers = guestUsers;
        this.passwords = passwords;
        this.tokens = tokens;
        this.tenantService = tenantService;
        this.socialTokenVerifier = socialTokenVerifier;
    }

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
        if (guestUser.getEmail() == null) guestUser.setEmail(normalizeEmail(email));
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
}
