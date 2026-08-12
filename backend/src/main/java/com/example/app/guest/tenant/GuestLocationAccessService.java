package com.example.app.guest.tenant;

import com.example.app.location.Location;
import com.example.app.location.LocationRepository;
import com.example.app.session.SessionType;
import java.util.Collection;
import java.util.List;
import java.util.Objects;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/**
 * Single source of truth for Guest App location discovery and booking access.
 *
 * <p>The company/client link stays as the shared identity bridge, while provider
 * subscriptions and Guest App discovery are location-level. Every booking path must
 * resolve through the same location rules.</p>
 */
@Service
public class GuestLocationAccessService {
    private final LocationRepository locations;

    public GuestLocationAccessService(LocationRepository locations) {
        this.locations = locations;
    }

    public List<Location> discoverableLocations() {
        return locations.findAllByActiveTrueAndGuestAppDiscoverableTrueOrderByCompanyIdAscNameAscIdAsc();
    }

    public List<Location> discoverableLocations(Long companyId) {
        if (companyId == null) return List.of();
        return locations.findAllByCompanyIdAndActiveTrueOrderByDefaultLocationDescNameAscIdAsc(companyId).stream()
                .filter(Location::isGuestAppDiscoverable)
                .toList();
    }

    public List<Location> discoverableLocations(Collection<Long> companyIds) {
        if (companyIds == null || companyIds.isEmpty()) return List.of();
        return locations.findAllByCompanyIdInAndActiveTrueOrderByCompanyIdAscDefaultLocationDescNameAscIdAsc(companyIds).stream()
                .filter(Location::isGuestAppDiscoverable)
                .toList();
    }

    public List<Location> bookableLocations(Long companyId) {
        return discoverableLocations(companyId).stream()
                .filter(Location::isPublicBookingEnabled)
                .toList();
    }

    public Location requireDiscoverable(Long companyId, Long locationId) {
        if (companyId == null || locationId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Location selection is required.");
        }
        return locations.findByIdAndCompanyId(locationId, companyId)
                .filter(Location::isActive)
                .filter(Location::isGuestAppDiscoverable)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Location is not available in the guest app."));
    }

    /**
     * Resolves the selected Guest App booking location. A single eligible branch may be
     * auto-selected because it is unambiguous; multiple branches require an explicit id.
     */
    public Location resolveBookable(Long companyId, Long locationId) {
        if (companyId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Company is required.");
        }
        if (locationId != null) {
            Location location = requireDiscoverable(companyId, locationId);
            if (!location.isPublicBookingEnabled()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Online booking is disabled for this location.");
            }
            return location;
        }
        List<Location> bookable = bookableLocations(companyId);
        if (bookable.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No online-bookable location is available.");
        }
        if (bookable.size() > 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Location selection is required.");
        }
        return bookable.get(0);
    }

    public boolean isServiceAvailableAt(SessionType type, Long locationId) {
        if (type == null || locationId == null) return false;
        if (type.isAvailableAllLocations()) return true;
        return type.getLocations() != null && type.getLocations().stream()
                .filter(Objects::nonNull)
                .anyMatch(location -> Objects.equals(location.getId(), locationId));
    }

    public void requireServiceAvailableAt(SessionType type, Location location) {
        if (type == null || location == null || !isServiceAvailableAt(type, location.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Service is not available at the selected location.");
        }
    }
}
