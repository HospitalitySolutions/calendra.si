package com.example.app.guest.order;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.app.client.Client;
import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.guest.catalog.GuestCatalogService;
import com.example.app.guest.common.GuestDtos;
import com.example.app.guest.common.GuestSettingsService;
import com.example.app.guest.model.GuestEntitlementRepository;
import com.example.app.guest.model.GuestEntitlementUsageRepository;
import com.example.app.guest.model.GuestOrder;
import com.example.app.guest.model.GuestOrderRepository;
import com.example.app.guest.model.GuestTenantLink;
import com.example.app.guest.model.GuestUser;
import com.example.app.guest.notifications.GuestNotificationService;
import com.example.app.guest.tenant.GuestTenantService;
import com.example.app.paypal.PayPalClient;
import com.example.app.reminder.ReminderService;
import com.example.app.session.BookingChangePublisher;
import com.example.app.session.SessionBookingCreationService;
import com.example.app.session.SessionBookingRepository;
import com.example.app.user.UserRepository;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import com.example.app.billing.PaymentMethodRepository;
import com.example.app.guest.model.GuestPaymentMethodType;

class GuestOrderServicePaymentRulesTest {

    @Test
    void createOrder_rejectsPayAtVenueWhenOnlinePaymentRequired() {
        Fixture fixture = fixtureWithRules(true);

        assertThatThrownBy(() -> fixture.service.createOrder(
                fixture.guestUser,
                new GuestDtos.CreateOrderRequest("10", "product-1", fixture.slotId, GuestPaymentMethodType.PAY_AT_VENUE.name()),
                GuestOrderService.PaymentChannel.GUEST))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies((ex) -> {
                    ResponseStatusException rse = (ResponseStatusException) ex;
                    org.assertj.core.api.Assertions.assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                    org.assertj.core.api.Assertions.assertThat(rse.getReason()).isEqualTo("This tenant requires online payment for bookings.");
                });
    }

    @Test
    void createOrder_rejectsOnlinePaymentWhenPayAtVenueModeIsActive() {
        Fixture fixture = fixtureWithRules(false);

        assertThatThrownBy(() -> fixture.service.createOrder(
                fixture.guestUser,
                new GuestDtos.CreateOrderRequest("10", "product-1", fixture.slotId, GuestPaymentMethodType.CARD.name()),
                GuestOrderService.PaymentChannel.GUEST))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies((ex) -> {
                    ResponseStatusException rse = (ResponseStatusException) ex;
                    org.assertj.core.api.Assertions.assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                    org.assertj.core.api.Assertions.assertThat(rse.getReason()).isEqualTo("Use pay at venue to complete this booking without online payment.");
                });
    }

    @Test
    void createOrder_allowsPayAtVenueWhenOnlinePaymentIsNotRequired() {
        Fixture fixture = fixtureWithRules(false);
        when(fixture.orders.save(any(GuestOrder.class))).thenAnswer(invocation -> {
            GuestOrder order = invocation.getArgument(0);
            order.setId(99L);
            return order;
        });

        fixture.service.createOrder(
                fixture.guestUser,
                new GuestDtos.CreateOrderRequest("10", "product-1", fixture.slotId, GuestPaymentMethodType.PAY_AT_VENUE.name()),
                GuestOrderService.PaymentChannel.GUEST
        );

        verify(fixture.orders).save(any(GuestOrder.class));
    }

    private Fixture fixtureWithRules(boolean requireOnlinePayment) {
        return fixtureWith(
                requireOnlinePayment,
                List.of("CARD", "BANK_TRANSFER", "PAYPAL", "GIFT_CARD"),
                requireOnlinePayment ? "full" : "none",
                20,
                "SESSION_SINGLE",
                BigDecimal.valueOf(49)
        );
    }

    private Fixture fixtureWith(boolean requireOnlinePayment, List<String> acceptedPaymentMethods) {
        return fixtureWith(
                requireOnlinePayment,
                acceptedPaymentMethods,
                requireOnlinePayment ? "full" : "none",
                20,
                "SESSION_SINGLE",
                BigDecimal.valueOf(49)
        );
    }

