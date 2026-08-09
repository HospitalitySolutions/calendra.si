package com.example.app.guest.common;

import com.example.app.guest.auth.GuestAuthContextService;
import com.example.app.guest.catalog.GuestCatalogService;
import com.example.app.guest.model.GuestUser;
import com.example.app.guest.tenant.GuestTenantService;
import com.example.app.session.BookingSlotHoldService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/guest/booking-holds")
public class GuestBookingSlotHoldController {
    private final GuestAuthContextService auth;
    private final GuestTenantService tenants;
    private final BookingSlotHoldService holds;
    private final GuestCatalogService catalog;

    public GuestBookingSlotHoldController(
            GuestAuthContextService auth,
            GuestTenantService tenants,
            BookingSlotHoldService holds,
            GuestCatalogService catalog
    ) {
        this.auth = auth;
        this.tenants = tenants;
        this.holds = holds;
        this.catalog = catalog;
    }

    public record GuestHoldRequest(
            String companyId,
            String locationId,
            String slotId,
            java.util.List<Long> serviceTypeIds,
            String previousHoldToken
    ) {}

    @PostMapping
    public BookingSlotHoldService.HoldResponse create(@RequestBody GuestHoldRequest request, HttpServletRequest httpRequest) {
        GuestUser guest = auth.requireGuest(httpRequest);
        Long companyId;
        try {
            companyId = request == null || request.companyId() == null
                    ? null
                    : Long.parseLong(request.companyId().trim());
        } catch (RuntimeException ex) {
            companyId = null;
        }
        if (companyId == null || companyId <= 0) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.BAD_REQUEST, "Company is required.");
        }
        tenants.requireLink(guest, companyId);
        Long locationId = parseOptionalLocationId(request.locationId());
        Long resolvedLocationId = catalog.requireGuestBookableLocation(companyId, locationId, request.serviceTypeIds(), guest);
        return holds.create(companyId, new BookingSlotHoldService.HoldRequest(
                resolvedLocationId, request.slotId(), request.serviceTypeIds(), request.previousHoldToken()
        ));
    }

    private static Long parseOptionalLocationId(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            long value = Long.parseLong(raw.trim());
            if (value <= 0) throw new NumberFormatException();
            return value;
        } catch (NumberFormatException ex) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.BAD_REQUEST, "Invalid location identifier.");
        }
    }

    @DeleteMapping("/{companyId}/{token}")
    public ResponseEntity<Void> release(@PathVariable Long companyId, @PathVariable String token, HttpServletRequest httpRequest) {
        GuestUser guest = auth.requireGuest(httpRequest);
        tenants.requireLink(guest, companyId);
        holds.release(companyId, token);
        return ResponseEntity.noContent().build();
    }
}
