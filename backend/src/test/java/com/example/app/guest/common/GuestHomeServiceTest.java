package com.example.app.guest.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.example.app.client.Client;
import com.example.app.company.Company;
import com.example.app.guest.model.GuestEntitlementRepository;
import com.example.app.guest.model.GuestOrderRepository;
import com.example.app.guest.model.GuestTenantLink;
import com.example.app.guest.model.GuestUser;
import com.example.app.guest.tenant.GuestTenantService;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.SessionType;
import com.example.app.user.User;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class GuestHomeServiceTest {

    @Test
    void formatConsultantDisplayName_joinsTrimmedParts() {
        User u = new User();
        u.setFirstName("  Ana  ");
        u.setLastName("Kovač ");
        assertThat(GuestMapper.formatConsultantDisplayName(u)).isEqualTo("Ana Kovač");
    }

    @Test
    void formatConsultantDisplayName_returnsNullWhenBlank() {
        User u = new User();
        u.setFirstName(" ");
        u.setLastName(null);
        assertThat(GuestMapper.formatConsultantDisplayName(u)).isNull();
        assertThat(GuestMapper.formatConsultantDisplayName(null)).isNull();
    }

    @Test
    void homeMapsEndsAtAndConsultantName() {
        GuestUser guest = new GuestUser();
        guest.setId(1L);
        Company company = new Company();
        company.setId(10L);
        company.setName("Studio");
        Client client = new Client();
        client.setId(100L);
        GuestTenantLink link = new GuestTenantLink();
        link.setGuestUser(guest);
        link.setCompany(company);
        link.setClient(client);

        GuestTenantService tenantService = mock(GuestTenantService.class);
        when(tenantService.requireLink(guest, 10L)).thenReturn(link);

        GuestSettingsService settingsService = mock(GuestSettingsService.class);
        when(settingsService.publicSettings(10L))
                .thenReturn(
                        new GuestSettingsService.GuestPublicSettings(
                                true,
                                true,
                                "Studio",
                                "Desc",
                                "Ljubljana",
                                "+386",
                                "Street 1",
                                null,
                                "sl",
                                false,
                                false,
                                true,
                                true,
                                "salon",
                                null,
                                null,
                                null));
        when(settingsService.bookingRules(10L))
                .thenReturn(
                        new GuestSettingsService.GuestBookingRules(
                                24, 24, false, false, false, false, List.of(), List.of(), List.of(), false, "none", 20));
        when(settingsService.acceptedPaymentMethods(10L)).thenReturn(List.of());

        User consultant = new User();
        consultant.setFirstName("Jane");
        consultant.setLastName("Doe");
        consultant.setPhone("+123");

        SessionType type = new SessionType();
        type.setId(77L);
        type.setName("Yoga");
        type.setCompany(company);

        LocalDateTime start = LocalDateTime.now().plusDays(2);
        LocalDateTime end = start.plusHours(1);
        SessionBooking booking = new SessionBooking();
        booking.setId(55L);
        booking.setStartTime(start);
        booking.setEndTime(end);
        booking.setType(type);
        booking.setConsultant(consultant);
        booking.setBookingStatus("CONFIRMED");

        SessionBookingRepository bookings = mock(SessionBookingRepository.class);
        when(bookings.findUpcomingByClientIdAndCompanyId(
                org.mockito.ArgumentMatchers.eq(100L),
                org.mockito.ArgumentMatchers.eq(10L),
                org.mockito.ArgumentMatchers.any(LocalDateTime.class),
                org.mockito.ArgumentMatchers.any(org.springframework.data.domain.Pageable.class)
        )).thenReturn(List.of(booking));

        GuestHomeService service =
                new GuestHomeService(
                        tenantService,
                        mock(GuestEntitlementRepository.class),
                        mock(GuestOrderRepository.class),
                        bookings,
                        settingsService);

        GuestDtos.HomeResponse home = service.home(guest, 10L);

        assertThat(home.upcomingBookings()).hasSize(1);
        GuestDtos.UpcomingBookingResponse u = home.upcomingBookings().get(0);
        assertThat(u.bookingId()).isEqualTo("55");
        assertThat(u.endsAt()).isEqualTo(end.toString());
        assertThat(u.consultantName()).isEqualTo("Jane Doe");
        assertThat(u.sessionTypeId()).isEqualTo("77");
        assertThat(u.employeePhone()).isEqualTo("+123");
    }
}
