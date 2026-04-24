package com.example.app.auth;

import com.example.app.mfa.WebAuthnService;
import com.example.app.security.AuthCookieService;
import com.example.app.securitycenter.SecurityCenterService;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.env.Environment;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/**
 * After successful Google OAuth2 login, find or create the user, generate JWT, and redirect to frontend with token.
 */
@Component
public class GoogleOAuth2SuccessHandler extends SimpleUrlAuthenticationSuccessHandler {
    private static final Logger log = LoggerFactory.getLogger(GoogleOAuth2SuccessHandler.class);

    private final UserRepository userRepository;
    private final WebAuthnService webAuthnService;
    private final SecurityCenterService securityCenterService;
    private final AuthCookieService authCookieService;
    private final SignupService signupService;
    private final Environment environment;

    public GoogleOAuth2SuccessHandler(
            UserRepository userRepository,
            WebAuthnService webAuthnService,
            SecurityCenterService securityCenterService,
            AuthCookieService authCookieService,
            SignupService signupService,
            Environment environment
    ) {
        this.userRepository = userRepository;
        this.webAuthnService = webAuthnService;
        this.securityCenterService = securityCenterService;
        this.authCookieService = authCookieService;
        this.signupService = signupService;
        this.environment = environment;
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

        HttpSession session = request.getSession(false);
        boolean googleSignupFlow = session != null && Boolean.TRUE.equals(session.getAttribute("OAUTH_GOOGLE_SIGNUP_ACTIVE"));
        if (googleSignupFlow) {
            if (session != null) {
                session.removeAttribute("OAUTH_GOOGLE_SIGNUP_ACTIVE");
            }
            SignupPendingSession pending = session == null ? null : (SignupPendingSession) session.getAttribute("SIGNUP_PENDING");
            if (session != null) {
                session.removeAttribute("SIGNUP_PENDING");
            }
            if (user != null && signupService.hasPendingSignupVerificationForEmail(normalizedEmail)) {
                String returnSearch = pending != null && pending.returnSearch() != null ? pending.returnSearch() : "";
                String target = buildRegisterAccountFinishVerifyUrl(returnSearch, normalizedEmail);
                log.info("Google signup: incomplete self-serve signup for email={}; redirecting to {}", normalizedEmail, target);
                getRedirectStrategy().sendRedirect(request, response, target);
                return;
            }
            if (pending == null) {
                log.warn("Google signup flow missing SIGNUP_PENDING session.");
                redirectWithError(response, "Your signup session expired. Return to account setup and try again.");
                return;
            }
            if (user != null) {
                String returnSearch = pending != null && pending.returnSearch() != null ? pending.returnSearch() : "";
                String target = buildRegisterAccountExistingAccountUrl(returnSearch, normalizedEmail);
                log.info("Google signup: verified account exists for email={}; redirecting to {}", normalizedEmail, target);
                getRedirectStrategy().sendRedirect(request, response, target);
                return;
            }
            String pendingEmail = pending.email() == null ? "" : pending.email().trim();
            if (!pendingEmail.isBlank() && !normalizedEmail.equalsIgnoreCase(pendingEmail)) {
                log.warn("Google signup email mismatch. google={}, pending={}", normalizedEmail, pendingEmail);
                redirectWithError(response, "Google account email does not match the work email you entered. Use the same email or start again.");
                return;
            }
            ResponseEntity<?> signupResult = signupService.signupFromGooglePending(
                    pending, normalizedEmail, firstName, lastName, request, response);
            if (signupResult.getStatusCode() == HttpStatus.CONFLICT) {
                if (signupResult.getBody() instanceof Map<?, ?> conflictBody
                        && Boolean.TRUE.equals(conflictBody.get("registeredAccountExists"))) {
                    String rs = pending.returnSearch() != null ? pending.returnSearch() : "";
                    String target = buildRegisterAccountExistingAccountUrl(rs, normalizedEmail);
                    getRedirectStrategy().sendRedirect(request, response, target);
                    return;
                }
                redirectWithError(response, "An account with this email already exists.");
                return;
            }
            if (!signupResult.getStatusCode().is2xxSuccessful() || !(signupResult.getBody() instanceof Map<?, ?> body)) {
                log.warn("Google signup unexpected response status={}", signupResult.getStatusCode());
                redirectWithError(response, "Could not complete signup. Please try again.");
                return;
            }
            Object emailOut = body.get("email");
            String verifyEmail = emailOut != null ? emailOut.toString() : normalizedEmail;
            String target = buildRegisterAccountVerifyUrl(pending.returnSearch(), verifyEmail);
            log.info("Google signup provisioned; redirecting to {}", target);
            getRedirectStrategy().sendRedirect(request, response, target);
            return;
        }

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

        WebAuthnService.PrimaryLoginResult mfa = webAuthnService.startLoginChallenge(user);
        String redirectUrl;
        if (mfa.mfaRequired()) {
            redirectUrl = frontendBaseUrl() + "/oauth-callback?mfa_token=" + java.net.URLEncoder.encode(mfa.pendingToken(), java.nio.charset.StandardCharsets.UTF_8);
            log.info("Google OAuth MFA challenge created for userId={}", user.getId());
        } else {
            String token = securityCenterService.issueSession(user, request, "Google sign-in").token();
            authCookieService.writeAuthCookie(request, response, token);
            log.info("Google OAuth token generated for userId={}", user.getId());
            redirectUrl = frontendBaseUrl() + "/oauth-callback";
        }
        log.info("Google OAuth redirecting to frontend callback url={}", redirectUrl);
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

    private String frontendBaseUrl() {
        return environment.getProperty("APP_AUTH_FRONTEND_URL", "http://localhost:3000");
    }

    private void redirectWithError(HttpServletResponse response, String error) throws IOException {
        String url = frontendBaseUrl() + "/login?oauth_error=" + URLEncoder.encode(error, StandardCharsets.UTF_8);
        response.sendRedirect(url);
    }

    private String buildRegisterAccountVerifyUrl(String returnSearch, String verifyEmail) {
        String base = frontendBaseUrl() + "/register/account";
        String rs = returnSearch == null ? "" : returnSearch.trim();
        if (!rs.isEmpty() && !rs.startsWith("?")) {
            rs = "?" + rs;
        }
        String sep = rs.contains("?") ? "&" : "?";
        return base + rs + sep + "verifyEmail=1&pendingAccountCreation=1&email=" + URLEncoder.encode(verifyEmail, StandardCharsets.UTF_8);
    }

    private String buildRegisterAccountFinishVerifyUrl(String returnSearch, String verifyEmail) {
        String base = frontendBaseUrl() + "/register/account";
        String rs = returnSearch == null ? "" : returnSearch.trim();
        if (!rs.isEmpty() && !rs.startsWith("?")) {
            rs = "?" + rs;
        }
        String sep = rs.contains("?") ? "&" : "?";
        return base + rs + sep + "finishVerify=1&email=" + URLEncoder.encode(verifyEmail, StandardCharsets.UTF_8);
    }

    private String buildRegisterAccountExistingAccountUrl(String returnSearch, String email) {
        String base = frontendBaseUrl() + "/register/account";
        String rs = returnSearch == null ? "" : returnSearch.trim();
        if (!rs.isEmpty() && !rs.startsWith("?")) {
            rs = "?" + rs;
        }
        String sep = rs.contains("?") ? "&" : "?";
        return base + rs + sep + "existingAccount=1&email=" + URLEncoder.encode(email, StandardCharsets.UTF_8);
    }
}
