package com.example.app.register;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/register")
public class RegisterCatalogController {
    private final RegisterCatalogService registerCatalogService;

    public RegisterCatalogController(RegisterCatalogService registerCatalogService) {
        this.registerCatalogService = registerCatalogService;
    }

    @GetMapping("/catalog")
    public RegisterPriceCatalog catalog() {
        return registerCatalogService.mergedCatalog();
    }
}
