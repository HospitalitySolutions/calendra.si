package com.example.app.billing;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.app.client.Client;
import com.example.app.client.ClientRepository;
import com.example.app.company.ClientCompany;
import com.example.app.company.ClientCompanyRepository;
import com.example.app.company.Company;
import com.example.app.fiscal.FiscalizationService;
import com.example.app.guest.model.GuestOrderRepository;
import jakarta.persistence.EntityManager;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.SessionType;
import com.example.app.session.TypeTransactionService;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.BillingModuleAccessService;
import com.example.app.settings.GlobalPaymentProviderService;
import com.example.app.stripe.StripeBillingService;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.lang.reflect.Method;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

@ExtendWith(MockitoExtension.class)
class BillingControllerBatchSyncRegressionTest {

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
    }

    @Test
    void syncOpenBillsFromPastSessions_reparentsLegacyItemsForBatchWithoutStaleEntityLookups() throws Exception {
        Company company = new Company();
        company.setId(1L);

        User consultant = new User();
        consultant.setId(2L);
        consultant.setCompany(company);

        ClientCompany billingCompany = new ClientCompany();
        billingCompany.setId(7L);
        billingCompany.setOwnerCompany(company);
        billingCompany.setBatchPaymentEnabled(true);

        Client client = new Client();
        client.setId(3L);
        client.setCompany(company);
        client.setBillingCompany(billingCompany);
        client.setBatchPaymentEnabled(false);
        client.setFirstName("Ana");
        client.setLastName("Novak");

        TransactionService service = new TransactionService();
        service.setId(11L);
        service.setNetPrice(new BigDecimal("10.00"));
        service.setTaxRate(TaxRate.VAT_22);
        service.setDescription("Session service");
        service.setCode("S1");

        TypeTransactionService typeLink = new TypeTransactionService();
        typeLink.setTransactionService(service);
        typeLink.setPrice(new BigDecimal("10.00"));

        SessionType type = new SessionType();
        type.setLinkedServices(new ArrayList<>(List.of(typeLink)));

        SessionBooking booking = new SessionBooking();
        booking.setId(99L);
        booking.setCompany(company);
        booking.setClient(client);
        booking.setConsultant(consultant);
        booking.setType(type);
        booking.setStartTime(LocalDateTime.now().minusHours(2));
        booking.setEndTime(LocalDateTime.now().minusHours(1));

        OpenBill legacyOpen = new OpenBill();
        legacyOpen.setId(1L);
        legacyOpen.setCompany(company);
        legacyOpen.setClient(client);
        legacyOpen.setConsultant(consultant);
        legacyOpen.setSessionBooking(booking);

        OpenBillItem legacyItem = new OpenBillItem();
        legacyItem.setId(2L);
        legacyItem.setOpenBill(legacyOpen);
        legacyItem.setTransactionService(service);
        legacyItem.setQuantity(1);
        legacyItem.setNetPrice(new BigDecimal("10.00"));
        legacyItem.setSourceSessionBookingId(null);
        legacyOpen.getItems().add(legacyItem);

        OpenBill batchOpen = new OpenBill();
        batchOpen.setId(5L);
        batchOpen.setCompany(company);
        batchOpen.setClient(client);
        batchOpen.setConsultant(consultant);
        batchOpen.setBatchScope(OpenBill.BATCH_SCOPE_COMPANY);
        batchOpen.setBatchTargetCompanyId(billingCompany.getId());

        when(sessionBookings.findPastSessionsWithTypeAndCompanyId(any(LocalDateTime.class), eq(1L)))
                .thenReturn(List.of(booking));
        when(openBillRepo.findBySessionBookingIdAndCompanyId(99L, 1L)).thenReturn(Optional.of(legacyOpen));
        when(openBillRepo.findBatchByCompanyTarget(1L, OpenBill.BATCH_SCOPE_COMPANY, 7L)).thenReturn(Optional.of(batchOpen));
        when(billRepo.findAllByCompanyIdAndSourceSessionIdSnapshotAndBillTypeOrderByIdAsc(1L, 99L, BillType.ADVANCE))
                .thenReturn(List.of());
        when(openBillRepo.saveAndFlush(any(OpenBill.class))).thenAnswer(inv -> inv.getArgument(0));
        when(openBillRepo.moveItemsToOpenBill(1L, 5L, 99L, 1L)).thenAnswer(inv -> {
            legacyOpen.getItems().clear();
            batchOpen.getItems().add(legacyItem);
            legacyItem.setOpenBill(batchOpen);
            legacyItem.setSourceSessionBookingId(99L);
            return 1;
        });
        when(openBillRepo.findByIdWithItemsForBatchSync(5L, 1L)).thenReturn(Optional.of(batchOpen));

        invokeSync(company.getId());

        assertEquals(0, legacyOpen.getItems().size());
        assertEquals(1, batchOpen.getItems().size());
        assertSame(legacyItem, batchOpen.getItems().get(0));
        assertEquals(99L, batchOpen.getItems().get(0).getSourceSessionBookingId());
        assertSame(batchOpen, batchOpen.getItems().get(0).getOpenBill());

        verify(openBillRepo, atLeastOnce()).saveAndFlush(batchOpen);
        verify(openBillRepo).deleteByIdAndCompanyId(1L, 1L);
        verify(openBillRepo).flush();
        verify(openBillRepo, never()).delete(any(OpenBill.class));
    }

    @Test
    void syncOpenBillsFromPastSessions_mergesMultipleLegacyOpenBillsIntoOneBatchAndPreservesSessionIds() throws Exception {
        Company company = new Company();
        company.setId(1L);

        User consultant = new User();
        consultant.setId(2L);
        consultant.setCompany(company);

        ClientCompany billingCompany = new ClientCompany();
        billingCompany.setId(7L);
        billingCompany.setOwnerCompany(company);
        billingCompany.setBatchPaymentEnabled(true);

        Client client = new Client();
        client.setId(3L);
        client.setCompany(company);
        client.setBillingCompany(billingCompany);
        client.setFirstName("Ana");
        client.setLastName("Novak");

        TransactionService service = new TransactionService();
        service.setId(11L);
        service.setNetPrice(new BigDecimal("10.00"));
        service.setTaxRate(TaxRate.VAT_22);

        TypeTransactionService typeLink = new TypeTransactionService();
        typeLink.setTransactionService(service);
        typeLink.setPrice(new BigDecimal("10.00"));

        SessionType type = new SessionType();
        type.setLinkedServices(new ArrayList<>(List.of(typeLink)));

        SessionBooking bookingOne = new SessionBooking();
        bookingOne.setId(99L);
        bookingOne.setCompany(company);
        bookingOne.setClient(client);
        bookingOne.setConsultant(consultant);
        bookingOne.setType(type);
        bookingOne.setStartTime(LocalDateTime.now().minusHours(3));
        bookingOne.setEndTime(LocalDateTime.now().minusHours(2));

        SessionBooking bookingTwo = new SessionBooking();
        bookingTwo.setId(100L);
        bookingTwo.setCompany(company);
        bookingTwo.setClient(client);
        bookingTwo.setConsultant(consultant);
        bookingTwo.setType(type);
        bookingTwo.setStartTime(LocalDateTime.now().minusHours(2));
        bookingTwo.setEndTime(LocalDateTime.now().minusHours(1));

        OpenBill legacyOne = new OpenBill();
        legacyOne.setId(1L);
        legacyOne.setCompany(company);
        legacyOne.setClient(client);
        legacyOne.setConsultant(consultant);
        legacyOne.setSessionBooking(bookingOne);
        OpenBillItem itemOne = new OpenBillItem();
        itemOne.setId(2L);
        itemOne.setOpenBill(legacyOne);
        itemOne.setTransactionService(service);
        itemOne.setQuantity(1);
        itemOne.setNetPrice(new BigDecimal("10.00"));
        legacyOne.getItems().add(itemOne);

        OpenBill legacyTwo = new OpenBill();
        legacyTwo.setId(3L);
        legacyTwo.setCompany(company);
        legacyTwo.setClient(client);
        legacyTwo.setConsultant(consultant);
        legacyTwo.setSessionBooking(bookingTwo);
        OpenBillItem itemTwo = new OpenBillItem();
        itemTwo.setId(4L);
        itemTwo.setOpenBill(legacyTwo);
        itemTwo.setTransactionService(service);
        itemTwo.setQuantity(1);
        itemTwo.setNetPrice(new BigDecimal("10.00"));
        legacyTwo.getItems().add(itemTwo);

        OpenBill batchOpen = new OpenBill();
        batchOpen.setId(5L);
        batchOpen.setCompany(company);
        batchOpen.setClient(client);
        batchOpen.setConsultant(consultant);
        batchOpen.setBatchScope(OpenBill.BATCH_SCOPE_COMPANY);
        batchOpen.setBatchTargetCompanyId(billingCompany.getId());

        when(sessionBookings.findPastSessionsWithTypeAndCompanyId(any(LocalDateTime.class), eq(1L)))
                .thenReturn(List.of(bookingOne, bookingTwo));
        when(openBillRepo.findBySessionBookingIdAndCompanyId(99L, 1L)).thenReturn(Optional.of(legacyOne));
        when(openBillRepo.findBySessionBookingIdAndCompanyId(100L, 1L)).thenReturn(Optional.of(legacyTwo));
        when(openBillRepo.findBatchByCompanyTarget(1L, OpenBill.BATCH_SCOPE_COMPANY, 7L)).thenReturn(Optional.of(batchOpen));
        when(billRepo.findAllByCompanyIdAndSourceSessionIdSnapshotAndBillTypeOrderByIdAsc(eq(1L), any(Long.class), eq(BillType.ADVANCE)))
                .thenReturn(List.of());
        when(openBillRepo.saveAndFlush(any(OpenBill.class))).thenAnswer(inv -> inv.getArgument(0));
        when(openBillRepo.moveItemsToOpenBill(1L, 5L, 99L, 1L)).thenAnswer(inv -> {
            legacyOne.getItems().clear();
            batchOpen.getItems().add(itemOne);
            itemOne.setOpenBill(batchOpen);
            itemOne.setSourceSessionBookingId(99L);
            return 1;
        });
        when(openBillRepo.moveItemsToOpenBill(3L, 5L, 100L, 1L)).thenAnswer(inv -> {
            legacyTwo.getItems().clear();
            batchOpen.getItems().add(itemTwo);
            itemTwo.setOpenBill(batchOpen);
            itemTwo.setSourceSessionBookingId(100L);
            return 1;
        });
        when(openBillRepo.findByIdWithItemsForBatchSync(5L, 1L)).thenReturn(Optional.of(batchOpen));

        invokeSync(company.getId());

        assertEquals(0, legacyOne.getItems().size());
        assertEquals(0, legacyTwo.getItems().size());
        assertEquals(2, batchOpen.getItems().size());
        assertEquals(List.of(99L, 100L), batchOpen.getItems().stream().map(OpenBillItem::getSourceSessionBookingId).sorted().toList());

        verify(openBillRepo, times(2)).deleteByIdAndCompanyId(any(Long.class), eq(1L));
        verify(openBillRepo, never()).delete(any(OpenBill.class));
    }

    private void invokeSync(Long companyId) throws Exception {
        Method method = BillingController.class.getDeclaredMethod("syncOpenBillsFromPastSessions", Long.class);
        method.setAccessible(true);
        method.invoke(controller, companyId);
    }
}
