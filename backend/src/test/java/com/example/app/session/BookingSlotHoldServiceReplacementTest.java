package com.example.app.session;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class BookingSlotHoldServiceReplacementTest {
    @Mock private BookingSlotHoldRepository holds;
    @Mock private CompanyRepository companies;
    @Mock private UserRepository users;
    @Mock private SessionBookingRepository bookings;
    @Mock private SessionBookingCreationService bookingCreationService;

    private BookingSlotHoldService service;
    private Company company;
    private User consultant;
    private BookingSlotHold previousHold;

    @BeforeEach
    void setUp() {
        service = new BookingSlotHoldService(holds, companies, users, bookings, bookingCreationService);

        company = new Company();
        company.setId(7L);
        consultant = new User();
        consultant.setId(6L);
        consultant.setCompany(company);
        consultant.setActive(true);

        previousHold = new BookingSlotHold();
        previousHold.setCompany(company);
        previousHold.setHoldToken("old-token");

        when(companies.findByIdForUpdate(7L)).thenReturn(Optional.of(company));
        when(holds.findByHoldToken("old-token")).thenReturn(Optional.of(previousHold));
        when(users.findById(6L)).thenReturn(Optional.of(consultant));
    }

    @Test
    void replacementValidatesBeforeDeletingPreviousHold() {
        LocalDateTime start = LocalDateTime.of(2026, 8, 13, 9, 0);
        LocalDateTime end = start.plusMinutes(90);
        LocalDateTime busyEnd = end.plusMinutes(10);
        SessionServicePlanService.Plan plan = new SessionServicePlanService.Plan(
                List.of(), start, end, busyEnd, true);
        when(bookingCreationService.validateServiceChainWindow(
                eq(7L),
                eq(List.of()),
                eq(6L),
                eq(start),
                anyList(),
                eq(List.of()),
                eq(false),
                eq("old-token")
        )).thenReturn(plan);
        when(holds.saveAndFlush(any(BookingSlotHold.class))).thenAnswer(invocation -> invocation.getArgument(0));

        BookingSlotHoldService.HoldResponse response = service.create(
                7L,
                new BookingSlotHoldService.HoldRequest(
                        "6|2026-08-13T09:00|2026-08-13T10:30",
                        List.of(4L, 1L),
                        "old-token"
                )
        );

        InOrder order = inOrder(bookingCreationService, holds);
        order.verify(bookingCreationService).validateServiceChainWindow(
                eq(7L),
                eq(List.of()),
                eq(6L),
                eq(start),
                anyList(),
                eq(List.of()),
                eq(false),
                eq("old-token")
        );
        order.verify(holds).delete(previousHold);
        order.verify(holds).saveAndFlush(any(BookingSlotHold.class));

        ArgumentCaptor<BookingSlotHold> saved = ArgumentCaptor.forClass(BookingSlotHold.class);
        verify(holds).saveAndFlush(saved.capture());
        assertEquals(start, saved.getValue().getSlotStart());
        assertEquals(end, saved.getValue().getSlotEnd());
        assertEquals(busyEnd, saved.getValue().getBusyEnd());
        assertEquals(response.holdToken(), saved.getValue().getHoldToken());
    }

    @Test
    void failedReplacementKeepsPreviousHold() {
        LocalDateTime start = LocalDateTime.of(2026, 8, 13, 9, 0);
        when(bookingCreationService.validateServiceChainWindow(
                eq(7L),
                eq(List.of()),
                eq(6L),
                eq(start),
                anyList(),
                eq(List.of()),
                eq(false),
                eq("old-token")
        )).thenThrow(new ResponseStatusException(HttpStatus.CONFLICT, "Slot conflict"));

        assertThrows(ResponseStatusException.class, () -> service.create(
                7L,
                new BookingSlotHoldService.HoldRequest(
                        "6|2026-08-13T09:00|2026-08-13T10:30",
                        List.of(4L, 1L),
                        "old-token"
                )
        ));

        verify(holds, never()).delete(previousHold);
        verify(holds, never()).saveAndFlush(any(BookingSlotHold.class));
    }
}
