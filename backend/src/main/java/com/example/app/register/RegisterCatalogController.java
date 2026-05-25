package com.example.app.register;

import com.example.app.settings.GlobalPaymentProviderService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/register")
public class RegisterCatalogController {
    private final RegisterCatalogService registerCatalogService;
    private final GlobalPaymentProviderService globalPaymentProviders;

    public RegisterCatalogController(
            RegisterCatalogService registerCatalogService,
            GlobalPaymentProviderService globalPaymentProviders
    ) {
        this.registerCatalogService = registerCatalogService;
        this.globalPaymentProviders = globalPaymentProviders;
    }

    public record RegisterPaymentCapabilitiesResponse(boolean stripeEnabled, boolean paypalEnabled) {}

    @GetMapping("/catalog")
    public RegisterPriceCatalog catalog() {
        return registerCatalogService.mergedCatalog();
    }

    @GetMapping("/payment-capabilities")
    public RegisterPaymentCapabilitiesResponse paymentCapabilities() {
        var caps = globalPaymentProviders.capabilities();
        return new RegisterPaymentCapabilitiesResponse(caps.stripeEnabled(), caps.paypalEnabled());
    }
}