    private Fixture fixtureWith(
            boolean requireOnlinePayment,
            List<String> acceptedPaymentMethods,
            String paymentRequirement,
            int depositPercent,
            String productType,
            BigDecimal priceGross
    ) {
        GuestTenantService tenantService = mock(GuestTenantService.class);
        GuestCatalogService catalogService = mock(GuestCatalogService.class);
        GuestSettingsService settingsService = mock(GuestSettingsService.class);
        CompanyRepository companies = mock(CompanyRepository.class);
        GuestOrderRepository orders = mock(GuestOrderRepository.class);
        GuestEntitlementRepository entitlements = mock(GuestEntitlementRepository.class);
        GuestEntitlementUsageRepository entitlementUsages = mock(GuestEntitlementUsageRepository.class);
        SessionBookingRepository bookings = mock(SessionBookingRepository.class);
        SessionBookingCreationService bookingCreationService = mock(SessionBookingCreationService.class);
        BookingChangePublisher bookingChangePublisher = mock(BookingChangePublisher.class);
        UserRepository users = mock(UserRepository.class);
        PaymentMethodRepository paymentMethods = mock(PaymentMethodRepository.class);
        GuestNotificationService notifications = mock(GuestNotificationService.class);
        ReminderService reminders = mock(ReminderService.class);
        GuestEntitlementService entitlementService = mock(GuestEntitlementService.class);
        GuestBankTransferBillingService bankTransferBillingService = mock(GuestBankTransferBillingService.class);
        GuestProductBillingService productBillingService = mock(GuestProductBillingService.class);
        PayPalClient payPalClient = mock(PayPalClient.class);

        GuestOrderService service = new GuestOrderService(
                tenantService,
                catalogService,
                settingsService,
                companies,
                orders,
                entitlements,
                entitlementUsages,
                bookings,
                bookingCreationService,
                bookingChangePublisher,
                users,
                paymentMethods,
                notifications,
                reminders,
                entitlementService,
                bankTransferBillingService,
                productBillingService,
                payPalClient
        );
        when(orders.save(any(GuestOrder.class))).thenAnswer(invocation -> {
            GuestOrder order = invocation.getArgument(0);
            if (order.getId() == null) {
                order.setId(99L);
            }
            return order;
        });

        when(settingsService.acceptedPaymentMethods(any(Long.class))).thenReturn(acceptedPaymentMethods);
        // Default: PayPal merchant configured, PayPal method present.
        // guestEnabled is intentionally false to verify guest channel no longer depends on it.
        Company defaultCompany = new Company();
        defaultCompany.setId(10L);
        defaultCompany.setPaypalMerchantId("PAYPAL_MERCHANT_ABC");
        when(companies.findById(10L)).thenReturn(java.util.Optional.of(defaultCompany));
        com.example.app.billing.PaymentMethod paypalMethod = mock(com.example.app.billing.PaymentMethod.class);
        when(paypalMethod.getPaymentType()).thenReturn(com.example.app.billing.PaymentType.OTHER);
        when(paypalMethod.isGuestEnabled()).thenReturn(false);
        when(paypalMethod.isWidgetEnabled()).thenReturn(true);
        when(paymentMethods.findAllByCompanyIdOrderByNameAsc(10L)).thenReturn(List.of(paypalMethod));

        GuestUser guestUser = new GuestUser();
        guestUser.setId(1L);
        Company company = new Company();
        company.setId(10L);
        Client client = new Client();
        client.setId(100L);
        GuestTenantLink link = new GuestTenantLink();
        link.setGuestUser(guestUser);
        link.setCompany(company);
        link.setClient(client);

        when(tenantService.requireLink(guestUser, 10L)).thenReturn(link);
        when(catalogService.resolveProduct(10L, "product-1")).thenReturn(
                new GuestCatalogService.ResolvedProduct(
                        null,
                        null,
                        "Service",
                        productType,
                        priceGross,
                        "EUR",
                        true
                )
        );
        when(catalogService.bookingRules(10L)).thenReturn(
                new GuestSettingsService.GuestBookingRules(
                        24,
                        12,
                        true,
                        true,
                        false,
                        false,
                        List.of(),
                        List.of(),
                        List.of(),
                        requireOnlinePayment,
                        paymentRequirement,
                        depositPercent
                )
        );

        return new Fixture(service, orders, guestUser, companies, paymentMethods, "11|2026-06-01T10:00:00|2026-06-01T11:00:00");
    }

    @Test
    void createOrder_rejectsCardWhenNotInAcceptedMethods() {
        Fixture fixture = fixtureWith(true, List.of("BANK_TRANSFER", "PAYPAL"));

        assertThatThrownBy(() -> fixture.service.createOrder(
                fixture.guestUser,
                new GuestDtos.CreateOrderRequest("10", "product-1", fixture.slotId, GuestPaymentMethodType.CARD.name()),
                GuestOrderService.PaymentChannel.GUEST))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies((ex) -> {
                    ResponseStatusException rse = (ResponseStatusException) ex;
                    org.assertj.core.api.Assertions.assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                    org.assertj.core.api.Assertions.assertThat(rse.getReason()).isEqualTo("This payment method is not enabled for this tenant.");
                });
    }

    @Test
    void createOrder_allowsGiftCardWhenAccepted() {
        Fixture fixture = fixtureWith(true, List.of("BANK_TRANSFER", "GIFT_CARD"));
        when(fixture.orders.save(any(GuestOrder.class))).thenAnswer(invocation -> {
            GuestOrder order = invocation.getArgument(0);
            order.setId(99L);
            return order;
        });

        fixture.service.createOrder(
                fixture.guestUser,
                new GuestDtos.CreateOrderRequest("10", "product-1", fixture.slotId, GuestPaymentMethodType.GIFT_CARD.name()),
                GuestOrderService.PaymentChannel.GUEST
        );

        verify(fixture.orders).save(any(GuestOrder.class));
    }

