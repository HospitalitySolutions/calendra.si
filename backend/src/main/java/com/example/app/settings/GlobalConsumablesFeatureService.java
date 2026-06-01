package com.example.app.settings;

import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class GlobalConsumablesFeatureService {
    private final AppSettingRepository settings;
    private final UserRepository users;

    public GlobalConsumablesFeatureService(AppSettingRepository settings, UserRepository users) {
        this.settings = settings;
        this.users = users;
    }

    public boolean isGloballyEnabled() {
        return users.findAllByRoleOrderByIdAsc(Role.SUPER_ADMIN).stream()
                .findFirst()
                .flatMap(u -> settings.findByCompanyIdAndKey(u.getCompany().getId(), SettingKey.GLOBAL_CONSUMABLES_ENABLED))
                .map(AppSetting::getValue)
                .map(v -> v == null ? "" : v.trim())
                .filter(v -> !v.isBlank())
                .map(v -> "true".equalsIgnoreCase(v) || "1".equals(v))
                .orElse(true);
    }

    public boolean isEnabledForUser(User user) {
        if (user != null && user.getRole() == Role.SUPER_ADMIN) {
            return true;
        }
        return isGloballyEnabled();
    }

    public void assertEnabledForUser(User user) {
        if (!isEnabledForUser(user)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Consumables module is disabled by the platform admin.");
        }
    }
}
