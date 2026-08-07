package com.example.app.waitlist;

import com.example.app.activitylog.ActivityAction;
import com.example.app.activitylog.ActivityDetails;
import com.example.app.activitylog.ActivityLogService;
import com.example.app.activitylog.ActivityModule;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.settings.TenantFeatureAccessService;
import com.example.app.user.User;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/waitlists/settings")
public class WaitlistSettingsController {
    private final WaitlistSettingsService service;
    private final AppSettingRepository settings;
    private final TenantFeatureAccessService featureAccess;
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private ActivityLogService activityLogs;

    public WaitlistSettingsController(WaitlistSettingsService service, AppSettingRepository settings, TenantFeatureAccessService featureAccess) {
        this.service = service;
        this.settings = settings;
        this.featureAccess = featureAccess;
    }

    @GetMapping
    public WaitlistSettingsService.WaitlistSettings get(@AuthenticationPrincipal User me) {
        featureAccess.assertWaitlistEnabled(me.getCompany().getId());
        return service.get(me.getCompany().getId());
    }

    public record SettingsRequest(String value) {}

    @PutMapping
    public WaitlistSettingsService.WaitlistSettings save(@AuthenticationPrincipal User me, @RequestBody SettingsRequest request) {
        Long companyId = me.getCompany().getId();
        featureAccess.assertWaitlistEnabled(companyId);
        String normalized = service.normalizeJson(request == null ? null : request.value());
        AppSetting row = settings.findByCompanyIdAndKey(companyId, SettingKey.WAITLIST_SETTINGS_JSON).orElseGet(() -> {
            AppSetting created = new AppSetting();
            created.setCompany(me.getCompany());
            created.setKey(SettingKey.WAITLIST_SETTINGS_JSON.name());
            return created;
        });
        row.setValue(normalized);
        settings.save(row);
        WaitlistSettingsService.WaitlistSettings result = service.get(companyId);
        if (activityLogs != null) {
            activityLogs.recordUser(me, ActivityModule.CONFIGURATION, ActivityAction.WAITLIST_SETTINGS_UPDATED,
                    "WAITLIST_SETTINGS", companyId, "Waitlist settings", "Updated waitlist settings", null, null,
                    ActivityDetails.of("targetPath", "/configuration?tab=booking"));
        }
        return result;
    }
}
