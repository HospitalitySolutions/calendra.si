package com.example.app.guest.auth;

import java.util.Arrays;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
    private static final Logger log = LoggerFactory.getLogger(GuestSocialTokenVerifier.class);

    private final List<String> googleClientIds;
    private final String appleClientId;

    public GuestSocialTokenVerifier(
            @Value("${app.guest.auth.google-client-ids:${app.guest.auth.google-client-id:}}") String googleClientIds,
            @Value("${app.guest.auth.google-android-client-id:}") String googleAndroidClientId,
            @Value("${app.guest.auth.google-ios-client-id:}") String googleIosClientId,
            @Value("${app.guest.auth.apple-client-id:}") String appleClientId
    ) {
        this.googleClientIds = parseClientIds(String.join(",",
                nullToBlank(googleClientIds),
                nullToBlank(googleAndroidClientId),
                nullToBlank(googleIosClientId)
        ));
        this.appleClientId = appleClientId == null ? "" : appleClientId.trim();
    }

    public SocialClaims verifyGoogleIdToken(String idToken) {
        if (googleClientIds.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Google guest sign-in is not configured.");
        }
        Jwt jwt = decode(idToken, "https://accounts.google.com", googleClientIds);
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

    private static List<String> parseClientIds(String configuredClientIds) {
        if (configuredClientIds == null || configuredClientIds.isBlank()) {
            return List.of();
        }
        return Arrays.stream(configuredClientIds.split("[,;\\s]+"))
                .map(String::trim)
                .filter(value -> !value.isBlank())
                .distinct()
                .toList();
    }

    private static String nullToBlank(String value) {
        return value == null ? "" : value.trim();
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
            log.warn("Failed to verify guest social identity token for issuer {} and audiences {}: {}", issuer, audiences, ex.getMessage());
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid social identity token.");
        }
    }

    public record SocialClaims(String subject, String email, String givenName, String familyName) {}
}