    @Test
    void createOrder_allowsPaypalWhenAcceptedAndMerchantConfigured() {
        Fixture fixture = fixtureWith(true, List.of("CARD", "PAYPAL"));
        when(fixture.orders.save(any(GuestOrder.class))).thenAnswer(invocation -> {
            GuestOrder order = invocation.getArgument(0);
            order.setId(99L);
            return order;
        });

        fixture.service.createOrder(
                fixture.guestUser,
                new GuestDtos.CreateOrderRequest("10", "product-1", fixture.slotId, GuestPaymentMethodType.PAYPAL.name()),
                GuestOrderService.PaymentChannel.GUEST
        );

        verify(fixture.orders).save(any(GuestOrder.class));
    }

    @Test
    void createOrder_rejectsWebsiteCheckoutWhenWidgetDisabled() {
        Fixture fixture = fixtureWith(true, List.of("PAYPAL"));
        com.example.app.billing.PaymentMethod paypalMethod = mock(com.example.app.billing.PaymentMethod.class);
        when(paypalMethod.getPaymentType()).thenReturn(com.example.app.billing.PaymentType.OTHER);
        when(paypalMethod.isWidgetEnabled()).thenReturn(false);
        when(fixture.paymentMethods.findAllByCompanyIdOrderByNameAsc(10L)).thenReturn(List.of(paypalMethod));

        assertThatThrownBy(() -> fixture.service.createOrder(
                fixture.guestUser,
                new GuestDtos.CreateOrderRequest("10", "product-1", fixture.slotId, GuestPaymentMethodType.PAYPAL.name()),
                GuestOrderService.PaymentChannel.WEBSITE))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies((ex) -> {
                    ResponseStatusException rse = (ResponseStatusException) ex;
                    org.assertj.core.api.Assertions.assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                    org.assertj.core.api.Assertions.assertThat(rse.getReason()).isEqualTo("PayPal is not enabled for the selected booking channel.");
                });
    }

    @Test
    void createOrder_usesDepositAmountForSessionWhenPartialPaymentEnabled() {
        Fixture fixture = fixtureWith(
                true,
                List.of("CARD"),
                "deposit",
                20,
                "SESSION_SINGLE",
                BigDecimal.valueOf(50)
        );
        com.example.app.billing.PaymentMethod cardMethod = mock(com.example.app.billing.PaymentMethod.class);
        when(cardMethod.getPaymentType()).thenReturn(com.example.app.billing.PaymentType.CARD);
        when(cardMethod.isStripeEnabled()).thenReturn(true);
        when(fixture.paymentMethods.findAllByCompanyIdOrderByNameAsc(10L)).thenReturn(List.of(cardMethod));

        var response = fixture.service.createOrder(
                fixture.guestUser,
                new GuestDtos.CreateOrderRequest("10", "product-1", fixture.slotId, GuestPaymentMethodType.CARD.name()),
                GuestOrderService.PaymentChannel.GUEST
        );

        assertThat(response.order().totalGross()).isEqualTo(10.0);
    }

    @Test
    void createOrder_usesFullAmountWhenPartialPaymentDisabled() {
        Fixture fixture = fixtureWith(
                true,
                List.of("CARD"),
                "full",
                20,
                "SESSION_SINGLE",
                BigDecimal.valueOf(50)
        );
        com.example.app.billing.PaymentMethod cardMethod = mock(com.example.app.billing.PaymentMethod.class);
        when(cardMethod.getPaymentType()).thenReturn(com.example.app.billing.PaymentType.CARD);
        when(cardMethod.isStripeEnabled()).thenReturn(true);
        when(fixture.paymentMethods.findAllByCompanyIdOrderByNameAsc(10L)).thenReturn(List.of(cardMethod));

        var response = fixture.service.createOrder(
                fixture.guestUser,
                new GuestDtos.CreateOrderRequest("10", "product-1", fixture.slotId, GuestPaymentMethodType.CARD.name()),
                GuestOrderService.PaymentChannel.GUEST
        );

        assertThat(response.order().totalGross()).isEqualTo(50.0);
    }

    @Test
    void createOrder_keepsFullAmountForNonSessionProducts() {
        Fixture fixture = fixtureWith(
                true,
                List.of("CARD"),
                "deposit",
                20,
                "PACK",
                BigDecimal.valueOf(80)
        );
        com.example.app.billing.PaymentMethod cardMethod = mock(com.example.app.billing.PaymentMethod.class);
        when(cardMethod.getPaymentType()).thenReturn(com.example.app.billing.PaymentType.CARD);
        when(cardMethod.isStripeEnabled()).thenReturn(true);
        when(fixture.paymentMethods.findAllByCompanyIdOrderByNameAsc(10L)).thenReturn(List.of(cardMethod));

        var response = fixture.service.createOrder(
                fixture.guestUser,
                new GuestDtos.CreateOrderRequest("10", "product-1", fixture.slotId, GuestPaymentMethodType.CARD.name()),
                GuestOrderService.PaymentChannel.GUEST
        );

        assertThat(response.order().totalGross()).isEqualTo(80.0);
    }

    private record Fixture(
            GuestOrderService service,
            GuestOrderRepository orders,
            GuestUser guestUser,
            CompanyRepository companies,
            PaymentMethodRepository paymentMethods,
            String slotId
    ) {}
}
