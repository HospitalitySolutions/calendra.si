package com.example.app.settings;

import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.workspacesubscription.WorkspaceSubscription;
import com.example.app.workspacesubscription.WorkspaceSubscriptionService;
import com.example.app.workspacesubscription.WorkspaceUsageMeterService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TenantSmsQuotaService {
    private final AppSettingRepository settings;
    private final CompanyRepository companies;
    private final WorkspaceSubscriptionService workspaceSubscriptions;
    private final WorkspaceUsageMeterService workspaceUsage;

    /** Backwards-compatible constructor for older tests. */
    public TenantSmsQuotaService(AppSettingRepository settings, CompanyRepository companies) {
        this(settings, companies, null, null);
    }

    @Autowired
    public TenantSmsQuotaService(
            AppSettingRepository settings,
            CompanyRepository companies,
            WorkspaceSubscriptionService workspaceSubscriptions,
            WorkspaceUsageMeterService workspaceUsage
    ) {
        this.settings = settings;
        this.companies = companies;
        this.workspaceSubscriptions = workspaceSubscriptions;
        this.workspaceUsage = workspaceUsage;
    }

    @Transactional
    public void assertCanSend(Long companyId, int partsToSend) {
        if (companyId == null) return;
        int requested = Math.max(1, partsToSend);
        WorkspaceQuota workspaceQuota = workspaceQuota(companyId);
        if (workspaceQuota != null) {
            if (workspaceQuota.limit() <= 0 || workspaceQuota.allowOverage()) return;
            if (workspaceQuota.used() + requested > workspaceQuota.limit()) {
                throw new ResponseStatusException(HttpStatus.PAYMENT_REQUIRED,
                        "Workspace monthly SMS limit reached. Increase it in Upravljanje računa → Naročnina.");
            }
            return;
        }
        int quota = parseSetting(companyId, SettingKey.SIGNUP_SMS_COUNT, 0);
        if (quota <= 0) return;
        int used = parseSetting(companyId, SettingKey.TENANCY_SMS_SENT_COUNT, 0);
        if (used + requested > quota) {
            throw new ResponseStatusException(HttpStatus.PAYMENT_REQUIRED,
                    "Monthly SMS limit reached. Increase your SMS limit in Upravljanje računa → Naročnina.");
        }
    }

    @Transactional
    public void increment(Long companyId, int parts) {
        if (companyId == null) return;
        int increment = Math.max(1, parts);
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
        setting.setValue(String.valueOf(current + increment));
        settings.save(setting);
        if (workspaceUsage != null) workspaceUsage.increment(companyId, WorkspaceUsageMeterService.SMS_PARTS, increment);
    }

    public SmsQuota quota(Long companyId) {
        WorkspaceQuota workspaceQuota = workspaceQuota(companyId);
        if (workspaceQuota != null) {
            int remaining = workspaceQuota.limit() <= 0 || workspaceQuota.allowOverage()
                    ? Integer.MAX_VALUE : Math.max(0, workspaceQuota.limit() - workspaceQuota.used());
            return new SmsQuota(workspaceQuota.limit(), workspaceQuota.used(), remaining,
                    workspaceQuota.limit() > 0 && remaining <= 50,
                    workspaceQuota.limit() > 0 && !workspaceQuota.allowOverage() && remaining <= 0);
        }
        int quota = parseSetting(companyId, SettingKey.SIGNUP_SMS_COUNT, 0);
        int used = parseSetting(companyId, SettingKey.TENANCY_SMS_SENT_COUNT, 0);
        int remaining = quota <= 0 ? Integer.MAX_VALUE : Math.max(0, quota - used);
        return new SmsQuota(quota, used, remaining, quota > 0 && remaining <= 50, quota > 0 && remaining <= 0);
    }

    private WorkspaceQuota workspaceQuota(Long companyId) {
        if (workspaceSubscriptions == null || companyId == null) return null;
        Company company = companies.findById(companyId).orElse(null);
        if (company == null || company.getWorkspace() == null) return null;
        try {
            WorkspaceSubscription subscription = workspaceSubscriptions.requireForWorkspace(company.getWorkspace().getId());
            long usedLong = workspaceSubscriptions.usage(company.getWorkspace().getId()).smsParts();
            int used = usedLong > Integer.MAX_VALUE ? Integer.MAX_VALUE : (int) usedLong;
            return new WorkspaceQuota(subscription.getIncludedSmsParts(), used, subscription.isAllowSmsOverage());
        } catch (Exception ignored) {
            return null;
        }
    }

    private int parseSetting(Long companyId, SettingKey key, int fallback) {
        if (companyId == null) return fallback;
        return settings.findByCompanyIdAndKey(companyId, key).map(AppSetting::getValue).map(v -> parseInt(v, fallback)).orElse(fallback);
    }

    private static int parseInt(String raw, int fallback) {
        try { return Integer.parseInt(raw == null || raw.isBlank() ? String.valueOf(fallback) : raw.trim()); }
        catch (Exception e) { return fallback; }
    }

    private record WorkspaceQuota(int limit, int used, boolean allowOverage) {}
    public record SmsQuota(int quota, int used, int remaining, boolean warning, boolean exhausted) {}
}
