package com.example.app.auth;

import com.example.app.security.JwtService;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.List;

/**
 * After successful Google OAuth2 login, find or create the user, generate JWT, and redirect to frontend with token.
 */
@Component
public class GoogleOAuth2SuccessHandler extends SimpleUrlAuthenticationSuccessHandler {
    private static final Logger log = LoggerFactory.getLogger(GoogleOAuth2SuccessHandler.class);

    private final UserRepository userRepository;
    private final JwtService jwtService;

    public GoogleOAuth2SuccessHandler(UserRepository userRepository, JwtService jwtService) {
        this.userRepository = userRepository;
        this.jwtService = jwtService;
    }

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response,
                                        Authentication authentication) throws IOException {
        OAuth2User oauth2User = (OAuth2User) authentication.getPrincipal();
        String email = extractEmail(oauth2User);
        String firstName = extractFirstName(oauth2User);
        String lastName = extractLastName(oauth2User);

        log.info("Google OAuth success callback reached. email={}, firstName={}, lastName={}", email, firstName, lastName);

        if (email == null || email.isBlank()) {
            log.warn("Google OAuth success rejected: provider did not return email.");
            redirectWithError(response, "Google did not provide an email address.");
            return;
        }

        String normalizedEmail = email.trim().toLowerCase();
        List<User> candidates = userRepository.findAllByEmailIgnoreCase(normalizedEmail);
        log.info("Google OAuth user lookup. normalizedEmail={}, matches={}", normalizedEmail, candidates.size());
        User user = candidates.isEmpty() ? null : candidates.get(0);

        if (user == null) {
            log.warn("Google OAuth success rejected: no local account for email={}", normalizedEmail);
            redirectWithError(response, "No account exists for this email. Please sign up first or contact your administrator.");
            return;
        }

        if (!user.isActive()) {
            log.warn("Google OAuth success rejected: user inactive for email={}", normalizedEmail);
            redirectWithError(response, "Your account is disabled.");
            return;
        }

        String token = jwtService.generateToken(user.getId());
        log.info("Google OAuth token generated for userId={}", user.getId());
        String redirectUrl = "/oauth-callback?token=" + token;
        log.info("Google OAuth redirecting to frontend callback path={}", redirectUrl);
        getRedirectStrategy().sendRedirect(request, response, redirectUrl);
    }

    private String extractEmail(OAuth2User oauth2User) {
        String email = oauth2User.getAttribute("email");
        if (email != null) return email;
        return (String) oauth2User.getAttributes().get("email");
    }

    private String extractFirstName(OAuth2User oauth2User) {
        String givenName = oauth2User.getAttribute("given_name");
        if (givenName != null) return givenName;
        String name = oauth2User.getAttribute("name");
        if (name != null) {
            int space = name.indexOf(' ');
            return space > 0 ? name.substring(0, space) : name;
        }
        return "User";
    }

    private String extractLastName(OAuth2User oauth2User) {
        String familyName = oauth2User.getAttribute("family_name");
        if (familyName != null) return familyName;
        String name = oauth2User.getAttribute("name");
        if (name != null) {
            int space = name.indexOf(' ');
            return space > 0 ? name.substring(space + 1) : "";
        }
        return "";
    }

    private void redirectWithError(HttpServletResponse response, String error) throws IOException {
        String url = "/?oauth_error=" + java.net.URLEncoder.encode(error, java.nio.charset.StandardCharsets.UTF_8);
        response.sendRedirect(url);
    }
}
