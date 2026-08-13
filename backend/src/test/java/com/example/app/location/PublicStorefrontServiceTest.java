package com.example.app.location;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.guest.catalog.GuestCatalogService;
import com.example.app.guest.common.GuestDtos;
import com.example.app.widget.PublicBookingWidgetController;
import com.example.app.widget.PublicBookingWidgetService;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletRequest;

@ExtendWith(MockitoExtension.class)
class PublicStorefrontServiceTest {
    @Mock private PublicLocationDirectoryService directory;
    @Mock private CompanyRepository companies;
    @Mock private PublicBookingWidgetService bookingWidget;
    @Mock private GuestCatalogService guestCatalog;

    @Test
    void combinesPublicServicesCommerceProductsAndDeduplicatedTeam() {
        PublicStorefrontService service = new PublicStorefrontService(directory, companies, bookingWidget, guestCatalog);
        var location = new PublicLocationDirectoryService.DirectoryLocationResponse(
                31L,
                "studio-lux-31",
                "STUDIO-LUX",
                true,
                "Studio LUX Ljubljana",
                "Opis",
                "https://example.com/logo.png",
                new PublicLocationDirectoryService.PhysicalAddressResponse("Slovenska 10", "1000", "Ljubljana", "SI"),
                "Slovenska 10, 1000 Ljubljana",
                "+38640111222",
                "salon",
                true,
                "/narocanje/STUDIO-LUX?locationId=31",
                4.9,
                128L,
                "https://maps.google.com/example"
        );
        Company company = new Company();
        company.setId(7L);
        company.setTenantCode("STUDIO-LUX");

        var haircut = new PublicBookingWidgetController.WidgetServiceResponse(
                10L, "Striženje", "Žensko striženje", 45, 0, "35,00 €", new BigDecimal("35.00"),
                null, false, 1L, "Frizerstvo", 0, 0
        );
        var coloring = new PublicBookingWidgetController.WidgetServiceResponse(
                11L, "Barvanje", null, 90, 0, "60,00 €", new BigDecimal("60.00"),
                null, false, 1L, "Frizerstvo", 0, 1
        );

        var pack = product("501", "Paket 5 obiskov", "PACK", 150d, 5, 180);
        var membership = product("502", "Mesečno članstvo", "MEMBERSHIP", 49d, null, 30);
        var giftCard = product("503", "Darilni bon 50 €", "GIFT_CARD", 50d, null, 365);
        var single = product("service-10", "Striženje", "SESSION_SINGLE", 35d, null, null);

        when(directory.findBySlug("studio-lux-31")).thenReturn(Optional.of(location));
        when(companies.findByTenantCodeIgnoreCase("STUDIO-LUX")).thenReturn(Optional.of(company));
        when(bookingWidget.services(
                org.mockito.ArgumentMatchers.eq("STUDIO-LUX"),
                org.mockito.ArgumentMatchers.eq(31L),
                org.mockito.ArgumentMatchers.any()
        ))
                .thenReturn(List.of(haircut, coloring));
        when(guestCatalog.publicProducts(7L, 31L)).thenReturn(List.of(pack, membership, giftCard, single));
        when(bookingWidget.storefrontConsultants(
                org.mockito.ArgumentMatchers.eq("STUDIO-LUX"),
                org.mockito.ArgumentMatchers.eq(31L),
                org.mockito.ArgumentMatchers.any()
        ))
                .thenReturn(List.of(
                        new PublicBookingWidgetController.WidgetConsultantResponse(1L, "Ana Novak"),
                        new PublicBookingWidgetController.WidgetConsultantResponse(2L, "Maja Horvat")
                ));

        PublicStorefrontService.StorefrontResponse result = service.storefront("studio-lux-31", new MockHttpServletRequest());

        assertThat(result.location().locationId()).isEqualTo(31L);
        assertThat(result.services()).extracting(PublicStorefrontService.ServiceResponse::name)
                .containsExactly("Striženje", "Barvanje");
        assertThat(result.products()).extracting(PublicStorefrontService.ProductResponse::productType)
                .containsExactly("PACK", "MEMBERSHIP", "GIFT_CARD");
        assertThat(result.team()).extracting(PublicStorefrontService.TeamMemberResponse::name)
                .containsExactly("Ana Novak", "Maja Horvat");
    }

    private static GuestDtos.ProductResponse product(
            String id, String name, String type, double price, Integer usageLimit, Integer validityDays
    ) {
        return new GuestDtos.ProductResponse(
                id,
                name,
                type,
                price,
                "EUR",
                null,
                null,
                true,
                "Opis",
                60,
                null,
                validityDays,
                usageLimit,
                null,
                null,
                null,
                0,
                null,
                null,
                type.equals("GIFT_CARD") ? price : null,
                List.of(),
                List.of()
        );
    }
}
