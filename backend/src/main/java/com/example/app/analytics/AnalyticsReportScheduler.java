package com.example.app.analytics;

import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class AnalyticsReportScheduler {
    private static final Logger log = LoggerFactory.getLogger(AnalyticsReportScheduler.class);

    private final AppSettingRepository settings;
    private final AnalyticsReportService reportService;
    private final ZoneId timezone;

    public AnalyticsReportScheduler(
            AppSettingRepository settings,
            AnalyticsReportService reportService,
            @Value("${app.reminders.timezone:Europe/Ljubljana}") String timezoneId
    ) {
        this.settings = settings;
        this.reportService = reportService;
        this.timezone = ZoneId.of(timezoneId == null || timezoneId.isBlank() ? "Europe/Ljubljana" : timezoneId);
    }

    @Scheduled(cron = "0 15 * * * *")
    @Transactional
    public void sendScheduledOwnerReports() {
        if (!reportService.isMailConfigured()) return;

        LocalDateTime now = LocalDateTime.now(timezone);
        if (now.getHour() < 7) return;

        for (AppSetting enabledSetting : settings.findAllByKey(SettingKey.ANALYTICS_REPORTS_ENABLED)) {
            Long companyId = enabledSetting.getCompany().getId();
            if (!isTruthy(enabledSetting.getValue())) continue;

            String email = get(companyId, SettingKey.ANALYTICS_REPORTS_EMAIL);
            if (email.isBlank()) continue;

            String frequency = get(companyId, SettingKey.ANALYTICS_REPORTS_FREQUENCY);
            if (frequency.isBlank()) frequency = "WEEKLY";

            LocalDate today = now.toLocalDate();
            LocalDate lastSent = parseDate(get(companyId, SettingKey.ANALYTICS_REPORTS_LAST_SENT_AT));
            if (!shouldSend(today, lastSent, frequency)) continue;

            try {
                reportService.sendScheduledReport(enabledSetting.getCompany(), email, frequency);
                save(companyId, enabledSetting, SettingKey.ANALYTICS_REPORTS_LAST_SENT_AT, today.toString());
                log.info("Sent scheduled analytics report for company {} to {}", companyId, email);
            } catch (Exception ex) {
                log.warn("Failed to send scheduled analytics report for company {}: {}", companyId, ex.getMessage());
            }
        }
    }

    private boolean shouldSend(LocalDate today, LocalDate lastSent, String frequency) {
        if ("DAILY".equalsIgnoreCase(frequency)) {
            return lastSent == null || !lastSent.equals(today);
        }
        if (today.getDayOfWeek() != DayOfWeek.MONDAY) return false;
        LocalDate currentWeekStart = today.minusDays(today.getDayOfWeek().getValue() - DayOfWeek.MONDAY.getValue());
        return lastSent == null || lastSent.isBefore(currentWeekStart);
    }

    private boolean isTruthy(String value) {
        if (value == null) return false;
        String normalized = value.trim().toLowerCase();
        return "true".equals(normalized) || "1".equals(normalized) || "yes".equals(normalized) || "on".equals(normalized);
    }

    private String get(Long companyId, SettingKey key) {
        return settings.findByCompanyIdAndKey(companyId, key)
                .map(AppSetting::getValue)
                .map(String::trim)
                .orElse("");
    }

    private LocalDate parseDate(String value) {
        try {
            return value == null || value.isBlank() ? null : LocalDate.parse(value.trim());
        } catch (Exception ex) {
            return null;
        }
    }

    private void save(Long companyId, AppSetting context, SettingKey key, String value) {
        AppSetting setting = settings.findByCompanyIdAndKey(companyId, key).orElseGet(() -> {
            AppSetting created = new AppSetting();
            created.setCompany(context.getCompany());
            created.setKey(key.name());
            return created;
        });
        setting.setKey(key.name());
        setting.setValue(value);
        settings.save(setting);
    }
}
