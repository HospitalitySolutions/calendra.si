package com.example.app.customer;

import com.example.app.company.Company;
import com.example.app.guest.auth.GuestTokenService;
import com.example.app.guest.model.GuestUser;
import com.example.app.guest.tenant.GuestProviderLinkService;
import com.example.app.location.Location;
import com.example.app.location.LocationRepository;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CustomerBookingHandoffService {
    private final LocationRepository locations;
    private final GuestTokenService guestTokens;
    private final GuestProviderLinkService providerLinks;

    public CustomerBookingHandoffService(
            LocationRepository locations,
            GuestTokenService guestTokens,
            GuestProviderLinkService providerLinks
    ) {
        this.locations = locations;
        this.guestTokens = guestTokens;
        this.providerLinks = providerLinks;
    }

    @Transactional
    public CustomerDtos.BookingHandoffResponse issue(
            GuestUser guestUser,
            CustomerDtos.BookingHandoffRequest request
    ) {
        Long locationId = parsePositiveLong(request == null ? null : request.locationId(), "Location is required.");
        Long sessionTypeId = parseOptionalPositiveLong(request == null ? null : request.sessionTypeId(), "Invalid service identifier.");
        Location location = locations.findById(locationId)
                .filter(Location::isActive)
                .filter(Location::isPublicBookingEnabled)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Location is not available for online booking."));
        Company company = location.getCompany();
        if (company == null || company.getId() == null || company.getTenantCode() == null || company.getTenantCode().isBlank()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Provider booking identity is unavailable.");
        }

        providerLinks.activateMarketplaceLocation(guestUser, company, location, guestUser.getLanguage());

        GuestTokenService.IssuedBookingHandoff handoff = guestTokens.issueBookingHandoff(
                guestUser.getId(), company.getId(), location.getId(), company.getTenantCode());

        StringBuilder bookingUrl = new StringBuilder("/narocanje/")
                .append(URLEncoder.encode(company.getTenantCode(), StandardCharsets.UTF_8))
                .append("?locationId=")
                .append(location.getId());
        if (sessionTypeId != null) {
            bookingUrl.append("&typeId=").append(sessionTypeId);
        }

        return new CustomerDtos.BookingHandoffResponse(
                handoff.token(),
                handoff.expiresAt().toString(),
                bookingUrl.toString(),
                String.valueOf(company.getId()),
                company.getName(),
                String.valueOf(location.getId()),
                location.getPublicName() == null || location.getPublicName().isBlank() ? location.getName() : location.getPublicName()
        );
    }

    private static Long parsePositiveLong(String value, String message) {
        Long parsed = parseOptionalPositiveLong(value, message);
        if (parsed == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
        return parsed;
    }

    private static Long parseOptionalPositiveLong(String value, String message) {
        if (value == null || value.isBlank()) return null;
        try {
            long parsed = Long.parseLong(value.trim());
            if (parsed <= 0L) throw new NumberFormatException();
            return parsed;
        } catch (NumberFormatException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
        }
    }
}
