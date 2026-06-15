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
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionTemplate;

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
    @Mock private OpenBillSyncQueueRepository syncQueue;
    @Mock private TransactionTemplate transactionTemplate;
    @Mock private EntityManager entityManager;

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
                new com.example.app.common.TimeService(new com.example.app.common.SimulatedTimeService(null, null, null, new com.fasterxml.jackson.databind.ObjectMapper())),
                syncQueue,
                new SimpleMeterRegistry(),
                transactionTemplate,
                200,
                200,
                100
        );
        ReflectionTestUtils.setField(service, "entityManager", entityManager);
    }

    @Test
    void syncSession_skipsCreatingOpenBillForCancelledSessions() {
        SessionBooking cancelled = new SessionBooking();
        cancelled.setId(5L);
        cancelled.setBookingStatus(SessionBookingStatus.CANCELLED);

        when(sessionBookings.findForOpenBillSyncByIdAndCompanyId(5L, 1L))
                .thenReturn(Optional.of(cancelled));
        when(openBillRepo.findAllContainingSessionIds(eq(1L), any()))
                .thenReturn(List.of());
        when(openBillRepo.findBatchMergeCandidateIds(eq(1L), any(Pageable.class)))
                .thenReturn(List.of());

        service.syncSession(1L, 5L);

        verify(openBillRepo, never()).save(any(OpenBill.class));
        verify(openBillRepo, never()).saveAndFlush(any(OpenBill.class));
        verify(openBillRepo, never()).findBySessionBookingIdAndCompanyId(any(), any());
    }
}
