package com.example.app.location;

import com.example.app.billingissuer.CompanyLegalEntity;
import com.example.app.billingissuer.CompanyLegalEntityRepository;
import com.example.app.billingissuer.LegalEntity;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.SpaceRepository;
import com.example.app.user.User;
import com.example.app.waitlist.WaitlistRequestRepository;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/locations")
public class LocationController {
    private final LocationRepository locations;
    private final SpaceRepository spaces;
    private final SessionBookingRepository bookings;
    private final WaitlistRequestRepository waitlists;
    private final CompanyLegalEntityRepository issuerAssignments;

    public LocationController(LocationRepository locations, SpaceRepository spaces, SessionBookingRepository bookings,
                              WaitlistRequestRepository waitlists, CompanyLegalEntityRepository issuerAssignments) {
        this.locations = locations;
        this.spaces = spaces;
        this.bookings = bookings;
        this.waitlists = waitlists;
        this.issuerAssignments = issuerAssignments;
    }

    public record LocationInput(String name, String address, String postalCode, String city, String timezone,
                                String phone, String email, String openingHoursJson, Boolean publicBookingEnabled,
                                Boolean defaultLocation, Boolean active, String fiscalBusinessPremiseCode,
                                Long defaultLegalEntityId) {}
    public record LocationResponse(Long id, String name, String address, String postalCode, String city, String timezone,
                                   String phone, String email, String openingHoursJson, boolean publicBookingEnabled,
                                   boolean defaultLocation, boolean active, String fiscalBusinessPremiseCode,
                                   Long defaultLegalEntityId, String defaultLegalEntityName) {}

    @GetMapping
    @Transactional(readOnly = true)
    public List<LocationResponse> list(@AuthenticationPrincipal User me) {
        return locations.findAllByCompanyIdOrderByDefaultLocationDescNameAscIdAsc(me.getCompany().getId())
                .stream().map(LocationController::response).toList();
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    public LocationResponse create(@RequestBody LocationInput input, @AuthenticationPrincipal User me) {
        String name = requiredName(input == null ? null : input.name());
        if (locations.existsByCompanyIdAndNameIgnoreCase(me.getCompany().getId(), name)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A location with this name already exists.");
        }
        Location location = new Location();
        location.setCompany(me.getCompany());
        apply(location, input, me.getCompany().getId());
        if (location.getDefaultLegalEntity() == null) {
            location.setDefaultLegalEntity(defaultIssuer(me.getCompany().getId()));
        }
        if (locations.countByCompanyId(me.getCompany().getId()) == 0 || Boolean.TRUE.equals(input.defaultLocation())) {
            clearDefault(me.getCompany().getId(), null);
            location.setDefaultLocation(true);
        }
        return response(locations.save(location));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    public LocationResponse update(@PathVariable Long id, @RequestBody LocationInput input, @AuthenticationPrincipal User me) {
        Location location = locations.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        String name = requiredName(input == null ? null : input.name());
        boolean duplicate = locations.findAllByCompanyIdOrderByDefaultLocationDescNameAscIdAsc(me.getCompany().getId()).stream()
                .anyMatch(other -> !other.getId().equals(id) && other.getName().equalsIgnoreCase(name));
        if (duplicate) throw new ResponseStatusException(HttpStatus.CONFLICT, "A location with this name already exists.");
        boolean wasDefault = location.isDefaultLocation();
        if (wasDefault && Boolean.FALSE.equals(input.defaultLocation())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Choose another default location before changing this one.");
        }
        if (Boolean.TRUE.equals(input.defaultLocation()) && !wasDefault) clearDefault(me.getCompany().getId(), id);
        apply(location, input, me.getCompany().getId());
        if (wasDefault || Boolean.TRUE.equals(input.defaultLocation())) location.setDefaultLocation(true);
        if (location.isDefaultLocation()) location.setActive(true);
        if (!location.isDefaultLocation() && locations.countByCompanyId(me.getCompany().getId()) == 1) location.setDefaultLocation(true);
        return response(locations.save(location));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    public void delete(@PathVariable Long id, @AuthenticationPrincipal User me) {
        Location location = locations.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (location.isDefaultLocation()) throw new ResponseStatusException(HttpStatus.CONFLICT, "The default location cannot be deleted.");
        if (spaces.countByLocationId(id) > 0 || bookings.countByLocationId(id) > 0 || waitlists.countByLocationId(id) > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Location is in use and cannot be deleted.");
        }
        locations.delete(location);
    }

    private void clearDefault(Long companyId, Long exceptId) {
        locations.findAllByCompanyIdOrderByDefaultLocationDescNameAscIdAsc(companyId).forEach(location -> {
            if (location.isDefaultLocation() && (exceptId == null || !location.getId().equals(exceptId))) {
                location.setDefaultLocation(false);
                locations.save(location);
            }
        });
    }

    private void apply(Location location, LocationInput input, Long companyId) {
        if (input == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Location is required.");
        location.setName(requiredName(input.name()));
        location.setAddress(trim(input.address()));
        location.setPostalCode(trim(input.postalCode()));
        location.setCity(trim(input.city()));
        location.setTimezone(trim(input.timezone()) == null ? "Europe/Ljubljana" : trim(input.timezone()));
        location.setPhone(trim(input.phone()));
        location.setEmail(trim(input.email()));
        location.setOpeningHoursJson(trim(input.openingHoursJson()));
        if (input.publicBookingEnabled() != null) location.setPublicBookingEnabled(input.publicBookingEnabled());
        if (input.defaultLocation() != null) location.setDefaultLocation(input.defaultLocation());
        if (input.active() != null) location.setActive(input.active());
        location.setFiscalBusinessPremiseCode(trim(input.fiscalBusinessPremiseCode()));
        if (input.defaultLegalEntityId() != null) {
            location.setDefaultLegalEntity(requireAssignedIssuer(companyId, input.defaultLegalEntityId()));
        }
    }

    private LegalEntity defaultIssuer(Long companyId) {
        return issuerAssignments.findFirstByCompanyIdAndActiveTrueOrderByDefaultIssuerDescIdAsc(companyId)
                .map(CompanyLegalEntity::getLegalEntity)
                .filter(LegalEntity::isActive)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT,
                        "Assign an active invoice issuer before creating a location."));
    }

    private LegalEntity requireAssignedIssuer(Long companyId, Long legalEntityId) {
        return issuerAssignments.findByCompanyIdAndLegalEntityId(companyId, legalEntityId)
                .filter(CompanyLegalEntity::isActive)
                .map(CompanyLegalEntity::getLegalEntity)
                .filter(LegalEntity::isActive)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "The selected invoice issuer is not assigned to this operating unit."));
    }

    private static String requiredName(String name) {
        String value = trim(name);
        if (value == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Location name is required.");
        return value;
    }
    private static String trim(String value) { return value == null || value.trim().isEmpty() ? null : value.trim(); }
    private static LocationResponse response(Location l) {
        return new LocationResponse(l.getId(), l.getName(), l.getAddress(), l.getPostalCode(), l.getCity(), l.getTimezone(),
                l.getPhone(), l.getEmail(), l.getOpeningHoursJson(), l.isPublicBookingEnabled(), l.isDefaultLocation(),
                l.isActive(), l.getFiscalBusinessPremiseCode(),
                l.getDefaultLegalEntity() == null ? null : l.getDefaultLegalEntity().getId(),
                l.getDefaultLegalEntity() == null ? null : l.getDefaultLegalEntity().getName());
    }
}
