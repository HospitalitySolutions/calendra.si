package com.example.app.stripe;

import com.example.app.company.Company;
import com.example.app.guest.model.GuestOrder;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;

@Service
public class StripeGuestCheckoutService {
    private final StripeConnectService connectService;
    private final StripePlatformSettingsService platformSettings;
    private final StripeCheckoutClient checkoutClient;
    private final Environment environment;

    public StripeGuestCheckoutService(
            StripeConnectService connectService,
            StripePlatformSettingsService platformSettings,
            StripeCheckoutClient checkoutClient,
            Environment environment
    ) {
        this.connectService = connectService;
        this.platformSettings = platformSettings;
        this.checkoutClient = checkoutClient;
        this.environment = environment;
    }

    /**
     * Validates that the tenant can accept Stripe guest payments before a guest order is persisted.
     *
     * The actual Checkout Session still needs a saved order id for metadata and return URLs,
     * but this guard lets callers fail early when Stripe Connect onboarding is incomplete so
     * Wallet > Orders does not get a stray PENDING order for an attempt that never reached Stripe.
     */
    public void assertCheckoutReady(Company company) {
        connectService.routingForCompany(company);
    }

    public StripeCheckoutSessionResult createCheckoutSession(GuestOrder order) {
        return createCheckoutSession(order, guestReturnUrl(order, "success"), guestCancelUrl(order), "guest_order");
    }

    public StripeCheckoutSessionResult createWebsiteWidgetCheckoutSession(GuestOrder order) {
        return createCheckoutSession(order, websiteWidgetReturnUrl(order, "success"), websiteWidgetCancelUrl(order), "website_widget_order");
    }

    private StripeCheckoutSessionResult createCheckoutSession(GuestOrder order, String successUrl, String cancelUrl, String source) {
        StripeConnectService.ConnectedAccountRouting routing = connectService.routingForCompany(order.getCompany());
        StripePlatformSettingsService.StripeModeSettings cfg = routing.modeSettings();
        order.setStripeConnectedAccountId(routing.accountId());
        order.setStripeConnectMode(routing.mode().apiValue());
        Map<String, String> metadata = new LinkedHashMap<>();
        metadata.put("source", source == null || source.isBlank() ? "guest_order" : source);
        metadata.put("guest_order_id", String.valueOf(order.getId()));
        metadata.put("company_id", String.valueOf(order.getCompany().getId()));
        metadata.put("client_id", String.valueOf(order.getClient().getId()));
        metadata.put("stripe_connect_mode", routing.mode().apiValue());

        long feeAmount = platformSettings.applicationFeeAmountMinor(routing.mode(), order.getTotalGross());

        return checkoutClient.createOneTimeSession(new StripeCheckoutClient.StripeCheckoutSessionCreateRequest(
                cfg.secretKey(),
                successUrl,
                cancelUrl,
                "Calendra order " + order.getReferenceCode(),
                order.getTotalGross(),
                cfg.currency(),
                order.getGuestUser() == null ? null : order.getGuestUser().getEmail(),
                metadata,
                metadata,
                routing.accountId(),
                feeAmount,
                "guest-order-checkout-" + order.getId() + "-" + routing.mode().apiValue() + "-" + System.currentTimeMillis()
        ));
    }

    private String guestReturnUrl(GuestOrder order, String status) {
        return publicBaseUrl()
                + "/api/guest/stripe/return?status=" + status
                + "&orderId=" + order.getId()
                + "&session_id={CHECKOUT_SESSION_ID}";
    }

    private String guestCancelUrl(GuestOrder order) {
        return publicBaseUrl()
                + "/api/guest/stripe/cancel?orderId=" + order.getId()
                + "&session_id={CHECKOUT_SESSION_ID}";
    }

    private String websiteWidgetReturnUrl(GuestOrder order, String status) {
        return publicBaseUrl()
                + "/api/public/widget/stripe/return?status=" + status
                + "&orderId=" + order.getId()
                + "&session_id={CHECKOUT_SESSION_ID}";
    }

    private String websiteWidgetCancelUrl(GuestOrder order) {
        return publicBaseUrl()
                + "/api/public/widget/stripe/cancel?orderId=" + order.getId()
                + "&session_id={CHECKOUT_SESSION_ID}";
    }

    private String publicBaseUrl() {
        String value = firstNonBlank(
                environment.getProperty("APP_PUBLIC_BASE_URL"),
                environment.getProperty("app.public-base-url"),
                environment.getProperty("APP_STRIPE_GUEST_PUBLIC_BASE_URL"),
                environment.getProperty("app.stripe.guest-public-base-url"),
                environment.getProperty("APP_PAYPAL_PUBLIC_BASE_URL"),
                environment.getProperty("app.paypal.public-base-url"),
                environment.getProperty("APP_AUTH_FRONTEND_URL"),
                environment.getProperty("app.auth.frontend-url")
        );
        if (value == null || value.isBlank()) {
            value = "http://localhost:4000";
        }
        value = value.trim();
        while (value.endsWith("/")) {
            value = value.substring(0, value.length() - 1);
        }
        return value;
    }

    private static String firstNonBlank(String... values) {
        if (values == null) return null;
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }
}
