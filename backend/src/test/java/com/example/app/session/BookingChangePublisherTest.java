package com.example.app.session;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.app.client.Client;
import com.example.app.company.Company;
import com.example.app.google.calendar.GoogleCalendarSyncQueueService;
import com.example.app.guest.model.GuestTenantLink;
import com.example.app.guest.model.GuestTenantLinkRepository;
import com.example.app.guest.model.GuestTenantLinkStatus;
import com.example.app.guest.model.GuestUser;
import com.example.app.guest.notifications.GuestPushService;
import com.example.app.guest.notifications.GuestBookingReminderService;
import java.time.LocalDateTime;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class BookingChangePublisherTest {
    @Mock private SessionBookingRealtimeService realtimeService;
    @Mock private GuestTenantLinkRepository guestTenantLinks;
    @Mock private GuestPushService guestPushService;
    @Mock private SessionBookingRepository sessionBookings;
    @Mock private GoogleCalendarSyncQueueService googleCalendarSyncQueueService;
    @Mock private GuestBookingReminderService bookingReminderService;

    private BookingChangePublisher publisher;

    @BeforeEach
    void setUp() {
        publisher = new BookingChangePublisher(
                realtimeService,
                guestTenantLinks,
                guestPushService,
                sessionBookings,
                googleCalendarSyncQueueService,
                bookingReminderService
        );
    }

    @Test
    void publishPushesOnlyToGuestLinkedToChangedBookingClient() {
        Company company = company(1L);
        Client selectedClient = client(10L, company);
        GuestUser linkedGuest = guestUser(100L);
        GuestTenantLink matchingLink = link(company, selectedClient, linkedGuest);
        SessionBooking booking = booking(77L, company, selectedClient);

        when(sessionBookings.findByIdAndCompanyId(77L, 1L)).thenReturn(Optional.of(booking));
        when(guestTenantLinks.findAllByCompanyIdAndClientIdAndStatusOrderByUpdatedAtDesc(1L, 10L, GuestTenantLinkStatus.ACTIVE))
                .thenReturn(java.util.List.of(matchingLink));

        publisher.publish(1L, 77L, LocalDateTime.parse("2026-06-15T10:00:00"), LocalDateTime.parse("2026-06-15T11:00:00"), BookingChangePublisher.BOOKING_CREATED);

        verify(realtimeService).publishBookingUpdated(eq(1L), eq(77L), any(LocalDateTime.class), any(LocalDateTime.class), eq(BookingChangePublisher.BOOKING_CREATED));
        verify(guestTenantLinks).findAllByCompanyIdAndClientIdAndStatusOrderByUpdatedAtDesc(1L, 10L, GuestTenantLinkStatus.ACTIVE);
        verify(guestTenantLinks, never()).findAllByCompanyIdAndStatus(anyLong(), any());
        verify(guestPushService).notifyGuestReminder(
                eq(linkedGuest),
                eq(company),
                eq(selectedClient),
                eq("Booking update"),
                eq("A booking has changed. Open the app to see the latest time."),
                anyMap()
        );
    }

    @Test
    void publishDoesNotPushWhenChangedBookingClientHasNoGuestLink() {
        Company company = company(1L);
        Client selectedClient = client(10L, company);
        SessionBooking booking = booking(77L, company, selectedClient);

        when(sessionBookings.findByIdAndCompanyId(77L, 1L)).thenReturn(Optional.of(booking));
        when(guestTenantLinks.findAllByCompanyIdAndClientIdAndStatusOrderByUpdatedAtDesc(1L, 10L, GuestTenantLinkStatus.ACTIVE))
                .thenReturn(java.util.List.of());

        publisher.publish(1L, 77L, LocalDateTime.parse("2026-06-15T10:00:00"), LocalDateTime.parse("2026-06-15T11:00:00"), BookingChangePublisher.BOOKING_CREATED);

        verify(guestTenantLinks).findAllByCompanyIdAndClientIdAndStatusOrderByUpdatedAtDesc(1L, 10L, GuestTenantLinkStatus.ACTIVE);
        verify(guestPushService, never()).notifyGuestReminder(any(), any(), any(), any(), any(), anyMap());
    }

    private static Company company(Long id) {
        Company company = new Company();
        company.setId(id);
        company.setName("Tenant");
        return company;
    }

    private static Client client(Long id, Company company) {
        Client client = new Client();
        client.setId(id);
        client.setCompany(company);
        client.setFirstName("Ana");
        client.setLastName("Novak");
        return client;
    }

    private static GuestUser guestUser(Long id) {
        GuestUser guestUser = new GuestUser();
        guestUser.setId(id);
        guestUser.setFirstName("Guest");
        guestUser.setLastName("User");
        guestUser.setEmail("guest@example.com");
        return guestUser;
    }

    private static GuestTenantLink link(Company company, Client client, GuestUser guestUser) {
        GuestTenantLink link = new GuestTenantLink();
        link.setCompany(company);
        link.setClient(client);
        link.setGuestUser(guestUser);
        link.setStatus(GuestTenantLinkStatus.ACTIVE);
        return link;
    }

    private static SessionBooking booking(Long id, Company company, Client client) {
        SessionBooking booking = new SessionBooking();
        booking.setId(id);
        booking.setCompany(company);
        booking.setClient(client);
        booking.setStartTime(LocalDateTime.parse("2026-06-15T10:00:00"));
        booking.setEndTime(LocalDateTime.parse("2026-06-15T11:00:00"));
        return booking;
    }
}
