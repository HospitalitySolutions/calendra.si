package com.example.app.location;

import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/public/location-directory")
public class PublicLocationDirectoryController {
    private final PublicLocationDirectoryService directory;
    private final PublicLocationNearbyService nearby;

    public PublicLocationDirectoryController(
            PublicLocationDirectoryService directory,
            PublicLocationNearbyService nearby
    ) {
        this.directory = directory;
        this.nearby = nearby;
    }

    @GetMapping
    public ResponseEntity<List<PublicLocationDirectoryService.DirectoryLocationResponse>> list() {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(directory.list());
    }

    @GetMapping("/nearby")
    public ResponseEntity<PublicLocationNearbyService.NearbySearchResponse> nearby(
            @RequestParam String address,
            @RequestParam(required = false) Double radiusKm,
            @RequestParam(required = false) Integer limit
    ) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(nearby.search(address, radiusKm, limit));
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
