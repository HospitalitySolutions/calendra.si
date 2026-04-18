package com.example.app.guest.notifications;

import com.example.app.client.Client;
import com.example.app.company.Company;
import com.example.app.guest.common.GuestDtos;
import com.example.app.guest.common.GuestMapper;
import com.example.app.guest.model.*;
import com.example.app.session.SessionBooking;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class GuestNotificationService {
    private final GuestNotificationRepository notifications;

    public GuestNotificationService(GuestNotificationRepository notifications) {
        this.notifications = notifications;
    }

    @Transactional
    public GuestNotification create(GuestUser guestUser, Company company, Client client, GuestNotificationType type, String title, String body, String payloadJson) {
        GuestNotification notification = new GuestNotification();
        notification.setGuestUser(guestUser);
        notification.setCompany(company);
        notification.setClient(client);
        notification.setNotificationType(type);
        notification.setTitle(title);
        notification.setBody(body);
        notification.setPayloadJson(payloadJson);
        return notifications.save(notification);
    }

    public void bookingConfirmed(GuestUser guestUser, Company company, Client client, SessionBooking booking) {
        create(guestUser, company, client, GuestNotificationType.BOOKING_CONFIRMED,
                "Booking confirmed",
                "Your booking for " + (booking.getType() == null ? "session" : booking.getType().getName()) + " is confirmed.",
                null);
    }

    public void paymentPending(GuestUser guestUser, Company company, Client client, String title, String body) {
        create(guestUser, company, client, GuestNotificationType.PAYMENT_PENDING, title, body, null);
    }

    public void paymentConfirmed(GuestUser guestUser, Company company, Client client, String title, String body) {
        create(guestUser, company, client, GuestNotificationType.PAYMENT_CONFIRMED, title, body, null);
    }

    @Transactional(readOnly = true)
    public GuestDtos.NotificationsResponse list(GuestUser guestUser, Long companyId) {
        return new GuestDtos.NotificationsResponse(
                notifications.findAllByGuestUserIdAndCompanyIdOrderByCreatedAtDesc(guestUser.getId(), companyId).stream()
                        .map(GuestMapper::toNotification)
                        .toList()
        );
    }

    @Transactional
    public GuestDtos.ReadNotificationResponse markRead(GuestUser guestUser, Long notificationId) {
        GuestNotification notification = notifications.findByIdAndGuestUserId(notificationId, guestUser.getId()).orElseThrow();
        notification.setReadAt(Instant.now());
        notification = notifications.save(notification);
        return new GuestDtos.ReadNotificationResponse(String.valueOf(notification.getId()), notification.getReadAt().toString());
    }

    @Transactional(readOnly = true)
    public List<GuestNotification> allForUserAndCompany(Long guestUserId, Long companyId) {
        return notifications.findAllByGuestUserIdAndCompanyIdOrderByCreatedAtDesc(guestUserId, companyId);
    }
}
