package com.example.app.guest.tenant;

import com.example.app.guest.auth.GuestAuthContextService;
import com.example.app.guest.common.GuestDtos;
import com.example.app.guest.model.GuestUser;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/guest/tenants")
public class GuestTenantController {
    private final GuestTenantService tenantService;
    private final GuestAuthContextService authContextService;

    public GuestTenantController(GuestTenantService tenantService, GuestAuthContextService authContextService) {
        this.tenantService = tenantService;
        this.authContextService = authContextService;
    }

    @PostMapping("/resolve-code")
    public GuestDtos.TenantLookupResponse resolveCode(@RequestBody GuestDtos.TenantLookupRequest request) {
        return tenantService.resolveByCode(request.tenantCode());
    }

    @GetMapping("/invite/{code}")
    public GuestDtos.TenantLookupResponse resolveInvite(@PathVariable String code) {
        return tenantService.resolveInvite(code);
    }

    @GetMapping("/search")
    public List<GuestDtos.TenantSummaryResponse> search(@RequestParam("q") String query) {
        return tenantService.search(query);
    }

    @PostMapping("/join")
    public GuestDtos.JoinTenantResponse join(@RequestBody GuestDtos.JoinTenantRequest request, HttpServletRequest httpRequest) {
        GuestUser guestUser = authContextService.requireGuest(httpRequest);
        return tenantService.join(guestUser, request);
    }
}
