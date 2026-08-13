package com.example.app.customer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.example.app.company.Company;
import com.example.app.guest.catalog.GuestCatalogService;
import com.example.app.guest.common.GuestDtos;
import com.example.app.guest.common.GuestSettingsService;
import com.example.app.guest.model.GuestOrderRepository;
import com.example.app.guest.model.GuestUser;
import com.example.app.guest.order.GuestOrderService;
import com.example.app.guest.tenant.GuestProviderLinkService;
import com.example.app.location.Location;
import com.example.app.location.LocationPublicPresentationService;
import com.example.app.location.LocationRepository;
import com.example.app.widget.WidgetBookingIdempotencyService;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class CustomerCommerceServiceTest {
    @Mock private LocationRepository locations;
    @Mock private GuestCatalogService catalog;
    @Mock private GuestSettingsService settings;
    @Mock private GuestProviderLinkService providerLinks;
    @Mock private GuestOrderService orderService;
    @Mock private GuestOrderRepository orders;
    @Mock private WidgetBookingIdempotencyService idempotency;
    @Mock private LocationPublicPresentationService presentations;

    @Test
    void catalogExposesOnlyWalletCommerceProductsAndWebPaymentMethods() {
        Company company = new Company();
        company.setId(7L);
        company.setName("Studio LUX");
        company.setPaypalMerchantId(null);

        Location location = new Location();
        location.setId(31L);
        location.setCompany(company);
        location.setName("Ljubljana");
        location.setActive(true);
        location.setGuestAppDiscoverable(true);

        GuestSettingsService.GuestPublicSettings publicSettings = new GuestSettingsService.GuestPublicSettings(
                true, "Ljubljana", "+38640111222", "Slovenska 10", "Studio LUX", "sl",
                true, false, true, true, "SALON", null, "https://example.com/logo.png", null,
                true, true, true
        );
        LocationPublicPresentationService.PublicPresentation presentation =
                new LocationPublicPresentationService.PublicPresentation(
                        31L, 7L, "Studio LUX Ljubljana", "Slovenska 10, Ljubljana", "Opis", "+38640111222",
                        null, "https://example.com/location-logo.png", null, true, true, true, true, true, null
                );

        when(locations.findById(31L)).thenReturn(Optional.of(location));
        when(settings.publicSettings(7L)).thenReturn(publicSettings);
        when(settings.acceptedPaymentMethods(7L)).thenReturn(List.of("CARD", "BANK_TRANSFER", "PAYPAL", "GIFT_CARD"));
        when(catalog.publicProducts(7L, 31L)).thenReturn(List.of(
                product("501", "Paket 5 obiskov", "PACK", 150d),
                product("502", "Mesečno članstvo", "MEMBERSHIP", 49d),
                product("503", "Darilni bon", "GIFT_CARD", 50d),
                product("service-10", "Striženje", "SESSION_SINGLE", 35d),
                product("504", "Skupinska karta", "CLASS_TICKET", 60d)
        ));
        when(presentations.resolve(location, publicSettings.companyLogoUrl())).thenReturn(presentation);

        CustomerCommerceService service = service();
        CustomerDtos.CommerceCatalogResponse result = service.catalog(new GuestUser(), 31L);

        assertThat(result.products()).extracting(GuestDtos.ProductResponse::productType)
                .containsExactly("PACK", "MEMBERSHIP", "GIFT_CARD");
        assertThat(result.acceptedPaymentMethods()).containsExactly("CARD", "BANK_TRANSFER");
        assertThat(result.provider().locationId()).isEqualTo("31");
        assertThat(result.provider().locationName()).isEqualTo("Studio LUX Ljubljana");
    }

    private CustomerCommerceService service() {
        return new CustomerCommerceService(
                locations, catalog, settings, providerLinks, orderService, orders, idempotency, presentations
        );
    }

    private static GuestDtos.ProductResponse product(String id, String name, String type, double price) {
        return new GuestDtos.ProductResponse(
                id, name, type, price, "EUR", null, null, true, "Opis", 60,
                null, 180, 5, null, null, null, 0,
                null, null, "GIFT_CARD".equals(type) ? price : null, List.of(), List.of()
        );
    }
}
