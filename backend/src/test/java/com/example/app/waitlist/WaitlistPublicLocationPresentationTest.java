package com.example.app.waitlist;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.app.client.ClientRepository;
import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.location.Location;
import com.example.app.location.LocationPublicPresentationService;
import com.example.app.location.LocationRepository;
import com.example.app.notification.TenantNotificationService;
import com.example.app.session.BookableSlotRepository;
import com.example.app.session.ServiceGroupRepository;
import com.example.app.session.SessionBookingCreationService;
import com.example.app.session.SessionBookingRealtimeService;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.SessionTypeRepository;
import com.example.app.session.SpaceRepository;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.TenantFeatureAccessService;
import com.example.app.settings.TenantReservationRulesService;
import com.example.app.user.UserRepository;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class WaitlistPublicLocationPresentationTest {

    @Test
    void publicOfferUsesRequestLocationPresentationAndKeepsLocationInOtherSlotsUrl() {
        WaitlistOfferRepository offers = mock(WaitlistOfferRepository.class);
        TenantFeatureAccessService featureAccess = mock(TenantFeatureAccessService.class);
        LocationPublicPresentationService locationPresentation = mock(LocationPublicPresentationService.class);

        WaitlistService service = new WaitlistService(
                mock(WaitlistRequestRepository.class),
                mock(WaitlistRequestWindowRepository.class),
                mock(WaitlistRequestEmployeeRepository.class),
                mock(WaitlistRequestServiceRepository.class),
                offers,
                mock(WaitlistBookingHoldRepository.class),
                mock(WaitlistEventRepository.class),
                mock(WaitlistSlotSkipRepository.class),
                mock(ClientRepository.class),
                mock(UserRepository.class),
                mock(SessionTypeRepository.class),
                mock(ServiceGroupRepository.class),
                mock(SpaceRepository.class),
                mock(SessionBookingRepository.class),
                mock(CompanyRepository.class),
                mock(AppSettingRepository.class),
                mock(LocationRepository.class),
                locationPresentation,
                mock(BookableSlotRepository.class),
                mock(SessionBookingCreationService.class),
                mock(TenantReservationRulesService.class),
                mock(WaitlistSettingsService.class),
                featureAccess,
                mock(TenantNotificationService.class),
                mock(SessionBookingRealtimeService.class),
                mock(WaitlistGuestNotificationService.class),
                5,
                100
        );

        Company company = new Company();
        company.setId(1L);
        company.setName("Calendra d.o.o.");
        company.setTenantCode("calendra");

        Location location = new Location();
        location.setId(12L);
        location.setCompany(company);
        location.setName("Koper");
        location.setPublicName("Calendra Koper");
        location.setTimezone("Europe/Ljubljana");
        location.setActive(true);

        WaitlistRequest request = new WaitlistRequest();
        request.setId(21L);
        request.setCompany(company);
        request.setLocation(location);
        request.setStatus(WaitlistRequestStatus.ACTIVE);

        WaitlistOffer offer = new WaitlistOffer();
        offer.setId(31L);
        offer.setCompany(company);
        offer.setRequest(request);
        offer.setLocation(location);
        offer.setServiceNameSnapshot("Masaža");
        offer.setSlotStart(LocalDateTime.of(2026, 8, 10, 14, 0));
        offer.setSlotEnd(LocalDateTime.of(2026, 8, 10, 15, 0));
        offer.setStatus(WaitlistOfferStatus.DECLINED);
        offer.setExpiresAt(Instant.now().plusSeconds(3600));

        when(offers.findById(31L)).thenReturn(Optional.of(offer));
        when(locationPresentation.resolve(location)).thenReturn(new LocationPublicPresentationService.PublicPresentation(
                12L,
                1L,
                "Calendra Koper",
                "Pristaniška ulica 1, 6000 Koper",
                "Obalna poslovalnica",
                "+386 5 555 0101",
                "koper@example.test",
                "/api/public/widget/location-assets?key=koper-logo",
                "koper-logo",
                true,
                true,
                true,
                true,
                true,
                "place-koper"
        ));

        WaitlistService.PublicOfferView response = service.publicOffer(31L);

        assertThat(response.locationId()).isEqualTo(12L);
        assertThat(response.tenantName()).isEqualTo("Calendra Koper");
        assertThat(response.tenantLogoUrl()).contains("koper-logo");
        assertThat(response.locationName()).isEqualTo("Calendra Koper");
        assertThat(response.locationAddress()).isEqualTo("Pristaniška ulica 1, 6000 Koper");
        assertThat(response.locationPhone()).isEqualTo("+386 5 555 0101");
        assertThat(response.locationEmail()).isEqualTo("koper@example.test");
        assertThat(response.timezone()).isEqualTo("Europe/Ljubljana");
        assertThat(response.slotStart()).endsWith("+02:00");
        assertThat(response.otherSlotsUrl()).isEqualTo("/widget/calendra?locationId=12");
        verify(featureAccess).assertWaitlistEnabled(1L);
        verify(locationPresentation).resolve(location);
    }
}
