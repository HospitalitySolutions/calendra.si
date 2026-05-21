package com.example.app.stripe;

import com.example.app.company.Company;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingsCryptoService;
import com.example.app.settings.SettingKey;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class StripePlatformSettingsService {
    private final AppSettingRepository settings;
    private final UserRepository users;
    private final SettingsCryptoService crypto;
    private final Environment environment;
    private final StripeConfig legacyConfig;

    public StripePlatformSettingsService(
            AppSettingRepository settings,
            UserRepository users,
            SettingsCryptoService crypto,
            Environment environment,
            StripeConfig legacyConfig
    ) {
        this.settings = settings;
        this.users = users;
        this.crypto = crypto;
        this.environment = environment;
        this.legacyConfig = legacyConfig;
    }

    public StripeModeSettings modeSettings(StripeConnectMode mode) {
        return new StripeModeSettings(
                mode,
                readBoolean(key(mode, "ENABLED"), mode == StripeConnectMode.SANDBOX),
                readSecret(key(mode, "SECRET_KEY"), fallbackSecretKey(mode)),
                readPlain(key(mode, "PUBLISHABLE_KEY"), fallbackPublishableKey(mode)),
                readSecret(key(mode, "WEBHOOK_SECRET"), fallbackWebhookSecret(mode)),
                readPlain(key(mode, "SUCCESS_URL"), legacyConfig.successUrl()),
                readPlain(key(mode, "CANCEL_URL"), legacyConfig.cancelUrl()),
                normalizeCurrency(readPlain(key(mode, "CURRENCY"), legacyConfig.currency())),
                parseDecimal(readPlain(key(mode, "APPLICATION_FEE_PERCENT"), "0")),
                parseLong(readPlain(key(mode, "APPLICATION_FEE_FIXED_MINOR"), "0"))
        );
    }

    public List<String> webhookSecrets() {
        List<String> out = new ArrayList<>();
        addNonBlank(out, modeSettings(StripeConnectMode.SANDBOX).webhookSecret());
        addNonBlank(out, modeSettings(StripeConnectMode.PRODUCTION).webhookSecret());
        addNonBlank(out, legacyConfig.webhookSecret());
        return out.stream().distinct().toList();
    }

    public PlatformStripeSettingsDto readForAdmin() {
        return new PlatformStripeSettingsDto(toAdminMode(StripeConnectMode.SANDBOX), toAdminMode(StripeConnectMode.PRODUCTION));
    }

    @Transactional
    public PlatformStripeSettingsDto saveForAdmin(Company adminCompany, PlatformStripeSettingsDto request) {
        if (request == null) return readForAdmin();
        if (request.sandbox() != null) saveMode(adminCompany, StripeConnectMode.SANDBOX, request.sandbox());
        if (request.production() != null) saveMode(adminCompany, StripeConnectMode.PRODUCTION, request.production());
        return readForAdmin();
    }

    public long applicationFeeAmountMinor(StripeConnectMode mode, java.math.BigDecimal amountMajor) {
        StripeModeSettings cfg = modeSettings(mode);
        if (amountMajor == null || amountMajor.compareTo(BigDecimal.ZERO) <= 0) return 0L;
        long amountMinor = amountMajor.multiply(BigDecimal.valueOf(100)).setScale(0, java.math.RoundingMode.HALF_UP).longValue();
        long percentFee = BigDecimal.valueOf(amountMinor)
                .multiply(cfg.applicationFeePercent().max(BigDecimal.ZERO))
                .divide(BigDecimal.valueOf(100), 0, java.math.RoundingMode.HALF_UP)
                .longValue();
        long fixed = Math.max(0L, cfg.applicationFeeFixedMinor());
        long fee = percentFee + fixed;
        return Math.max(0L, Math.min(fee, amountMinor));
    }

    private AdminStripeModeSettingsDto toAdminMode(StripeConnectMode mode) {
        StripeModeSettings cfg = modeSettings(mode);
        return new AdminStripeModeSettingsDto(
                cfg.enabled(),
                cfg.secretKey() == null || cfg.secretKey().isBlank(),
                cfg.publishableKey(),
                cfg.webhookSecret() == null || cfg.webhookSecret().isBlank(),
                cfg.successUrl(),
                cfg.cancelUrl(),
                cfg.currency().toUpperCase(java.util.Locale.ROOT),
                cfg.applicationFeePercent().stripTrailingZeros().toPlainString(),
                String.valueOf(cfg.applicationFeeFixedMinor())
        );
    }

    private void saveMode(Company company, StripeConnectMode mode, AdminStripeModeSettingsDto value) {
        savePlain(company, key(mode, "ENABLED"), value.enabled() ? "true" : "false");
        saveSecretIfPresent(company, key(mode, "SECRET_KEY"), value.secretKey());
        savePlain(company, key(mode, "PUBLISHABLE_KEY"), blankToEmpty(value.publishableKey()));
        saveSecretIfPresent(company, key(mode, "WEBHOOK_SECRET"), value.webhookSecret());
        savePlain(company, key(mode, "SUCCESS_URL"), blankToEmpty(value.successUrl()));
        savePlain(company, key(mode, "CANCEL_URL"), blankToEmpty(value.cancelUrl()));
        savePlain(company, key(mode, "CURRENCY"), normalizeCurrency(value.currency()).toUpperCase(java.util.Locale.ROOT));
        savePlain(company, key(mode, "APPLICATION_FEE_PERCENT"), parseDecimal(value.applicationFeePercent()).max(BigDecimal.ZERO).stripTrailingZeros().toPlainString());
        savePlain(company, key(mode, "APPLICATION_FEE_FIXED_MINOR"), String.valueOf(Math.max(0L, parseLong(value.applicationFeeFixedMinor()))));
    }

    private SettingKey key(StripeConnectMode mode, String suffix) {
        String prefix = mode == StripeConnectMode.PRODUCTION ? "GLOBAL_STRIPE_PRODUCTION_" : "GLOBAL_STRIPE_SANDBOX_";
        return SettingKey.valueOf(prefix + suffix);
    }

    private String readPlain(SettingKey key, String fallback) {
        return superAdminCompanyId()
                .flatMap(companyId -> settings.findByCompanyIdAndKey(companyId, key))
                .map(AppSetting::getValue)
                .map(v -> v == null ? "" : v.trim())
                .filter(v -> !v.isBlank())
                .orElse(fallback == null ? "" : fallback.trim());
    }

    private String readSecret(SettingKey key, String fallback) {
        return superAdminCompanyId()
                .flatMap(companyId -> settings.findByCompanyIdAndKey(companyId, key))
                .map(AppSetting::getValue)
                .map(crypto::decryptIfEncrypted)
                .map(v -> v == null ? "" : v.trim())
                .filter(v -> !v.isBlank())
                .orElse(fallback == null ? "" : fallback.trim());
    }

    private boolean readBoolean(SettingKey key, boolean fallback) {
        String value = readPlain(key, fallback ? "true" : "false");
        return "true".equalsIgnoreCase(value) || "1".equals(value);
    }

    private Optional<Long> superAdminCompanyId() {
        return users.findAllByRoleOrderByIdAsc(Role.SUPER_ADMIN).stream()
                .findFirst()
                .map(User::getCompany)
                .map(Company::getId);
    }

    private void savePlain(Company company, SettingKey key, String value) {
        AppSetting row = settings.findByCompanyIdAndKey(company.getId(), key).orElseGet(() -> {
            AppSetting created = new AppSetting();
            created.setCompany(company);
            created.setKey(key.name());
            return created;
        });
        row.setValue(value == null ? "" : value.trim());
        settings.save(row);
    }

    private void saveSecretIfPresent(Company company, SettingKey key, String value) {
        String trimmed = value == null ? "" : value.trim();
        if (trimmed.isBlank() || "••••••••••••••••".equals(trimmed)) {
            return;
        }
        savePlain(company, key, crypto.encrypt(trimmed));
    }

    private String fallbackSecretKey(StripeConnectMode mode) {
        String envKey = mode == StripeConnectMode.PRODUCTION ? "STRIPE_SECRET_KEY_LIVE" : "STRIPE_SECRET_KEY_TEST";
        String value = environment.getProperty(envKey);
        if (value != null && !value.isBlank()) return value.trim();
        return mode == StripeConnectMode.SANDBOX ? legacyConfig.secretKey() : "";
    }

    private String fallbackPublishableKey(StripeConnectMode mode) {
        String envKey = mode == StripeConnectMode.PRODUCTION ? "STRIPE_PUBLISHABLE_KEY_LIVE" : "STRIPE_PUBLISHABLE_KEY_TEST";
        String value = environment.getProperty(envKey);
        if (value != null && !value.isBlank()) return value.trim();
        return mode == StripeConnectMode.SANDBOX ? legacyConfig.publishableKey() : "";
    }

    private String fallbackWebhookSecret(StripeConnectMode mode) {
        String envKey = mode == StripeConnectMode.PRODUCTION ? "STRIPE_WEBHOOK_SECRET_LIVE" : "STRIPE_WEBHOOK_SECRET_TEST";
        String value = environment.getProperty(envKey);
        if (value != null && !value.isBlank()) return value.trim();
        return mode == StripeConnectMode.SANDBOX ? legacyConfig.webhookSecret() : "";
    }

    private static BigDecimal parseDecimal(String raw) {
        try {
            String v = raw == null ? "" : raw.trim().replace(',', '.');
            if (v.isBlank()) return BigDecimal.ZERO;
            return new BigDecimal(v);
        } catch (Exception ignored) {
            return BigDecimal.ZERO;
        }
    }

    private static long parseLong(String raw) {
        try {
            String v = raw == null ? "" : raw.trim();
            if (v.isBlank()) return 0L;
            return Long.parseLong(v);
        } catch (Exception ignored) {
            return 0L;
        }
    }

    private static String normalizeCurrency(String raw) {
        String value = raw == null ? "" : raw.trim();
        if (value.isBlank()) return "eur";
        return value.toLowerCase(java.util.Locale.ROOT);
    }

    private static String blankToEmpty(String value) {
        return value == null ? "" : value.trim();
    }

    private static void addNonBlank(List<String> list, String value) {
        if (value != null && !value.isBlank()) list.add(value.trim());
    }

    public record StripeModeSettings(
            StripeConnectMode mode,
            boolean enabled,
            String secretKey,
            String publishableKey,
            String webhookSecret,
            String successUrl,
            String cancelUrl,
            String currency,
            BigDecimal applicationFeePercent,
            long applicationFeeFixedMinor
    ) {}

    public record PlatformStripeSettingsDto(AdminStripeModeSettingsDto sandbox, AdminStripeModeSettingsDto production) {}

    public record AdminStripeModeSettingsDto(
            boolean enabled,
            boolean secretKeyMissing,
            String publishableKey,
            boolean webhookSecretMissing,
            String successUrl,
            String cancelUrl,
            String currency,
            String applicationFeePercent,
            String applicationFeeFixedMinor,
            String secretKey,
            String webhookSecret
    ) {
        public AdminStripeModeSettingsDto(
                boolean enabled,
                boolean secretKeyMissing,
                String publishableKey,
                boolean webhookSecretMissing,
                String successUrl,
                String cancelUrl,
                String currency,
                String applicationFeePercent,
                String applicationFeeFixedMinor
        ) {
            this(enabled, secretKeyMissing, publishableKey, webhookSecretMissing, successUrl, cancelUrl, currency, applicationFeePercent, applicationFeeFixedMinor, "", "");
        }
    }
}
