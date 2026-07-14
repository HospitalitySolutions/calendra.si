package com.example.app.company;

import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/public/company-directory")
public class PublicCompanyDirectoryController {
    private final PublicCompanyDirectoryService directory;

    public PublicCompanyDirectoryController(PublicCompanyDirectoryService directory) {
        this.directory = directory;
    }

    @GetMapping
    public ResponseEntity<List<PublicCompanyDirectoryService.DirectoryCompanyResponse>> list() {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(directory.list());
    }
}
