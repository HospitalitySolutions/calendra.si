package com.example.app.customer;

import com.example.app.company.Company;
import com.example.app.guest.common.GuestBookingViewSupport;
import com.example.app.guest.common.GuestDtos;
import com.example.app.guest.common.GuestMapper;
import com.example.app.guest.common.GuestSettingsService;
import com.example.app.guest.model.EntitlementStatus;
import com.example.app.guest.model.EntitlementType;
import com.example.app.guest.model.GuestEntitlement;
import com.example.app.guest.model.GuestEntitlementRepository;
import com.example.app.guest.model.GuestLocationSubscription;
import com.example.app.guest.model.GuestLocationSubscriptionRepository;
import com.example.app.guest.model.GuestNotification;
import com.example.app.guest.model.GuestNotificationRepository;
import com.example.app.guest.model.GuestOrder;
import com.example.app.guest.model.GuestOrderRepository;
import com.example.app.guest.model.GuestTenantLink;
import com.example.app.guest.model.GuestTenantLinkRepository;
import com.example.app.guest.model.GuestTenantLinkStatus;
import com.example.app.guest.model.GuestUser;
import com.example.app.guest.order.GuestEntitlementService;
import com.example.app.inbox.ClientMessageService;
import com.example.app.location.Location;
import com.example.app.location.LocationPublicPresentationService;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.SessionServiceSupport;
import com.example.app.settings.EntitlementsModuleAccessService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CustomerService {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final int MAX_PAGE_SIZE = 200;

    private final SessionBookingRepository bookings;
    private final GuestEntitlementRepository entitlements;
    private final GuestOrderRepository orders;
    private final GuestNotificationRepository notifications;
    private final GuestTenantLinkRepository tenantLinks;
    private final GuestLocationSubscriptionRepository locationSubscriptions;
    private final GuestEntitlementService entitlementService;
    private final EntitlementsModuleAccessService entitlementsModuleAccess;
    private final ClientMessageService messageService;
    private final GuestSettingsService settingsService;
    private final LocationPublicPresentationService presentations;

    public CustomerService(
            SessionBookingRepository bookings,
            GuestEntitlementRepository entitlements,
            GuestOrderRepository orders,
            GuestNotificationRepository notifications,
            GuestTenantLinkRepository tenantLinks,
            GuestLocationSubscriptionRepository locationSubscriptions,
            GuestEntitlementService entitlementService,
            EntitlementsModuleAccessService entitlementsModuleAccess,
            ClientMessageService messageService,
            GuestSettingsService settingsService,
            LocationPublicPresentationService presentations
    ) {
        this.bookings = bookings;
        this.entitlements = entitlements;
        this.orders = orders;
        this.notifications = notifications;
        this.tenantLinks = tenantLinks;
        this.locationSubscriptions = locationSubscriptions;
        this.entitlementService = entitlementService;
        this.entitlementsModuleAccess = entitlementsModuleAccess;
        this.messageService = messageService;
        this.settingsService = settingsService;
        this.presentations = presentations;
    }

    @Transactional(readOnly = true)
    public CustomerDtos.HomeResponse home(GuestUser guestUser) {
        List<SessionBooking> upcomingRows = bookings.findCustomerUpcomingBookings(
                guestUser.getId(), GuestTenantLinkStatus.ACTIVE, LocalDateTime.now(), PageRequest.of(0, 5));
        Map<Long, String> paymentStatuses = paymentStatuses(upcomingRows);
        List<CustomerDtos.BookingResponse> upcoming = upcomingRows.stream()
                .map(row -> toBooking(row, paymentStatuses.get(row.getId())))
                .toList();

        List<GuestEntitlement> entitlementRows = enabledEntitlements(
                entitlements.findCustomerEntitlements(
                        guestUser.getId(), GuestTenantLinkStatus.ACTIVE, EntitlementStatus.CANCELLED, PageRequest.of(0, 30)))
                .stream()
                .filter(row -> row.getStatus() == EntitlementStatus.ACTIVE || row.getStatus() == EntitlementStatus.PENDING)
                .limit(8)
                .toList();
        Map<Long, Integer> visitCounts = entitlementService.membershipVisitCounts(entitlementRows);
        List<CustomerDtos.WalletEntitlementResponse> active = entitlementRows.stream()
                .map(row -> toWalletEntitlement(row, visitCounts))
                .toList();

        List<CustomerDtos.ProviderResponse> recentProviders = recentProviders(guestUser, 6);
        long unreadNotificationCount = notifications.countByGuestUserIdAndReadAtIsNull(guestUser.getId());
        long unreadInboxCount = unreadInboxCount(guestUser);

        return new CustomerDtos.HomeResponse(
                upcoming.isEmpty() ? null : upcoming.get(0),
                upcoming,
                active,
                recentProviders,
                unreadNotificationCount,
                unreadInboxCount
        );
    }

    @Transactional(readOnly = true)
    public List<CustomerDtos.BookingResponse> bookings(GuestUser guestUser, String status, int page, int size) {
        int safePage = safePage(page);
        int safeSize = safeSize(size, 50);
        LocalDateTime now = LocalDateTime.now();
        List<SessionBooking> rows = switch (normalizeBookingStatus(status)) {
            case "past" -> bookings.findCustomerPastBookings(
                    guestUser.getId(), GuestTenantLinkStatus.ACTIVE, now, PageRequest.of(safePage, safeSize));
            case "cancelled" -> bookings.findCustomerCancelledBookings(
                    guestUser.getId(), GuestTenantLinkStatus.ACTIVE, PageRequest.of(safePage, safeSize));
            default -> bookings.findCustomerUpcomingBookings(
                    guestUser.getId(), GuestTenantLinkStatus.ACTIVE, now, PageRequest.of(safePage, safeSize));
        };
        Map<Long, String> paymentStatuses = paymentStatuses(rows);
        return rows.stream().map(row -> toBooking(row, paymentStatuses.get(row.getId()))).toList();
    }

    @Transactional(readOnly = true)
    public CustomerDtos.BookingResponse booking(GuestUser guestUser, Long bookingId) {
        SessionBooking row = bookings.findCustomerBookingById(
                        bookingId, guestUser.getId(), GuestTenantLinkStatus.ACTIVE)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Booking not found."));
        return toBooking(row, paymentStatuses(List.of(row)).get(row.getId()));
    }

    @Transactional(readOnly = true)
    public CustomerDtos.WalletResponse wallet(GuestUser guestUser, int page, int size) {
        int safePage = safePage(page);
        int safeSize = safeSize(size, 100);
        List<GuestEntitlement> entitlementRows = enabledEntitlements(
                entitlements.findCustomerEntitlements(
                        guestUser.getId(), GuestTenantLinkStatus.ACTIVE, EntitlementStatus.CANCELLED,
                        PageRequest.of(safePage, safeSize)));
        Map<Long, Integer> visitCounts = entitlementService.membershipVisitCounts(entitlementRows);

        List<CustomerDtos.WalletEntitlementResponse> entitlementViews = entitlementRows.stream()
                .map(row -> toWalletEntitlement(row, visitCounts))
                .toList();
        List<GuestOrder> orderRows = orders.findAllByGuestUserIdOrderByCreatedAtDesc(
                guestUser.getId(), PageRequest.of(safePage, safeSize));
        Map<Long, ProductMetadata> productByOrderId = loadProductMetadata(orderRows);
        List<CustomerDtos.WalletOrderResponse> orderViews = orderRows.stream()
                .map(order -> toWalletOrder(order, productByOrderId.get(order.getId())))
                .toList();
        return new CustomerDtos.WalletResponse(entitlementViews, orderViews);
    }

    @Transactional(readOnly = true)
    public CustomerDtos.NotificationsResponse notifications(GuestUser guestUser, int page, int size) {
        List<CustomerDtos.NotificationResponse> items = notifications.findAllByGuestUserIdOrderByCreatedAtDesc(
                        guestUser.getId(), PageRequest.of(safePage(page), safeSize(size, 100))).stream()
                .map(this::toNotification)
                .toList();
        return new CustomerDtos.NotificationsResponse(items, notifications.countByGuestUserIdAndReadAtIsNull(guestUser.getId()));
    }

    @Transactional
    public GuestDtos.ReadNotificationResponse markNotificationRead(GuestUser guestUser, Long notificationId) {
        GuestNotification row = notifications.findByIdAndGuestUserId(notificationId, guestUser.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Notification not found."));
        if (row.getReadAt() == null) {
            row.setReadAt(Instant.now());
            row = notifications.save(row);
        }
        return new GuestDtos.ReadNotificationResponse(String.valueOf(row.getId()), row.getReadAt().toString());
    }

    @Transactional
    public GuestDtos.MarkAllReadResponse markAllNotificationsRead(GuestUser guestUser) {
        int updated = notifications.markAllUnreadAsReadForGuest(guestUser.getId(), Instant.now());
        return new GuestDtos.MarkAllReadResponse(updated);
    }

    @Transactional(readOnly = true)
    public List<CustomerDtos.InboxThreadResponse> inboxThreads(GuestUser guestUser, int page, int size) {
        return aggregateInboxThreads(guestUser, safePage(page), safeSize(size, 100));
    }

    private long unreadInboxCount(GuestUser guestUser) {
        long unread = 0L;
        for (GuestTenantLink link : tenantLinks.findAllByGuestUserIdAndStatus(guestUser.getId(), GuestTenantLinkStatus.ACTIVE)) {
            Long companyId = link.getCompany().getId();
            GuestSettingsService.GuestPublicSettings settings = settingsService.publicSettings(companyId);
            if (!settings.inboxEnabled()) continue;
            try {
                unread += messageService.listGuestThreads(guestUser, companyId, 0, 500).stream()
                        .mapToLong(ClientMessageService.GuestThreadSummary::unreadCount)
                        .sum();
            } catch (ResponseStatusException ex) {
                if (!ex.getStatusCode().is4xxClientError()) throw ex;
            }
        }
        return unread;
    }

    private List<CustomerDtos.InboxThreadResponse> aggregateInboxThreads(GuestUser guestUser, int page, int size) {
        int requestedRows = Math.min(500, Math.max(size, (page + 1) * size));
        List<CustomerDtos.InboxThreadResponse> all = new ArrayList<>();
        for (GuestTenantLink link : tenantLinks.findAllByGuestUserIdAndStatus(guestUser.getId(), GuestTenantLinkStatus.ACTIVE)) {
            Long companyId = link.getCompany().getId();
            GuestSettingsService.GuestPublicSettings settings = settingsService.publicSettings(companyId);
            if (!settings.inboxEnabled()) continue;
            CustomerDtos.ProviderResponse provider = provider(link.getCompany(), null, settings);
            try {
                for (ClientMessageService.GuestThreadSummary thread : messageService.listGuestThreads(guestUser, companyId, 0, requestedRows)) {
                    all.add(new CustomerDtos.InboxThreadResponse(
                            provider,
                            thread.clientId(),
                            thread.threadKey(),
                            thread.clientFirstName(),
                            thread.clientLastName(),
                            thread.lastPreview(),
                            thread.lastSenderName(),
                            thread.lastSentAt() == null ? null : thread.lastSentAt().toString(),
                            thread.messageCount(),
                            thread.unreadCount()
                    ));
                }
            } catch (ResponseStatusException ex) {
                if (!ex.getStatusCode().is4xxClientError()) throw ex;
            }
        }
        all.sort(Comparator.comparing(
                (CustomerDtos.InboxThreadResponse row) -> row.lastSentAt() == null ? "" : row.lastSentAt())
                .reversed());
        int from = Math.min(page * size, all.size());
        int to = Math.min(from + size, all.size());
        return List.copyOf(all.subList(from, to));
    }

    private List<CustomerDtos.ProviderResponse> recentProviders(GuestUser guestUser, int limit) {
        List<GuestLocationSubscription> subscriptions = locationSubscriptions.findAllActiveForGuest(
                guestUser.getId(), GuestTenantLinkStatus.ACTIVE, GuestTenantLinkStatus.ACTIVE);
        Set<Long> seen = new LinkedHashSet<>();
        List<CustomerDtos.ProviderResponse> out = new ArrayList<>();
        for (GuestLocationSubscription subscription : subscriptions) {
            Location location = subscription.getLocation();
            if (location == null || location.getId() == null || !seen.add(location.getId())) continue;
            out.add(provider(location.getCompany(), location, settingsService.publicSettings(location.getCompany().getId())));
            if (out.size() >= limit) break;
        }
        return List.copyOf(out);
    }

    private List<GuestEntitlement> enabledEntitlements(List<GuestEntitlement> rows) {
        Map<Long, Boolean> enabledByCompany = new LinkedHashMap<>();
        return rows.stream()
                .filter(row -> row.getCompany() != null && row.getCompany().getId() != null)
                .filter(row -> enabledByCompany.computeIfAbsent(
                        row.getCompany().getId(), entitlementsModuleAccess::isEnabled))
                .toList();
    }

    private CustomerDtos.WalletEntitlementResponse toWalletEntitlement(
            GuestEntitlement row,
            Map<Long, Integer> membershipVisitCounts
    ) {
        int visits = row.getEntitlementType() == EntitlementType.MEMBERSHIP
                ? membershipVisitCounts.getOrDefault(row.getId(), row.getVisitCount())
                : row.getVisitCount();
        Location singleLocation = null;
        if (!row.isAvailableAllLocations() && row.getLocations() != null && row.getLocations().size() == 1) {
            singleLocation = row.getLocations().iterator().next();
        }
        return new CustomerDtos.WalletEntitlementResponse(
                provider(row.getCompany(), singleLocation, settingsService.publicSettings(row.getCompany().getId())),
                GuestMapper.toEntitlement(row, visits)
        );
    }

    private CustomerDtos.WalletOrderResponse toWalletOrder(GuestOrder order, ProductMetadata fallbackProduct) {
        ProductMetadata metadataProduct = productMetadata(order.getMetadataJson());
        ProductMetadata product = new ProductMetadata(
                metadataProduct.name() == null ? fallbackProduct == null ? null : fallbackProduct.name() : metadataProduct.name(),
                metadataProduct.type() == null ? fallbackProduct == null ? null : fallbackProduct.type() : metadataProduct.type()
        );
        return new CustomerDtos.WalletOrderResponse(
                provider(order.getCompany(), order.getLocation(), settingsService.publicSettings(order.getCompany().getId())),
                String.valueOf(order.getId()),
                order.getStatus().name(),
                order.getPaymentMethodType().name(),
                order.getTotalGross().doubleValue(),
                order.getCurrency(),
                order.getPaidAt() == null ? null : order.getPaidAt().toString(),
                order.getCreatedAt() == null ? null : order.getCreatedAt().toString(),
                order.getReferenceCode(),
                product.name(),
                product.type()
        );
    }

    private CustomerDtos.NotificationResponse toNotification(GuestNotification row) {
        GuestSettingsService.GuestPublicSettings settings = settingsService.publicSettings(row.getCompany().getId());
        return new CustomerDtos.NotificationResponse(
                String.valueOf(row.getId()),
                provider(row.getCompany(), null, settings),
                row.getNotificationType().name(),
                row.getTitle(),
                row.getBody(),
                row.getReadAt() == null ? null : row.getReadAt().toString(),
                row.getCreatedAt() == null ? null : row.getCreatedAt().toString(),
                row.getPayloadJson()
        );
    }

    private CustomerDtos.BookingResponse toBooking(SessionBooking booking, String paymentStatus) {
        List<GuestDtos.BookingServiceResponse> serviceLines = GuestBookingViewSupport.services(booking, "EUR");
        GuestSettingsService.GuestPublicSettings settings = settingsService.publicSettings(booking.getCompany().getId());
        return new CustomerDtos.BookingResponse(
                String.valueOf(booking.getId()),
                provider(booking.getCompany(), booking.getLocation(), settings),
                booking.getType() == null ? null : String.valueOf(booking.getType().getId()),
                GuestBookingViewSupport.summaryName(serviceLines),
                booking.getStartTime() == null ? null : booking.getStartTime().toString(),
                booking.getEndTime() == null ? null : booking.getEndTime().toString(),
                booking.getBookingStatus() == null ? "CONFIRMED" : booking.getBookingStatus(),
                GuestMapper.formatConsultantDisplayName(booking.getConsultant()),
                serviceLines,
                SessionServiceSupport.totalServiceMinutes(booking),
                GuestBookingViewSupport.totalPrice(serviceLines),
                "EUR",
                paymentStatus
        );
    }

    private CustomerDtos.ProviderResponse provider(
            Company company,
            Location location,
            GuestSettingsService.GuestPublicSettings settings
    ) {
        String companyName = GuestMapper.displayCompanyName(company, settings);
        if (location == null) {
            return new CustomerDtos.ProviderResponse(
                    String.valueOf(company.getId()), companyName, settings.companyLogoUrl(), null, null, null);
        }
        LocationPublicPresentationService.PublicPresentation presentation = presentations.resolve(location, settings.companyLogoUrl());
        return new CustomerDtos.ProviderResponse(
                String.valueOf(company.getId()),
                companyName,
                presentation.publicLogoUrl(),
                String.valueOf(location.getId()),
                presentation.publicName(),
                presentation.publicAddress()
        );
    }

    private Map<Long, String> paymentStatuses(List<SessionBooking> rows) {
        Map<Long, Long> orderIdByBookingId = new LinkedHashMap<>();
        for (SessionBooking booking : rows) {
            if (booking.getId() == null || booking.getSourceOrderId() == null || booking.getSourceOrderId().isBlank()) continue;
            try {
                orderIdByBookingId.put(booking.getId(), Long.parseLong(booking.getSourceOrderId()));
            } catch (NumberFormatException ignored) {
            }
        }
        if (orderIdByBookingId.isEmpty()) return Map.of();
        Map<Long, String> statusByOrderId = new LinkedHashMap<>();
        orders.findAllById(new LinkedHashSet<>(orderIdByBookingId.values()))
                .forEach(order -> statusByOrderId.put(order.getId(), order.getStatus().name()));
        Map<Long, String> out = new LinkedHashMap<>();
        orderIdByBookingId.forEach((bookingId, orderId) -> {
            String status = statusByOrderId.get(orderId);
            if (status != null) out.put(bookingId, status);
        });
        return out;
    }

    private Map<Long, ProductMetadata> loadProductMetadata(List<GuestOrder> orderRows) {
        List<Long> orderIds = orderRows.stream()
                .map(GuestOrder::getId)
                .filter(Objects::nonNull)
                .toList();
        if (orderIds.isEmpty()) return Map.of();
        Map<Long, ProductMetadata> out = new LinkedHashMap<>();
        for (Object[] row : orders.findFirstEntitlementProductRowsForOrderIds(orderIds)) {
            if (row == null || row.length < 3 || row[0] == null) continue;
            Long orderId = (Long) row[0];
            out.putIfAbsent(orderId, new ProductMetadata(
                    row[1] == null ? null : String.valueOf(row[1]),
                    row[2] == null ? null : String.valueOf(row[2])
            ));
        }
        return out;
    }

    private static ProductMetadata productMetadata(String metadataJson) {
        if (metadataJson == null || metadataJson.isBlank()) return new ProductMetadata(null, null);
        try {
            JsonNode node = JSON.readTree(metadataJson);
            return new ProductMetadata(text(node, "productName"), text(node, "productType"));
        } catch (Exception ignored) {
            return new ProductMetadata(null, null);
        }
    }

    private static String text(JsonNode node, String field) {
        if (node == null || !node.hasNonNull(field)) return null;
        String value = node.path(field).asText(null);
        return value == null || value.isBlank() ? null : value;
    }

    private static String normalizeBookingStatus(String status) {
        if (status == null || status.isBlank()) return "upcoming";
        String normalized = status.trim().toLowerCase();
        if (!List.of("upcoming", "past", "cancelled").contains(normalized)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "status must be upcoming, past or cancelled.");
        }
        return normalized;
    }

    private static int safePage(int page) {
        return Math.max(0, page);
    }

    private static int safeSize(int size, int fallback) {
        if (size <= 0) return fallback;
        return Math.min(size, MAX_PAGE_SIZE);
    }

    private record ProductMetadata(String name, String type) {}
}
