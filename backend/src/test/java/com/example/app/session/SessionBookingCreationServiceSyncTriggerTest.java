package com.example.app.session;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.app.billing.OpenBillSyncService;
import com.example.app.client.Client;
import com.example.app.client.ClientRepository;
import com.example.app.company.ClientCompanyRepository;
import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.google.GoogleMeetService;
import com.example.app.group.ClientGroupRepository;
import com.example.app.reminder.ReminderService;
import com.example.app.settings.AppSettingRepository;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import com.example.app.zoom.ZoomService;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class SessionBookingCreationServiceSyncTriggerTest {
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

    private SessionBookingCreationService service;
    private Company company;
    private Client client;
    private User admin;

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

        company = new Company();
        company.setId(1L);

        client = new Client();
        client.setId(10L);
        client.setCompany(company);
        client.setFirstName("Ana");
        client.setLastName("Novak");

        admin = new User();
        admin.setId(20L);
        admin.setCompany(company);
        admin.setRole(Role.ADMIN);
        admin.setActive(true);
        admin.setConsultant(true);
    }

    @Test
    void createChannelBooking_triggersImmediateOpenBillSync() {
        LocalDateTime start = LocalDateTime.now().minusHours(2);
        LocalDateTime end = LocalDateTime.now().minusHours(1);
        var request = new SessionBookingCreationService.ChannelBookingRequest(
                1L,
                10L,
                null,
                start,
                end,
                null,
                null,
                "note",
                null,
                false,
                null,
                false,
                "STAFF",
                null,
                null,
                null,
                false
        );

        when(clients.findByIdAndCompanyId(10L, 1L)).thenReturn(Optional.of(client));
        when(companies.findByIdForUpdate(1L)).thenReturn(Optional.of(company));
        when(users.findFirstByCompanyIdAndActiveTrueAndRoleOrderByIdAsc(1L, Role.ADMIN)).thenReturn(Optional.of(admin));
        when(repo.save(any(SessionBooking.class))).thenAnswer(inv -> {
            SessionBooking row = inv.getArgument(0);
            row.setId(111L);
            return row;
        });

        SessionBooking saved = service.createChannelBooking(request);

        assertEquals(111L, saved.getId());
        verify(openBillSyncService).enqueueBookingsSync(org.mockito.ArgumentMatchers.eq(1L), org.mockito.ArgumentMatchers.any());
    }

    @Test
    void update_whenMovedToPast_triggersImmediateOpenBillSync() {
        SessionBooking existing = new SessionBooking();
        existing.setId(50L);
        existing.setCompany(company);
        existing.setClient(client);
        existing.setBookingGroupKey("g-1");
        existing.setStartTime(LocalDateTime.now().plusDays(1));
        existing.setEndTime(LocalDateTime.now().plusDays(1).plusHours(1));
        existing.setBookingStatus(SessionBookingStatus.RESERVED);
        existing.setConsultant(admin);

        var request = new SessionBookingController.BookingRequest(
                10L,
                null,
                20L,
                LocalDateTime.now().minusHours(3).toString(),
                LocalDateTime.now().minusHours(2).toString(),
                null,
                null,
                "moved",
                null,
                false,
                null,
                false,
                null,
                null,
                null,
                SessionBookingStatus.CHECKED_OUT,
                null,
                null
        );

        when(repo.findByIdAndCompanyId(50L, 1L)).thenReturn(Optional.of(existing));
        when(repo.findByBookingGroupKeyAndCompanyIdOrderByIdAsc("g-1", 1L)).thenReturn(List.of(existing));
        when(companies.findByIdForUpdate(1L)).thenReturn(Optional.of(company));
        when(clients.findByIdAndCompanyId(10L, 1L)).thenReturn(Optional.of(client));
        when(users.findByIdAndCompanyId(20L, 1L)).thenReturn(Optional.of(admin));
        when(repo.save(any(SessionBooking.class))).thenAnswer(inv -> inv.getArgument(0));

        var response = service.update(50L, request, admin);

        assertEquals(50L, response.id());
        verify(openBillSyncService).enqueueBookingsSync(org.mockito.ArgumentMatchers.eq(1L), org.mockito.ArgumentMatchers.any());
    }

    @Test
    void update_whenTransitionedToCancelledAndUnbilled_removesOpenBillRows() {
        SessionBooking existing = new SessionBooking();
        existing.setId(50L);
        existing.setCompany(company);
        existing.setClient(client);
        existing.setBookingGroupKey("g-1");
        existing.setStartTime(LocalDateTime.now().plusDays(1));
        existing.setEndTime(LocalDateTime.now().plusDays(1).plusHours(1));
        existing.setBookingStatus(SessionBookingStatus.RESERVED);
        existing.setConsultant(admin);
        existing.setBilledAt(null);

        var request = new SessionBookingController.BookingRequest(
                10L,
                null,
                20L,
                LocalDateTime.now().plusDays(1).toString(),
                LocalDateTime.now().plusDays(1).plusHours(1).toString(),
                null,
                null,
                "cancelled",
                null,
                false,
                null,
                false,
                null,
                null,
                null,
                SessionBookingStatus.CANCELLED,
                null,
                null
        );

        when(repo.findByIdAndCompanyId(50L, 1L)).thenReturn(Optional.of(existing));
        when(repo.findByBookingGroupKeyAndCompanyIdOrderByIdAsc("g-1", 1L)).thenReturn(List.of(existing));
        when(companies.findByIdForUpdate(1L)).thenReturn(Optional.of(company));
        when(clients.findByIdAndCompanyId(10L, 1L)).thenReturn(Optional.of(client));
        when(users.findByIdAndCompanyId(20L, 1L)).thenReturn(Optional.of(admin));
        when(repo.save(any(SessionBooking.class))).thenAnswer(inv -> inv.getArgument(0));

        service.update(50L, request, admin);

        verify(openBillSyncService).removeSessionRowsFromOpenBills(1L, List.of(50L));
    }

    @Test
    void update_whenTransitionedToCancelledButAlreadyBilled_doesNotRemoveOpenBillRows() {
        SessionBooking existing = new SessionBooking();
        existing.setId(50L);
        existing.setCompany(company);
        existing.setClient(client);
        existing.setBookingGroupKey("g-1");
        existing.setStartTime(LocalDateTime.now().plusDays(1));
        existing.setEndTime(LocalDateTime.now().plusDays(1).plusHours(1));
        existing.setBookingStatus(SessionBookingStatus.RESERVED);
        existing.setConsultant(admin);
        existing.setBilledAt(LocalDate.now());

        var request = new SessionBookingController.BookingRequest(
                10L,
                null,
                20L,
                LocalDateTime.now().plusDays(1).toString(),
                LocalDateTime.now().plusDays(1).plusHours(1).toString(),
                null,
                null,
                "cancelled billed",
                null,
                false,
                null,
                false,
                null,
                null,
                null,
                SessionBookingStatus.CANCELLED,
                null,
                null
        );

        when(repo.findByIdAndCompanyId(50L, 1L)).thenReturn(Optional.of(existing));
        when(repo.findByBookingGroupKeyAndCompanyIdOrderByIdAsc("g-1", 1L)).thenReturn(List.of(existing));
        when(companies.findByIdForUpdate(1L)).thenReturn(Optional.of(company));
        when(clients.findByIdAndCompanyId(10L, 1L)).thenReturn(Optional.of(client));
        when(users.findByIdAndCompanyId(20L, 1L)).thenReturn(Optional.of(admin));
        when(repo.save(any(SessionBooking.class))).thenAnswer(inv -> inv.getArgument(0));

        service.update(50L, request, admin);

        verify(openBillSyncService, never()).removeSessionRowsFromOpenBills(1L, List.of(50L));
    }
}
