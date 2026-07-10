package com.example.app.email;

import com.example.app.company.Company;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import jakarta.mail.MessagingException;
import java.io.UnsupportedEncodingException;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

@Service
public class TenantEmailSenderResolver {
    public enum EmailPurpose {
        CLIENT_NOTIFICATION,
        PLATFORM_SECURITY
    }

    public record ResolvedEmailSender(
            String mode,
            String fromEmail,
            String fromName,
            String replyToEmail,
            String verifiedDomain,
            boolean customDomain
    ) {
        public String fromHeader() {
            if (fromName == null || fromName.isBlank()) {
                return fromEmail;
            }
            return fromName + " <" + fromEmail + ">";
        }
    }

    private static final Pattern BASIC_EMAIL = Pattern.compile("^[^@\\s<>]+@[^@\\s<>]+\\.[^@\\s<>]+$");
    private final AppSettingRepository settings;
    private final String configuredMailFrom;
    private final String fallbackMailUsername;

    public TenantEmailSenderResolver(
            AppSettingRepository settings,
            @Value("${app.mail.from:}") String configuredMailFrom,
            @Value("${spring.mail.username:}") String fallbackMailUsername
    ) {
        this.settings = settings;
        this.configuredMailFrom = configuredMailFrom == null ? "" : configuredMailFrom.trim();
        this.fallbackMailUsername = fallbackMailUsername == null ? "" : fallbackMailUsername.trim();
    }

    public ResolvedEmailSender resolve(Company company, EmailPurpose purpose) {
        ResolvedEmailSender defaultSender = defaultSender();
        if (purpose != EmailPurpose.CLIENT_NOTIFICATION || company == null || company.getId() == null) {
            return defaultSender;
        }

        Long companyId = company.getId();
        String mode = setting(companyId, SettingKey.EMAIL_SENDER_MODE).orElse("DEFAULT_CALENDRA");
        if (!"CUSTOM_DOMAIN".equalsIgnoreCase(mode.trim())) {
            return defaultSender;
        }

        String status = setting(companyId, SettingKey.EMAIL_CUSTOM_DOMAIN_VERIFICATION_STATUS).orElse("");
        if (!isVerifiedStatus(status)) {
            return defaultSender;
        }

        String fromEmail = normalizeEmail(setting(companyId, SettingKey.EMAIL_CUSTOM_FROM_EMAIL).orElse(""));
        if (!isValidEmail(fromEmail)) {
            return defaultSender;
        }

        String verifiedDomain = normalizeDomain(setting(companyId, SettingKey.EMAIL_CUSTOM_DOMAIN).orElse(""));
        if (verifiedDomain.isBlank()) {
            verifiedDomain = domainOf(fromEmail);
        }
        if (!emailBelongsToDomain(fromEmail, verifiedDomain)) {
            return defaultSender;
        }

        String fromName = sanitizeDisplayName(setting(companyId, SettingKey.EMAIL_CUSTOM_FROM_NAME)
                .orElseGet(() -> setting(companyId, SettingKey.COMPANY_NAME)
                        .orElse(company.getName())));
        if (fromName.isBlank()) {
            fromName = sanitizeDisplayName(company.getName());
        }
        String replyTo = normalizeEmail(setting(companyId, SettingKey.EMAIL_CUSTOM_REPLY_TO_EMAIL).orElse(""));
        if (!isValidEmail(replyTo)) {
            replyTo = fromEmail;
        }

        return new ResolvedEmailSender(
                "CUSTOM_DOMAIN",
                fromEmail,
                fromName,
                replyTo,
                verifiedDomain,
                true
        );
    }

    public void applyFrom(MimeMessageHelper helper, Company company, EmailPurpose purpose) throws MessagingException {
        ResolvedEmailSender sender = resolve(company, purpose);
        try {
            if (sender.fromName() != null && !sender.fromName().isBlank()) {
                helper.setFrom(sender.fromEmail(), sender.fromName());
            } else {
                helper.setFrom(sender.fromEmail());
            }
        } catch (UnsupportedEncodingException ex) {
            throw new MessagingException("Invalid sender display name.", ex);
        }
    }

