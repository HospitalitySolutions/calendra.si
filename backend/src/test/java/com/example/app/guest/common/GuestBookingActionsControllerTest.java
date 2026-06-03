package com.example.app.guest.common;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.app.billing.BillFolioPdfService;
import com.example.app.billing.BillRepository;
import com.example.app.billing.InvoicePdfS3Service;
import com.example.app.billing.OpenBillSyncService;
import com.example.app.client.Client;
import com.example.app.company.Company;
import com.example.app.guest.auth.GuestAuthContextService;
import com.example.app.guest.catalog.GuestCatalogService;
import com.example.app.guest.model.GuestOrderRepository;
import com.example.app.guest.model.GuestTenantLink;
import com.example.app.guest.model.GuestUser;
import com.example.app.guest.order.GuestEntitlementService;
import com.example.app.guest.tenant.GuestTenantService;
import com.example.app.session.BookingChangePublisher;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingRealtimeService;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.SessionBookingStatus;
import com.example.app.user.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class GuestBookingActionsControllerTest {

    @Mock private GuestAuthContextService authContextService;
    @Mock private SessionBookingRepository bookings;
    @Mock private GuestTenantService tenantService;
    @Mock private GuestCatalogService catalogService;
    @Mock private UserRepository users;
    @Mock private GuestOrderRepository orders;
    @Mock private BillRepository bills;
    @Mock private BillFolioPdfService billFolioPdfService;
    @Mock private InvoicePdfS3Service invoicePdfS3Service;
    @Mock private GuestEntitlementService entitlementService;
    @Mock private SessionBookingRealtimeService bookingRealtimeService;
    @Mock private BookingChangePublisher bookingChangePublisher;
    @Mock private OpenBillSyncService openBillSyncService;
    @Mock private HttpServletRequest request;

    private GuestBookingActionsController controller;

    @BeforeEach
    void setUp() {
        controller = new GuestBookingActionsController(
                authContextService,
                bookings,
                tenantService,
                catalogService,
                users,
                orders,
                bills,
                billFolioPdfService,
                invoicePdfS3Service,
                entitlementService,
                bookingRealtimeService,
                bookingChangePublisher,
                openBillSyncService
        );
    }

    @Test
    void cancel_whenSessionIsUnbilled_removesOpenBillRows() {
        SessionBooking booking = buildBooking();
        booking.setBilledAt(null);

        stubCancelFlow(booking);

        controller.cancel(booking.getId(), null, request);

        verify(openBillSyncService).removeSessionRowsFromOpenBills(booking.getCompany().getId(), List.of(booking.getId()));
    }

    @Test
    void cancel_whenSessionIsAlreadyBilled_doesNotRemoveOpenBillRows() {
        SessionBooking booking = buildBooking();
        booking.setBilledAt(LocalDate.now());

        stubCancelFlow(booking);

        controller.cancel(booking.getId(), null, request);

        verify(openBillSyncService, never()).removeSessionRowsFromOpenBills(eq(booking.getCompany().getId()), any());
    }

    @Test
    void cancelRejectsBookingWhenGuestIsLinkedToDifferentClient() {
        SessionBooking booking = buildBooking();
        GuestUser guestUser = new GuestUser();
        guestUser.setId(99L);

        Client differentLinkedClient = new Client();
        differentLinkedClient.setId(999L);
        differentLinkedClient.setCompany(booking.getCompany());
        GuestTenantLink link = new GuestTenantLink();
        link.setClient(differentLinkedClient);

        when(authContextService.requireGuest(request)).thenReturn(guestUser);
        when(bookings.findById(booking.getId())).thenReturn(Optional.of(booking));
        when(tenantService.requireLink(guestUser, booking.getCompany().getId())).thenReturn(link);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> controller.cancel(booking.getId(), null, request));

        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
        verify(bookings, never()).save(any(SessionBooking.class));
        verify(openBillSyncService, never()).removeSessionRowsFromOpenBills(any(), any());
        verify(bookingChangePublisher, never()).publish(any(), any(), any(), any(), any());
    }

    @Test
    void streamRequiresTenantLinkBeforeSubscribingToCompanyRealtimeEvents() {
        GuestUser guestUser = new GuestUser();
        guestUser.setId(99L);
        when(authContextService.requireGuest(request)).thenReturn(guestUser);
        when(tenantService.requireLink(guestUser, 123L))
                .thenThrow(new ResponseStatusException(HttpStatus.NOT_FOUND, "Tenant link not found."));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> controller.stream(123L, request));

        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
        verify(bookingRealtimeService, never()).subscribe(any());
    }

    private void stubCancelFlow(SessionBooking booking) {
        GuestUser guestUser = new GuestUser();
        guestUser.setId(99L);

        GuestTenantLink link = new GuestTenantLink();
        link.setClient(booking.getClient());

        when(authContextService.requireGuest(request)).thenReturn(guestUser);
        when(bookings.findById(booking.getId())).thenReturn(Optional.of(booking));
        when(tenantService.requireLink(guestUser, booking.getCompany().getId())).thenReturn(link);
        when(catalogService.bookingRules(booking.getCompany().getId())).thenReturn(new GuestSettingsService.GuestBookingRules(
                24,
                24,
                false,
                false,
                false,
                false,
                List.of(),
                List.of(),
                List.of(),
                false,
                "NONE",
                100
        ));
        when(bookings.save(any(SessionBooking.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    private SessionBooking buildBooking() {
        Company company = new Company();
        company.setId(1L);

        Client client = new Client();
        client.setId(10L);
        client.setCompany(company);

        SessionBooking booking = new SessionBooking();
        booking.setId(50L);
        booking.setCompany(company);
        booking.setClient(client);
        booking.setStartTime(LocalDateTime.now().plusDays(2));
        booking.setEndTime(LocalDateTime.now().plusDays(2).plusHours(1));
        booking.setBookingStatus(SessionBookingStatus.RESERVED);
        return booking;
    }
}
