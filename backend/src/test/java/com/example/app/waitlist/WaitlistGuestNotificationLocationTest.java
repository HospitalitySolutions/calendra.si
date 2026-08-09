package com.example.app.waitlist;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.example.app.client.Client;
import com.example.app.guest.notifications.GuestNotificationService;
import com.example.app.guest.notifications.GuestPushService;
import com.example.app.location.Location;
import com.example.app.location.LocationPublicPresentationService;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.TenantSmsQuotaService;
import com.example.app.company.Company;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

class WaitlistGuestNotificationLocationTest {

    @Test
    void tokensUseLocationIdentityContactAndTimezone() {
        WaitlistGuestNotificationService service = new WaitlistGuestNotificationService(
                mock(ApplicationEventPublisher.class),
                mock(WaitlistRequestRepository.class),
                mock(WaitlistOfferRepository.class),
                mock(WaitlistRequestWindowRepository.class),
                mock(AppSettingRepository.class),
                new ObjectMapper(),
                null,
                "",
                "",
                "",
                "https://app.calendra.test",
                null,
                mock(TenantSmsQuotaService.class),
                mock(GuestNotificationService.class),
                mock(GuestPushService.class),
                null,
                null,
                mock(LocationPublicPresentationService.class),
                null
        );

        Company company = new Company();
        company.setId(1L);
        company.setName("Generic company");

        Location location = new Location();
        location.setId(12L);
        location.setCompany(company);
        location.setName("London branch");
        location.setTimezone("Europe/London");

        Client client = new Client();
        client.setFirstName("Ana");
        client.setLastName("Novak");

        WaitlistRequest request = new WaitlistRequest();
        request.setId(21L);
        request.setCompany(company);
        request.setLocation(location);
        request.setClient(client);
        request.setDateFrom(LocalDate.of(2026, 8, 10));
        request.setDateTo(LocalDate.of(2026, 8, 10));
        request.setServiceGroupNameSnapshot("Consultation");

        WaitlistOffer offer = new WaitlistOffer();
        offer.setId(31L);
        offer.setRequest(request);
        offer.setCompany(company);
        offer.setLocation(location);
        offer.setServiceNameSnapshot("Consultation");
        offer.setSlotStart(LocalDateTime.of(2026, 8, 10, 13, 0));
        offer.setSlotEnd(LocalDateTime.of(2026, 8, 10, 14, 0));
        offer.setExpiresAt(Instant.parse("2026-08-09T18:00:00Z"));

        LocationPublicPresentationService.PublicPresentation presentation = new LocationPublicPresentationService.PublicPresentation(
                12L,
                1L,
                "Calendra London",
                "1 High Street, London",
                null,
                "+44 20 1234 5678",
                "london@example.test",
                "/api/public/widget/location-assets?key=london-logo",
                "london-logo",
                true,
                true,
                true,
                true,
                true,
                null
        );

        Map<String, String> tokens = service.tokens(request, offer, List.of(), presentation);

        assertThat(tokens.get("{{companyName}}")).isEqualTo("Calendra London");
        assertThat(tokens.get("{{locationName}}")).isEqualTo("Calendra London");
        assertThat(tokens.get("{{locationAddress}}")).isEqualTo("1 High Street, London");
        assertThat(tokens.get("{{locationPhone}}")).isEqualTo("+44 20 1234 5678");
        assertThat(tokens.get("{{locationEmail}}")).isEqualTo("london@example.test");
        assertThat(tokens.get("{{offerExpiresAt}}")).contains("19:00");
        assertThat(tokens.get("{{acceptUrl}}")).isEqualTo("https://app.calendra.test/public-waitlist/offer/31?action=accept");
        assertThat(tokens.get("{{manageWaitlistUrl}}")).isEqualTo("https://app.calendra.test/appointments?requestId=21&locationId=12");
    }
}
