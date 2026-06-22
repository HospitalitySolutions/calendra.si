package com.example.app.settings;

import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TenantSmsQuotaService {
    private final AppSettingRepository settings;
    private final CompanyRepository companies;

    public TenantSmsQuotaService(AppSettingRepository settings, CompanyRepository companies) {
        this.settings = settings;
        this.companies = companies;
    }

    @Transactional
    public void assertCanSend(Long companyId, int partsToSend) {
        if (companyId == null) return;
        int quota = parseSetting(companyId, SettingKey.SIGNUP_SMS_COUNT, 0);
        if (quota <= 0) return;
        int used = parseSetting(companyId, SettingKey.TENANCY_SMS_SENT_COUNT, 0);
        int requested = Math.max(1, partsToSend);
        if (used + requested > quota) {
            throw new ResponseStatusException(HttpStatus.PAYMENT_REQUIRED, "Monthly SMS limit reached. Increase your SMS limit in Upravljanje računa → Naročnina.");
        }
    }

    @Transactional
    public void increment(Long companyId, int parts) {
        if (companyId == null) return;
        Company company = companies.findById(companyId).orElse(null);
        if (company == null) return;
        AppSetting setting = settings.findForUpdateByCompanyIdAndKey(companyId, SettingKey.TENANCY_SMS_SENT_COUNT).orElseGet(() -> {
            AppSetting created = new AppSetting();
            created.setCompany(company);
            created.setKey(SettingKey.TENANCY_SMS_SENT_COUNT.name());
            created.setValue("0");
            return settings.save(created);
        });
        int current = parseInt(setting.getValue(), 0);
        setting.setValue(String.valueOf(current + Math.max(1, parts)));
        settings.save(setting);
    }

    public SmsQuota quota(Long companyId) {
        int quota = parseSetting(companyId, SettingKey.SIGNUP_SMS_COUNT, 0);
        int used = parseSetting(companyId, SettingKey.TENANCY_SMS_SENT_COUNT, 0);
        int remaining = quota <= 0 ? Integer.MAX_VALUE : Math.max(0, quota - used);
        return new SmsQuota(quota, used, remaining, quota > 0 && remaining <= 50, quota > 0 && remaining <= 0);
    }

    private int parseSetting(Long companyId, SettingKey key, int fallback) {
        if (companyId == null) return fallback;
        return settings.findByCompanyIdAndKey(companyId, key).map(AppSetting::getValue).map(v -> parseInt(v, fallback)).orElse(fallback);
    }

    private static int parseInt(String raw, int fallback) {
        try { return Integer.parseInt(raw == null || raw.isBlank() ? String.valueOf(fallback) : raw.trim()); }
        catch (Exception e) { return fallback; }
    }

    public record SmsQuota(int quota, int used, int remaining, boolean warning, boolean exhausted) {}
}
