package com.example.app.referral;

import com.example.app.admin.PlatformTenancyAdminAuditLog;
import com.example.app.admin.PlatformTenancyAdminAuditLogRepository;
import com.example.app.company.Company;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.user.User;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Grants the "one free month" reward to both the referrer and the referred tenant once the referred tenant makes
 * its first successful subscription payment. A free month is applied by pushing {@code BILLING_SUBSCRIPTION_END}
 * forward by one month, which delays the next renewal invoice (see PlatformSubscriptionBillingService renewal job).
 */
@Service
public class ReferralRewardService {

    private static final Logger log = LoggerFactory.getLogger(ReferralRewardService.class);
    private static final String AUDIT_ACTION = "REFERRAL_REWARD";

    private final ReferralRepository referrals;
    private final ReferralService referralService;
    private final AppSettingRepository settings;
    private final PlatformTenancyAdminAuditLogRepository auditLogs;

    public ReferralRewardService(
            ReferralRepository referrals,
            ReferralService referralService,
            AppSettingRepository settings,
            PlatformTenancyAdminAuditLogRepository auditLogs
    ) {
        this.referrals = referrals;
        this.referralService = referralService;
        this.settings = settings;
        this.auditLogs = auditLogs;
    }

    /**
     * Called when a tenant's subscription becomes PAID. Idempotent: only a PENDING referral for this tenant is
     * processed, after which the row is moved to QUALIFIED/REWARDED so later payments (renewals) are no-ops.
     */
    @Transactional
    public void onReferredTenantFirstPayment(Long referredCompanyId) {
        if (referredCompanyId == null) {
            return;
        }
        Referral referral = referrals
                .findFirstByReferredCompanyIdAndStatus(referredCompanyId, ReferralStatus.PENDING)
                .orElse(null);
        if (referral == null) {
            return;
        }

        Company referredCompany = referral.getReferredCompany();
        Company referrerCompany = referral.getReferrerCompany();
        User referrerUser = referral.getReferrerUser();

        boolean referredGranted = extendSubscriptionByOneMonth(referredCompanyId);
        referral.setReferredRewardGranted(referredGranted);

        boolean referrerGranted = false;
        int cap = referralService.resolveMonthlyCap();
        long earned = referrerCompany == null || referrerCompany.getId() == null
                ? Long.MAX_VALUE
                : referrals.countByReferrerCompanyIdAndReferrerRewardGrantedTrueAndQualifiedAtAfter(
                        referrerCompany.getId(), Instant.now().minus(365, java.time.temporal.ChronoUnit.DAYS));
        if (referrerCompany != null && referrerCompany.getId() != null && earned < cap) {
            referrerGranted = extendSubscriptionByOneMonth(referrerCompany.getId());
        }
        referral.setReferrerRewardGranted(referrerGranted);

        referral.setQualifiedAt(Instant.now());
        referral.setStatus(referrerGranted ? ReferralStatus.REWARDED : ReferralStatus.QUALIFIED);
        referrals.save(referral);

        appendAuditSafely(referredCompany, referrerUser, "Referral reward: 1 free month granted (new tenant)",
                referrerCompany == null ? "" : "Referred by company #" + referrerCompany.getId());
        if (referrerGranted) {
            appendAuditSafely(referrerCompany, referrerUser, "Referral reward: 1 free month granted (referrer)",
                    "Referred new tenant company #" + referredCompanyId + " paid their first invoice");
        }
        log.info("Referral reward processed referredCompanyId={} referrerRewardGranted={} referredRewardGranted={}",
                referredCompanyId, referrerGranted, referredGranted);
    }

    private boolean extendSubscriptionByOneMonth(Long companyId) {
        AppSetting endSetting = settings.findByCompanyIdAndKey(companyId, SettingKey.BILLING_SUBSCRIPTION_END).orElse(null);
        if (endSetting == null) {
            return false;
        }
        LocalDate current = parseDateOrNull(endSetting.getValue());
        if (current == null) {
            return false;
        }
        LocalDate today = LocalDate.now();
        // Never shorten the period; extend from the later of today or the current end.
        LocalDate base = current.isBefore(today) ? today : current;
        endSetting.setValue(base.plusMonths(1).toString());
        settings.save(endSetting);
        return true;
    }

    private void appendAuditSafely(Company company, User actor, String summary, String detail) {
        if (company == null || company.getId() == null || actor == null || actor.getId() == null) {
            return;
        }
        try {
            PlatformTenancyAdminAuditLog row = new PlatformTenancyAdminAuditLog();
            row.setCompany(company);
            row.setActorUser(actor);
            row.setActionType(AUDIT_ACTION);
            row.setSummary(summary);
            row.setDetail(detail);
            auditLogs.save(row);
        } catch (Exception e) {
            log.warn("Referral reward audit log skipped for company {}: {}", company.getId(), e.getMessage());
        }
    }

    private LocalDate parseDateOrNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return LocalDate.parse(value.trim());
        } catch (DateTimeParseException e) {
            return null;
        }
    }
}
