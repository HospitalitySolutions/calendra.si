package com.example.app.location;

import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@RestController
@RequestMapping("/api/public/location-directory")
public class PublicLocationDirectoryController {
    private final PublicLocationDirectoryService directory;

    public PublicLocationDirectoryController(PublicLocationDirectoryService directory) {
        this.directory = directory;
    }

    @GetMapping
    public ResponseEntity<List<PublicLocationDirectoryService.DirectoryLocationResponse>> list() {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(directory.list());
    }

    @GetMapping("/nearby")
    public ResponseEntity<PublicLocationDirectoryService.NearbySearchResponse> nearby(
            @RequestParam String address,
            @RequestParam(required = false) Double radiusKm,
            @RequestParam(defaultValue = "50") int limit
    ) {
        try {
            return ResponseEntity.ok()
                    .cacheControl(CacheControl.noStore())
                    .body(directory.searchNearby(address, radiusKm, limit));
        } catch (IllegalArgumentException error) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, error.getMessage(), error);
        } catch (IllegalStateException error) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, error.getMessage(), error);
        }
    }

    @GetMapping("/{slug}")
    public ResponseEntity<PublicLocationDirectoryService.DirectoryLocationResponse> detail(@PathVariable String slug) {
        return directory.findBySlug(slug)
                .map(location -> ResponseEntity.ok()
                        .cacheControl(CacheControl.noStore())
                        .body(location))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
