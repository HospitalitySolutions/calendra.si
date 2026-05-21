package com.example.app.settings;

import com.example.app.user.Role;
import com.example.app.user.UserRepository;
import org.springframework.stereotype.Service;

@Service
public class GlobalMessagingProviderService {
    private final AppSettingRepository settings;
    private final UserRepository users;

    public record ProviderCapabilities(boolean whatsappEnabled, boolean viberEnabled) {}

    public GlobalMessagingProviderService(AppSettingRepository settings, UserRepository users) {
        this.settings = settings;
        this.users = users;
    }

    public boolean isWhatsAppEnabled() {
        return readGlobalBoolean(SettingKey.GLOBAL_MESSAGING_WHATSAPP_ENABLED, true);
    }

    public boolean isViberEnabled() {
        return readGlobalBoolean(SettingKey.GLOBAL_MESSAGING_VIBER_ENABLED, true);
    }

    public ProviderCapabilities capabilities() {
        return new ProviderCapabilities(isWhatsAppEnabled(), isViberEnabled());
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
