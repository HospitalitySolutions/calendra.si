package com.example.app.billing;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anySet;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.app.client.Client;
import com.example.app.client.ClientRepository;
import com.example.app.company.ClientCompany;
import com.example.app.company.ClientCompanyRepository;
import com.example.app.company.Company;
import com.example.app.fiscal.FiscalizationService;
import com.example.app.guest.model.GuestOrderRepository;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingRepository;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.GlobalPaymentProviderService;
import com.example.app.stripe.StripeBillingService;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import jakarta.persistence.EntityManager;
import java.util.List;
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
class BillingControllerOpenBillPayeeOverrideTest {

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
    private Company ownerCompany;
    private User me;
    private User consultant;
    private Client existingClient;
    private OpenBill openBill;

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

        ownerCompany = new Company();
        ownerCompany.setId(1L);

        me = new User();
        me.setCompany(ownerCompany);

        consultant = new User();
        consultant.setId(9L);
        consultant.setCompany(ownerCompany);
        consultant.setFirstName("System");
        consultant.setLastName("Admin");

        existingClient = new Client();
        existingClient.setId(11L);
        existingClient.setCompany(ownerCompany);
        existingClient.setFirstName("Ana");
        existingClient.setLastName("Novak");

        openBill = new OpenBill();
        openBill.setId(18L);
        openBill.setCompany(ownerCompany);
        openBill.setClient(existingClient);
        openBill.setConsultant(consultant);
        openBill.setBatchScope(OpenBill.BATCH_SCOPE_COMPANY);

        when(openBillRepo.findById(18L)).thenReturn(Optional.of(openBill));
        when(openBillRepo.save(any(OpenBill.class))).thenAnswer(inv -> inv.getArgument(0));
        when(openBillRepo.findAllWithItemsByCompanyId(1L)).thenReturn(List.of(openBill));
    }

    @Test
    void updateOpenBill_companyTarget_allowsUnlinkedRecipientWhenClientProvided() {
        ClientCompany recipientCompany = new ClientCompany();
        recipientCompany.setId(101L);
        recipientCompany.setOwnerCompany(ownerCompany);

        when(clientCompanies.findByIdAndOwnerCompanyId(101L, 1L)).thenReturn(Optional.of(recipientCompany));
        when(clients.findByIdAndCompanyId(11L, 1L)).thenReturn(Optional.of(existingClient));

        BillingController.OpenBillUpdateRequest req = new BillingController.OpenBillUpdateRequest(
                null,
                "",
                "COMPANY",
                11L,
                101L,
                null,
                null,
                null,
                List.of()
        );

        assertDoesNotThrow(() -> controller.updateOpenBill(18L, req, me));
        assertSame(existingClient, openBill.getClient());
        assertEquals(OpenBill.BATCH_SCOPE_COMPANY, openBill.getBatchScope());
        assertEquals(101L, openBill.getBatchTargetCompanyId());
    }

    @Test
    void updateOpenBill_companyTarget_preservesExistingClientWhenRecipientHasNoLinkedClients() {
        ClientCompany recipientCompany = new ClientCompany();
        recipientCompany.setId(202L);
        recipientCompany.setOwnerCompany(ownerCompany);

        when(clientCompanies.findByIdAndOwnerCompanyId(202L, 1L)).thenReturn(Optional.of(recipientCompany));

        BillingController.OpenBillUpdateRequest req = new BillingController.OpenBillUpdateRequest(
                null,
                "",
                "COMPANY",
                null,
                202L,
                null,
                null,
                null,
                List.of()
        );

        assertDoesNotThrow(() -> controller.updateOpenBill(18L, req, me));
        assertSame(existingClient, openBill.getClient());
        assertEquals(202L, openBill.getBatchTargetCompanyId());
        verify(clients, never()).findFirstByCompanyIdAndBillingCompanyIdOrderByIdAsc(1L, 202L);
    }

    @Test
    void updateOpenBill_companyTarget_rejectsRecipientCompanyFromAnotherTenant() {
        when(clientCompanies.findByIdAndOwnerCompanyId(999L, 1L)).thenReturn(Optional.empty());

        BillingController.OpenBillUpdateRequest req = new BillingController.OpenBillUpdateRequest(
                null,
                "",
                "COMPANY",
                11L,
                999L,
                null,
                null,
                null,
                List.of()
        );

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> controller.updateOpenBill(18L, req, me));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertEquals("Invalid recipientCompanyId.", ex.getReason());
    }

    @Test
    void updateOpenBill_companyTarget_keepsSessionEvenWhenSessionLinkedCompanyDiffers() {
        ClientCompany recipientCompany = new ClientCompany();
        recipientCompany.setId(303L);
        recipientCompany.setOwnerCompany(ownerCompany);

        ClientCompany sessionClientCompany = new ClientCompany();
        sessionClientCompany.setId(404L);
        sessionClientCompany.setOwnerCompany(ownerCompany);
        existingClient.setBillingCompany(sessionClientCompany);

        SessionBooking selectedSession = new SessionBooking();
        selectedSession.setId(55L);
        selectedSession.setCompany(ownerCompany);
        selectedSession.setClient(existingClient);

        when(clientCompanies.findByIdAndOwnerCompanyId(303L, 1L)).thenReturn(Optional.of(recipientCompany));
        when(clients.findByIdAndCompanyId(11L, 1L)).thenReturn(Optional.of(existingClient));
        when(sessionBookings.findByIdAndCompanyId(55L, 1L)).thenReturn(Optional.of(selectedSession));
        when(openBillRepo.findBySessionBookingIdAndCompanyId(55L, 1L)).thenReturn(Optional.of(openBill));
        when(sessionBookings.findAllByCompanyIdAndIds(1L, anySet())).thenReturn(List.of(selectedSession));

        BillingController.OpenBillUpdateRequest req = new BillingController.OpenBillUpdateRequest(
                null,
                "",
                "COMPANY",
                11L,
                303L,
                null,
                55L,
                null,
                List.of()
        );

        assertDoesNotThrow(() -> controller.updateOpenBill(18L, req, me));
        assertSame(selectedSession, openBill.getSessionBooking());
        assertEquals(303L, openBill.getBatchTargetCompanyId());
    }

    @Test
    void updateOpenBill_rejectsSessionAlreadyLinkedToAnotherOpenBill() {
        ClientCompany recipientCompany = new ClientCompany();
        recipientCompany.setId(505L);
        recipientCompany.setOwnerCompany(ownerCompany);

        SessionBooking selectedSession = new SessionBooking();
        selectedSession.setId(77L);
        selectedSession.setCompany(ownerCompany);
        selectedSession.setClient(existingClient);

        OpenBill otherOpenBill = new OpenBill();
        otherOpenBill.setId(999L);
        otherOpenBill.setCompany(ownerCompany);

        when(clientCompanies.findByIdAndOwnerCompanyId(505L, 1L)).thenReturn(Optional.of(recipientCompany));
        when(clients.findByIdAndCompanyId(11L, 1L)).thenReturn(Optional.of(existingClient));
        when(sessionBookings.findByIdAndCompanyId(77L, 1L)).thenReturn(Optional.of(selectedSession));
        when(openBillRepo.findBySessionBookingIdAndCompanyId(77L, 1L)).thenReturn(Optional.of(otherOpenBill));

        BillingController.OpenBillUpdateRequest req = new BillingController.OpenBillUpdateRequest(
                null,
                "",
                "COMPANY",
                11L,
                505L,
                null,
                77L,
                null,
                List.of()
        );

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> controller.updateOpenBill(18L, req, me));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertEquals("Selected session is already linked to another open bill.", ex.getReason());
    }
}
