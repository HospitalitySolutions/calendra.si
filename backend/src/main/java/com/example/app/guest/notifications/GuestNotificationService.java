package com.example.app.guest.notifications;

import com.example.app.billing.Bill;
import com.example.app.client.Client;
import com.example.app.company.Company;
import com.example.app.delivery.MessageDeliveryChannel;
import com.example.app.delivery.MessageDeliveryLogService;
import com.example.app.guest.common.GuestDtos;
import com.example.app.guest.common.GuestMapper;
import com.example.app.guest.model.*;
import com.example.app.session.SessionBooking;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
public class GuestNotificationService {
    private static final ObjectMapper JSON = new ObjectMapper();

    private final GuestNotificationRepository notifications;
    private final GuestTenantLinkRepository tenantLinks;
    private final GuestPushService guestPushService;

    @Autowired(required = false)
    private MessageDeliveryLogService deliveryLogs;

    @Autowired
    public GuestNotificationService(
            GuestNotificationRepository notifications,
            GuestTenantLinkRepository tenantLinks,
            GuestPushService guestPushService
    ) {
        this.notifications = notifications;
        this.tenantLinks = tenantLinks;
        this.guestPushService = guestPushService;
    }

    /** Backwards-compatible constructor used by older unit tests. */
    public GuestNotificationService(
            GuestNotificationRepository notifications,
            GuestTenantLinkRepository tenantLinks
    ) {
        this(notifications, tenantLinks, null);
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
        GuestNotification saved = notifications.save(notification);
        logGuestAppNotification(saved, guestUser, company, client, type, title, body);
        return saved;
    }


    private void logGuestAppNotification(GuestNotification notification, GuestUser guestUser, Company company, Client client, GuestNotificationType type, String title, String body) {
        if (deliveryLogs == null || notification == null || company == null) return;
        deliveryLogs.sent(
                company,
                client,
                guestUser,
                MessageDeliveryChannel.GUEST_APP,
                type == null ? "GUEST_APP_NOTIFICATION" : type.name(),
                guestUser == null ? null : guestUser.getEmail(),
                title,
                body,
                "guest_notification",
                notification.getId()
        );
    }

