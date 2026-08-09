package com.example.app.commerce;

import com.example.app.billing.PaymentMethod;
import com.example.app.guest.model.GuestEntitlement;
import com.example.app.guest.model.GuestProduct;
import com.example.app.location.Location;
import com.example.app.location.LocationRepository;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/** Central authority for all/selected-location commerce definitions and entitlement snapshots. */
@Service
public class CommerceLocationScopeService {
    private final LocationRepository locations;

    public CommerceLocationScopeService(LocationRepository locations) {
        this.locations = locations;
    }

    public boolean productAvailableAt(GuestProduct product, Long locationId) {
        if (product == null || locationId == null) return false;
        if (product.isAvailableAllLocations()) return true;
        return containsLocation(product.getLocations(), locationId);
    }

    public boolean paymentMethodAvailableAt(PaymentMethod method, Long locationId) {
        if (method == null || locationId == null) return false;
        if (method.isAvailableAllLocations()) return true;
        return containsLocation(method.getLocations(), locationId);
    }

    public boolean entitlementAvailableAt(GuestEntitlement entitlement, Long locationId) {
        if (entitlement == null || locationId == null) return false;
        if (entitlement.isAvailableAllLocations()) return true;
        return containsLocation(entitlement.getLocations(), locationId);
    }

    public void requireProductAvailableAt(GuestProduct product, Location location) {
        if (location == null || location.getId() == null || !productAvailableAt(product, location.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected product is not available at this location.");
        }
    }

    public void requirePaymentMethodAvailableAt(PaymentMethod method, Location location) {
        if (location == null || location.getId() == null || !paymentMethodAvailableAt(method, location.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected payment method is not available at this location.");
        }
    }

    public void requireEntitlementAvailableAt(GuestEntitlement entitlement, Location location) {
        if (location == null || location.getId() == null || !entitlementAvailableAt(entitlement, location.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected entitlement is not valid at this location.");
        }
    }

    public Location requireActiveLocation(Long companyId, Long locationId) {
        if (companyId == null || locationId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Location is required.");
        }
        return locations.findByIdAndCompanyId(locationId, companyId)
                .filter(Location::isActive)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected location is invalid or inactive."));
    }

    /** Resolve a purchase branch from the product's eligible active locations. */
    public Location resolveProductPurchaseLocation(Long companyId, GuestProduct product, Long requestedLocationId) {
        if (companyId == null || product == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Product location is unavailable.");
        }
        if (requestedLocationId != null) {
            Location requested = requireActiveLocation(companyId, requestedLocationId);
            requireProductAvailableAt(product, requested);
            return requested;
        }
        List<Location> eligible = eligibleActiveLocations(companyId, product);
        if (eligible.size() == 1) return eligible.getFirst();
        if (eligible.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This product is not available at any active location.");
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Location selection is required for this product.");
    }

    public List<Location> eligibleActiveLocations(Long companyId, GuestProduct product) {
        List<Location> active = locations.findAllByCompanyIdAndActiveTrueOrderByDefaultLocationDescNameAscIdAsc(companyId);
        return active.stream().filter(location -> productAvailableAt(product, location.getId())).toList();
    }

    public Set<Location> resolveSelectedLocations(Long companyId, Boolean availableAllLocations, Collection<Long> locationIds, String label) {
        if (Boolean.TRUE.equals(availableAllLocations) || availableAllLocations == null) return Set.of();
        LinkedHashSet<Long> ids = new LinkedHashSet<>();
        if (locationIds != null) locationIds.stream().filter(Objects::nonNull).forEach(ids::add);
        if (ids.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, (label == null ? "Item" : label) + " must be available at at least one location.");
        }
        List<Location> resolved = locations.findAllByCompanyIdAndIdIn(companyId, ids);
        if (resolved.size() != ids.size()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "One or more selected locations are invalid.");
        }
        LinkedHashSet<Location> result = new LinkedHashSet<>();
        for (Long id : ids) {
            resolved.stream().filter(location -> Objects.equals(location.getId(), id)).findFirst().ifPresent(result::add);
        }
        return result;
    }

    public List<Long> locationIds(GuestProduct product) {
        return ids(product == null ? null : product.getLocations());
    }

    public List<Long> locationIds(PaymentMethod method) {
        return ids(method == null ? null : method.getLocations());
    }

    public List<Long> locationIds(GuestEntitlement entitlement) {
        return ids(entitlement == null ? null : entitlement.getLocations());
    }

    public List<String> locationNames(GuestProduct product) {
        return names(product == null ? null : product.getLocations());
    }

    public List<String> locationNames(PaymentMethod method) {
        return names(method == null ? null : method.getLocations());
    }

    public List<String> locationNames(GuestEntitlement entitlement) {
        return names(entitlement == null ? null : entitlement.getLocations());
    }

    private static boolean containsLocation(Collection<Location> values, Long locationId) {
        return values != null && values.stream().filter(Objects::nonNull).map(Location::getId).anyMatch(locationId::equals);
    }

    private static List<Long> ids(Collection<Location> values) {
        if (values == null) return List.of();
        return values.stream().filter(Objects::nonNull).map(Location::getId).filter(Objects::nonNull).sorted().toList();
    }

    private static List<String> names(Collection<Location> values) {
        if (values == null) return List.of();
        return values.stream().filter(Objects::nonNull).sorted((a, b) -> String.CASE_INSENSITIVE_ORDER.compare(
                        Objects.toString(a.getName(), ""), Objects.toString(b.getName(), "")))
                .map(Location::getName).filter(Objects::nonNull).toList();
    }
}
