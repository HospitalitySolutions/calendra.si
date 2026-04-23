package com.example.app.auth;

import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import jakarta.mail.internet.MimeMessage;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PasswordResetService {
    private static final Logger log = LoggerFactory.getLogger(PasswordResetService.class);
    private static final long TOKEN_TTL_SECONDS = 60L * 60L;
    private static final int TOKEN_BYTES = 32;

    private final UserRepository users;
    private final PasswordResetTokenRepository resetTokens;
    private final AppSettingRepository appSettings;
    private final PasswordEncoder passwordEncoder;
    private final JavaMailSender mailSender;
    private final String mailFrom;
    private final String frontendBaseUrl;
    private final boolean mailConfigured;
    private final SecureRandom secureRandom = new SecureRandom();

    public PasswordResetService(
            UserRepository users,
            PasswordResetTokenRepository resetTokens,
            AppSettingRepository appSettings,
            PasswordEncoder passwordEncoder,
            @Autowired(required = false) JavaMailSender mailSender,
            @Value("${app.mail.from:}") String mailFrom,
            @Value("${spring.mail.host:}") String mailHost,
            @Value("${spring.mail.username:}") String mailUsername,
            @Value("${app.auth.frontend-url:http://app.calendra.si}") String frontendBaseUrl
    ) {
        this.users = users;
        this.resetTokens = resetTokens;
        this.appSettings = appSettings;
        this.passwordEncoder = passwordEncoder;
        this.mailSender = mailSender;
        this.mailFrom = mailFrom == null ? "" : mailFrom;
        this.frontendBaseUrl = sanitizeBase(frontendBaseUrl);
        this.mailConfigured = mailSender != null
                && mailHost != null && !mailHost.isBlank()
                && mailUsername != null && !mailUsername.isBlank();
    }

    @Transactional
    public void requestReset(String email) {
        if (email == null || email.isBlank()) return;
        String normalized = email.trim().toLowerCase();
        List<User> matches = users.findAllByEmailIgnoreCaseAndActiveTrue(normalized);
        if (matches.isEmpty()) {
            log.info("Password reset requested for non-active or unknown email={}", normalized);
            return;
        }
        User user = matches.get(0);
        invalidatePreviousTokens(user);
        String token = generateToken();
        PasswordResetToken row = new PasswordResetToken();
        row.setUser(user);
        row.setToken(token);
        row.setExpiresAt(Instant.now().plusSeconds(TOKEN_TTL_SECONDS));
        row.setActive(true);
        resetTokens.save(row);
        sendResetEmail(user, token);
    }

    @Transactional(readOnly = true)
    public boolean isTokenUsable(String token) {
        return resolveValidToken(token) != null;
    }

    /**
     * Resolves the account email for a usable reset token (for pre-filling the confirm-email UI).
     */
    @Transactional(readOnly = true)
    public Optional<String> findEmailForUsableResetToken(String token) {
        PasswordResetToken row = resolveValidToken(token);
        if (row == null) {
            return Optional.empty();
        }
        String email = row.getUser().getEmail();
        if (email == null || email.isBlank()) {
            return Optional.empty();
        }
        return Optional.of(email.trim().toLowerCase());
    }

    @Transactional
    public boolean resetPassword(String token, String newPassword) {
        PasswordResetToken row = resolveValidToken(token);
        if (row == null) return false;
        User user = row.getUser();
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        users.save(user);
        clearSignupOwnerPasswordPending(user);
        row.setActive(false);
        row.setUsedAt(Instant.now());
        resetTokens.save(row);
        return true;
    }

    private void clearSignupOwnerPasswordPending(User user) {
        Long companyId = user.getCompany().getId();
        appSettings.findByCompanyIdAndKey(companyId, SettingKey.SIGNUP_OWNER_PASSWORD_PENDING).ifPresent(s -> {
            s.setValue("false");
            appSettings.save(s);
        });
    }

    private void invalidatePreviousTokens(User user) {
        List<PasswordResetToken> activeTokens = resetTokens.findAllByUser_IdAndActiveTrue(user.getId());
        for (PasswordResetToken t : activeTokens) {
            t.setActive(false);
            t.setUsedAt(Instant.now());
        }
        if (!activeTokens.isEmpty()) resetTokens.saveAll(activeTokens);
        resetTokens.deleteByExpiresAtBefore(Instant.now().minusSeconds(60L * 60L * 24L));
    }

    private PasswordResetToken resolveValidToken(String token) {
        if (token == null || token.isBlank()) return null;
        PasswordResetToken row = resetTokens.findByTokenAndActiveTrue(token).orElse(null);
        if (row == null) return null;
        if (row.getUsedAt() != null) return null;
        if (row.getExpiresAt() == null || row.getExpiresAt().isBefore(Instant.now())) return null;
        return row;
    }

    private void sendResetEmail(User user, String token) {
        if (!mailConfigured) {
            log.warn("Password reset requested for {}, but mail is not configured (spring.mail.host / SMTP sender missing).", user.getEmail());
            return;
        }
        String encodedToken = URLEncoder.encode(token, StandardCharsets.UTF_8);
        String encodedEmail = URLEncoder.encode(user.getEmail(), StandardCharsets.UTF_8);
        String resetUrl = frontendBaseUrl + "/confirm-email?token=" + encodedToken + "&email=" + encodedEmail;
        String subject = "Reset your password";
        String body = """
                Hello %s,

                We received a request to reset your password.
                Open this link to set a new one:

                %s

                This link expires in 1 hour.
                If you did not request this, you can safely ignore this email.
                """.formatted(user.getFirstName() == null ? "there" : user.getFirstName(), resetUrl);
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, StandardCharsets.UTF_8.name());
            helper.setFrom(mailFrom);
            helper.setTo(user.getEmail());
            helper.setSubject(subject);
            helper.setText(body, false);
            mailSender.send(message);
            log.info("Password reset email sent to {}", user.getEmail());
        } catch (Exception e) {
            log.warn("Failed sending password reset email to {}: {}", user.getEmail(), e.getMessage());
        }
    }

    private String generateToken() {
        byte[] bytes = new byte[TOKEN_BYTES];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String sanitizeBase(String raw) {
        String base = (raw == null || raw.isBlank()) ? "http://localhost:3000" : raw.trim();
        return base.endsWith("/") ? base.substring(0, base.length() - 1) : base;
    }
}

