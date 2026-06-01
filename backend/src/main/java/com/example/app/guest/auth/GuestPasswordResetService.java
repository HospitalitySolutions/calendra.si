package com.example.app.guest.auth;

import com.example.app.guest.model.GuestUser;
import com.example.app.guest.model.GuestUserRepository;
import jakarta.mail.internet.MimeMessage;
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
    private static final long CODE_TTL_SECONDS = 15L * 60L;
    private static final long RESET_SESSION_TTL_SECONDS = 15L * 60L;
    private static final int TOKEN_BYTES = 32;
    private static final int RESET_CODE_DIGITS = 6;
    private static final int MAX_CODE_ATTEMPTS = 5;

    private final GuestUserRepository guestUsers;
    private final GuestPasswordResetTokenRepository resetTokens;
    private final GuestPasswordService passwords;
    private final JavaMailSender mailSender;
    private final String mailFrom;
    private final boolean mailConfigured;
    private final SecureRandom secureRandom = new SecureRandom();

    public GuestPasswordResetService(
            GuestUserRepository guestUsers,
            GuestPasswordResetTokenRepository resetTokens,
            GuestPasswordService passwords,
            @Autowired(required = false) JavaMailSender mailSender,
            @Value("${app.mail.from:}") String mailFrom,
            @Value("${spring.mail.host:}") String mailHost,
            @Value("${spring.mail.username:}") String mailUsername
    ) {
        this.guestUsers = guestUsers;
        this.resetTokens = resetTokens;
        this.passwords = passwords;
        this.mailSender = mailSender;
        this.mailFrom = (mailFrom == null || mailFrom.isBlank()) ? (mailUsername == null ? "" : mailUsername) : mailFrom;
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
            log.info("Guest password reset code requested for non-active or unknown email={}", normalized);
            return;
        }
        GuestUser guestUser = candidate.get();
        invalidatePreviousTokens(guestUser);

        String code = generateNumericCode();
        GuestPasswordResetToken row = new GuestPasswordResetToken();
        row.setGuestUser(guestUser);
        // This token becomes the short-lived reset session after the verification code is accepted.
        // It is not sent in the email, so users must prove email possession with the code first.
        row.setToken(generateToken());
        row.setVerificationCodeHash(passwords.hash(code));
        row.setFailedAttempts(0);
        row.setExpiresAt(Instant.now().plusSeconds(CODE_TTL_SECONDS));
        row.setActive(true);
        resetTokens.save(row);
        sendVerificationCodeEmail(guestUser, code, locale);
    }

    @Transactional
    public Optional<VerifiedResetSession> verifyCode(String email, String code) {
        String normalized = normalizeEmail(email);
        String normalizedCode = normalizeCode(code);
        if (normalized == null || normalizedCode == null) return Optional.empty();

        Optional<GuestUser> candidate = guestUsers.findByEmailIgnoreCase(normalized)
                .filter(GuestUser::isActive);
        if (candidate.isEmpty()) return Optional.empty();

        GuestPasswordResetToken row = latestActiveToken(candidate.get()).orElse(null);
        if (row == null) return Optional.empty();
        if (row.getUsedAt() != null || row.getExpiresAt() == null || row.getExpiresAt().isBefore(Instant.now())) {
            row.setActive(false);
            resetTokens.save(row);
            return Optional.empty();
        }
        if (row.getCodeVerifiedAt() != null) {
            return Optional.of(new VerifiedResetSession(row.getToken(), normalizeEmail(row.getGuestUser().getEmail())));
        }
        if (row.getFailedAttempts() >= MAX_CODE_ATTEMPTS) {
            row.setActive(false);
            resetTokens.save(row);
            return Optional.empty();
        }
        if (!passwords.matches(normalizedCode, row.getVerificationCodeHash())) {
            row.setFailedAttempts(row.getFailedAttempts() + 1);
            if (row.getFailedAttempts() >= MAX_CODE_ATTEMPTS) {
                row.setActive(false);
                row.setUsedAt(Instant.now());
            }
            resetTokens.save(row);
            return Optional.empty();
        }

        row.setCodeVerifiedAt(Instant.now());
        row.setFailedAttempts(0);
        row.setExpiresAt(Instant.now().plusSeconds(RESET_SESSION_TTL_SECONDS));
        resetTokens.save(row);
        return Optional.of(new VerifiedResetSession(row.getToken(), normalizeEmail(row.getGuestUser().getEmail())));
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

    private Optional<GuestPasswordResetToken> latestActiveToken(GuestUser guestUser) {
        return resetTokens.findAllByGuestUser_IdAndActiveTrue(guestUser.getId())
                .stream()
                .filter(token -> token.getGuestUser() != null && token.getGuestUser().isActive())
                .max((left, right) -> Long.compare(idOrZero(left), idOrZero(right)));
    }

    private static long idOrZero(GuestPasswordResetToken token) {
        return token == null || token.getId() == null ? 0L : token.getId();
    }

    private GuestPasswordResetToken resolveValidToken(String token) {
        if (token == null || token.isBlank()) return null;
        GuestPasswordResetToken row = resetTokens.findByTokenAndActiveTrue(token.trim()).orElse(null);
        if (row == null) return null;
        if (row.getUsedAt() != null) return null;
        if (row.getCodeVerifiedAt() == null) return null;
        if (row.getExpiresAt() == null || row.getExpiresAt().isBefore(Instant.now())) return null;
        GuestUser guestUser = row.getGuestUser();
        if (guestUser == null || !guestUser.isActive()) return null;
        return row;
    }

    private void sendVerificationCodeEmail(GuestUser guestUser, String code, String locale) {
        if (!mailConfigured) {
            log.warn("Guest password reset code requested for {}, but mail is not configured (spring.mail.host / SMTP sender missing).", guestUser.getEmail());
            return;
        }
        boolean sl = locale == null || locale.isBlank() || locale.trim().toLowerCase(Locale.ROOT).startsWith("sl");
        String firstName = guestUser.getFirstName() == null || guestUser.getFirstName().isBlank()
                ? (sl ? "" : "there")
                : guestUser.getFirstName().trim();
        String subject = sl ? "Koda za ponastavitev gesla" : "Your password reset code";
        String greeting = sl
                ? (firstName.isBlank() ? "Pozdravljeni," : "Pozdravljeni " + firstName + ",")
                : "Hello " + firstName + ",";
        String body = sl ? """
                %s

                Prejeli smo zahtevo za ponastavitev gesla za vaš Calendra Book račun.
                V aplikaciji vnesite spodnjo potrditveno kodo:

                %s

                Koda velja 15 minut.
                Če tega niste zahtevali, lahko to sporočilo prezrete.
                """.formatted(greeting, code) : """
                %s

                We received a request to reset the password for your Calendra Book account.
                Enter this verification code in the app:

                %s

                This code expires in 15 minutes.
                If you did not request this, you can safely ignore this email.
                """.formatted(greeting, code);
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, StandardCharsets.UTF_8.name());
            helper.setFrom(mailFrom);
            helper.setTo(guestUser.getEmail());
            helper.setSubject(subject);
            helper.setText(body, false);
            mailSender.send(message);
            log.info("Guest password reset verification code email sent to {}", guestUser.getEmail());
        } catch (Exception ex) {
            log.warn("Failed sending guest password reset code email to {}: {}", guestUser.getEmail(), ex.getMessage());
        }
    }

    private String generateToken() {
        byte[] bytes = new byte[TOKEN_BYTES];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String generateNumericCode() {
        int bound = (int) Math.pow(10, RESET_CODE_DIGITS);
        int floor = bound / 10;
        return String.valueOf(floor + secureRandom.nextInt(bound - floor));
    }

    private static String normalizeEmail(String email) {
        if (email == null || email.isBlank()) return null;
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private static String normalizeCode(String code) {
        if (code == null) return null;
        String normalized = code.replaceAll("\\D", "").trim();
        return normalized.length() == RESET_CODE_DIGITS ? normalized : null;
    }

    public record VerifiedResetSession(String resetToken, String email) {}
}
