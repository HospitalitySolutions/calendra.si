package com.example.app.guest.auth;

import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class GuestSocialTokenVerifier {
    private final String googleClientId;
    private final String appleClientId;

    public GuestSocialTokenVerifier(
            @Value("${app.guest.auth.google-client-id:}") String googleClientId,
            @Value("${app.guest.auth.apple-client-id:}") String appleClientId
    ) {
        this.googleClientId = googleClientId == null ? "" : googleClientId.trim();
        this.appleClientId = appleClientId == null ? "" : appleClientId.trim();
    }

    public SocialClaims verifyGoogleIdToken(String idToken) {
        if (googleClientId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Google guest sign-in is not configured.");
        }
        Jwt jwt = decode(idToken, "https://accounts.google.com", List.of(googleClientId));
        return new SocialClaims(
                jwt.getSubject(),
                jwt.getClaimAsString("email"),
                jwt.getClaimAsString("given_name"),
                jwt.getClaimAsString("family_name")
        );
    }

    public SocialClaims verifyAppleIdToken(String idToken) {
        if (appleClientId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Apple guest sign-in is not configured.");
        }
        Jwt jwt = decode(idToken, "https://appleid.apple.com", List.of(appleClientId));
        String email = jwt.getClaimAsString("email");
        return new SocialClaims(
                jwt.getSubject(),
                email,
                jwt.getClaimAsString("given_name"),
                jwt.getClaimAsString("family_name")
        );
    }

    private Jwt decode(String idToken, String issuer, List<String> audiences) {
        try {
            JwtDecoder decoder = NimbusJwtDecoder.withIssuerLocation(issuer).build();
            OAuth2TokenValidator<Jwt> audienceValidator = jwt -> {
                Object aud = jwt.getClaims().get("aud");
                boolean valid = false;
                if (aud instanceof String audStr) {
                    valid = audiences.contains(audStr);
                } else if (aud instanceof java.util.Collection<?> auds) {
                    valid = auds.stream().anyMatch(a -> audiences.contains(String.valueOf(a)));
                }
                return valid
                        ? OAuth2TokenValidatorResult.success()
                        : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "Invalid audience.", null));
            };
            OAuth2TokenValidator<Jwt> validator = new DelegatingOAuth2TokenValidator<>(
                    JwtValidators.createDefaultWithIssuer(issuer),
                    audienceValidator
            );
            if (decoder instanceof NimbusJwtDecoder nimbus) {
                nimbus.setJwtValidator(validator);
            }
            return decoder.decode(idToken);
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid social identity token.");
        }
    }

    public record SocialClaims(String subject, String email, String givenName, String familyName) {}
}
