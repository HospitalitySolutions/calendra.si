package com.example.app.analytics;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.app.billing.BillRepository;
import com.example.app.client.ClientRepository;
import com.example.app.common.TimeService;
import com.example.app.location.Location;
import com.example.app.location.LocationRepository;
import com.example.app.session.ServiceGroupRepository;
import com.example.app.session.SessionBookingRepository;
import com.example.app.settings.TenantFeatureAccessService;
import com.example.app.waitlist.WaitlistOfferRepository;
import com.example.app.waitlist.WaitlistRequestRepository;
import com.example.app.waitlist.WaitlistRequestServiceRepository;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class AnalyticsLocationScopeTest {

    @Test
    void overviewScopesOperationalSourcesToSelectedLocation() {
        SessionBookingRepository bookings = mock(SessionBookingRepository.class);
        ClientRepository clients = mock(ClientRepository.class);
        BillRepository bills = mock(BillRepository.class);
        ServiceGroupRepository groups = mock(ServiceGroupRepository.class);
        WaitlistRequestRepository waitlistRequests = mock(WaitlistRequestRepository.class);
        WaitlistRequestServiceRepository waitlistServices = mock(WaitlistRequestServiceRepository.class);
        WaitlistOfferRepository waitlistOffers = mock(WaitlistOfferRepository.class);
        TimeService time = mock(TimeService.class);
        TenantFeatureAccessService features = mock(TenantFeatureAccessService.class);
        LocationRepository locations = mock(LocationRepository.class);

        Location location = new Location();
        location.setId(22L);
        location.setName("Koper");
        location.setTimezone("Europe/Ljubljana");
        location.setActive(true);

        when(locations.findByIdAndCompanyId(22L, 1L)).thenReturn(Optional.of(location));
        when(locations.findAllByCompanyIdAndActiveTrueOrderByDefaultLocationDescNameAscIdAsc(1L)).thenReturn(List.of(location));
        when(features.areServiceGroupsEnabled(1L)).thenReturn(false);
        when(features.isWaitlistEnabled(1L)).thenReturn(false);
        when(bookings.findAnalyticsByCompanyIdAndRange(eq(1L), any(), any(), eq(null), eq(22L), eq(null), eq(null), eq(null)))
                .thenReturn(List.of());
        when(bills.findAnalyticsByCompanyIdAndIssueDateRange(1L, LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 31), null, 22L))
                .thenReturn(List.of());

        AnalyticsService service = new AnalyticsService(
                bookings,
                clients,
                bills,
                groups,
                waitlistRequests,
                waitlistServices,
                waitlistOffers,
                time,
                features,
                locations
        );

        AnalyticsService.AnalyticsOverviewResponse response = service.overviewForCompany(
                1L,
                "custom",
                LocalDate.of(2026, 8, 1),
                LocalDate.of(2026, 8, 31),
                null,
                22L,
                null,
                null,
                null
        );

        assertThat(response.locationId()).isEqualTo(22L);
        assertThat(response.locationName()).isEqualTo("Koper");
        assertThat(response.locations()).hasSize(1);
        assertThat(response.locations().getFirst().locationId()).isEqualTo(22L);
        verify(bookings).findAnalyticsByCompanyIdAndRange(eq(1L), any(), any(), eq(null), eq(22L), eq(null), eq(null), eq(null));
        verify(bills).findAnalyticsByCompanyIdAndIssueDateRange(1L, LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 31), null, 22L);
    }
}
