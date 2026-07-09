package com.example.app.auth;

import com.example.app.logging.LogSanitizer;
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
import java.util.Locale;
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
            log.info("Password reset requested for non-active or unknown email={}", LogSanitizer.emailHash(normalized));
            return;
        }
        User user = matches.get(0);
        String token = createResetToken(user);
        sendResetEmail(user, token);
    }

    @Transactional
    public void sendEmployeeAccountCreatedEmail(User user) {
        if (user == null || user.getId() == null || user.getEmail() == null || user.getEmail().isBlank()) {
            return;
        }
        String token = createResetToken(user);
        sendEmployeeAccountCreatedEmail(user, token);
    }

    @Transactional(readOnly = true)
    public boolean isTokenUsable(String token) {
        return resolveValidToken(token) != null;
    }

    /**
     * Resolves the account email for a usable reset token (for pre-filling reset/login UI).
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

    private String createResetToken(User user) {
        invalidatePreviousTokens(user);
        String token = generateToken();
        PasswordResetToken row = new PasswordResetToken();
        row.setUser(user);
        row.setToken(token);
        row.setExpiresAt(Instant.now().plusSeconds(TOKEN_TTL_SECONDS));
        row.setActive(true);
        resetTokens.save(row);
        return token;
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
            log.warn("Password reset requested for {}, but mail is not configured (spring.mail.host / SMTP sender missing).", LogSanitizer.emailHash(user.getEmail()));
            return;
        }
        String encodedToken = URLEncoder.encode(token, StandardCharsets.UTF_8);
        String encodedEmail = URLEncoder.encode(user.getEmail(), StandardCharsets.UTF_8);
        String resetUrl = frontendBaseUrl + "/reset-password?token=" + encodedToken + "&email=" + encodedEmail;
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
            log.info("Password reset email sent to {}", LogSanitizer.emailHash(user.getEmail()));
        } catch (Exception e) {
            log.warn("Failed sending password reset email to {}: {}", LogSanitizer.emailHash(user.getEmail()), e.getMessage());
        }
    }

    private void sendEmployeeAccountCreatedEmail(User user, String token) {
        if (!mailConfigured) {
            log.warn("Employee account created for {}, but mail is not configured (spring.mail.host / SMTP sender missing).", LogSanitizer.emailHash(user.getEmail()));
            return;
        }
        String encodedToken = URLEncoder.encode(token, StandardCharsets.UTF_8);
        String encodedEmail = URLEncoder.encode(user.getEmail(), StandardCharsets.UTF_8);
        String resetUrl = frontendBaseUrl + "/reset-password?token=" + encodedToken + "&email=" + encodedEmail;
        String subject = "Your Calendra account has been created";
        String html = buildEmployeeAccountCreatedHtml(user, resetUrl);
        String plainText = buildEmployeeAccountCreatedText(user, resetUrl);
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, StandardCharsets.UTF_8.name());
            helper.setFrom(mailFrom);
            helper.setTo(user.getEmail());
            helper.setSubject(subject);
            helper.setText(plainText, html);
            mailSender.send(message);
            log.info("Employee account created email sent to {}", LogSanitizer.emailHash(user.getEmail()));
        } catch (Exception e) {
            log.warn("Failed sending employee account created email to {}: {}", LogSanitizer.emailHash(user.getEmail()), e.getMessage());
        }
    }

    private String buildEmployeeAccountCreatedText(User user, String resetUrl) {
        String firstName = user.getFirstName() == null || user.getFirstName().isBlank() ? "there" : user.getFirstName().trim();
        String companyName = user.getCompany() == null || user.getCompany().getName() == null || user.getCompany().getName().isBlank()
                ? "your company"
                : user.getCompany().getName().trim();
        return """
                Hi %s,

                A user account has been created for you in Calendra for %s.
                To finish setup, create your password using this secure link:

                %s

                This link expires in 1 hour. For security reasons, Calendra does not send passwords by email.
                If you were not expecting this account, you can ignore this email.
                """.formatted(firstName, companyName, resetUrl);
    }

    private String buildEmployeeAccountCreatedHtml(User user, String resetUrl) {
        String firstName = user.getFirstName() == null || user.getFirstName().isBlank() ? "there" : escapeHtml(user.getFirstName().trim());
        String companyName = user.getCompany() == null || user.getCompany().getName() == null || user.getCompany().getName().isBlank()
                ? "Calendra"
                : escapeHtml(user.getCompany().getName().trim());
        String email = escapeHtml(user.getEmail() == null ? "" : user.getEmail().trim().toLowerCase(Locale.ROOT));
        String role = escapeHtml(formatRole(user));
        String accessRole = escapeHtml(user.getEmployeeAccessRole() == null || user.getEmployeeAccessRole().getName() == null || user.getEmployeeAccessRole().getName().isBlank()
                ? "—"
                : user.getEmployeeAccessRole().getName().trim());
        String safeResetUrl = escapeHtml(resetUrl);

        return """
                <!doctype html>
                <html>
                <body style="margin:0;background:#f3f6fb;font-family:Arial,sans-serif;color:#0f172a;">
                  <div style="max-width:640px;margin:32px auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:24px;padding:32px;box-shadow:0 18px 45px rgba(15,23,42,.08);">
                    <div style="font-size:26px;font-weight:800;letter-spacing:-.03em;color:#0f172a;margin-bottom:28px;">Calendra</div>
                    <div style="display:inline-block;background:#eff6ff;color:#1d4ed8;border-radius:999px;padding:8px 14px;font-size:13px;font-weight:700;margin-bottom:20px;">New user account</div>
                    <h1 style="font-size:30px;line-height:1.15;margin:0 0 18px;">Welcome to Calendra</h1>
                    <p style="font-size:16px;line-height:1.65;margin:0 0 14px;">Hi %s,</p>
                    <p style="font-size:16px;line-height:1.65;margin:0 0 24px;color:#334155;">A user account has been created for you in Calendra for <strong>%s</strong>. To finish setup, please create your password using the secure link below.</p>
                    <a href="%s" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;border-radius:14px;padding:16px 24px;margin-bottom:24px;">Set your password</a>
                    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:18px;padding:18px 20px;margin:0 0 26px;">
                      <strong>This link expires in 1 hour.</strong><br>
                      <span style="color:#64748b;">If you were not expecting this account, you can ignore this email.</span>
                    </div>
                    <h2 style="font-size:18px;margin:0 0 14px;">Account details</h2>
                    <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0 10px;">
                      %s
                      %s
                      %s
                      %s
                    </table>
                    <p style="font-size:14px;line-height:1.6;color:#64748b;margin:22px 0 0;">For security reasons, Calendra does not send passwords by email. You will choose your own password on the setup page.</p>
                  </div>
                </body>
                </html>
                """.formatted(
                firstName,
                companyName,
                safeResetUrl,
                accountDetailRow("Company", companyName),
                accountDetailRow("Login email", email),
                accountDetailRow("Role", role),
                accountDetailRow("Access role", accessRole)
        );
    }

    private String accountDetailRow(String label, String value) {
        return "<tr>"
                + "<td style=\"background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:16px;color:#64748b;font-weight:700;\">" + escapeHtml(label) + "</td>"
                + "<td style=\"background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:16px;text-align:right;font-weight:700;\">" + value + "</td>"
                + "</tr>";
    }

    private String formatRole(User user) {
        if (user.getRole() == null) {
            return "Employee";
        }
        return switch (user.getRole()) {
            case ADMIN -> "Administrator";
            case CONSULTANT -> "Employee";
            case SUPER_ADMIN -> "Super admin";
        };
    }

    private static String escapeHtml(String value) {
        if (value == null) return "";
        return value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
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

