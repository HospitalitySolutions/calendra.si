package com.example.app.guest.notifications;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.example.app.client.Client;
import com.example.app.company.Company;
import com.example.app.guest.model.GuestNotification;
import com.example.app.guest.model.GuestNotificationRepository;
import com.example.app.guest.model.GuestOrder;
import com.example.app.guest.model.GuestTenantLinkRepository;
import com.example.app.guest.model.GuestUser;
import com.example.app.location.Location;
import org.junit.jupiter.api.Test;

class GuestNotificationOrderLocationTest {

    @Test
    void paymentNotificationPayloadCarriesImmutableOrderLocation() {
        GuestNotificationRepository notifications = mock(GuestNotificationRepository.class);
        when(notifications.save(any(GuestNotification.class))).thenAnswer(invocation -> invocation.getArgument(0));
        GuestNotificationService service = new GuestNotificationService(
                notifications,
                mock(GuestTenantLinkRepository.class)
        );

        Company company = new Company();
        company.setId(1L);
        Client client = new Client();
        client.setId(3L);
        GuestUser guestUser = new GuestUser();
        guestUser.setId(4L);
        Location location = new Location();
        location.setId(12L);
        location.setName("Maribor Center");
        location.setCompany(company);

        GuestOrder order = new GuestOrder();
        order.setId(99L);
        order.setCompany(company);
        order.setClient(client);
        order.setGuestUser(guestUser);
        order.setLocation(location);

        service.paymentConfirmed(order, "Payment confirmed", "Payment received.");

        var captor = org.mockito.ArgumentCaptor.forClass(GuestNotification.class);
        org.mockito.Mockito.verify(notifications).save(captor.capture());
        GuestNotification saved = captor.getValue();
        assertThat(saved.getPayloadJson()).contains("\"orderId\":99");
        assertThat(saved.getPayloadJson()).contains("\"locationId\":12");
        assertThat(saved.getPayloadJson()).contains("\"locationName\":\"Maribor Center\"");
    }
}
