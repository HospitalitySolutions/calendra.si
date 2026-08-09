package com.example.app.guest.notifications;

import com.example.app.billing.Bill;
import com.example.app.client.Client;
import com.example.app.company.Company;
import com.example.app.delivery.MessageDeliveryChannel;
import com.example.app.delivery.MessageDeliveryLogService;
import com.example.app.guest.common.GuestDtos;
import com.example.app.guest.common.GuestMapper;
import com.example.app.location.LocationPublicPresentationService;
import com.example.app.guest.model.*;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionServiceSupport;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
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
    private final AppSettingRepository appSettings;

    @Autowired(required = false)
    private MessageDeliveryLogService deliveryLogs;

    @Autowired(required = false)
    private LocationPublicPresentationService locationPresentationService;

    @Autowired
    public GuestNotificationService(
            GuestNotificationRepository notifications,
            GuestTenantLinkRepository tenantLinks,
            GuestPushService guestPushService,
            AppSettingRepository appSettings
    ) {
        this.notifications = notifications;
        this.tenantLinks = tenantLinks;
        this.guestPushService = guestPushService;
        this.appSettings = appSettings;
    }

    /** Backwards-compatible constructor used by older unit tests. */
    public GuestNotificationService(
            GuestNotificationRepository notifications,
            GuestTenantLinkRepository tenantLinks
    ) {
        this(notifications, tenantLinks, null, null);
    }

    @Transactional
    public GuestNotification create(GuestUser guestUser, Company company, Client client, GuestNotificationType type, String title, String body, String payloadJson) {
        if (!guestAppNotificationsEnabled(company)) {
            return null;
        }
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


    private boolean guestAppNotificationsEnabled(Company company) {
        Long companyId = company == null ? null : company.getId();
        if (appSettings == null || companyId == null) return true;
        return booleanSetting(companyId, SettingKey.NOTIFICATIONS_ENABLED, true)
                && booleanSetting(companyId, SettingKey.NOTIFICATIONS_GUEST_APP_ALERTS_ENABLED, true);
    }

    private boolean booleanSetting(Long companyId, SettingKey key, boolean fallback) {
        return appSettings.findByCompanyIdAndKey(companyId, key)
                .map(AppSetting::getValue)
                .map(String::trim)
                .map(value -> {
                    if (value.equalsIgnoreCase("true")) return true;
                    if (value.equalsIgnoreCase("false")) return false;
                    return fallback;
                })
                .orElse(fallback);
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
        Map<String, Object> eventPayload = new LinkedHashMap<>();
        eventPayload.put("event", "booking_confirmed");
        if (booking != null && booking.getId() != null) eventPayload.put("bookingId", booking.getId());
        addLocationPayload(eventPayload, booking == null ? null : booking.getLocation());
        create(guestUser, company, client, GuestNotificationType.BOOKING_CONFIRMED,
                "Booking confirmed",
                "Your booking for " + SessionServiceSupport.serviceSummary(booking) + " is confirmed.",
                payload(eventPayload));
    }

    public void paymentPending(GuestUser guestUser, Company company, Client client, String title, String body) {
        create(guestUser, company, client, GuestNotificationType.PAYMENT_PENDING, title, body, null);
    }

    public PaymentNotificationContext paymentContext(GuestOrder order) {
        if (order == null) return null;
        Long locationId = order.getLocation() == null ? null : order.getLocation().getId();
        String locationName = null;
        if (order.getLocation() != null) {
            locationName = order.getLocation().getName();
            if (locationPresentationService != null) {
                try {
                    var presentation = locationPresentationService.resolve(order.getLocation());
                    if (presentation != null && presentation.publicName() != null && !presentation.publicName().isBlank()) {
                        locationName = presentation.publicName();
                    }
                } catch (RuntimeException ignored) {
                    // Notification context must not make checkout fail; fall back to the operational location name.
                }
            }
        }
        return new PaymentNotificationContext(
                order.getGuestUser(),
                order.getCompany(),
                order.getClient(),
                order.getId(),
                locationId,
                locationName
        );
    }

    public void paymentPending(PaymentNotificationContext context, String title, String body) {
        if (context == null) return;
        Map<String, Object> eventPayload = new LinkedHashMap<>();
        eventPayload.put("event", "payment_pending");
        if (context.orderId() != null) eventPayload.put("orderId", context.orderId());
        if (context.locationId() != null) eventPayload.put("locationId", context.locationId());
        if (context.locationName() != null && !context.locationName().isBlank()) {
            eventPayload.put("locationName", context.locationName());
        }
        create(context.guestUser(), context.company(), context.client(), GuestNotificationType.PAYMENT_PENDING, title, body, payload(eventPayload));
    }

    public void paymentPending(GuestOrder order, String title, String body) {
        paymentPending(paymentContext(order), title, body);
    }

    public void paymentConfirmed(GuestUser guestUser, Company company, Client client, String title, String body) {
        create(guestUser, company, client, GuestNotificationType.PAYMENT_CONFIRMED, title, body, null);
    }

    public void paymentConfirmed(GuestOrder order, String title, String body) {
        if (order == null) return;
        Map<String, Object> eventPayload = new LinkedHashMap<>();
        eventPayload.put("event", "payment_confirmed");
        if (order.getId() != null) eventPayload.put("orderId", order.getId());
        addLocationPayload(eventPayload, order.getLocation());
        create(order.getGuestUser(), order.getCompany(), order.getClient(), GuestNotificationType.PAYMENT_CONFIRMED, title, body, payload(eventPayload));
    }

    public void guestMessage(GuestUser guestUser, Company company, Client client, String title, String body, String payloadJson) {
        create(guestUser, company, client, GuestNotificationType.GUEST_MESSAGE, title, body, payloadJson);
    }

    /** Creates a bell notification when tenant staff changes a booking without changing its time. */
    @Transactional
    public GuestNotification webBookingUpdated(SessionBooking booking) {
        if (booking == null || booking.getClient() == null || booking.getClient().isAnonymized()) return null;
        String serviceName = SessionServiceSupport.serviceSummary(booking);
        String title = "Booking updated";
        String body = "Your booking for " + serviceName + " has been updated.";
        GuestNotification created = createForClient(
                booking.getCompany(),
                booking.getClient(),
                GuestNotificationType.BOOKING_UPDATED,
                title,
                body,
                bookingPayload("booking_updated", booking)
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
                invoicePayload(bill)
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
                if (notification.getPayloadJson() != null && !notification.getPayloadJson().isBlank()) {
                    try {
                        var payloadNode = JSON.readTree(notification.getPayloadJson());
                        String locationId = payloadNode.path("locationId").asText("").trim();
                        if (!locationId.isBlank()) extra.put("locationId", locationId);
                    } catch (Exception ignored) {
                        // Push metadata is best-effort; the persisted notification remains authoritative.
                    }
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

    public record PaymentNotificationContext(
            GuestUser guestUser,
            Company company,
            Client client,
            Long orderId,
            Long locationId,
            String locationName
    ) {}

    private String bookingPayload(String event, SessionBooking booking) {
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("event", event);
        if (booking != null && booking.getId() != null) values.put("bookingId", booking.getId());
        addLocationPayload(values, booking == null ? null : booking.getLocation());
        return payload(values);
    }

    private String invoicePayload(Bill bill) {
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("event", "invoice_created");
        if (bill != null && bill.getId() != null) values.put("billId", bill.getId());
        values.put("billNumber", bill == null || bill.getBillNumber() == null ? "" : bill.getBillNumber());
        values.put("orderId", bill == null || bill.getOrderId() == null ? "" : bill.getOrderId());
        addLocationPayload(values, bill == null ? null : bill.getLocation());
        return payload(values);
    }

    private void addLocationPayload(Map<String, Object> values, com.example.app.location.Location location) {
        if (values == null || location == null || location.getId() == null) return;
        values.put("locationId", location.getId());
        String name = location.getName();
        if (locationPresentationService != null) {
            try {
                var presentation = locationPresentationService.resolve(location);
                if (presentation != null && presentation.publicName() != null && !presentation.publicName().isBlank()) {
                    name = presentation.publicName();
                }
            } catch (Exception ignored) {
                // Payload still contains the immutable location ID and internal name fallback.
            }
        }
        if (name != null && !name.isBlank()) values.put("locationName", name.trim());
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
