package com.example.app.location;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/public/storefront")
public class PublicStorefrontController {
    private final PublicStorefrontService storefront;

    public PublicStorefrontController(PublicStorefrontService storefront) {
        this.storefront = storefront;
    }

    @GetMapping("/{slug}")
    public ResponseEntity<PublicStorefrontService.StorefrontResponse> storefront(
            @PathVariable String slug,
            HttpServletRequest request
    ) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(storefront.storefront(slug, request));
    }
}
