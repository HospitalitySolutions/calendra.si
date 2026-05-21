package com.example.app.settings;

import com.example.app.user.Role;
import com.example.app.user.UserRepository;
import org.springframework.stereotype.Service;

@Service
public class GlobalAjpesPrsService {
    private final AppSettingRepository settings;
    private final UserRepository users;

    public GlobalAjpesPrsService(AppSettingRepository settings, UserRepository users) {
        this.settings = settings;
        this.users = users;
    }

    public boolean isPrsEnabled() {
        return users.findAllByRoleOrderByIdAsc(Role.SUPER_ADMIN).stream()
                .findFirst()
                .flatMap(u -> settings.findByCompanyIdAndKey(u.getCompany().getId(), SettingKey.GLOBAL_AJPES_PRS_ENABLED))
                .map(AppSetting::getValue)
                .map(v -> v == null ? "" : v.trim())
                .filter(v -> !v.isBlank())
                .map(v -> "true".equalsIgnoreCase(v) || "1".equals(v))
                .orElse(false);
    }
}
