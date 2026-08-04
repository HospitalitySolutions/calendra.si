package com.example.app.location;

import com.example.app.company.Company;
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
        return locations.save(location);
    }
}
