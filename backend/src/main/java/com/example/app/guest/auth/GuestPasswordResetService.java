package com.example.app.guest.auth;

import com.example.app.guest.model.GuestUser;
import com.example.app.guest.model.GuestUserRepository;
import jakarta.mail.internet.MimeMessage;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.Locale;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class GuestPasswordResetService {
    private static final Logger log = LoggerFactory.getLogger(GuestPasswordResetService.class);
    private static final long TOKEN_TTL_SECONDS = 60L * 60L;
    private static final int TOKEN_BYTES = 32;

    private final GuestUserRepository guestUsers;
    private final GuestPasswordResetTokenRepository resetTokens;
    private final GuestPasswordService passwords;
    private final JavaMailSender mailSender;
    private final String mailFrom;
    private final String mobileResetScheme;
    private final String webResetBaseUrl;
    private final boolean mailConfigured;
    private final SecureRandom secureRandom = new SecureRandom();

    public GuestPasswordResetService(
            GuestUserRepository guestUsers,
            GuestPasswordResetTokenRepository resetTokens,
            GuestPasswordService passwords,
            @Autowired(required = false) JavaMailSender mailSender,
            @Value("${app.mail.from:}") String mailFrom,
            @Value("${spring.mail.host:}") String mailHost,
            @Value("${spring.mail.username:}") String mailUsername,
            @Value("${app.guest.auth.password-reset-mobile-scheme:calendra-guest}") String mobileResetScheme,
            @Value("${app.guest.auth.password-reset-web-url:${app.auth.frontend-url:http://localhost:3000}}") String webResetBaseUrl
    ) {
        this.guestUsers = guestUsers;
        this.resetTokens = resetTokens;
        this.passwords = passwords;
        this.mailSender = mailSender;
        this.mailFrom = (mailFrom == null || mailFrom.isBlank()) ? (mailUsername == null ? "" : mailUsername) : mailFrom;
        this.mobileResetScheme = sanitizeScheme(mobileResetScheme);
        this.webResetBaseUrl = sanitizeBase(webResetBaseUrl);
        this.mailConfigured = mailSender != null
                && mailHost != null && !mailHost.isBlank()
                && mailUsername != null && !mailUsername.isBlank();
    }

    @Transactional
    public void requestReset(String email, String locale) {
        String normalized = normalizeEmail(email);
        if (normalized == null) return;
        Optional<GuestUser> candidate = guestUsers.findByEmailIgnoreCase(normalized)
                .filter(GuestUser::isActive);
        if (candidate.isEmpty()) {
            log.info("Guest password reset requested for non-active or unknown email={}", normalized);
            return;
        }
        GuestUser guestUser = candidate.get();
        invalidatePreviousTokens(guestUser);
        String token = generateToken();
        GuestPasswordResetToken row = new GuestPasswordResetToken();
        row.setGuestUser(guestUser);
        row.setToken(token);
        row.setExpiresAt(Instant.now().plusSeconds(TOKEN_TTL_SECONDS));
        row.setActive(true);
        resetTokens.save(row);
        sendResetEmail(guestUser, token, locale);
    }

    @Transactional(readOnly = true)
    public Optional<String> findEmailForUsableResetToken(String token) {
        GuestPasswordResetToken row = resolveValidToken(token);
        if (row == null) return Optional.empty();
        return Optional.ofNullable(normalizeEmail(row.getGuestUser().getEmail()));
    }

    @Transactional
    public boolean resetPassword(String token, String newPassword) {
        GuestPasswordResetToken row = resolveValidToken(token);
        if (row == null) return false;
        GuestUser guestUser = row.getGuestUser();
        guestUser.setPasswordHash(passwords.hash(newPassword));
        guestUsers.save(guestUser);
        row.setActive(false);
        row.setUsedAt(Instant.now());
        resetTokens.save(row);
        return true;
    }

    private void invalidatePreviousTokens(GuestUser guestUser) {
        var activeTokens = resetTokens.findAllByGuestUser_IdAndActiveTrue(guestUser.getId());
        for (GuestPasswordResetToken token : activeTokens) {
            token.setActive(false);
            token.setUsedAt(Instant.now());
        }
        if (!activeTokens.isEmpty()) resetTokens.saveAll(activeTokens);
        resetTokens.deleteByExpiresAtBefore(Instant.now().minusSeconds(60L * 60L * 24L));
    }

    private GuestPasswordResetToken resolveValidToken(String token) {
        if (token == null || token.isBlank()) return null;
        GuestPasswordResetToken row = resetTokens.findByTokenAndActiveTrue(token.trim()).orElse(null);
        if (row == null) return null;
        if (row.getUsedAt() != null) return null;
        if (row.getExpiresAt() == null || row.getExpiresAt().isBefore(Instant.now())) return null;
        GuestUser guestUser = row.getGuestUser();
        if (guestUser == null || !guestUser.isActive()) return null;
        return row;
    }

    private void sendResetEmail(GuestUser guestUser, String token, String locale) {
        if (!mailConfigured) {
            log.warn("Guest password reset requested for {}, but mail is not configured (spring.mail.host / SMTP sender missing).", guestUser.getEmail());
            return;
        }
        String encodedToken = URLEncoder.encode(token, StandardCharsets.UTF_8);
        String encodedEmail = URLEncoder.encode(guestUser.getEmail(), StandardCharsets.UTF_8);
        String mobileResetUrl = mobileResetScheme + "://reset-password?token=" + encodedToken + "&email=" + encodedEmail;
        String webResetUrl = webResetBaseUrl + "/reset-password?guest=1&token=" + encodedToken + "&email=" + encodedEmail;
        boolean sl = locale == null || locale.isBlank() || locale.trim().toLowerCase(Locale.ROOT).startsWith("sl");
        String firstName = guestUser.getFirstName() == null || guestUser.getFirstName().isBlank()
                ? (sl ? "" : "there")
                : guestUser.getFirstName().trim();
        String subject = sl ? "Ponastavitev gesla" : "Reset your password";
        String greeting = sl
                ? (firstName.isBlank() ? "Pozdravljeni," : "Pozdravljeni " + firstName + ",")
                : "Hello " + firstName + ",";
        String body = sl ? """
                %s

                Prejeli smo zahtevo za ponastavitev gesla za vaš Calendra Book račun.
                Odprite spodnjo povezavo na telefonu, da nastavite novo geslo:

                %s

                Če se aplikacija ne odpre samodejno, uporabite to rezervno povezavo:
                %s

                Povezava velja 60 minut.
                Če tega niste zahtevali, lahko to sporočilo prezrete.
                """.formatted(greeting, mobileResetUrl, webResetUrl) : """
                %s

                We received a request to reset the password for your Calendra Book account.
                Open this link on your phone to set a new password:

                %s

                If the app does not open automatically, use this fallback link:
                %s

                This link expires in 60 minutes.
                If you did not request this, you can safely ignore this email.
                """.formatted(greeting, mobileResetUrl, webResetUrl);
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, StandardCharsets.UTF_8.name());
            helper.setFrom(mailFrom);
            helper.setTo(guestUser.getEmail());
            helper.setSubject(subject);
            helper.setText(body, false);
            mailSender.send(message);
            log.info("Guest password reset email sent to {}", guestUser.getEmail());
        } catch (Exception ex) {
            log.warn("Failed sending guest password reset email to {}: {}", guestUser.getEmail(), ex.getMessage());
        }
    }

    private String generateToken() {
        byte[] bytes = new byte[TOKEN_BYTES];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String normalizeEmail(String email) {
        if (email == null || email.isBlank()) return null;
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private static String sanitizeScheme(String raw) {
        String scheme = raw == null || raw.isBlank() ? "calendra-guest" : raw.trim();
        return scheme.replace("://", "").replace(":", "");
    }

    private static String sanitizeBase(String raw) {
        String base = raw == null || raw.isBlank() ? "http://localhost:3000" : raw.trim();
        return base.endsWith("/") ? base.substring(0, base.length() - 1) : base;
    }
}
