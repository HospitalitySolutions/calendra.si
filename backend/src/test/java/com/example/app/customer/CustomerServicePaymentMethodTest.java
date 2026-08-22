package com.example.app.customer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.example.app.company.Company;
import com.example.app.guest.common.GuestSettingsService;
import com.example.app.guest.model.GuestEntitlementRepository;
import com.example.app.guest.model.GuestLocationSubscriptionRepository;
import com.example.app.guest.model.GuestNotificationRepository;
import com.example.app.guest.model.GuestOrder;
import com.example.app.guest.model.GuestOrderRepository;
import com.example.app.guest.model.GuestPaymentMethodType;
import com.example.app.guest.model.GuestTenantLinkRepository;
import com.example.app.guest.model.GuestTenantLinkStatus;
import com.example.app.guest.model.GuestUser;
import com.example.app.guest.model.OrderStatus;
import com.example.app.guest.order.GuestEntitlementService;
import com.example.app.inbox.ClientMessageService;
import com.example.app.location.LocationPublicPresentationService;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingRepository;
import com.example.app.settings.EntitlementsModuleAccessService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class CustomerServicePaymentMethodTest {

    @Test
    void booking_exposesPayAtVenueSeparatelyFromInternalPaidStatus() {
        SessionBookingRepository bookings = mock(SessionBookingRepository.class);
        GuestOrderRepository orders = mock(GuestOrderRepository.class);
        GuestSettingsService settings = mock(GuestSettingsService.class);
        CustomerService service = new CustomerService(
                bookings,
                mock(GuestEntitlementRepository.class),
                orders,
                mock(GuestNotificationRepository.class),
                mock(GuestTenantLinkRepository.class),
                mock(GuestLocationSubscriptionRepository.class),
                mock(GuestEntitlementService.class),
                mock(EntitlementsModuleAccessService.class),
                mock(ClientMessageService.class),
                settings,
                mock(LocationPublicPresentationService.class)
        );

        Company company = new Company();
        company.setId(10L);
        company.setName("Test provider");

        SessionBooking booking = new SessionBooking();
        booking.setId(55L);
        booking.setCompany(company);
        booking.setStartTime(LocalDateTime.of(2026, 8, 23, 10, 0));
        booking.setEndTime(LocalDateTime.of(2026, 8, 23, 10, 30));
        booking.setSourceOrderId("99");

        GuestOrder order = new GuestOrder();
        order.setId(99L);
        order.setStatus(OrderStatus.PAID);
        order.setPaymentMethodType(GuestPaymentMethodType.PAY_AT_VENUE);

        GuestUser guest = new GuestUser();
        guest.setId(7L);

        when(bookings.findCustomerBookingById(eq(55L), eq(7L), eq(GuestTenantLinkStatus.ACTIVE)))
                .thenReturn(Optional.of(booking));
        when(orders.findAllById(any())).thenReturn(List.of(order));
        when(settings.publicSettings(10L)).thenReturn(new GuestSettingsService.GuestPublicSettings(
                true, null, null, null, "Test provider", "sl", false, false,
                false, true, null, null, null, null, true, true, false
        ));

        CustomerDtos.BookingResponse response = service.booking(guest, 55L);

        assertThat(response.paymentStatus()).isEqualTo("PAID");
        assertThat(response.paymentMethodType()).isEqualTo("PAY_AT_VENUE");
    }
}
