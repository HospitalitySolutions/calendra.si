package com.example.app.waitlist;

import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.user.User;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/waitlists/settings")
public class WaitlistSettingsController {
    private final WaitlistSettingsService service;
    private final AppSettingRepository settings;

    public WaitlistSettingsController(WaitlistSettingsService service, AppSettingRepository settings) {
        this.service = service;
        this.settings = settings;
    }

    @GetMapping
    public WaitlistSettingsService.WaitlistSettings get(@AuthenticationPrincipal User me) {
        return service.get(me.getCompany().getId());
    }

    public record SettingsRequest(String value) {}

    @PutMapping
    public WaitlistSettingsService.WaitlistSettings save(@AuthenticationPrincipal User me, @RequestBody SettingsRequest request) {
        Long companyId = me.getCompany().getId();
        String normalized = service.normalizeJson(request == null ? null : request.value());
        AppSetting row = settings.findByCompanyIdAndKey(companyId, SettingKey.WAITLIST_SETTINGS_JSON).orElseGet(() -> {
            AppSetting created = new AppSetting();
            created.setCompany(me.getCompany());
            created.setKey(SettingKey.WAITLIST_SETTINGS_JSON.name());
            return created;
        });
        row.setValue(normalized);
        settings.save(row);
        return service.get(companyId);
    }
}
