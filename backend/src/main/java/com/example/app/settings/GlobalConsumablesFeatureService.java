package com.example.app.settings;

import com.example.app.user.User;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class GlobalConsumablesFeatureService {
    private final TenantFeatureAccessService tenantFeatures;

    public GlobalConsumablesFeatureService(TenantFeatureAccessService tenantFeatures) {
        this.tenantFeatures = tenantFeatures;
    }

    public boolean isEnabledForCompany(Long companyId) {
        return companyId != null && companyId > 0 && tenantFeatures.areConsumablesEnabled(companyId);
    }

    public boolean isEnabledForUser(User user) {
        if (user == null || user.getCompany() == null) return false;
        return isEnabledForCompany(user.getCompany().getId());
    }

    public void assertEnabledForUser(User user) {
        if (!isEnabledForUser(user)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Consumables are disabled. Enable Porabni material in App settings (Premium).");
        }
    }
}
