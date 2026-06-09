package com.example.app.billing;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.app.company.ClientCompanyRepository;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.SessionBookingStatus;
import com.example.app.settings.AppSettingRepository;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class OpenBillSyncServiceEligibilityTest {
    @Mock private SessionBookingRepository sessionBookings;
    @Mock private OpenBillRepository openBillRepo;
    @Mock private BillRepository billRepo;
    @Mock private PaymentMethodRepository paymentMethodRepo;
    @Mock private AdvanceAllocationRepository advanceAllocationRepo;
    @Mock private com.example.app.user.UserRepository users;
    @Mock private ClientCompanyRepository clientCompanies;
    @Mock private AppSettingRepository settings;
    @Mock private TransactionServiceRepository txRepo;

    private OpenBillSyncService service;

    @BeforeEach
    void setUp() {
        service = new OpenBillSyncService(
                sessionBookings,
                users,
                openBillRepo,
                billRepo,
                paymentMethodRepo,
                advanceAllocationRepo,
                clientCompanies,
                settings,
                txRepo,
                new com.example.app.common.TimeService(new com.example.app.common.SimulatedTimeService(null, null, null, new com.fasterxml.jackson.databind.ObjectMapper()))
        );
    }

    @Test
    void syncCompany_skipsCancelledSessions() {
        SessionBooking cancelled = new SessionBooking();
        cancelled.setId(5L);
        cancelled.setBookingStatus(SessionBookingStatus.CANCELLED);

        when(sessionBookings.findPastSessionsWithTypeAndCompanyId(any(LocalDateTime.class), eq(1L)))
                .thenReturn(List.of(cancelled));

        service.syncCompany(1L);

        verify(openBillRepo, never()).save(any(OpenBill.class));
        verify(openBillRepo, never()).saveAndFlush(any(OpenBill.class));
        verify(openBillRepo, never()).findBySessionBookingIdAndCompanyId(any(), any());
    }
}
