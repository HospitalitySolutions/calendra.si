package com.example.app.session;

import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Keeps tenant-wide service-break defaults and per-service overrides in sync. */
@Service
public class SessionTypeBreakSettingsService {
    public static final int MIN_BREAK_MINUTES = 0;
    public static final int MAX_BREAK_MINUTES = 180;
    public static final int BREAK_STEP_MINUTES = 5;

    private final AppSettingRepository settings;
    private final SessionTypeRepository sessionTypes;

    public SessionTypeBreakSettingsService(AppSettingRepository settings, SessionTypeRepository sessionTypes) {
        this.settings = settings;
        this.sessionTypes = sessionTypes;
    }

    public int defaultBreakMinutes(Long companyId) {
        if (companyId == null) return 0;
        String raw = settings.findByCompanyIdAndKey(companyId, SettingKey.DEFAULT_SERVICE_BREAK_MINUTES)
                .map(setting -> setting.getValue())
                .orElse("0");
        return normalizeDefault(raw);
    }

    public int effectiveBreakMinutes(SessionType type) {
        if (type == null) return 0;
        if (type.isBreakMinutesOverridden()) {
            return normalizeSpecific(type.getBreakMinutes());
        }
        Long companyId = type.getCompany() == null ? null : type.getCompany().getId();
        return defaultBreakMinutes(companyId);
    }

    @Transactional
    public int applyDefaultToInheritedServices(Long companyId, String rawValue) {
        int normalized = normalizeDefault(rawValue);
        if (companyId == null) return normalized;
        List<SessionType> inherited = sessionTypes.findAllByCompanyId(companyId).stream()
                .filter(type -> !type.isBreakMinutesOverridden())
                .toList();
        inherited.forEach(type -> type.setBreakMinutes(normalized));
        if (!inherited.isEmpty()) sessionTypes.saveAll(inherited);
        return normalized;
    }

    public static int normalizeSpecific(Integer value) {
        if (value == null) return 0;
        return Math.max(MIN_BREAK_MINUTES, Math.min(999, value));
    }

    public static int normalizeDefault(String raw) {
        int parsed;
        try {
            parsed = Integer.parseInt(raw == null ? "0" : raw.trim());
        } catch (Exception ignored) {
            parsed = 0;
        }
        parsed = Math.max(MIN_BREAK_MINUTES, Math.min(MAX_BREAK_MINUTES, parsed));
        return Math.round(parsed / (float) BREAK_STEP_MINUTES) * BREAK_STEP_MINUTES;
    }
}
