package com.example.app.paypal;

import com.example.app.user.User;
import com.example.app.settings.BillingModuleAccessService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.ModelAttribute;

@RestController
@RequestMapping("/api/paypal/onboarding")
@PreAuthorize("hasRole('ADMIN')")
public class PayPalOnboardingController {
    private final PayPalOnboardingService onboardingService;
    private final BillingModuleAccessService billingModuleAccess;

    public PayPalOnboardingController(PayPalOnboardingService onboardingService, BillingModuleAccessService billingModuleAccess) {
        this.onboardingService = onboardingService;
        this.billingModuleAccess = billingModuleAccess;
    }

    @ModelAttribute
    public void ensureBillingModuleEnabled(@AuthenticationPrincipal User me) {
        billingModuleAccess.assertBillingEnabled(me);
    }

    @GetMapping("/config")
    public PayPalOnboardingService.PayPalOnboardingStatus config(@AuthenticationPrincipal User me) {
        return onboardingService.readConfig(me.getCompany());
    }

    @PutMapping("/config")
    public PayPalOnboardingService.PayPalOnboardingStatus saveConfig(
            @RequestBody SaveConfigRequest request,
            @AuthenticationPrincipal User me
    ) {
        return onboardingService.saveManualConfig(me.getCompany(), request.merchantId(), request.trackingId());
    }

    @PostMapping("/start")
    public PayPalOnboardingService.PayPalOnboardingLink start(
            @RequestBody StartRequest request,
            @AuthenticationPrincipal User me
    ) {
        return onboardingService.createOnboardingLink(me.getCompany(), request.returnUrl());
    }

    @PostMapping("/complete")
    public PayPalOnboardingService.PayPalOnboardingStatus complete(
            @RequestBody CompleteRequest request,
            @AuthenticationPrincipal User me
    ) {
        return onboardingService.completeOnboarding(me.getCompany(), request.merchantId(), request.trackingId());
    }

    public record StartRequest(String returnUrl) {}
    public record CompleteRequest(String merchantId, String trackingId) {}
    public record SaveConfigRequest(String merchantId, String trackingId) {}
}
