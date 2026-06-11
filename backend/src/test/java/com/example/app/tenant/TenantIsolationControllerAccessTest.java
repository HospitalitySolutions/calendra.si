package com.example.app.tenant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.example.app.account.AccountManagementInvoiceController;
import com.example.app.billing.AdvanceAllocationRepository;
import com.example.app.billing.BankStatementReconciliationService;
import com.example.app.billing.Bill;
import com.example.app.billing.BillFolioPdfService;
import com.example.app.billing.BillRepository;
import com.example.app.billing.BillingController;
import com.example.app.billing.BillingEmailService;
import com.example.app.billing.FolioPdfService;
import com.example.app.billing.InvoiceOrderIdService;
import com.example.app.billing.InvoicePdfS3Service;
import com.example.app.billing.OpenBill;
import com.example.app.billing.OpenBillRepository;
import com.example.app.billing.OpenBillSyncService;
import com.example.app.billing.PaymentMethodRepository;
import com.example.app.billing.TransactionServiceRepository;
import com.example.app.client.Client;
import com.example.app.client.ClientAnonymizationService;
import com.example.app.client.ClientController;
import com.example.app.client.ClientRemovalGuard;
import com.example.app.client.ClientRepository;
import com.example.app.client.ClientWalletPurchaseController;
import com.example.app.company.ClientCompany;
import com.example.app.company.ClientCompanyRepository;
import com.example.app.company.Company;
import com.example.app.company.CompanyController;
import com.example.app.company.CompanyRepository;
import com.example.app.company.PlatformTenantAccountLinkService;
import com.example.app.consumables.ConsumableService;
import com.example.app.files.ClientFileRepository;
import com.example.app.files.CompanyFileRepository;
import com.example.app.files.TenantFileS3Service;
import com.example.app.fiscal.FiscalizationService;
import com.example.app.guest.auth.GuestAuthContextService;
import com.example.app.guest.catalog.GuestCatalogService;
import com.example.app.guest.catalog.GuestProductAdminController;
import com.example.app.guest.model.EntitlementStatus;
import com.example.app.guest.model.GuestEntitlement;
import com.example.app.guest.model.GuestEntitlementRepository;
import com.example.app.guest.model.GuestEntitlementUsageRepository;
import com.example.app.guest.model.GuestOrder;
import com.example.app.guest.model.GuestOrderItemRepository;
import com.example.app.guest.model.GuestOrderRepository;
import com.example.app.guest.model.GuestProductRepository;
import com.example.app.guest.model.GuestTenantLinkRepository;
import com.example.app.guest.model.GuestUser;
import com.example.app.guest.model.GuestUserRepository;
import com.example.app.guest.model.OrderStatus;
import com.example.app.guest.order.GuestEntitlementService;
import com.example.app.guest.order.GuestOrderService;
import com.example.app.guest.tenant.GuestTenantService;
import com.example.app.guest.common.GuestBookingActionsController;
import com.example.app.reminder.ReminderService;
import com.example.app.session.BookableSlotRepository;
import com.example.app.session.BookingChangePublisher;
import com.example.app.session.CalendarTodoRepository;
import com.example.app.session.PersonalCalendarBlockRepository;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingController;
import com.example.app.session.SessionBookingCreationService;
import com.example.app.session.SessionBookingRealtimeService;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.SessionTypeRepository;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.BillingModuleAccessService;
import com.example.app.settings.GlobalConsumablesFeatureService;
import com.example.app.settings.GlobalPaymentProviderService;
import com.example.app.settings.SettingKey;
import com.example.app.settings.SettingsController;
import com.example.app.settings.SettingsCryptoService;
import com.example.app.stripe.StripeBillingService;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import jakarta.persistence.EntityManager;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class TenantIsolationControllerAccessTest {

    @Test
    void clientDetailWalletAndFileDownloadAreTenantScoped() {
        ClientRepository clients = mock(ClientRepository.class);
        ClientFileRepository clientFiles = mock(ClientFileRepository.class);
        TenantFileS3Service fileStorage = mock(TenantFileS3Service.class);
        GuestEntitlementRepository entitlements = mock(GuestEntitlementRepository.class);
        GuestOrderService guestOrderService = mock(GuestOrderService.class);
        ClientController controller = clientController(clients, clientFiles, fileStorage, entitlements, guestOrderService);
        User tenantA = tenantAdmin(1L);

        when(clients.findByIdAndCompanyId(99L, 1L)).thenReturn(Optional.empty());
        assertNotFound(() -> controller.findById(99L, tenantA));
        assertNotFound(() -> controller.clientWallet(99L, tenantA));
        verify(clients, times(2)).findByIdAndCompanyId(99L, 1L);
        verifyNoInteractions(guestOrderService, entitlements);

        Client owned = client(10L, tenantA.getCompany());
        when(clients.findByIdAndCompanyId(10L, 1L)).thenReturn(Optional.of(owned));
        when(clientFiles.findByIdAndClientIdAndOwnerCompanyId(77L, 10L, 1L)).thenReturn(Optional.empty());

        assertNotFound(() -> controller.downloadFile(10L, 77L, tenantA));
        verify(clientFiles).findByIdAndClientIdAndOwnerCompanyId(77L, 10L, 1L);
        verify(fileStorage, never()).download(any());
    }

    @Test
    void walletEntitlementDeleteReturnsNotFoundForCrossTenantEntitlement() {
        ClientRepository clients = mock(ClientRepository.class);
        ClientFileRepository clientFiles = mock(ClientFileRepository.class);
        TenantFileS3Service fileStorage = mock(TenantFileS3Service.class);
        GuestEntitlementRepository entitlements = mock(GuestEntitlementRepository.class);
        ClientController controller = clientController(clients, clientFiles, fileStorage, entitlements, mock(GuestOrderService.class));
        User tenantA = tenantAdmin(1L);
        Client ownedClient = client(10L, tenantA.getCompany());
        when(clients.findByIdAndCompanyId(10L, 1L)).thenReturn(Optional.of(ownedClient));

        GuestEntitlement otherTenantEntitlement = new GuestEntitlement();
        otherTenantEntitlement.setId(44L);
        otherTenantEntitlement.setCompany(company(2L));
        otherTenantEntitlement.setClient(ownedClient);
        otherTenantEntitlement.setStatus(EntitlementStatus.ACTIVE);
        when(entitlements.findById(44L)).thenReturn(Optional.of(otherTenantEntitlement));

        assertNotFound(() -> controller.deleteWalletEntitlement(10L, 44L, tenantA));
        verify(entitlements, never()).save(any());
    }

    @Test
    void clientCompanyBillsAndFilesAreTenantScopedByOwnerCompany() {
        ClientCompanyRepository clientCompanies = mock(ClientCompanyRepository.class);
        BillRepository bills = mock(BillRepository.class);
        CompanyFileRepository companyFiles = mock(CompanyFileRepository.class);
        TenantFileS3Service fileStorage = mock(TenantFileS3Service.class);
        CompanyController controller = new CompanyController(
                clientCompanies,
                bills,
                companyFiles,
                fileStorage,
                mock(PlatformTenantAccountLinkService.class));
        User tenantA = tenantAdmin(1L);

        when(clientCompanies.findByIdAndOwnerCompanyId(88L, 1L)).thenReturn(Optional.empty());
        assertNotFound(() -> controller.get(88L, tenantA));
        assertNotFound(() -> controller.bills(88L, tenantA));
        verifyNoInteractions(bills);

        ClientCompany ownedPayee = new ClientCompany();
        ownedPayee.setId(88L);
        ownedPayee.setOwnerCompany(tenantA.getCompany());
        when(clientCompanies.findByIdAndOwnerCompanyId(88L, 1L)).thenReturn(Optional.of(ownedPayee));
        when(companyFiles.findByIdAndCompanyIdAndOwnerCompanyId(99L, 88L, 1L)).thenReturn(Optional.empty());

        assertNotFound(() -> controller.downloadFile(88L, 99L, tenantA));
        verify(companyFiles).findByIdAndCompanyIdAndOwnerCompanyId(99L, 88L, 1L);
        verify(fileStorage, never()).download(any());
    }

    @Test
    void bookingSwapCannotInferBookingFromAnotherTenant() {
        SessionBookingRepository bookings = mock(SessionBookingRepository.class);
        CompanyRepository companies = mock(CompanyRepository.class);
        SessionBookingController controller = new SessionBookingController(
                bookings,
                mock(BookableSlotRepository.class),
                mock(PersonalCalendarBlockRepository.class),
                mock(CalendarTodoRepository.class),
                companies,
                mock(SessionBookingCreationService.class),
                mock(ReminderService.class),
                mock(SessionBookingRealtimeService.class),
                mock(BookingChangePublisher.class),
                mock(OpenBillSyncService.class),
                mock(OpenBillRepository.class),
                mock(BillRepository.class),
                mock(GuestEntitlementUsageRepository.class),
                mock(ConsumableService.class),
                mock(AppSettingRepository.class),
                new com.example.app.common.TimeService(new com.example.app.common.SimulatedTimeService(null, null, null, new com.fasterxml.jackson.databind.ObjectMapper())));
        User tenantA = tenantAdmin(1L);

        SessionBooking owned = new SessionBooking();
        owned.setId(10L);
        owned.setCompany(tenantA.getCompany());
        when(companies.findByIdForUpdate(1L)).thenReturn(Optional.of(tenantA.getCompany()));
        when(bookings.findByIdAndCompanyId(10L, 1L)).thenReturn(Optional.of(owned));
        when(bookings.findByIdAndCompanyId(20L, 1L)).thenReturn(Optional.empty());

        assertNotFound(() -> controller.swap(new SessionBookingController.SwapRequest(10L, 20L), tenantA));
        verify(bookings).findByIdAndCompanyId(10L, 1L);
        verify(bookings).findByIdAndCompanyId(20L, 1L);
    }

    @Test
    void billingPdfEndpointsUseTenantScopedBillLookupAndOpenBillCompanyGuard() {
        BillRepository bills = mock(BillRepository.class);
        OpenBillRepository openBills = mock(OpenBillRepository.class);
        InvoicePdfS3Service invoiceStorage = mock(InvoicePdfS3Service.class);
        BillFolioPdfService billFolioPdfService = mock(BillFolioPdfService.class);
        BillingController controller = billingController(bills, openBills, invoiceStorage, billFolioPdfService);
        User tenantA = tenantAdmin(1L);

        when(bills.findByIdAndCompanyId(100L, 1L)).thenReturn(Optional.empty());
        assertNotFound(() -> controller.billPdf(100L, tenantA));
        assertNotFound(() -> controller.billFolioPdf(100L, null, tenantA));
        assertNotFound(() -> controller.resendBillPdf(100L, null, tenantA));
        verify(bills, times(3)).findByIdAndCompanyId(100L, 1L);
        verifyNoInteractions(invoiceStorage, billFolioPdfService);

        OpenBill otherTenantOpenBill = new OpenBill();
        otherTenantOpenBill.setId(200L);
        otherTenantOpenBill.setCompany(company(2L));
        when(openBills.findById(200L)).thenReturn(Optional.of(otherTenantOpenBill));

        assertNotFound(() -> controller.deleteOpenBill(200L, tenantA));
        verify(openBills, never()).delete(any());
    }

    @Test
    void guestReceiptCannotDownloadBillFromAnotherTenant() {
        GuestAuthContextService authContext = mock(GuestAuthContextService.class);
        GuestOrderRepository orders = mock(GuestOrderRepository.class);
        BillRepository bills = mock(BillRepository.class);
        InvoicePdfS3Service invoiceStorage = mock(InvoicePdfS3Service.class);
        BillFolioPdfService billFolioPdfService = mock(BillFolioPdfService.class);
        GuestBookingActionsController controller = new GuestBookingActionsController(
                authContext,
                mock(SessionBookingRepository.class),
                mock(GuestTenantService.class),
                mock(GuestCatalogService.class),
                mock(UserRepository.class),
                orders,
                bills,
                billFolioPdfService,
                invoiceStorage,
                mock(GuestEntitlementService.class),
                mock(SessionBookingRealtimeService.class),
                mock(BookingChangePublisher.class),
                mock(OpenBillSyncService.class));
        HttpServletRequest request = mock(HttpServletRequest.class);
        GuestUser guestUser = new GuestUser();
        guestUser.setId(7L);
        guestUser.setLanguage("sl");
        when(authContext.requireGuest(request)).thenReturn(guestUser);

        GuestOrder order = new GuestOrder();
        order.setId(55L);
        order.setGuestUser(guestUser);
        order.setCompany(company(1L));
        order.setBillId(999L);
        order.setStatus(OrderStatus.PAID);
        when(orders.findByIdAndGuestUserId(55L, 7L)).thenReturn(Optional.of(order));
        when(bills.findByIdAndCompanyId(999L, 1L)).thenReturn(Optional.empty());

        assertNotFound(() -> controller.receiptPdf(55L, request));
        verify(bills).findByIdAndCompanyId(999L, 1L);
        verifyNoInteractions(invoiceStorage, billFolioPdfService);
    }

    @Test
    void clientWalletPurchaseAndGuestProductAdminUseProductTenantScope() {
        ClientRepository clients = mock(ClientRepository.class);
        GuestProductRepository products = mock(GuestProductRepository.class);
        GuestOrderRepository orders = mock(GuestOrderRepository.class);
        ClientWalletPurchaseController walletPurchases = new ClientWalletPurchaseController(
                clients,
                products,
                orders,
                mock(GuestTenantLinkRepository.class),
                mock(GuestUserRepository.class),
                mock(OpenBillRepository.class),
                mock(PaymentMethodRepository.class),
                mock(TransactionServiceRepository.class));
        User tenantA = tenantAdmin(1L);
        Client client = client(33L, tenantA.getCompany());
        when(clients.findByIdAndCompanyId(33L, 1L)).thenReturn(Optional.of(client));
        when(products.findByIdAndCompanyId(44L, 1L)).thenReturn(Optional.empty());

        assertNotFound(() -> walletPurchases.createPurchaseOpenBill(33L, 44L, tenantA));
        verify(orders, never()).save(any());

        GuestProductAdminController productAdmin = new GuestProductAdminController(
                products,
                mock(SessionTypeRepository.class),
                mock(TransactionServiceRepository.class),
                mock(GuestOrderItemRepository.class),
                mock(GuestEntitlementRepository.class),
                mock(com.example.app.course.CourseRepository.class),
                mock(com.example.app.course.MembershipCourseRepository.class));
        var req = new GuestProductAdminController.ProductAdminRequest(
                "Starter pack",
                null,
                null,
                "PACK",
                java.math.BigDecimal.TEN,
                "EUR",
                true,
                true,
                false,
                null,
                null,
                false,
                0,
                null,
                null,
                java.util.List.of());
        assertNotFound(() -> productAdmin.update(44L, req, tenantA));
        verify(products).findByIdAndCompanyId(44L, 1L);
    }

    @Test
    void settingsReadAndSaveAreTenantScoped() {
        AppSettingRepository settings = mock(AppSettingRepository.class);
        SettingsCryptoService crypto = mock(SettingsCryptoService.class);
        PlatformTenantAccountLinkService accountLinkService = mock(PlatformTenantAccountLinkService.class);
        SettingsController controller = new SettingsController(
                settings,
                crypto,
                mock(TenantFileS3Service.class),
                mock(GlobalPaymentProviderService.class),
                mock(GlobalConsumablesFeatureService.class),
                accountLinkService);
        User tenantA = tenantAdmin(1L);
        when(settings.findAllByCompanyId(1L)).thenReturn(List.of());
        when(settings.findByCompanyIdAndKey(1L, SettingKey.COMPANY_EMAIL)).thenReturn(Optional.empty());

        controller.all(tenantA);
        controller.save(Map.of(SettingKey.COMPANY_EMAIL.name(), "tenant@example.com"), tenantA);

        verify(settings, times(2)).findAllByCompanyId(1L);
        verify(settings).findByCompanyIdAndKey(1L, SettingKey.COMPANY_EMAIL);
        verify(settings).save(argThat(saved ->
                saved instanceof AppSetting
                        && ((AppSetting) saved).getCompany() != null
                        && Long.valueOf(1L).equals(((AppSetting) saved).getCompany().getId())
                        && SettingKey.COMPANY_EMAIL.name().equals(((AppSetting) saved).getKey())));
        verify(accountLinkService).syncFromTenantSettings(eq(tenantA.getCompany()), any());
    }

    @Test
    void accountManagementReceivedInvoicePdfOnlyUsesPlatformPayeesLinkedToCurrentTenant() {
        CompanyRepository companies = mock(CompanyRepository.class);
        ClientCompanyRepository clientCompanies = mock(ClientCompanyRepository.class);
        BillRepository bills = mock(BillRepository.class);
        AccountManagementInvoiceController controller = new AccountManagementInvoiceController(
                companies,
                clientCompanies,
                bills,
                mock(UserRepository.class),
                mock(InvoicePdfS3Service.class),
                mock(BillFolioPdfService.class));
        User tenantA = tenantAdmin(1L);
        Company platform = company(100L);
        platform.setName("Platform Admin");
        when(companies.findAll()).thenReturn(List.of(platform));
        ClientCompany linkedPayee = new ClientCompany();
        linkedPayee.setId(700L);
        linkedPayee.setOwnerCompany(platform);
        linkedPayee.setPlatformTenantCompany(tenantA.getCompany());
        when(clientCompanies.findAllLinkedPlatformPayees(100L, 1L)).thenReturn(List.of(linkedPayee));
        when(bills.findByIdAndCompanyIdAndRecipientCompanyIdSnapshotIn(eq(900L), eq(100L), any()))
                .thenReturn(Optional.empty());

        assertNotFound(() -> controller.receivedInvoicePdf(900L, false, tenantA));
        verify(bills).findByIdAndCompanyIdAndRecipientCompanyIdSnapshotIn(
                eq(900L),
                eq(100L),
                argThat(ids -> ids.size() == 1 && ids.contains(700L)));
    }

    private static ClientController clientController(
            ClientRepository clients,
            ClientFileRepository clientFiles,
            TenantFileS3Service fileStorage,
            GuestEntitlementRepository entitlements,
            GuestOrderService guestOrderService
    ) {
        return new ClientController(
                clients,
                mock(UserRepository.class),
                mock(SessionBookingRepository.class),
                mock(ClientAnonymizationService.class),
                mock(ClientCompanyRepository.class),
                clientFiles,
                fileStorage,
                entitlements,
                mock(GuestEntitlementUsageRepository.class),
                mock(GuestEntitlementService.class),
                mock(GuestTenantLinkRepository.class),
                guestOrderService,
                mock(ClientRemovalGuard.class));
    }

    private static BillingController billingController(
            BillRepository bills,
            OpenBillRepository openBills,
            InvoicePdfS3Service invoiceStorage,
            BillFolioPdfService billFolioPdfService
    ) {
        return new BillingController(
                mock(TransactionServiceRepository.class),
                mock(PaymentMethodRepository.class),
                bills,
                mock(AdvanceAllocationRepository.class),
                openBills,
                mock(SessionBookingRepository.class),
                mock(ClientRepository.class),
                mock(ClientCompanyRepository.class),
                mock(UserRepository.class),
                mock(AppSettingRepository.class),
                mock(FiscalizationService.class),
                mock(StripeBillingService.class),
                mock(BillingEmailService.class),
                billFolioPdfService,
                invoiceStorage,
                mock(FolioPdfService.class),
                mock(BankStatementReconciliationService.class),
                mock(ApplicationEventPublisher.class),
                mock(GuestOrderRepository.class),
                mock(InvoiceOrderIdService.class),
                mock(EntityManager.class),
                mock(GlobalPaymentProviderService.class),
                mock(BillingModuleAccessService.class),
                new com.example.app.common.TimeService(new com.example.app.common.SimulatedTimeService(null, null, null, new com.fasterxml.jackson.databind.ObjectMapper())));
    }

    private static User tenantAdmin(Long companyId) {
        User user = new User();
        user.setId(companyId * 10);
        user.setFirstName("Tenant");
        user.setLastName("Admin");
        user.setEmail("admin" + companyId + "@example.com");
        user.setRole(Role.ADMIN);
        user.setCompany(company(companyId));
        return user;
    }

    private static Company company(Long id) {
        Company company = new Company();
        company.setId(id);
        company.setName("Tenant " + id);
        return company;
    }

    private static Client client(Long id, Company company) {
        Client client = new Client();
        client.setId(id);
        client.setCompany(company);
        client.setFirstName("Client");
        client.setLastName(String.valueOf(id));
        client.setEmail("client" + id + "@example.com");
        return client;
    }

    private static void assertNotFound(ThrowingAction action) {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class, action::run);
        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
    }

    @FunctionalInterface
    private interface ThrowingAction {
        void run();
    }
}
