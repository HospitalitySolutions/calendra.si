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
        requestReset(email, null);
    }

    @Transactional
    public void requestReset(String email, String localeCode) {
        if (email == null || email.isBlank()) return;
        String normalized = email.trim().toLowerCase(Locale.ROOT);
        List<User> matches = users.findAllByEmailIgnoreCaseAndActiveTrue(normalized);
        if (matches.isEmpty()) {
            log.info("Password reset requested for non-active or unknown email={}", LogSanitizer.emailHash(normalized));
            return;
        }
        User user = matches.get(0);
        String token = createResetToken(user);
        sendResetEmail(user, token, localeCode);
    }

    @Transactional
    public Optional<String> createPasswordSetupUrl(User user, String localeCode) {
        if (user == null || user.getId() == null || user.getEmail() == null || user.getEmail().isBlank()) {
            return Optional.empty();
        }
        String token = createResetToken(user);
        String encodedToken = URLEncoder.encode(token, StandardCharsets.UTF_8);
        String encodedEmail = URLEncoder.encode(user.getEmail().trim().toLowerCase(Locale.ROOT), StandardCharsets.UTF_8);
        String locale = normalizeSupportedLocale(localeCode);
        return Optional.of(frontendBaseUrl + "/reset-password?token=" + encodedToken + "&email=" + encodedEmail + "&locale=" + locale);
    }

    @Transactional
    public void sendEmployeeAccountCreatedEmail(User user) {
        sendEmployeeAccountCreatedEmail(user, null);
    }

    @Transactional
    public void sendEmployeeAccountCreatedEmail(User user, String localeCode) {
        if (user == null || user.getId() == null || user.getEmail() == null || user.getEmail().isBlank()) {
            return;
        }
        String token = createResetToken(user);
        sendEmployeeAccountCreatedEmail(user, token, localeCode);
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

    private void sendResetEmail(User user, String token, String localeCode) {
        if (!mailConfigured) {
            log.warn("Password reset requested for {}, but mail is not configured (spring.mail.host / SMTP sender missing).", LogSanitizer.emailHash(user.getEmail()));
            return;
        }
        String encodedToken = URLEncoder.encode(token, StandardCharsets.UTF_8);
        String encodedEmail = URLEncoder.encode(user.getEmail(), StandardCharsets.UTF_8);
        String locale = normalizeSupportedLocale(localeCode);
        String resetUrl = frontendBaseUrl + "/reset-password?token=" + encodedToken + "&email=" + encodedEmail + "&locale=" + locale;
        ResetEmailCopy copy = resetEmailCopy(locale);
        String firstName = user.getFirstName() == null || user.getFirstName().isBlank()
                ? copy.greetingFallback()
                : user.getFirstName().trim();
        String body = """
                %s %s,

                %s
                %s

                %s

                %s
                %s
                """.formatted(
                copy.greetingPrefix(),
                firstName,
                copy.requestText(),
                copy.openLinkText(),
                resetUrl,
                copy.expiryText(),
                copy.ignoreText()
        );
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, StandardCharsets.UTF_8.name());
            helper.setFrom(mailFrom);
            helper.setTo(user.getEmail());
            helper.setSubject(copy.subject());
            helper.setText(body, false);
            mailSender.send(message);
            log.info("Password reset email sent to {}", LogSanitizer.emailHash(user.getEmail()));
        } catch (Exception e) {
            log.warn("Failed sending password reset email to {}: {}", LogSanitizer.emailHash(user.getEmail()), e.getMessage());
        }
    }

    private void sendEmployeeAccountCreatedEmail(User user, String token, String localeCode) {
        if (!mailConfigured) {
            log.warn("Employee account created for {}, but mail is not configured (spring.mail.host / SMTP sender missing).", LogSanitizer.emailHash(user.getEmail()));
            return;
        }
        String encodedToken = URLEncoder.encode(token, StandardCharsets.UTF_8);
        String encodedEmail = URLEncoder.encode(user.getEmail(), StandardCharsets.UTF_8);
        String locale = normalizeSupportedLocale(localeCode);
        String resetUrl = frontendBaseUrl + "/reset-password?token=" + encodedToken + "&email=" + encodedEmail + "&locale=" + locale;
        EmployeeAccountEmailCopy copy = employeeAccountEmailCopy(locale);
        String html = buildEmployeeAccountCreatedHtml(user, resetUrl, copy);
        String plainText = buildEmployeeAccountCreatedText(user, resetUrl, copy);
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, StandardCharsets.UTF_8.name());
            helper.setFrom(mailFrom);
            helper.setTo(user.getEmail());
            helper.setSubject(copy.subject());
            helper.setText(plainText, html);
            mailSender.send(message);
            log.info("Employee account created email sent to {}", LogSanitizer.emailHash(user.getEmail()));
        } catch (Exception e) {
            log.warn("Failed sending employee account created email to {}: {}", LogSanitizer.emailHash(user.getEmail()), e.getMessage());
        }
    }

    private String buildEmployeeAccountCreatedText(User user, String resetUrl, EmployeeAccountEmailCopy copy) {
        String firstName = user.getFirstName() == null || user.getFirstName().isBlank() ? copy.plainGreetingFallback() : user.getFirstName().trim();
        String companyName = user.getCompany() == null || user.getCompany().getName() == null || user.getCompany().getName().isBlank()
                ? copy.companyFallback()
                : user.getCompany().getName().trim();
        return """
                %s %s,

                %s %s.
                %s

                %s

                %s %s
                %s
                """.formatted(
                copy.plainGreetingPrefix(),
                firstName,
                copy.plainAccountCreatedPrefix(),
                companyName,
                copy.plainFinishSetup(),
                resetUrl,
                copy.expiryText(),
                copy.securityPlainText(),
                copy.unexpectedText()
        );
    }

    private String buildEmployeeAccountCreatedHtml(User user, String resetUrl, EmployeeAccountEmailCopy copy) {
        String firstName = user.getFirstName() == null || user.getFirstName().isBlank() ? copy.htmlGreetingFallback() : escapeHtml(user.getFirstName().trim());
        String companyName = user.getCompany() == null || user.getCompany().getName() == null || user.getCompany().getName().isBlank()
                ? escapeHtml(copy.companyFallback())
                : escapeHtml(user.getCompany().getName().trim());
        String email = escapeHtml(user.getEmail() == null ? "" : user.getEmail().trim().toLowerCase(Locale.ROOT));
        String role = escapeHtml(formatRole(user, copy));
        String accessRole = escapeHtml(formatAccessRole(user, copy));
        String safeResetUrl = escapeHtml(resetUrl);

        return """
                <!doctype html>
                <html>
                <body style="margin:0;background:#f3f6fb;font-family:Arial,sans-serif;color:#0f172a;">
                  <div style="max-width:640px;margin:32px auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:24px;padding:32px;box-shadow:0 18px 45px rgba(15,23,42,.08);">
                    <div style="font-size:26px;font-weight:800;letter-spacing:-.03em;color:#0f172a;margin-bottom:28px;">Calendra</div>
                    <div style="display:inline-block;background:#eff6ff;color:#1d4ed8;border-radius:999px;padding:8px 14px;font-size:13px;font-weight:700;margin-bottom:20px;">%s</div>
                    <h1 style="font-size:30px;line-height:1.15;margin:0 0 18px;">%s</h1>
                    <p style="font-size:16px;line-height:1.65;margin:0 0 14px;">%s %s,</p>
                    <p style="font-size:16px;line-height:1.65;margin:0 0 24px;color:#334155;">%s <strong>%s</strong>. %s</p>
                    <a href="%s" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;border-radius:14px;padding:16px 24px;margin-bottom:24px;">%s</a>
                    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:18px;padding:18px 20px;margin:0 0 26px;">
                      <strong>%s</strong><br>
                      <span style="color:#64748b;">%s</span>
                    </div>
                    <h2 style="font-size:18px;margin:0 0 14px;">%s</h2>
                    <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0 10px;">
                      %s
                      %s
                      %s
                      %s
                    </table>
                    <p style="font-size:14px;line-height:1.6;color:#64748b;margin:22px 0 0;">%s</p>
                  </div>
                </body>
                </html>
                """.formatted(
                copy.badge(),
                copy.title(),
                copy.htmlGreetingPrefix(),
                firstName,
                copy.htmlAccountCreatedPrefix(),
                companyName,
                copy.htmlFinishSetup(),
                safeResetUrl,
                copy.buttonLabel(),
                copy.expiryText(),
                copy.unexpectedText(),
                copy.accountDetailsTitle(),
                accountDetailRow(copy.companyLabel(), companyName),
                accountDetailRow(copy.loginEmailLabel(), email),
                accountDetailRow(copy.roleLabel(), role),
                accountDetailRow(copy.accessRoleLabel(), accessRole),
                copy.securityHtmlText()
        );
    }

    private String accountDetailRow(String label, String value) {
        return "<tr>"
                + "<td style=\"background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:16px;color:#64748b;font-weight:700;\">" + escapeHtml(label) + "</td>"
                + "<td style=\"background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:16px;text-align:right;font-weight:700;\">" + value + "</td>"
                + "</tr>";
    }

    private String formatRole(User user, EmployeeAccountEmailCopy copy) {
        if (user.getRole() == null) {
            return copy.employeeRoleLabel();
        }
        return switch (user.getRole()) {
            case ADMIN -> copy.administratorRoleLabel();
            case CONSULTANT -> copy.employeeRoleLabel();
            case SUPER_ADMIN -> copy.superAdminRoleLabel();
        };
    }

    private String formatAccessRole(User user, EmployeeAccountEmailCopy copy) {
        if (user.getEmployeeAccessRole() == null || user.getEmployeeAccessRole().getName() == null || user.getEmployeeAccessRole().getName().isBlank()) {
            return "—";
        }
        String accessRole = user.getEmployeeAccessRole().getName().trim();
        if ("Calendar access".equalsIgnoreCase(accessRole)) {
            return copy.defaultCalendarAccessRoleLabel();
        }
        return accessRole;
    }

    private String normalizeSupportedLocale(String localeCode) {
        if (localeCode == null || localeCode.isBlank()) {
            return "en";
        }
        String normalized = localeCode.trim().toLowerCase(Locale.ROOT);
        if (normalized.startsWith("sl")) return "sl";
        if (normalized.startsWith("sr")) return "sr";
        return "en";
    }

    private ResetEmailCopy resetEmailCopy(String locale) {
        return switch (normalizeSupportedLocale(locale)) {
            case "sl" -> new ResetEmailCopy(
                    "Nastavite novo geslo",
                    "Pozdravljeni",
                    "pozdravljeni",
                    "Prejeli smo zahtevo za nastavitev novega gesla za vaš račun.",
                    "Novo geslo nastavite prek varne povezave:",
                    "Povezava poteče čez 1 uro.",
                    "Če tega niste zahtevali, lahko to e-pošto prezrete."
            );
            case "sr" -> new ResetEmailCopy(
                    "Podesite novu lozinku",
                    "Zdravo",
                    "zdravo",
                    "Primili smo zahtev za podešavanje nove lozinke za vaš nalog.",
                    "Novu lozinku podesite preko sigurne veze:",
                    "Ova veza ističe za 1 sat.",
                    "Ako ovo niste zatražili, možete ignorisati ovu e-poštu."
            );
            default -> new ResetEmailCopy(
                    "Reset your password",
                    "Hello",
                    "there",
                    "We received a request to reset your password.",
                    "Open this link to set a new one:",
                    "This link expires in 1 hour.",
                    "If you did not request this, you can safely ignore this email."
            );
        };
    }

    private EmployeeAccountEmailCopy employeeAccountEmailCopy(String locale) {
        return switch (normalizeSupportedLocale(locale)) {
            case "sl" -> new EmployeeAccountEmailCopy(
                    "Vaš uporabniški račun Calendra je bil ustvarjen",
                    "Nov uporabniški račun",
                    "Dobrodošli v Calendri",
                    "Pozdravljeni",
                    "pozdravljeni",
                    "Pozdravljeni",
                    "pozdravljeni",
                    "Za vas je bil v Calendri ustvarjen uporabniški račun za",
                    "Za vas je bil v Calendri ustvarjen uporabniški račun za",
                    "Za dokončanje nastavitve ustvarite geslo prek varne povezave spodaj.",
                    "Za dokončanje nastavitve ustvarite geslo prek varne povezave spodaj.",
                    "Nastavite geslo",
                    "Povezava poteče čez 1 uro.",
                    "Če tega računa niste pričakovali, lahko to e-pošto prezrete.",
                    "Zaradi varnosti Calendra gesel ne pošilja po e-pošti. Geslo boste izbrali sami na strani za nastavitev.",
                    "Zaradi varnosti Calendra gesel ne pošilja po e-pošti.",
                    "Podatki računa",
                    "Podjetje",
                    "E-pošta za prijavo",
                    "Vloga",
                    "Dostopna vloga",
                    "vaše podjetje",
                    "Administrator",
                    "Zaposleni",
                    "Super administrator",
                    "Dostop do koledarja"
            );
            case "sr" -> new EmployeeAccountEmailCopy(
                    "Vaš Calendra korisnički nalog je kreiran",
                    "Novi korisnički nalog",
                    "Dobro došli u Calendra",
                    "Zdravo",
                    "zdravo",
                    "Zdravo",
                    "zdravo",
                    "Za vas je kreiran korisnički nalog u Calendra za",
                    "Za vas je kreiran korisnički nalog u Calendra za",
                    "Da završite podešavanje, kreirajte lozinku preko sigurne veze ispod.",
                    "Da završite podešavanje, kreirajte lozinku preko sigurne veze ispod.",
                    "Podesite lozinku",
                    "Ova veza ističe za 1 sat.",
                    "Ako niste očekivali ovaj nalog, možete ignorisati ovu e-poštu.",
                    "Iz bezbednosnih razloga, Calendra ne šalje lozinke e-poštom. Svoju lozinku ćete izabrati na stranici za podešavanje.",
                    "Iz bezbednosnih razloga, Calendra ne šalje lozinke e-poštom.",
                    "Podaci naloga",
                    "Kompanija",
                    "E-pošta za prijavu",
                    "Uloga",
                    "Pristupna uloga",
                    "vašu kompaniju",
                    "Administrator",
                    "Zaposleni",
                    "Super administrator",
                    "Pristup kalendaru"
            );
            default -> new EmployeeAccountEmailCopy(
                    "Your Calendra account has been created",
                    "New user account",
                    "Welcome to Calendra",
                    "Hi",
                    "there",
                    "Hi",
                    "there",
                    "A user account has been created for you in Calendra for",
                    "A user account has been created for you in Calendra for",
                    "To finish setup, please create your password using the secure link below.",
                    "To finish setup, create your password using this secure link:",
                    "Set your password",
                    "This link expires in 1 hour.",
                    "If you were not expecting this account, you can ignore this email.",
                    "For security reasons, Calendra does not send passwords by email. You will choose your own password on the setup page.",
                    "For security reasons, Calendra does not send passwords by email.",
                    "Account details",
                    "Company",
                    "Login email",
                    "Role",
                    "Access role",
                    "your company",
                    "Administrator",
                    "Employee",
                    "Super admin",
                    "Calendar access"
            );
        };
    }

    private record ResetEmailCopy(
            String subject,
            String greetingPrefix,
            String greetingFallback,
            String requestText,
            String openLinkText,
            String expiryText,
            String ignoreText
    ) {}

    private record EmployeeAccountEmailCopy(
            String subject,
            String badge,
            String title,
            String htmlGreetingPrefix,
            String htmlGreetingFallback,
            String plainGreetingPrefix,
            String plainGreetingFallback,
            String htmlAccountCreatedPrefix,
            String plainAccountCreatedPrefix,
            String htmlFinishSetup,
            String plainFinishSetup,
            String buttonLabel,
            String expiryText,
            String unexpectedText,
            String securityHtmlText,
            String securityPlainText,
            String accountDetailsTitle,
            String companyLabel,
            String loginEmailLabel,
            String roleLabel,
            String accessRoleLabel,
            String companyFallback,
            String administratorRoleLabel,
            String employeeRoleLabel,
            String superAdminRoleLabel,
            String defaultCalendarAccessRoleLabel
    ) {}

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

