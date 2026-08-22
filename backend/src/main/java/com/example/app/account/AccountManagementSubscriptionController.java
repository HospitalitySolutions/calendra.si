package com.example.app.account;

import com.example.app.company.Company;
import com.example.app.register.PlatformSubscriptionBillingService;
import com.example.app.register.PlatformSubscriptionBillingService.PackageChangeResult;
import com.example.app.user.User;
import com.example.app.workspacesubscription.WorkspaceSubscriptionService;
import com.example.app.workspacesubscription.WorkspaceSubscriptionService.BillingDetailsUpdate;
import com.example.app.workspacesubscription.WorkspaceSubscriptionService.SubscriptionView;
import java.math.BigDecimal;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Workspace-owned self-serve subscription management. */
@RestController
@RequestMapping("/api/account-management")
@PreAuthorize("hasRole('ADMIN')")
public class AccountManagementSubscriptionController {
    private final PlatformSubscriptionBillingService subscriptionBillingService;
    private final WorkspaceSubscriptionService workspaceSubscriptions;

    /** Backwards-compatible constructor for focused unit tests. */
    public AccountManagementSubscriptionController(PlatformSubscriptionBillingService subscriptionBillingService) {
        this(subscriptionBillingService, null);
    }

    @Autowired
    public AccountManagementSubscriptionController(
            PlatformSubscriptionBillingService subscriptionBillingService,
            WorkspaceSubscriptionService workspaceSubscriptions
    ) {
        this.subscriptionBillingService = subscriptionBillingService;
        this.workspaceSubscriptions = workspaceSubscriptions;
    }

    public record ChangePackageRequest(String packageName, String interval) {}

    public record ChangePackageResponse(
            String currentPackage,
            String nextPackage,
            String interval,
            String nextInterval,
            BigDecimal pendingUpgradeDiff,
            String changeKind,
            boolean trialEnded,
            Long billId,
            String billNumber,
            String checkoutUrl,
            String paymentStatus
    ) {}

    @GetMapping("/subscription")
    public SubscriptionView subscription(@AuthenticationPrincipal User me) {
        requireWorkspaceService();
        return workspaceSubscriptions.view(me);
    }

    @PutMapping("/subscription/billing-details")
    public SubscriptionView updateBillingDetails(
            @RequestBody BillingDetailsUpdate request,
            @AuthenticationPrincipal User me
    ) {
        requireWorkspaceService();
        return workspaceSubscriptions.updateBillingDetails(me, request);
    }

    @PutMapping("/subscription/payer")
    public SubscriptionView updatePayer(
            @RequestParam(required = false) Long legalEntityId,
            @AuthenticationPrincipal User me
    ) {
        requireWorkspaceService();
        return workspaceSubscriptions.updatePayer(me, legalEntityId);
    }

    @PostMapping("/subscription/billing-owner")
    public SubscriptionView updateBillingOwner(
            @RequestParam Long companyId,
            @AuthenticationPrincipal User me
    ) {
        requireWorkspaceService();
        Long workspaceId = me == null || me.getCompany() == null || me.getCompany().getWorkspace() == null
                ? null : me.getCompany().getWorkspace().getId();
        workspaceSubscriptions.selectBillingOwner(workspaceId, companyId, me);
        return workspaceSubscriptions.view(me);
    }

    @PostMapping("/change-package")
    public ChangePackageResponse changePackage(@RequestBody ChangePackageRequest request, @AuthenticationPrincipal User me) {
        if (workspaceSubscriptions != null) {
            Long workspaceId = me == null || me.getCompany() == null || me.getCompany().getWorkspace() == null
                    ? null : me.getCompany().getWorkspace().getId();
            workspaceSubscriptions.requireWorkspaceAdministrator(me, workspaceId);
        }
        Company tenant = workspaceSubscriptions == null
                ? (me == null ? null : me.getCompany())
                : workspaceSubscriptions.billingOwnerCompany(me);
        if (tenant == null || tenant.getId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No subscription billing owner.");
        }
        if (request == null || request.packageName() == null || request.packageName().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "packageName is required.");
        }
        PackageChangeResult result = subscriptionBillingService.applyPackageChange(tenant, request.packageName(), request.interval());
        if (workspaceSubscriptions != null) workspaceSubscriptions.syncFromBillingOwnerSettings(tenant.getId());
        return new ChangePackageResponse(
                result.currentPackage(), result.nextPackage(), result.interval(), result.nextInterval(),
                result.pendingUpgradeDiff(), result.changeKind(), result.trialEnded(), result.billId(),
                result.billNumber(), result.checkoutUrl(), result.paymentStatus()
        );
    }

    private void requireWorkspaceService() {
        if (workspaceSubscriptions == null) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Workspace subscription service is unavailable.");
        }
    }
}
