package com.example.app.account;

import com.example.app.company.Company;
import com.example.app.register.PlatformSubscriptionBillingService;
import com.example.app.register.PlatformSubscriptionBillingService.PackageChangeResult;
import com.example.app.user.User;
import java.math.BigDecimal;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Tenant-facing self-serve subscription package changes.
 *
 * <p>Lives under {@code /api/account-management} (not {@code /api/billing}) so tenants can change
 * their plan regardless of whether their Billing/Obračun module is enabled.</p>
 */
@RestController
@RequestMapping("/api/account-management")
@PreAuthorize("hasRole('ADMIN')")
public class AccountManagementSubscriptionController {
    private final PlatformSubscriptionBillingService subscriptionBillingService;

    public AccountManagementSubscriptionController(PlatformSubscriptionBillingService subscriptionBillingService) {
        this.subscriptionBillingService = subscriptionBillingService;
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

    @PostMapping("/change-package")
    public ChangePackageResponse changePackage(@RequestBody ChangePackageRequest request, @AuthenticationPrincipal User me) {
        Company tenant = me == null ? null : me.getCompany();
        if (tenant == null || tenant.getId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No tenant company.");
        }
        if (request == null || request.packageName() == null || request.packageName().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "packageName is required.");
        }
        PackageChangeResult result = subscriptionBillingService.applyPackageChange(tenant, request.packageName(), request.interval());
        return new ChangePackageResponse(
                result.currentPackage(),
                result.nextPackage(),
                result.interval(),
                result.nextInterval(),
                result.pendingUpgradeDiff(),
                result.changeKind(),
                result.trialEnded(),
                result.billId(),
                result.billNumber(),
                result.checkoutUrl(),
                result.paymentStatus()
        );
    }
}
