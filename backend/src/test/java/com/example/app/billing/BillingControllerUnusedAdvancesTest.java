package com.example.app.billing;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.app.client.ClientRepository;
import com.example.app.company.ClientCompanyRepository;
import com.example.app.company.Company;
import com.example.app.fiscal.FiscalizationService;
import com.example.app.guest.model.GuestOrderRepository;
import com.example.app.session.SessionBookingRepository;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.BillingModuleAccessService;
import com.example.app.settings.GlobalPaymentProviderService;
import com.example.app.stripe.StripeBillingService;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

@ExtendWith(MockitoExtension.class)
class BillingControllerUnusedAdvancesTest {

    @Mock private TransactionServiceRepository txRepo;
    @Mock private PaymentMethodRepository paymentMethodRepo;
    @Mock private BillRepository billRepo;
    @Mock private AdvanceAllocationRepository advanceAllocationRepo;
    @Mock private OpenBillRepository openBillRepo;
    @Mock private SessionBookingRepository sessionBookings;
    @Mock private ClientRepository clients;
    @Mock private ClientCompanyRepository clientCompanies;
    @Mock private UserRepository users;
    @Mock private AppSettingRepository settings;
    @Mock private FiscalizationService fiscalizationService;
    @Mock private StripeBillingService stripeBillingService;
    @Mock private BillingEmailService billingEmailService;
    @Mock private BillFolioPdfService billFolioPdfService;
    @Mock private InvoicePdfS3Service invoicePdfS3Service;
    @Mock private FolioPdfService folioPdfService;
    @Mock private BankStatementReconciliationService bankStatementReconciliationService;
    @Mock private ApplicationEventPublisher events;
    @Mock private GuestOrderRepository guestOrders;
    @Mock private InvoiceOrderIdService invoiceOrderIdService;
    @Mock private EntityManager entityManager;
    @Mock private GlobalPaymentProviderService globalPaymentProviders;
    @Mock private BillingModuleAccessService billingModuleAccess;

    private BillingController controller;
    private User me;

    @BeforeEach
    void setUp() {
        controller = new BillingController(
                txRepo,
                paymentMethodRepo,
                billRepo,
                advanceAllocationRepo,
                openBillRepo,
                sessionBookings,
                clients,
                clientCompanies,
                users,
                settings,
                fiscalizationService,
                stripeBillingService,
                billingEmailService,
                billFolioPdfService,
                invoicePdfS3Service,
                folioPdfService,
                bankStatementReconciliationService,
                events,
                guestOrders,
                invoiceOrderIdService,
                entityManager,
                globalPaymentProviders,
                billingModuleAccess,
                new com.example.app.common.TimeService(
                        new com.example.app.common.SimulatedTimeService(
                                null,
                                null,
                                null,
                                new com.fasterxml.jackson.databind.ObjectMapper()
                        )
                )
        );

        Company company = new Company();
        company.setId(1L);
        me = new User();
        me.setCompany(company);
    }

    @Test
    void unusedAdvances_returnsOnlyPaidAdvances() {
        Bill paid = advance(10L, BillPaymentStatus.PAID, LocalDate.of(2026, 8, 1));
        Bill unpaid = advance(11L, BillPaymentStatus.PAYMENT_PENDING, LocalDate.of(2026, 8, 2));

        when(billingModuleAccess.isAdvanceEnabled(1L)).thenReturn(true);
        when(billRepo.findPageIdsByCompanyIdAndBillTypeAndPaymentStatus(
                eq(1L),
                eq(BillType.ADVANCE),
                eq(BillPaymentStatus.PAID),
                any(Pageable.class)
        )).thenReturn(List.of(10L, 11L));
        when(billRepo.findAllByCompanyIdAndIdIn(1L, List.of(10L, 11L)))
                .thenReturn(List.of(unpaid, paid));

        List<BillingController.UnusedAdvanceResponse> result = controller.unusedAdvances(me);

        assertEquals(1, result.size());
        assertEquals(10L, result.getFirst().advanceBillId());
        verify(billRepo).findPageIdsByCompanyIdAndBillTypeAndPaymentStatus(
                1L,
                BillType.ADVANCE,
                BillPaymentStatus.PAID,
                PageRequest.of(0, 500)
        );
    }

    private static Bill advance(Long id, String paymentStatus, LocalDate issueDate) {
        Bill bill = new Bill();
        bill.setId(id);
        bill.setBillNumber("ADV-" + id);
        bill.setBillType(BillType.ADVANCE);
        bill.setPaymentStatus(paymentStatus);
        bill.setIssueDate(issueDate);
        bill.setTotalNet(new BigDecimal("100.00"));
        bill.setTotalGross(new BigDecimal("100.00"));
        return bill;
    }
}
