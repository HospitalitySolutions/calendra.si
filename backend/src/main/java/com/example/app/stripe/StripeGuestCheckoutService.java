package com.example.app.stripe;

import com.example.app.guest.model.GuestOrder;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class StripeGuestCheckoutService {
    private final StripeConnectService connectService;
    private final StripePlatformSettingsService platformSettings;
    private final StripeCheckoutClient checkoutClient;

    public StripeGuestCheckoutService(
            StripeConnectService connectService,
            StripePlatformSettingsService platformSettings,
            StripeCheckoutClient checkoutClient
    ) {
        this.connectService = connectService;
        this.platformSettings = platformSettings;
        this.checkoutClient = checkoutClient;
    }

    public StripeCheckoutSessionResult createCheckoutSession(GuestOrder order) {
        StripeConnectService.ConnectedAccountRouting routing = connectService.routingForCompany(order.getCompany());
        StripePlatformSettingsService.StripeModeSettings cfg = routing.modeSettings();
        order.setStripeConnectedAccountId(routing.accountId());
        order.setStripeConnectMode(routing.mode().apiValue());
        Map<String, String> metadata = new LinkedHashMap<>();
        metadata.put("source", "guest_order");
        metadata.put("guest_order_id", String.valueOf(order.getId()));
        metadata.put("company_id", String.valueOf(order.getCompany().getId()));
        metadata.put("client_id", String.valueOf(order.getClient().getId()));
        metadata.put("stripe_connect_mode", routing.mode().apiValue());

        long feeAmount = platformSettings.applicationFeeAmountMinor(routing.mode(), order.getTotalGross());
        String successUrl = fillUrl(cfg.successUrl(), order, "success");
        String cancelUrl = fillUrl(cfg.cancelUrl(), order, "cancelled");

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

    private String fillUrl(String template, GuestOrder order, String status) {
        String value = template == null ? "" : template.trim();
        if (value.isBlank()) {
            value = "calendra-guest://stripe/return?status={STATUS}&orderId={ORDER_ID}&session_id={CHECKOUT_SESSION_ID}";
        }
        return value
                .replace("{STATUS}", status)
                .replace("{ORDER_ID}", String.valueOf(order.getId()))
                .replace("{ORDER_REFERENCE}", order.getReferenceCode() == null ? "" : order.getReferenceCode())
                .replace("{TENANT_ID}", String.valueOf(order.getCompany().getId()))
                .replace("{CHECKOUT_SESSION_ID}", "{CHECKOUT_SESSION_ID}");
    }
}
