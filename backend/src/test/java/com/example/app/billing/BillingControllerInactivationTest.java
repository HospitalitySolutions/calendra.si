package com.example.app.billing;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import com.example.app.client.ClientRepository;
import com.example.app.company.ClientCompanyRepository;
import com.example.app.company.Company;
import com.example.app.fiscal.FiscalizationService;
import com.example.app.guest.model.GuestOrderRepository;
import jakarta.persistence.EntityManager;
import com.example.app.session.SessionBookingRepository;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.GlobalPaymentProviderService;
import com.example.app.stripe.StripeBillingService;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.math.BigDecimal;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class BillingControllerInactivationTest {

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

    private BillingController controller;
    private User me;
    private TransactionService existing;

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
                globalPaymentProviders
        );

        Company company = new Company();
        company.setId(1L);

        me = new User();
        me.setCompany(company);

        existing = new TransactionService();
        existing.setId(7L);
        existing.setCompany(company);
        existing.setCode("SVC-1");
        existing.setDescription("Service");
        existing.setTaxRate(TaxRate.VAT_22);
        existing.setNetPrice(new BigDecimal("10.00"));
        existing.setActive(true);
    }

    @Test
    void updateService_blocksInactivationWhenUpcomingBookingsExist() {
        when(txRepo.findByIdAndCompanyId(7L, 1L)).thenReturn(Optional.of(existing));
        when(sessionBookings.existsUpcomingOrOngoingForTransactionService(eq(1L), eq(7L), any())).thenReturn(true);

        TransactionService req = new TransactionService();
        req.setCode("SVC-1");
        req.setDescription("Service");
        req.setTaxRate(TaxRate.VAT_22);
        req.setNetPrice(new BigDecimal("10.00"));
        req.setActive(false);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> controller.updateService(7L, req, me));
        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
    }

    @Test
    void updateService_allowsInactivationWhenNoUpcomingBookingsExist() {
        when(txRepo.findByIdAndCompanyId(7L, 1L)).thenReturn(Optional.of(existing));
        when(sessionBookings.existsUpcomingOrOngoingForTransactionService(eq(1L), eq(7L), any())).thenReturn(false);
        when(txRepo.save(any(TransactionService.class))).thenAnswer(inv -> inv.getArgument(0));

        TransactionService req = new TransactionService();
        req.setCode("SVC-1");
        req.setDescription("Service");
        req.setTaxRate(TaxRate.VAT_22);
        req.setNetPrice(new BigDecimal("10.00"));
        req.setActive(false);

        TransactionService updated = controller.updateService(7L, req, me);

        assertFalse(updated.isActive());
    }
}
