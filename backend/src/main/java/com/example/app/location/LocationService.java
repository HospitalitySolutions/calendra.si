package com.example.app.location;

import com.example.app.company.Company;
import java.util.Locale;
import java.util.Objects;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class LocationService {
    private final LocationRepository locations;

    public LocationService(LocationRepository locations) {
        this.locations = locations;
    }

    public Location requireDefault(Company company) {
        if (company == null || company.getId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Operating unit is required.");
        }
        return locations.findFirstByCompanyIdAndDefaultLocationTrue(company.getId())
                .orElseGet(() -> locations.findAllByCompanyIdOrderByDefaultLocationDescNameAscIdAsc(company.getId())
                        .stream().findFirst().map(existing -> {
                            existing.setDefaultLocation(true);
                            existing.setActive(true);
                            return locations.save(existing);
                        }).orElseGet(() -> createDefault(company)));
    }

    /**
     * Completes the default physical location while a tenant is being provisioned.
     * The company INSERT trigger guarantees that a location exists even for raw SQL
     * provisioning; application provisioning calls this method once contact/address
     * details become available so the default location is useful immediately.
     *
     * <p>This is intentionally an initialization API rather than ongoing company-to-
     * location synchronization. After provisioning, Location is the source of truth
     * for physical/public location details.</p>
     */
    public Location initializeDefaultLocation(Company company, InitialLocationDetails details) {
        Location location = requireDefault(company);
        if (details == null) return location;

        String name = trim(details.name());
        if (name != null) location.setName(name);

        String address = trim(details.address());
        if (address != null) location.setAddress(address);
        String postalCode = trim(details.postalCode());
        if (postalCode != null) location.setPostalCode(postalCode);
        String city = trim(details.city());
        if (city != null) location.setCity(city);
        String country = normalizeCountry(details.country());
        if (country != null) location.setCountry(country);
        String phone = trim(details.phone());
        if (phone != null) location.setPhone(phone);
        String email = trim(details.email());
        if (email != null) location.setEmail(email);

        location.setDefaultLocation(true);
        location.setActive(true);
        return locations.save(location);
    }

    public Location requireForCompany(Long locationId, Company company) {
        if (locationId == null) return requireDefault(company);
        return locations.findByIdAndCompanyId(locationId, company.getId())
                .filter(Location::isActive)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Location is not available in this unit."));
    }

    public void assertSameCompany(Location location, Company company) {
        if (location == null || location.getCompany() == null || company == null
                || !Objects.equals(location.getCompany().getId(), company.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Location belongs to another operating unit.");
        }
    }

    private Location createDefault(Company company) {
        Location location = new Location();
        location.setCompany(company);
        location.setName(company.getName() == null || company.getName().isBlank() ? "Location" : company.getName().trim());
        location.setDefaultLocation(true);
        location.setActive(true);
        location.setPublicBookingEnabled(true);
        location.setWebsitePresentationEnabled(true);
        return locations.save(location);
    }

    private static String trim(String value) {
        return value == null || value.trim().isEmpty() ? null : value.trim();
    }

    private static String normalizeCountry(String country) {
        String value = trim(country);
        if (value == null) return null;
        return value.matches("(?i)[a-z]{2}") ? value.toUpperCase(Locale.ROOT) : null;
    }

    public record InitialLocationDetails(
            String name,
            String address,
            String postalCode,
            String city,
            String country,
            String phone,
            String email
    ) {}
}
