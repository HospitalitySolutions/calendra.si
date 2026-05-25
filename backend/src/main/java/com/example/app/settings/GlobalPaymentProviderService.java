package com.example.app.settings;

import com.example.app.user.Role;
import com.example.app.user.UserRepository;
import org.springframework.stereotype.Service;

@Service
public class GlobalPaymentProviderService {
    private final AppSettingRepository settings;
    private final UserRepository users;

    public record ProviderCapabilities(boolean stripeEnabled, boolean paypalEnabled) {}

    public GlobalPaymentProviderService(AppSettingRepository settings, UserRepository users) {
        this.settings = settings;
        this.users = users;
    }

    public boolean isStripeEnabled() {
        return readGlobalBoolean(SettingKey.GLOBAL_PAYMENTS_STRIPE_ENABLED, true);
    }

    public boolean isPaypalEnabled() {
        return readGlobalBoolean(SettingKey.GLOBAL_PAYMENTS_PAYPAL_ENABLED, false);
    }

    public ProviderCapabilities capabilities() {
        return new ProviderCapabilities(isStripeEnabled(), isPaypalEnabled());
    }

    private boolean readGlobalBoolean(SettingKey key, boolean fallback) {
        return users.findAllByRoleOrderByIdAsc(Role.SUPER_ADMIN).stream()
                .findFirst()
                .flatMap(u -> settings.findByCompanyIdAndKey(u.getCompany().getId(), key))
                .map(AppSetting::getValue)
                .map(v -> v == null ? "" : v.trim())
                .filter(v -> !v.isBlank())
                .map(v -> "true".equalsIgnoreCase(v) || "1".equals(v))
                .orElse(fallback);
    }
}
