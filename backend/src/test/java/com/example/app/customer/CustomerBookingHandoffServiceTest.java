package com.example.app.customer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.app.company.Company;
import com.example.app.guest.auth.GuestTokenService;
import com.example.app.guest.model.GuestUser;
import com.example.app.guest.tenant.GuestProviderLinkService;
import com.example.app.location.Location;
import com.example.app.location.LocationRepository;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class CustomerBookingHandoffServiceTest {
    @Test
    void issueScopesHandoffToSelectedPublicLocationAndPreselectsService() {
        Company company = new Company();
        company.setId(7L);
        company.setName("Studio LUX");
        company.setTenantCode("3DAV");

        Location location = new Location();
        location.setId(31L);
        location.setCompany(company);
        location.setName("Maribor");
        location.setPublicName("Studio LUX Maribor");
        location.setActive(true);
        location.setPublicBookingEnabled(true);

        GuestUser guest = new GuestUser();
        guest.setId(11L);
        guest.setActive(true);
        guest.setLanguage("sl");

        LocationRepository locations = mock(LocationRepository.class);
        when(locations.findById(31L)).thenReturn(Optional.of(location));
        GuestTokenService tokens = mock(GuestTokenService.class);
        when(tokens.issueBookingHandoff(11L, 7L, 31L, "3DAV"))
                .thenReturn(new GuestTokenService.IssuedBookingHandoff("handoff-token", Instant.parse("2026-08-13T08:00:00Z")));
        GuestProviderLinkService links = mock(GuestProviderLinkService.class);

        CustomerBookingHandoffService service = new CustomerBookingHandoffService(locations, tokens, links);
        CustomerDtos.BookingHandoffResponse response = service.issue(
                guest, new CustomerDtos.BookingHandoffRequest("31", "42"));

        assertThat(response.handoffToken()).isEqualTo("handoff-token");
        assertThat(response.bookingUrl()).isEqualTo("/narocanje/3DAV?locationId=31&typeId=42");
        assertThat(response.companyId()).isEqualTo("7");
        assertThat(response.locationId()).isEqualTo("31");
        assertThat(response.locationName()).isEqualTo("Studio LUX Maribor");
        verify(links).activateMarketplaceLocation(guest, company, location, "sl");
    }
}
