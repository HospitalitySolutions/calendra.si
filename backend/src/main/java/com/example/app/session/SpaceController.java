package com.example.app.session;

import com.example.app.activitylog.ActivityAction;
import com.example.app.activitylog.ActivityDetails;
import com.example.app.activitylog.ActivityLogService;
import com.example.app.activitylog.ActivityModule;
import com.example.app.location.Location;
import com.example.app.location.LocationService;
import com.example.app.user.User;
import java.time.Instant;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/spaces")
public class SpaceController {
    private final SpaceRepository repo;
    private final LocationService locations;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private ActivityLogService activityLogs;

    public SpaceController(SpaceRepository repo, LocationService locations) {
        this.repo = repo;
        this.locations = locations;
    }

    public record SpaceInput(String name, String description, Long locationId) {}

    /**
     * API-safe location data used by a space response.
     *
     * Returning the Location JPA entity here would expose detached lazy relations
     * after the repository transaction has closed (open-in-view is disabled).
     */
    public record SpaceLocationResponse(
            Long id,
            String name,
            String timezone,
            boolean active
    ) {}

    /**
     * Do not return Space entities directly. Space contains tenant and location
     * relations and serializing those entities outside a transaction can trigger
     * LazyInitializationException / Hibernate proxy serialization failures.
     */
    public record SpaceResponse(
            Long id,
            String name,
            String description,
            Instant createdAt,
            Instant updatedAt,
            SpaceLocationResponse location
    ) {}

    @GetMapping
    public List<SpaceResponse> list(@AuthenticationPrincipal User me) {
        return repo.findSummariesByCompanyId(me.getCompany().getId()).stream()
                .map(SpaceController::response)
                .toList();
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping
    public SpaceResponse create(@RequestBody SpaceInput input, @AuthenticationPrincipal User me) {
        Space space = new Space();
        space.setCompany(me.getCompany());
        space.setName(requiredName(input == null ? null : input.name()));
        space.setDescription(trim(input == null ? null : input.description()));
        space.setLocation(locations.requireForCompany(input == null ? null : input.locationId(), me.getCompany()));
        SpaceResponse result = response(repo.save(space));
        recordSpace(me, ActivityAction.SPACE_CREATED, result, "Created space");
        return result;
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/{id}")
    public SpaceResponse update(@PathVariable Long id, @RequestBody SpaceInput input, @AuthenticationPrincipal User me) {
        Space existing = repo.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        existing.setName(requiredName(input == null ? null : input.name()));
        existing.setDescription(trim(input == null ? null : input.description()));
        if (input != null && input.locationId() != null) {
            existing.setLocation(locations.requireForCompany(input.locationId(), me.getCompany()));
        }
        SpaceResponse result = response(repo.save(existing));
        recordSpace(me, ActivityAction.SPACE_UPDATED, result, "Updated space");
        return result;
    }

    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id, @AuthenticationPrincipal User me) {
        Space existing = repo.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        SpaceResponse snapshot = response(existing);
        repo.delete(existing);
        if (activityLogs != null) {
            Long locationId = snapshot.location() == null ? null : snapshot.location().id();
            activityLogs.recordUser(me, ActivityModule.CONFIGURATION, ActivityAction.SPACE_DELETED,
                    "SPACE", snapshot.id(), snapshot.name(), "Deleted space", locationId, snapshot.id(),
                    ActivityDetails.of("location", snapshot.location() == null ? null : snapshot.location().name(),
                            "targetPath", "/configuration?tab=booking"));
        }
    }

    private void recordSpace(User me, ActivityAction action, SpaceResponse row, String summary) {
        if (activityLogs == null || row == null) return;
        Long locationId = row.location() == null ? null : row.location().id();
        activityLogs.recordUser(me, ActivityModule.CONFIGURATION, action,
                "SPACE", row.id(), row.name(), summary, locationId, row.id(),
                ActivityDetails.of("location", row.location() == null ? null : row.location().name(),
                        "targetPath", "/configuration?tab=booking"));
    }

    private static SpaceResponse response(Space space) {
        Location location = space.getLocation();
        SpaceLocationResponse locationResponse = location == null
                ? null
                : new SpaceLocationResponse(
                        location.getId(),
                        location.getName(),
                        location.getTimezone(),
                        location.isActive()
                );
        return new SpaceResponse(
                space.getId(),
                space.getName(),
                space.getDescription(),
                space.getCreatedAt(),
                space.getUpdatedAt(),
                locationResponse
        );
    }

    private static SpaceResponse response(SpaceRepository.SpaceSummary space) {
        SpaceLocationResponse locationResponse = space.getLocationId() == null
                ? null
                : new SpaceLocationResponse(
                        space.getLocationId(),
                        space.getLocationName(),
                        space.getLocationTimezone(),
                        Boolean.TRUE.equals(space.getLocationActive())
                );
        return new SpaceResponse(
                space.getId(),
                space.getName(),
                space.getDescription(),
                space.getCreatedAt(),
                space.getUpdatedAt(),
                locationResponse
        );
    }

    private static String requiredName(String value) {
        String trimmed = trim(value);
        if (trimmed == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Space name is required.");
        }
        return trimmed;
    }

    private static String trim(String value) {
        return value == null || value.trim().isEmpty() ? null : value.trim();
    }
}
