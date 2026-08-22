package com.example.app.guest.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.example.app.common.TimeService;
import com.example.app.company.Company;
import com.example.app.guest.common.GuestSettingsService;
import com.example.app.guest.model.GuestProduct;
import com.example.app.guest.model.GuestProductRepository;
import com.example.app.guest.model.ProductType;
import com.example.app.session.BookableSlotRepository;
import com.example.app.session.SessionBookingCreationService;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.SessionType;
import com.example.app.session.SessionTypeRepository;
import com.example.app.settings.CourseModuleAccessService;
import com.example.app.settings.TenantFeatureAccessService;
import com.example.app.user.UserRepository;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class GuestCatalogServiceWebsiteProductTest {
    private SessionTypeRepository sessionTypes;
    private GuestProductRepository guestProducts;
    private GuestCatalogService service;

    @BeforeEach
    void setUp() {
        sessionTypes = mock(SessionTypeRepository.class);
        guestProducts = mock(GuestProductRepository.class);
        service = new GuestCatalogService(
                sessionTypes,
                guestProducts,
                mock(BookableSlotRepository.class),
                mock(SessionBookingRepository.class),
                mock(UserRepository.class),
                mock(SessionBookingCreationService.class),
                mock(GuestSettingsService.class),
                mock(TimeService.class),
                mock(CourseModuleAccessService.class),
                mock(TenantFeatureAccessService.class),
                "Europe/Ljubljana"
        );
    }

    @Test
    void productsAllowsWalletProductWithoutServiceGroup() {
        Company company = new Company();
        company.setId(10L);

        SessionType type = new SessionType();
        type.setId(11L);
        type.setCompany(company);
        type.setName("Consultation");
        type.setActive(true);
        type.setGuestBookingEnabled(true);

        GuestProduct product = new GuestProduct();
        product.setId(12L);
        product.setCompany(company);
        product.setSessionType(type);
        product.setName("5 visits");
        product.setProductType(ProductType.PACK);
        product.setPriceGross(new BigDecimal("50.00"));
        product.setCurrency("EUR");
        product.setActive(true);
        product.setGuestVisible(true);
        product.setBookable(true);

        when(sessionTypes.findAllWithLinkedServicesByCompanyId(10L)).thenReturn(List.of());
        when(guestProducts.findAllByCompanyIdAndActiveTrueAndGuestVisibleTrueOrderBySortOrderAscIdAsc(10L))
                .thenReturn(List.of(product));

        var products = service.products(10L, null);

        assertThat(products).hasSize(1);
        assertThat(products.getFirst().productId()).isEqualTo("12");
        assertThat(products.getFirst().serviceGroupId()).isNull();
        assertThat(products.getFirst().serviceGroupName()).isNull();
        assertThat(products.getFirst().serviceGroupSortOrder()).isNull();
    }

    @Test
    void websiteResolverDoesNotRequireGuestAppVisibility() {
        Company company = new Company();
        company.setId(10L);
        SessionType type = new SessionType();
        type.setId(11L);
        type.setCompany(company);
        type.setName("Group session");
        type.setActive(true);
        type.setWidgetGroupBookingEnabled(true);
        type.setGuestBookingEnabled(false);
        type.setMaxParticipantsPerSession(12);
        when(sessionTypes.findById(11L)).thenReturn(Optional.of(type));

        GuestCatalogService.ResolvedProduct product = service.resolveWebsiteSessionProduct(10L, 11L);

        assertThat(product.sessionType()).isSameAs(type);
        assertThat(product.productType()).isEqualTo("CLASS_TICKET");
        assertThat(product.name()).isEqualTo("Group session");
    }

    @Test
    void websiteResolverAllowsGuestVisibleService() {
        Company company = new Company();
        company.setId(10L);
        SessionType type = new SessionType();
        type.setId(11L);
        type.setCompany(company);
        type.setName("Consultation");
        type.setActive(true);
        type.setWidgetGroupBookingEnabled(false);
        type.setGuestBookingEnabled(true);
        when(sessionTypes.findById(11L)).thenReturn(Optional.of(type));

        GuestCatalogService.ResolvedProduct product = service.resolveWebsiteSessionProduct(10L, 11L);

        assertThat(product.sessionType()).isSameAs(type);
        assertThat(product.productType()).isEqualTo("SESSION_SINGLE");
        assertThat(product.name()).isEqualTo("Consultation");
    }

    @Test
    void websiteResolverRejectsServiceThatIsNotExposedInWidget() {
        Company company = new Company();
        company.setId(10L);
        SessionType type = new SessionType();
        type.setId(11L);
        type.setCompany(company);
        type.setName("Hidden service");
        type.setActive(true);
        type.setWidgetGroupBookingEnabled(false);
        type.setGuestBookingEnabled(false);
        when(sessionTypes.findById(11L)).thenReturn(Optional.of(type));

        assertThatThrownBy(() -> service.resolveWebsiteSessionProduct(10L, 11L))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> {
                    ResponseStatusException exception = (ResponseStatusException) error;
                    assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(exception.getReason()).isEqualTo("This service is not available in the website widget.");
                });
    }
}
