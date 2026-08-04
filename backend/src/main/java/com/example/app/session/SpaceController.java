package com.example.app.session;

import com.example.app.location.LocationService;
import com.example.app.user.User;
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

    public SpaceController(SpaceRepository repo, LocationService locations) {
        this.repo = repo;
        this.locations = locations;
    }

    public record SpaceInput(String name, String description, Long locationId) {}

    @GetMapping
    public List<Space> list(@AuthenticationPrincipal User me) {
        return repo.findAllByCompanyId(me.getCompany().getId());
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping
    public Space create(@RequestBody SpaceInput input, @AuthenticationPrincipal User me) {
        Space space = new Space();
        space.setCompany(me.getCompany());
        space.setName(requiredName(input == null ? null : input.name()));
        space.setDescription(input == null ? null : input.description());
        space.setLocation(locations.requireForCompany(input == null ? null : input.locationId(), me.getCompany()));
        return repo.save(space);
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/{id}")
    public Space update(@PathVariable Long id, @RequestBody SpaceInput input, @AuthenticationPrincipal User me) {
        Space existing = repo.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        existing.setName(requiredName(input == null ? null : input.name()));
        existing.setDescription(input == null ? null : input.description());
        if (input != null && input.locationId() != null) {
            existing.setLocation(locations.requireForCompany(input.locationId(), me.getCompany()));
        }
        return repo.save(existing);
    }

    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id, @AuthenticationPrincipal User me) {
        Space existing = repo.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        repo.delete(existing);
    }

    private static String requiredName(String value) {
        if (value == null || value.trim().isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Space name is required.");
        return value.trim();
    }
}
