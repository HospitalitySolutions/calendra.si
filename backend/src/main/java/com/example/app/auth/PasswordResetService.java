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
import org.springframework.core.io.ClassPathResource;
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
    private static final String CALENDRA_LOGO_CONTENT_ID = "calendraLogo";
    private static final String CALENDRA_LOGO_CLASSPATH = "static/widget/calendra-transparent-logo.png";

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
            helper.addInline(
                    CALENDRA_LOGO_CONTENT_ID,
                    new ClassPathResource(CALENDRA_LOGO_CLASSPATH),
                    "image/png"
            );
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
        String email = user.getEmail() == null ? "" : user.getEmail().trim().toLowerCase(Locale.ROOT);
        return """
                %s %s,

                %s %s.
                %s

                %s

                %s
                %s: %s
                %s: %s

                %s
                %s
                """.formatted(
                copy.plainGreetingPrefix(),
                firstName,
                copy.plainAccountCreatedPrefix(),
                companyName,
                copy.plainFinishSetup(),
                resetUrl,
                copy.expiryText(),
                copy.companyLabel(),
                companyName,
                copy.loginEmailLabel(),
                email,
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
        String safeResetUrl = escapeHtml(resetUrl);

        return """
                <!doctype html>
                <html lang="en">
                <head>
                  <meta charset="UTF-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <meta name="color-scheme" content="light">
                  <meta name="supported-color-schemes" content="light">
                  <style>
                    @media only screen and (max-width: 640px) {
                      .email-shell { padding: 16px 10px !important; }
                      .email-card { border-radius: 18px !important; }
                      .email-content { padding: 28px 22px 24px !important; }
                      .email-title { font-size: 27px !important; }
                      .details-value { text-align: left !important; padding-top: 2px !important; }
                    }
                  </style>
                </head>
                <body style="margin:0;padding:0;background:#f3f6fb;font-family:Arial,'Helvetica Neue',sans-serif;color:#0f172a;-webkit-font-smoothing:antialiased;">
                  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">%s</div>
                  <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0" style="width:100%%;background:#f3f6fb;border-collapse:collapse;">
                    <tr>
                      <td align="center" class="email-shell" style="padding:34px 16px;">
                        <table role="presentation" width="620" cellspacing="0" cellpadding="0" border="0" class="email-card" style="width:100%%;max-width:620px;background:#ffffff;border:1px solid #e5eaf2;border-radius:24px;border-collapse:separate;box-shadow:0 16px 42px rgba(15,23,42,0.08);overflow:hidden;">
                          <tr>
                            <td class="email-content" style="padding:32px 38px 28px;">
                              <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0" style="width:100%%;border-collapse:collapse;">
                                <tr>
                                  <td style="padding:0 0 18px;">
                                    <img src="cid:%s" width="190" alt="Calendra" style="display:block;width:190px;max-width:62%%;height:auto;border:0;outline:none;text-decoration:none;">
                                  </td>
                                </tr>
                                <tr>
                                  <td style="padding:0 0 16px;">
                                    <span style="display:inline-block;background:#edf5ff;color:#1769e0;border-radius:999px;padding:7px 12px;font-size:12px;line-height:16px;font-weight:700;">%s</span>
                                  </td>
                                </tr>
                                <tr>
                                  <td style="padding:0;">
                                    <h1 class="email-title" style="margin:0 0 14px;font-size:30px;line-height:1.2;letter-spacing:-0.5px;color:#101828;font-weight:800;">%s</h1>
                                    <p style="margin:0 0 8px;font-size:15px;line-height:1.65;color:#344054;">%s %s,</p>
                                    <p style="margin:0 0 22px;font-size:15px;line-height:1.65;color:#344054;">%s <strong style="color:#101828;">%s</strong>. %s</p>
                                  </td>
                                </tr>
                                <tr>
                                  <td style="padding:0 0 18px;">
                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate;">
                                      <tr>
                                        <td align="center" bgcolor="#2563eb" style="border-radius:12px;background:#2563eb;box-shadow:0 6px 14px rgba(37,99,235,0.22);">
                                          <a href="%s" style="display:inline-block;padding:14px 22px;color:#ffffff;font-size:14px;line-height:18px;font-weight:700;text-decoration:none;border-radius:12px;">%s</a>
                                        </td>
                                      </tr>
                                    </table>
                                  </td>
                                </tr>
                                <tr>
                                  <td style="padding:0 0 22px;">
                                    <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0" style="width:100%%;background:#f7faff;border:1px solid #dce9fb;border-radius:12px;border-collapse:separate;">
                                      <tr>
                                        <td width="46" valign="top" style="padding:16px 0 16px 16px;">
                                          <div style="width:24px;height:24px;line-height:24px;text-align:center;border:2px solid #3b82f6;border-radius:50%%;color:#2563eb;font-size:14px;font-weight:800;box-sizing:border-box;">i</div>
                                        </td>
                                        <td style="padding:15px 16px 15px 10px;">
                                          <div style="font-size:13px;line-height:18px;color:#172033;font-weight:700;margin:0 0 2px;">%s</div>
                                          <div style="font-size:12px;line-height:18px;color:#667085;">%s</div>
                                        </td>
                                      </tr>
                                    </table>
                                  </td>
                                </tr>
                                <tr>
                                  <td style="border-top:1px solid #edf0f5;padding:20px 0 12px;">
                                    <h2 style="margin:0;font-size:16px;line-height:22px;color:#101828;font-weight:700;">%s</h2>
                                  </td>
                                </tr>
                                <tr>
                                  <td style="padding:0;">
                                    <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0" style="width:100%%;background:#ffffff;border:1px solid #e6eaf0;border-radius:12px;border-collapse:separate;overflow:hidden;">
                                      %s
                                      %s
                                    </table>
                                  </td>
                                </tr>
                                <tr>
                                  <td style="padding:22px 0 0;">
                                    <p style="margin:0;font-size:12px;line-height:18px;color:#7b8798;">%s</p>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </body>
                </html>
                """.formatted(
                copy.preheader(),
                CALENDRA_LOGO_CONTENT_ID,
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
                accountDetailRow("&#9638;", copy.companyLabel(), companyName, false, false),
                accountDetailRow("&#9993;", copy.loginEmailLabel(), email, true, true),
                copy.securityHtmlText()
        );
    }

    private String accountDetailRow(String icon, String label, String value, boolean valueIsLink, boolean addTopBorder) {
        String renderedValue = valueIsLink
                ? "<a href=\"mailto:" + value + "\" style=\"color:#2563eb;text-decoration:none;font-weight:700;\">" + value + "</a>"
                : value;
        return "<tr>"
                + "<td colspan=\"2\" style=\"height:1px;padding:0;background:" + (addTopBorder ? "#edf0f5" : "#ffffff") + ";font-size:0;line-height:0;\">&nbsp;</td>"
                + "</tr>"
                + "<tr>"
                + "<td valign=\"middle\" style=\"padding:12px 8px 12px 14px;\">"
                + "<table role=\"presentation\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"border-collapse:collapse;\"><tr>"
                + "<td width=\"32\" height=\"32\" align=\"center\" valign=\"middle\" style=\"width:32px;height:32px;background:#edf5ff;border-radius:50%;color:#2563eb;font-size:16px;line-height:32px;font-weight:700;\">" + icon + "</td>"
                + "<td style=\"padding-left:10px;font-size:13px;line-height:18px;color:#344054;font-weight:600;white-space:nowrap;\">" + escapeHtml(label) + "</td>"
                + "</tr></table>"
                + "</td>"
                + "<td class=\"details-value\" align=\"right\" valign=\"middle\" style=\"padding:12px 14px 12px 8px;text-align:right;font-size:13px;line-height:18px;color:#101828;font-weight:700;\">" + renderedValue + "</td>"
                + "</tr>";
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
                    "Vaš račun je pripravljen. Nastavite geslo in se prijavite v Calendro.",
                    "Nov uporabniški račun",
                    "Dobrodošli v Calendri! 👋",
                    "Pozdravljeni",
                    "pozdravljeni",
                    "Pozdravljeni",
                    "pozdravljeni",
                    "Za vas je bil v Calendri ustvarjen uporabniški račun za",
                    "Za vas je bil v Calendri ustvarjen uporabniški račun za",
                    "Za dokončanje nastavitve vašega gesla kliknite spodnji gumb.",
                    "Za dokončanje nastavitve vašega gesla odprite spodnjo povezavo.",
                    "Nastavite geslo",
                    "Povezava poteče čez 1 uro.",
                    "Če tega niste zahtevali, lahko to sporočilo varno ignorirate.",
                    "Zaradi varnosti povezava deluje samo enkrat in je časovno omejena.",
                    "Zaradi varnosti povezava deluje samo enkrat in je časovno omejena.",
                    "Podatki računa",
                    "Podjetje",
                    "E-pošta za prijavo",
                    "vaše podjetje"
            );
            case "sr" -> new EmployeeAccountEmailCopy(
                    "Vaš Calendra korisnički nalog je kreiran",
                    "Vaš nalog je spreman. Podesite lozinku i prijavite se u Calendra.",
                    "Novi korisnički nalog",
                    "Dobro došli u Calendra! 👋",
                    "Zdravo",
                    "zdravo",
                    "Zdravo",
                    "zdravo",
                    "Za vas je kreiran korisnički nalog u Calendra za",
                    "Za vas je kreiran korisnički nalog u Calendra za",
                    "Da završite podešavanje lozinke, kliknite na dugme ispod.",
                    "Da završite podešavanje lozinke, otvorite vezu ispod.",
                    "Podesite lozinku",
                    "Ova veza ističe za 1 sat.",
                    "Ako ovo niste zatražili, možete bezbedno ignorisati ovu poruku.",
                    "Iz bezbednosnih razloga, veza radi samo jednom i vremenski je ograničena.",
                    "Iz bezbednosnih razloga, veza radi samo jednom i vremenski je ograničena.",
                    "Podaci naloga",
                    "Kompanija",
                    "E-pošta za prijavu",
                    "vašu kompaniju"
            );
            default -> new EmployeeAccountEmailCopy(
                    "Your Calendra account has been created",
                    "Your account is ready. Set your password and sign in to Calendra.",
                    "New user account",
                    "Welcome to Calendra! 👋",
                    "Hi",
                    "there",
                    "Hi",
                    "there",
                    "A user account has been created for you in Calendra for",
                    "A user account has been created for you in Calendra for",
                    "To finish setting up your password, click the button below.",
                    "To finish setting up your password, open the link below.",
                    "Set your password",
                    "This link expires in 1 hour.",
                    "If you did not request this, you can safely ignore this message.",
                    "For security, this link works only once and is time-limited.",
                    "For security, this link works only once and is time-limited.",
                    "Account details",
                    "Company",
                    "Login email",
                    "your company"
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
            String preheader,
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
            String companyFallback
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

