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
    private final GuestTenantLinkRepository tenantLinks;

    public GuestNotificationService(
            GuestNotificationRepository notifications,
            GuestTenantLinkRepository tenantLinks
    ) {
        this.notifications = notifications;
        this.tenantLinks = tenantLinks;
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

    /**
     * Resolves the guest user for the company+client pairing (active tenant link) and records a notification.
     * Returns null when the client is not linked to the guest mobile app.
     */
    @Transactional
    public GuestNotification createForClient(Company company, Client client, GuestNotificationType type, String title, String body, String payloadJson) {
        if (company == null || client == null) return null;
        GuestTenantLink link = tenantLinks.findByCompanyIdAndClientIdAndStatus(
                company.getId(), client.getId(), GuestTenantLinkStatus.ACTIVE
        ).orElse(null);
        if (link == null || link.getGuestUser() == null) return null;
        return create(link.getGuestUser(), company, client, type, title, body, payloadJson);
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

    public void guestMessage(GuestUser guestUser, Company company, Client client, String title, String body, String payloadJson) {
        create(guestUser, company, client, GuestNotificationType.GUEST_MESSAGE, title, body, payloadJson);
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

    @Transactional
    public GuestDtos.MarkAllReadResponse markAllRead(GuestUser guestUser, Long companyId) {
        List<GuestNotification> all = notifications.findAllByGuestUserIdAndCompanyIdOrderByCreatedAtDesc(guestUser.getId(), companyId);
        Instant now = Instant.now();
        int updated = 0;
        for (GuestNotification n : all) {
            if (n.getReadAt() == null) {
                n.setReadAt(now);
                notifications.save(n);
                updated++;
            }
        }
        return new GuestDtos.MarkAllReadResponse(updated);
    }

    @Transactional(readOnly = true)
    public List<GuestNotification> allForUserAndCompany(Long guestUserId, Long companyId) {
        return notifications.findAllByGuestUserIdAndCompanyIdOrderByCreatedAtDesc(guestUserId, companyId);
    }
}
