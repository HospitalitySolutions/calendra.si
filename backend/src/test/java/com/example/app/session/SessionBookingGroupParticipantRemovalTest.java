package com.example.app.session;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.app.activitylog.ActivityAction;
import com.example.app.activitylog.ActivityLogService;
import com.example.app.activitylog.ActivityModule;
import com.example.app.billing.OpenBillSyncService;
import com.example.app.client.Client;
import com.example.app.client.ClientRepository;
import com.example.app.company.ClientCompanyRepository;
import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.google.GoogleMeetService;
import com.example.app.group.ClientGroup;
import com.example.app.group.ClientGroupRepository;
import com.example.app.reminder.ReminderService;
import com.example.app.settings.AppSettingRepository;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import com.example.app.zoom.ZoomService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class SessionBookingGroupParticipantRemovalTest {
    @Mock private SessionBookingRepository repo;
    @Mock private PersonalCalendarBlockRepository personalBlocks;
    @Mock private ClientRepository clients;
    @Mock private UserRepository users;
    @Mock private SpaceRepository spaces;
    @Mock private SessionTypeRepository types;
    @Mock private CompanyRepository companies;
    @Mock private AppSettingRepository settings;
    @Mock private ClientGroupRepository groupRepository;
    @Mock private ClientCompanyRepository clientCompanies;
    @Mock private ReminderService reminderService;
    @Mock private ZoomService zoomService;
    @Mock private GoogleMeetService googleMeetService;
    @Mock private BookingChangePublisher bookingChangePublisher;
    @Mock private OpenBillSyncService openBillSyncService;
    @Mock private ActivityLogService activityLogs;

    private SessionBookingCreationService service;
    private Company company;
    private User admin;
    private ClientGroup group;

    @BeforeEach
    void setUp() {
        service = new SessionBookingCreationService(
                repo,
                personalBlocks,
                clients,
                users,
                spaces,
                types,
                companies,
                settings,
                groupRepository,
                clientCompanies,
                reminderService,
                zoomService,
                googleMeetService,
                bookingChangePublisher,
                openBillSyncService
        );
        ReflectionTestUtils.setField(service, "activityLogs", activityLogs);

        company = new Company();
        company.setId(1L);

        admin = new User();
        admin.setId(20L);
        admin.setCompany(company);
        admin.setRole(Role.ADMIN);
        admin.setActive(true);
        admin.setConsultant(true);

        group = new ClientGroup();
        group.setId(5L);
        group.setCompany(company);
    }

    @Test
    void removeLastParticipant_usesPublicCancellationCoreAndKeepsEmptyOccurrence() {
        Client client = client(68L, "Andrej", "Novak");
        SessionBooking row = booking(299L, client);
        List<SessionBooking> persisted = new java.util.ArrayList<>();
        persisted.add(row);

        when(companies.findByIdForUpdate(1L)).thenReturn(Optional.of(company));
        when(repo.findByIdAndCompanyId(299L, 1L)).thenReturn(Optional.of(row));
        when(repo.findByBookingGroupKeyAndCompanyIdOrderByIdAsc("group-1", 1L))
                .thenAnswer(invocation -> List.copyOf(persisted));
        when(repo.save(any(SessionBooking.class))).thenAnswer(invocation -> {
            SessionBooking saved = invocation.getArgument(0);
            if (saved.getId() == null) {
                saved.setId(300L);
                persisted.add(saved);
            }
            return saved;
        });

        SessionBookingController.BookingResponse response = service.removeGroupSessionParticipant(299L, 68L, admin);

        assertEquals(300L, response.id());
        assertEquals(0, response.clients().size());
        assertEquals(client, row.getClient());
        assertEquals(SessionBookingStatus.CANCELLED, row.getBookingStatus());

        SessionBooking placeholder = persisted.stream()
                .filter(candidate -> Long.valueOf(300L).equals(candidate.getId()))
                .findFirst()
                .orElseThrow();
        assertNull(placeholder.getClient());
        assertEquals(SessionBookingStatus.RESERVED, placeholder.getBookingStatus());
        assertEquals(BookingSource.MANUAL, placeholder.getBookingSource());
        assertEquals("group-1", placeholder.getBookingGroupKey());

        verify(repo, times(1)).save(row);
        verify(repo, times(2)).save(any(SessionBooking.class));
        // Staff removal now consumes the placeholder returned by the same core used
        // by public cancellation instead of doing a third post-cancellation reload.
        verify(repo, times(2)).findByBookingGroupKeyAndCompanyIdOrderByIdAsc("group-1", 1L);
        verify(openBillSyncService).removeSessionRowsFromOpenBills(eq(1L), eq(List.of(299L)));
        verify(openBillSyncService).syncSessionGroup(1L, "group-1");
        verify(bookingChangePublisher).publish(
                eq(1L), eq(300L), any(LocalDateTime.class), any(LocalDateTime.class),
                eq(BookingChangePublisher.BOOKING_CREATED), eq("STAFF"), isNull());
        verify(bookingChangePublisher).publish(
                eq(1L), eq(299L), any(LocalDateTime.class), any(LocalDateTime.class),
                eq(BookingChangePublisher.BOOKING_CANCELLED), eq("STAFF"), isNull());
        verify(activityLogs, times(1)).recordUser(
                eq(admin), eq(ActivityModule.CALENDAR), eq(ActivityAction.SESSION_PARTICIPANT_REMOVED),
                eq("SESSION"), eq(299L), anyString(), eq("CLIENT"), eq(68L), eq("Andrej Novak"),
                anyString(), isNull(), isNull(), anyMap());
    }

    @Test
    void removeOneOfSeveralParticipants_usesSameCoreWithoutCreatingPlaceholder() {
        Client removedClient = client(68L, "Andrej", "Novak");
        Client remainingClient = client(69L, "Ana", "Kovac");
        SessionBooking removed = booking(299L, removedClient);
        SessionBooking remaining = booking(300L, remainingClient);
        List<SessionBooking> persisted = new java.util.ArrayList<>(List.of(removed, remaining));

        when(companies.findByIdForUpdate(1L)).thenReturn(Optional.of(company));
        when(repo.findByIdAndCompanyId(299L, 1L)).thenReturn(Optional.of(removed));
        when(repo.findByBookingGroupKeyAndCompanyIdOrderByIdAsc("group-1", 1L))
                .thenAnswer(invocation -> List.copyOf(persisted));
        when(repo.save(any(SessionBooking.class))).thenAnswer(invocation -> invocation.getArgument(0));

        SessionBookingController.BookingResponse response = service.removeGroupSessionParticipant(299L, 68L, admin);

        assertEquals(SessionBookingStatus.CANCELLED, removed.getBookingStatus());
        assertEquals(removedClient, removed.getClient());
        assertEquals(1, response.clients().size());
        assertEquals(69L, response.clients().getFirst().id());
        verify(repo, times(1)).save(removed);
        verify(repo, times(1)).save(any(SessionBooking.class));
        // No new placeholder is created while another participant remains, so the
        // normal grouped-row reload is still used for the returned UI state.
        verify(repo, times(3)).findByBookingGroupKeyAndCompanyIdOrderByIdAsc("group-1", 1L);
        verify(openBillSyncService).removeSessionRowsFromOpenBills(eq(1L), eq(List.of(299L)));
        verify(activityLogs, times(1)).recordUser(
                eq(admin), eq(ActivityModule.CALENDAR), eq(ActivityAction.SESSION_PARTICIPANT_REMOVED),
                eq("SESSION"), eq(299L), anyString(), eq("CLIENT"), eq(68L), eq("Andrej Novak"),
                anyString(), isNull(), isNull(), anyMap());
    }

    private Client client(Long id, String firstName, String lastName) {
        Client client = new Client();
        client.setId(id);
        client.setCompany(company);
        client.setFirstName(firstName);
        client.setLastName(lastName);
        return client;
    }

    private SessionBooking booking(Long id, Client client) {
        LocalDateTime start = LocalDateTime.of(2026, 8, 10, 9, 0);
        SessionBooking booking = new SessionBooking();
        booking.setId(id);
        booking.setCompany(company);
        booking.setClient(client);
        booking.setBookingGroupKey("group-1");
        booking.setConsultant(admin);
        booking.setClientGroup(group);
        booking.setStartTime(start);
        booking.setEndTime(start.plusHours(1));
        booking.setAvailabilityEndTime(start.plusHours(1));
        booking.setBookingStatus(SessionBookingStatus.RESERVED);
        booking.setBookingSource(BookingSource.WEBSITE_WIDGET);
        booking.setSourceChannel("WEBSITE_WIDGET");
        booking.setSourceOrderId("order-" + id);
        booking.setGuestUserId("guest-" + id);
        return booking;
    }
}