    public void applyReplyTo(MimeMessageHelper helper, Company company, EmailPurpose purpose) throws MessagingException {
        ResolvedEmailSender sender = resolve(company, purpose);
        if (sender.replyToEmail() != null && !sender.replyToEmail().isBlank()) {
            helper.setReplyTo(sender.replyToEmail());
        }
    }

    public void applyFrom(SimpleMailMessage message, Company company, EmailPurpose purpose) {
        ResolvedEmailSender sender = resolve(company, purpose);
        message.setFrom(sender.fromEmail());
        if (sender.replyToEmail() != null && !sender.replyToEmail().isBlank()) {
            message.setReplyTo(sender.replyToEmail());
        }
    }

    private ResolvedEmailSender defaultSender() {
        ParsedAddress parsed = parseAddress(!configuredMailFrom.isBlank()
                ? configuredMailFrom
                : (!fallbackMailUsername.isBlank() ? fallbackMailUsername : "no-reply@calendra.si"));
        String email = isValidEmail(parsed.email()) ? parsed.email() : "no-reply@calendra.si";
        String name = sanitizeDisplayName(parsed.name());
        if (name.isBlank()) {
            name = "Calendra";
        }
        return new ResolvedEmailSender("DEFAULT_CALENDRA", email, name, null, "calendra.si", false);
    }

    private Optional<String> setting(Long companyId, SettingKey key) {
        if (settings == null || companyId == null || key == null) {
            return Optional.empty();
        }
        return settings.findByCompanyIdAndKey(companyId, key)
                .map(AppSetting::getValue)
                .map(String::trim)
                .filter(value -> !value.isBlank());
    }

    private static boolean isVerifiedStatus(String value) {
        String normalized = value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
        return "VERIFIED".equals(normalized) || "SUCCESS".equals(normalized);
    }

    private static String normalizeEmail(String value) {
        if (value == null) return "";
        return value.trim().replace("\r", "").replace("\n", "").toLowerCase(Locale.ROOT);
    }

    public static boolean isValidEmail(String value) {
        return value != null && BASIC_EMAIL.matcher(value.trim()).matches();
    }

    public static String normalizeDomain(String value) {
        if (value == null) return "";
        String domain = value.trim().toLowerCase(Locale.ROOT)
                .replace("\r", "")
                .replace("\n", "");
        while (domain.startsWith(".")) domain = domain.substring(1);
        while (domain.endsWith(".")) domain = domain.substring(0, domain.length() - 1);
        return domain;
    }

    public static String domainOf(String email) {
        if (email == null) return "";
        int at = email.lastIndexOf('@');
        if (at < 0 || at >= email.length() - 1) return "";
        return normalizeDomain(email.substring(at + 1));
    }

    public static boolean emailBelongsToDomain(String email, String verifiedDomain) {
        String emailDomain = domainOf(email);
        String domain = normalizeDomain(verifiedDomain);
        return !emailDomain.isBlank()
                && !domain.isBlank()
                && (emailDomain.equals(domain) || emailDomain.endsWith("." + domain));
    }

    private static String sanitizeDisplayName(String value) {
        if (value == null) return "";
        String sanitized = value.replace("\r", " ").replace("\n", " ").trim();
        return sanitized.length() > 100 ? sanitized.substring(0, 100) : sanitized;
    }

    private static ParsedAddress parseAddress(String raw) {
        if (raw == null) return new ParsedAddress("", "");
        String value = raw.trim();
        int lt = value.lastIndexOf('<');
        int gt = value.lastIndexOf('>');
        if (lt >= 0 && gt > lt) {
            String name = value.substring(0, lt).trim();
            if ((name.startsWith("\"") && name.endsWith("\"")) || (name.startsWith("'") && name.endsWith("'"))) {
                name = name.substring(1, name.length() - 1).trim();
            }
            return new ParsedAddress(normalizeEmail(value.substring(lt + 1, gt)), sanitizeDisplayName(name));
        }
        return new ParsedAddress(normalizeEmail(value), "");
    }

    private record ParsedAddress(String email, String name) {}
}