    /**
     * Resolves the guest user for the company+client pairing (active tenant link) and records a notification.
     * Returns null when the client is not linked to the guest mobile app.
     */
    @Transactional
    public GuestNotification createForClient(Company company, Client client, GuestNotificationType type, String title, String body, String payloadJson) {
        if (company == null || client == null) return null;
        GuestTenantLink link = tenantLinks.findFirstByCompanyIdAndClientIdAndStatusOrderByUpdatedAtDesc(
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

    /** Creates a bell notification when tenant staff changes a booking without changing its time. */
    @Transactional
    public GuestNotification webBookingUpdated(SessionBooking booking) {
        if (booking == null || booking.getClient() == null || booking.getClient().isAnonymized()) return null;
        String serviceName = booking.getType() == null || booking.getType().getName() == null || booking.getType().getName().isBlank()
                ? "session"
                : booking.getType().getName();
        String title = "Booking updated";
        String body = "Your booking for " + serviceName + " has been updated.";
        GuestNotification created = createForClient(
                booking.getCompany(),
                booking.getClient(),
                GuestNotificationType.BOOKING_UPDATED,
                title,
                body,
                payload(Map.of(
                        "event", "booking_updated",
                        "bookingId", booking.getId() == null ? "" : String.valueOf(booking.getId())
                ))
        );
        sendBellPush(created, title, body, "booking_updated");
        return created;
    }

    /** Creates a bell notification when tenant staff adds a wallet entitlement for a guest. */
    @Transactional
    public GuestNotification webEntitlementAdded(GuestEntitlement entitlement) {
        if (entitlement == null || entitlement.getClient() == null) return null;
        String productName = productName(entitlement);
        String title = "Entitlement added";
        String body = productName + " was added to your wallet.";
        GuestNotification created = createForClient(
                entitlement.getCompany(),
                entitlement.getClient(),
                GuestNotificationType.ENTITLEMENT_ADDED,
                title,
                body,
                payload(Map.of(
                        "event", "entitlement_added",
                        "entitlementId", entitlement.getId() == null ? "" : String.valueOf(entitlement.getId())
                ))
        );
        sendBellPush(created, title, body, "entitlement_added");
        return created;
    }

    /** Creates a bell notification when tenant staff removes/cancels a wallet entitlement for a guest. */
    @Transactional
    public GuestNotification webEntitlementRemoved(GuestEntitlement entitlement) {
        if (entitlement == null || entitlement.getClient() == null) return null;
        String productName = productName(entitlement);
        String title = "Entitlement removed";
        String body = productName + " was removed from your wallet.";
        GuestNotification created = createForClient(
                entitlement.getCompany(),
                entitlement.getClient(),
                GuestNotificationType.ENTITLEMENT_REMOVED,
                title,
                body,
                payload(Map.of(
                        "event", "entitlement_removed",
                        "entitlementId", entitlement.getId() == null ? "" : String.valueOf(entitlement.getId())
                ))
        );
        sendBellPush(created, title, body, "entitlement_removed");
        return created;
    }

    /** Creates a bell notification when tenant staff creates an invoice for a linked guest client. */
    @Transactional
    public GuestNotification webInvoiceCreated(Bill bill) {
        if (bill == null || bill.getClient() == null) return null;
        String invoiceRef = firstNonBlank(bill.getOrderId(), bill.getBillNumber(), bill.getId() == null ? null : String.valueOf(bill.getId()));
        String title = "Invoice created";
        String body = invoiceRef == null || invoiceRef.isBlank()
                ? "A new invoice is available."
                : "A new invoice " + invoiceRef + " is available.";
        GuestNotification created = createForClient(
                bill.getCompany(),
                bill.getClient(),
                GuestNotificationType.INVOICE_CREATED,
                title,
                body,
                payload(Map.of(
                        "event", "invoice_created",
                        "billId", bill.getId() == null ? "" : String.valueOf(bill.getId()),
                        "billNumber", bill.getBillNumber() == null ? "" : bill.getBillNumber(),
                        "orderId", bill.getOrderId() == null ? "" : bill.getOrderId()
                ))
        );
        sendBellPush(created, title, body, "invoice_created");
        return created;
    }

    @Transactional(readOnly = true)
    public GuestDtos.NotificationsResponse list(GuestUser guestUser, Long companyId) {
        return list(guestUser, companyId, 0, 100);
    }

    @Transactional(readOnly = true)
    public GuestDtos.NotificationsResponse list(GuestUser guestUser, Long companyId, int page, int size) {
        return new GuestDtos.NotificationsResponse(
                notifications.findAllByGuestUserIdAndCompanyIdOrderByCreatedAtDesc(
                                guestUser.getId(),
                                companyId,
                                PageRequest.of(safePage(page), safeSize(size, 100, 200))
                        ).stream()
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
        int updated = notifications.markAllUnreadAsRead(guestUser.getId(), companyId, Instant.now());
        return new GuestDtos.MarkAllReadResponse(updated);
    }

    @Transactional(readOnly = true)
    public List<GuestNotification> allForUserAndCompany(Long guestUserId, Long companyId) {
        return notifications.findAllByGuestUserIdAndCompanyIdOrderByCreatedAtDesc(
                guestUserId,
                companyId,
                PageRequest.of(0, 200)
        );
    }

    private void sendBellPush(GuestNotification notification, String title, String body, String event) {
        if (guestPushService == null || notification == null || notification.getGuestUser() == null) return;
        Runnable send = () -> {
            try {
                Map<String, String> extra = new LinkedHashMap<>();
                extra.put("event", event);
                if (notification.getId() != null) {
                    extra.put("notificationId", String.valueOf(notification.getId()));
                }
                if (notification.getNotificationType() != null) {
                    extra.put("notificationType", notification.getNotificationType().name());
                }
                guestPushService.notifyGuestReminder(
                        notification.getGuestUser(),
                        notification.getCompany(),
                        notification.getClient(),
                        title,
                        body,
                        extra
                );
            } catch (Exception ignored) {
                // The in-app bell notification is the source of truth; push delivery must not break the web action.
            }
        };
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    send.run();
                }
            });
            return;
        }
        send.run();
    }

    private static String payload(Map<String, ?> values) {
        try {
            return JSON.writeValueAsString(values);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static String productName(GuestEntitlement entitlement) {
        if (entitlement.getProduct() != null && entitlement.getProduct().getName() != null && !entitlement.getProduct().getName().isBlank()) {
            return entitlement.getProduct().getName();
        }
        return "Entitlement";
    }

    private static String firstNonBlank(String... values) {
        if (values == null) return null;
        for (String value : values) {
            if (value != null && !value.isBlank()) return value;
        }
        return null;
    }

    private static int safePage(int page) {
        return Math.max(0, page);
    }

    private static int safeSize(int size, int defaultSize, int maxSize) {
        if (size <= 0) return defaultSize;
        return Math.min(size, maxSize);
    }
}
