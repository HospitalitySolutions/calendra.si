package com.example.app.settings;

import com.example.app.stripe.StripeConnectService;
import com.example.app.user.Role;
import com.example.app.user.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class GlobalPaymentProviderService {
    private final AppSettingRepository settings;
    private final UserRepository users;
    private final StripeConnectService stripeConnectService;

    public record ProviderCapabilities(boolean stripeEnabled) {}

    public GlobalPaymentProviderService(AppSettingRepository settings, UserRepository users) {
        this(settings, users, null);
    }

    @Autowired
    public GlobalPaymentProviderService(
            AppSettingRepository settings,
            UserRepository users,
            StripeConnectService stripeConnectService
    ) {
        this.settings = settings;
        this.users = users;
        this.stripeConnectService = stripeConnectService;
    }

    public boolean isStripeEnabled() {
        return readGlobalBoolean(SettingKey.GLOBAL_PAYMENTS_STRIPE_ENABLED, true);
    }

    /**
     * Registration subscription card payments are issued by the Platform Admin
     * tenant. They may only be offered after Stripe is globally enabled and that
     * tenant's connected account is ready to accept charges.
     */
    public boolean isPlatformAdminStripeReady() {
        if (!isStripeEnabled() || stripeConnectService == null) {
            return false;
        }
        return users.findAllByRoleOrderByIdAsc(Role.SUPER_ADMIN).stream()
                .map(user -> user.getCompany())
                .filter(company -> company != null && company.getId() != null)
                .findFirst()
                .map(stripeConnectService::isReadyForCompany)
                .orElse(false);
    }

    public ProviderCapabilities capabilities() {
        return new ProviderCapabilities(isStripeEnabled());
    }

    private boolean readGlobalBoolean(SettingKey key, boolean fallback) {
        return users.findAllByRoleOrderByIdAsc(Role.SUPER_ADMIN).stream()
                .map(user -> user.getCompany())
                .filter(company -> company != null && company.getId() != null)
                .findFirst()
                .flatMap(company -> settings.findByCompanyIdAndKey(company.getId(), key))
                .map(AppSetting::getValue)
                .map(v -> v == null ? "" : v.trim())
                .filter(v -> !v.isBlank())
                .map(v -> "true".equalsIgnoreCase(v) || "1".equals(v))
                .orElse(fallback);
    }
}
