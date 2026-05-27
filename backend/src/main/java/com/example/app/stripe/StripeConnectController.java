package com.example.app.stripe;

import com.example.app.user.User;
import com.example.app.settings.BillingModuleAccessService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/stripe/connect")
@PreAuthorize("hasRole('ADMIN')")
public class StripeConnectController {
    private final StripeConnectService connectService;
    private final BillingModuleAccessService billingModuleAccess;

    public StripeConnectController(StripeConnectService connectService, BillingModuleAccessService billingModuleAccess) {
        this.connectService = connectService;
        this.billingModuleAccess = billingModuleAccess;
    }

    @ModelAttribute
    public void ensureBillingModuleEnabled(@AuthenticationPrincipal User me) {
        billingModuleAccess.assertBillingEnabled(me);
    }

    @GetMapping("/config")
    public StripeConnectService.TenantStripeConnectStatus config(@AuthenticationPrincipal User me) {
        return connectService.readConfig(me.getCompany());
    }

    @PutMapping("/config")
    public StripeConnectService.TenantStripeConnectStatus save(
            @RequestBody StripeConnectService.TenantStripePreferenceRequest request,
            @AuthenticationPrincipal User me
    ) {
        return connectService.saveTenantPreference(me.getCompany(), request);
    }

    @PostMapping("/onboarding-link")
    public StripeConnectService.TenantStripeOnboardingLink onboardingLink(
            @RequestBody StripeConnectService.TenantStripeOnboardingRequest request,
            @AuthenticationPrincipal User me
    ) {
        return connectService.startOnboarding(me.getCompany(), me, request);
    }

    @PostMapping("/refresh")
    public StripeConnectService.TenantStripeConnectStatus refresh(
            @RequestParam(value = "mode", required = false) String mode,
            @AuthenticationPrincipal User me
    ) {
        return connectService.refreshAccount(me.getCompany(), mode);
    }
}
