package com.example.app.settings;

import com.example.app.user.User;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class BillingModuleAccessService {
    private final AppSettingRepository settings;

    public BillingModuleAccessService(AppSettingRepository settings) {
        this.settings = settings;
    }

    public boolean isBillingEnabled(User user) {
        if (user == null || user.getCompany() == null || user.getCompany().getId() == null) {
            return true;
        }
        return settings.findByCompanyIdAndKey(user.getCompany().getId(), SettingKey.BILLING_ENABLED)
                .map(AppSetting::getValue)
                .map(value -> !"false".equalsIgnoreCase(String.valueOf(value).trim()))
                .orElse(true);
    }

    public void assertBillingEnabled(User user) {
        if (!isBillingEnabled(user)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Billing module is disabled for this tenant.");
        }
    }
}
