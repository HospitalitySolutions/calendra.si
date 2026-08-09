package com.example.app.commerce;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import com.example.app.billing.PaymentMethod;
import com.example.app.guest.model.GuestEntitlement;
import com.example.app.guest.model.GuestProduct;
import com.example.app.location.Location;
import com.example.app.location.LocationRepository;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class CommerceLocationScopeServiceTest {
    private final LocationRepository locations = org.mockito.Mockito.mock(LocationRepository.class);
    private final CommerceLocationScopeService service = new CommerceLocationScopeService(locations);

    @Test
    void allLocationDefinitionsAreAvailableAtAnyBranch() {
        GuestProduct product = new GuestProduct();
        product.setAvailableAllLocations(true);
        PaymentMethod paymentMethod = new PaymentMethod();
        paymentMethod.setAvailableAllLocations(true);
        GuestEntitlement entitlement = new GuestEntitlement();
        entitlement.setAvailableAllLocations(true);

        assertThat(service.productAvailableAt(product, 10L)).isTrue();
        assertThat(service.paymentMethodAvailableAt(paymentMethod, 20L)).isTrue();
        assertThat(service.entitlementAvailableAt(entitlement, 30L)).isTrue();
    }

    @Test
    void selectedLocationDefinitionsOnlyAllowConfiguredBranches() {
        Location maribor = location(10L, "Maribor");
        GuestProduct product = new GuestProduct();
        product.setAvailableAllLocations(false);
        product.setLocations(new LinkedHashSet<>(java.util.Set.of(maribor)));
        PaymentMethod paymentMethod = new PaymentMethod();
        paymentMethod.setAvailableAllLocations(false);
        paymentMethod.setLocations(new LinkedHashSet<>(java.util.Set.of(maribor)));
        GuestEntitlement entitlement = new GuestEntitlement();
        entitlement.setAvailableAllLocations(false);
        entitlement.setLocations(new LinkedHashSet<>(java.util.Set.of(maribor)));

        assertThat(service.productAvailableAt(product, 10L)).isTrue();
        assertThat(service.productAvailableAt(product, 20L)).isFalse();
        assertThat(service.paymentMethodAvailableAt(paymentMethod, 10L)).isTrue();
        assertThat(service.paymentMethodAvailableAt(paymentMethod, 20L)).isFalse();
        assertThat(service.entitlementAvailableAt(entitlement, 10L)).isTrue();
        assertThat(service.entitlementAvailableAt(entitlement, 20L)).isFalse();
    }

    @Test
    void purchaseAutoResolvesWhenExactlyOneEligibleLocationExists() {
        GuestProduct product = new GuestProduct();
        product.setAvailableAllLocations(false);
        Location maribor = location(10L, "Maribor");
        Location ljubljana = location(20L, "Ljubljana");
        product.setLocations(new LinkedHashSet<>(java.util.Set.of(maribor)));
        when(locations.findAllByCompanyIdAndActiveTrueOrderByDefaultLocationDescNameAscIdAsc(7L))
                .thenReturn(List.of(maribor, ljubljana));

        assertThat(service.resolveProductPurchaseLocation(7L, product, null).getId()).isEqualTo(10L);
    }

    @Test
    void purchaseRequiresSelectionWhenSeveralEligibleLocationsExist() {
        GuestProduct product = new GuestProduct();
        product.setAvailableAllLocations(true);
        Location maribor = location(10L, "Maribor");
        Location ljubljana = location(20L, "Ljubljana");
        when(locations.findAllByCompanyIdAndActiveTrueOrderByDefaultLocationDescNameAscIdAsc(7L))
                .thenReturn(List.of(maribor, ljubljana));

        assertThatThrownBy(() -> service.resolveProductPurchaseLocation(7L, product, null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Location selection is required");
    }

    @Test
    void activeLocationResolutionRejectsForeignOrInactiveBranches() {
        Location inactive = location(10L, "Inactive");
        inactive.setActive(false);
        when(locations.findByIdAndCompanyId(10L, 7L)).thenReturn(Optional.of(inactive));
        when(locations.findByIdAndCompanyId(20L, 7L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.requireActiveLocation(7L, 10L))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("invalid or inactive");
        assertThatThrownBy(() -> service.requireActiveLocation(7L, 20L))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("invalid or inactive");
    }

    @Test
    void explicitPurchaseLocationMustBelongToProductScope() {
        GuestProduct product = new GuestProduct();
        product.setAvailableAllLocations(false);
        Location maribor = location(10L, "Maribor");
        Location ljubljana = location(20L, "Ljubljana");
        product.setLocations(new LinkedHashSet<>(java.util.Set.of(maribor)));
        when(locations.findByIdAndCompanyId(20L, 7L)).thenReturn(Optional.of(ljubljana));

        assertThatThrownBy(() -> service.resolveProductPurchaseLocation(7L, product, 20L))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("not available at this location");
    }

    private Location location(Long id, String name) {
        Location location = new Location();
        location.setId(id);
        location.setName(name);
        location.setActive(true);
        return location;
    }
}
