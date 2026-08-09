package com.example.app.location;

import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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
}
