package com.example.app.billing;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
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
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.BillingModuleAccessService;
import com.example.app.settings.GlobalPaymentProviderService;
import com.example.app.settings.SettingKey;
import com.example.app.stripe.StripeBillingService;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class BillingControllerCompanyProxyClientFallbackTest {

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
    private Company ownerCompany;
    private User me;
    private User consultant;
    private ClientCompany recipientCompany;
    private PaymentMethod defaultMethod;

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
                billingModuleAccess
        );

        ownerCompany = new Company();
        ownerCompany.setId(1L);

        me = new User();
        me.setId(5L);
        me.setCompany(ownerCompany);

        consultant = new User();
        consultant.setId(9L);
        consultant.setCompany(ownerCompany);
        consultant.setFirstName("System");
        consultant.setLastName("Admin");

        recipientCompany = new ClientCompany();
        recipientCompany.setId(77L);
        recipientCompany.setOwnerCompany(ownerCompany);
        recipientCompany.setName("Acme d.o.o.");
        recipientCompany.setAddress("Main 1");
        recipientCompany.setPostalCode("1000");
        recipientCompany.setCity("Ljubljana");
        recipientCompany.setVatId("SI123");

        defaultMethod = new PaymentMethod();
        defaultMethod.setId(44L);
        defaultMethod.setCompany(ownerCompany);
        defaultMethod.setName("Cash");
        defaultMethod.setPaymentType(PaymentType.CASH);
        defaultMethod.setFiscalized(false);
        defaultMethod.setStripeEnabled(false);

        org.mockito.Mockito.lenient().when(users.findByIdAndCompanyId(5L, 1L)).thenReturn(Optional.of(consultant));
        org.mockito.Mockito.lenient().when(clientCompanies.findByIdAndOwnerCompanyId(77L, 1L)).thenReturn(Optional.of(recipientCompany));
        org.mockito.Mockito.lenient().when(paymentMethodRepo.findAllByCompanyIdOrderByNameAsc(1L)).thenReturn(List.of(defaultMethod));
        org.mockito.Mockito.lenient().when(sessionBookings.findPastSessionsWithTypeAndCompanyId(any(), anyLong())).thenReturn(List.of());
    }

    @Test
    void createManualOpenBill_companyTargetWithoutLinkedClients_createsProxyClientAndCompanyBatch() {
        TransactionService tx = new TransactionService();
        tx.setId(101L);
        tx.setCompany(ownerCompany);
        tx.setNetPrice(new BigDecimal("50.00"));

        Client proxyClient = new Client();
        proxyClient.setId(901L);
        proxyClient.setCompany(ownerCompany);
        proxyClient.setBillingCompany(recipientCompany);
        proxyClient.setFirstName("Company");
        proxyClient.setLastName("Billing Proxy");
        proxyClient.setEmail("company-billing-proxy+1-77@calendra.invalid");

        when(txRepo.findByIdAndCompanyId(101L, 1L)).thenReturn(Optional.of(tx));
        when(clients.findFirstByCompanyIdAndBillingCompanyIdOrderByIdAsc(1L, 77L)).thenReturn(Optional.empty());
        when(clients.findAllByCompanyIdAndNormalizedEmail(1L, "company-billing-proxy+1-77@calendra.invalid")).thenReturn(List.of());
        when(clients.save(any(Client.class))).thenReturn(proxyClient);
        List<OpenBill> openBills = new ArrayList<>();
        when(openBillRepo.save(any(OpenBill.class))).thenAnswer(inv -> {
            OpenBill open = inv.getArgument(0);
            open.setId(200L);
            openBills.clear();
            openBills.add(open);
            return open;
        });
        when(openBillRepo.findAllWithItemsByCompanyId(1L)).thenAnswer(inv -> openBills);

        BillingController.ManualOpenBillRequest req = new BillingController.ManualOpenBillRequest(
                null,
                77L,
                null,
                null,
                null,
                "INVOICE",
                "REF-1",
                null,
                null,
                null,
                null,
                null,
                List.of(new BillingController.ManualOpenBillLineRequest(101L, 1, new BigDecimal("50.00"), new BigDecimal("50.00"), null))
        );

        assertDoesNotThrow(() -> controller.createManualOpenBill(req, me));

        ArgumentCaptor<OpenBill> openCaptor = ArgumentCaptor.forClass(OpenBill.class);
        verify(openBillRepo).save(openCaptor.capture());
        OpenBill saved = openCaptor.getValue();
        assertEquals(OpenBill.BATCH_SCOPE_COMPANY, saved.getBatchScope());
        assertEquals(77L, saved.getBatchTargetCompanyId());
        assertEquals(901L, saved.getClient().getId());
        verify(openBillRepo, never()).findBatchByCompanyTarget(1L, OpenBill.BATCH_SCOPE_COMPANY, 77L);
    }

    @Test
    void createAdditionalOpenBill_companyTargetWithoutLinkedClients_usesProxyClient() {
        SessionBooking sourceSession = new SessionBooking();
        sourceSession.setId(300L);
        sourceSession.setCompany(ownerCompany);
        sourceSession.setBookingStatus("CONFIRMED");
        sourceSession.setConsultant(consultant);

        Client proxyClient = new Client();
        proxyClient.setId(902L);
        proxyClient.setCompany(ownerCompany);
        proxyClient.setBillingCompany(recipientCompany);
        proxyClient.setAssignedTo(consultant);
        proxyClient.setFirstName("Company");
        proxyClient.setLastName("Billing Proxy");
        proxyClient.setEmail("company-billing-proxy+1-77@calendra.invalid");

        when(sessionBookings.findByIdAndCompanyId(300L, 1L)).thenReturn(Optional.of(sourceSession));
        when(clients.findFirstByCompanyIdAndBillingCompanyIdOrderByIdAsc(1L, 77L)).thenReturn(Optional.empty());
        when(clients.findAllByCompanyIdAndNormalizedEmail(1L, "company-billing-proxy+1-77@calendra.invalid")).thenReturn(List.of());
        when(clients.save(any(Client.class))).thenReturn(proxyClient);

        List<OpenBill> openBills = new ArrayList<>();
        when(openBillRepo.saveAndFlush(any(OpenBill.class))).thenAnswer(inv -> {
            OpenBill open = inv.getArgument(0);
            open.setId(201L);
            openBills.clear();
            openBills.add(open);
            return open;
        });
        when(openBillRepo.findAllWithItemsByCompanyId(1L)).thenAnswer(inv -> openBills);

        BillingController.AdditionalOpenBillRequest req = new BillingController.AdditionalOpenBillRequest(null, 77L, null);

        BillingController.OpenBillResponse response = assertDoesNotThrow(() -> controller.createAdditionalOpenBillForSession(300L, req, me));
        assertNotNull(response);
        assertEquals(201L, response.id());
        assertEquals(OpenBill.BATCH_SCOPE_COMPANY, response.batchScope());
    }

    @Test
    void createBillFromOpen_companyBatchWithProxyClient_keepsCompanyRecipient() {
        Client proxyClient = new Client();
        proxyClient.setId(903L);
        proxyClient.setCompany(ownerCompany);
        proxyClient.setBillingCompany(recipientCompany);
        proxyClient.setFirstName("Company");
        proxyClient.setLastName("Billing Proxy");

        TransactionService tx = new TransactionService();
        tx.setId(102L);
        tx.setCompany(ownerCompany);
        tx.setNetPrice(new BigDecimal("50.00"));

        OpenBill openBill = new OpenBill();
        openBill.setId(202L);
        openBill.setCompany(ownerCompany);
        openBill.setClient(proxyClient);
        openBill.setConsultant(consultant);
        openBill.setPaymentMethod(defaultMethod);
        openBill.setBatchScope(OpenBill.BATCH_SCOPE_COMPANY);
        openBill.setBatchTargetCompanyId(77L);
        openBill.setDiscountType("PERCENT");
        openBill.setDiscountValue(new BigDecimal("10"));
        openBill.setItems(new ArrayList<>());

        OpenBillItem openBillItem = new OpenBillItem();
        openBillItem.setOpenBill(openBill);
        openBillItem.setTransactionService(tx);
        openBillItem.setQuantity(1);
        openBillItem.setNetPrice(new BigDecimal("50.00"));
        openBillItem.setUnitGrossPrice(new BigDecimal("50.00"));
        openBill.getItems().add(openBillItem);

        AppSetting invoiceCounter = new AppSetting();
        invoiceCounter.setCompany(ownerCompany);
        invoiceCounter.setKey(SettingKey.INVOICE_COUNTER.name());
        invoiceCounter.setValue("100");

        when(openBillRepo.findById(202L)).thenReturn(Optional.of(openBill));
        when(clientCompanies.findByIdAndOwnerCompanyId(77L, 1L)).thenReturn(Optional.of(recipientCompany));
        when(settings.findByCompanyIdAndKey(anyLong(), any(SettingKey.class))).thenReturn(Optional.empty());
        when(settings.findByCompanyIdAndKey(1L, SettingKey.INVOICE_COUNTER)).thenReturn(Optional.of(invoiceCounter));
        when(settings.save(any(AppSetting.class))).thenAnswer(inv -> inv.getArgument(0));
        when(billRepo.saveAndFlush(any(Bill.class))).thenAnswer(inv -> {
            Bill bill = inv.getArgument(0);
            bill.setId(500L);
            return bill;
        });

        BillingController.BillResponse response = assertDoesNotThrow(() -> controller.createBillFromOpen(202L, me));
        assertNotNull(response);
        assertEquals(500L, response.id());

        ArgumentCaptor<Bill> billCaptor = ArgumentCaptor.forClass(Bill.class);
        verify(billRepo).saveAndFlush(billCaptor.capture());
        Bill savedBill = billCaptor.getValue();
        assertNull(savedBill.getClient());
        assertEquals("Acme d.o.o.", savedBill.getRecipientCompanyNameSnapshot());
        assertEquals(new BigDecimal("45.00"), savedBill.getTotalGross());
    }

    @Test
    void createManualOpenBill_rejectsInvalidExplicitClientId() {
        when(clients.findByIdAndCompanyId(999L, 1L)).thenReturn(Optional.empty());

        BillingController.ManualOpenBillRequest req = new BillingController.ManualOpenBillRequest(
                999L,
                77L,
                null,
                null,
                null,
                "INVOICE",
                null,
                null,
                null,
                null,
                null,
                null,
                List.of()
        );

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> controller.createManualOpenBill(req, me));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertEquals("Invalid clientId.", ex.getReason());
    }
}
