package com.example.app.workspacesubscription;

import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/** Enforces and meters the pooled monthly email allowance for a workspace. */
@Service
public class WorkspaceEmailQuotaService {
    private final CompanyRepository companies;
    private final WorkspaceSubscriptionService subscriptions;
    private final WorkspaceUsageMeterService usage;

    public WorkspaceEmailQuotaService(
            CompanyRepository companies,
            WorkspaceSubscriptionService subscriptions,
            WorkspaceUsageMeterService usage
    ) {
        this.companies = companies;
        this.subscriptions = subscriptions;
        this.usage = usage;
    }

    @Transactional(readOnly = true)
    public void assertCanSend(Long companyId, int messages) {
        Quota quota = quota(companyId);
        int requested = Math.max(1, messages);
        if (quota == null || quota.limit() <= 0 || quota.allowOverage()) return;
        if (quota.used() + requested > quota.limit()) {
            throw new ResponseStatusException(HttpStatus.PAYMENT_REQUIRED,
                    "Workspace monthly email limit reached. Upgrade the workspace subscription or enable email overage.");
        }
    }

    @Transactional
    public void increment(Long companyId, int messages) {
        usage.increment(companyId, WorkspaceUsageMeterService.EMAIL_MESSAGES, Math.max(1, messages));
    }

    @Transactional(readOnly = true)
    public Quota quota(Long companyId) {
        if (companyId == null) return null;
        Company company = companies.findById(companyId).orElse(null);
        if (company == null || company.getWorkspace() == null) return null;
        WorkspaceSubscription subscription;
        try {
            subscription = subscriptions.requireForWorkspace(company.getWorkspace().getId());
        } catch (Exception ignored) {
            return null;
        }
        long usedLong = subscriptions.usage(company.getWorkspace().getId()).emailMessages();
        int used = usedLong > Integer.MAX_VALUE ? Integer.MAX_VALUE : (int) usedLong;
        return new Quota(subscription.getIncludedEmailMessages(), used, subscription.isAllowEmailOverage());
    }

    public record Quota(int limit, int used, boolean allowOverage) {}
}
