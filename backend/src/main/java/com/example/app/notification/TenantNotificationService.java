package com.example.app.notification;

import com.example.app.client.Client;
import com.example.app.session.BookingChangePublisher;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingRepository;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TenantNotificationService {
    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("d. M. yyyy HH:mm");

    private final TenantNotificationRepository notifications;
    private final PlatformAnnouncementRepository announcements;
    private final PlatformAnnouncementReadRepository announcementReads;
    private final SessionBookingRepository bookings;
    private final UserRepository users;
    private final ObjectMapper objectMapper;

    public TenantNotificationService(
            TenantNotificationRepository notifications,
            PlatformAnnouncementRepository announcements,
            PlatformAnnouncementReadRepository announcementReads,
            SessionBookingRepository bookings,
            UserRepository users,
            ObjectMapper objectMapper
    ) {
        this.notifications = notifications;
        this.announcements = announcements;
        this.announcementReads = announcementReads;
        this.bookings = bookings;
        this.users = users;
        this.objectMapper = objectMapper;
    }

    public record NotificationItem(
            String key,
            String category,
            String type,
            String severity,
            String title,
            String message,
            String source,
            String actionUrl,
            Long entityId,
            String createdAt,
            boolean unread,
            boolean announcement
    ) {}

    public record NotificationFeed(List<NotificationItem> items, long unreadCount) {}

    @Transactional(readOnly = true)
    public NotificationFeed feed(User me, String categoryRaw, int limitRaw) {
        String category = normalizeCategory(categoryRaw);
        int limit = Math.max(1, Math.min(limitRaw, 50));
        Instant now = Instant.now();
        List<NotificationItem> out = new ArrayList<>();

        notifications.findVisible(me.getId(), category, now, PageRequest.of(0, limit)).stream()
                .map(this::toItem)
                .forEach(out::add);

        if ("ALL".equals(category) || "SYSTEM".equals(category)) {
            List<PlatformAnnouncement> active = announcements.findActive(now).stream()
                    .filter(a -> targetsCompany(a, me.getCompany().getId()))
                    .toList();
            Set<Long> readIds = new LinkedHashSet<>();
            if (!active.isEmpty()) {
                announcementReads.findAllByUserIdAndAnnouncementIdIn(
                                me.getId(), active.stream().map(PlatformAnnouncement::getId).toList())
                        .forEach(row -> readIds.add(row.getAnnouncement().getId()));
            }
            active.stream().map(a -> toItem(a, !readIds.contains(a.getId()))).forEach(out::add);
        }

        out.sort(Comparator.comparing(NotificationItem::createdAt).reversed());
        if (out.size() > limit) out = new ArrayList<>(out.subList(0, limit));
        return new NotificationFeed(out, unreadCount(me));
    }

    @Transactional(readOnly = true)
    public long unreadCount(User me) {
        Instant now = Instant.now();
        long count = notifications.countUnread(me.getId(), now);
        List<PlatformAnnouncement> active = announcements.findActive(now).stream()
                .filter(a -> targetsCompany(a, me.getCompany().getId()))
                .toList();
        if (active.isEmpty()) return count;
        Set<Long> readIds = new LinkedHashSet<>();
        announcementReads.findAllByUserIdAndAnnouncementIdIn(
                        me.getId(), active.stream().map(PlatformAnnouncement::getId).toList())
                .forEach(row -> readIds.add(row.getAnnouncement().getId()));
        return count + active.stream().filter(a -> !readIds.contains(a.getId())).count();
    }

    @Transactional
    public void markRead(User me, String key) {
        if (key == null || key.isBlank()) return;
        if (key.startsWith("N-")) {
            parseId(key.substring(2)).flatMap(id -> notifications.findByIdAndRecipientId(id, me.getId())).ifPresent(row -> {
                if (row.getReadAt() == null) {
                    row.setReadAt(Instant.now());
                    notifications.save(row);
                }
            });
            return;
        }
        if (key.startsWith("A-")) {
            parseId(key.substring(2)).flatMap(announcements::findById).ifPresent(announcement -> {
                if (!targetsCompany(announcement, me.getCompany().getId())) return;
                announcementReads.findByUserIdAndAnnouncementId(me.getId(), announcement.getId()).orElseGet(() -> {
                    PlatformAnnouncementRead row = new PlatformAnnouncementRead();
                    row.setAnnouncement(announcement);
                    row.setUser(me);
                    row.setReadAt(Instant.now());
                    return announcementReads.save(row);
                });
            });
        }
    }

    @Transactional
    public void markAllRead(User me) {
        Instant now = Instant.now();
        notifications.markAllRead(me.getId(), now);
        List<PlatformAnnouncement> active = announcements.findActive(now).stream()
                .filter(a -> targetsCompany(a, me.getCompany().getId()))
                .toList();
        if (active.isEmpty()) return;
        Set<Long> alreadyRead = new LinkedHashSet<>();
        announcementReads.findAllByUserIdAndAnnouncementIdIn(
                        me.getId(), active.stream().map(PlatformAnnouncement::getId).toList())
                .forEach(row -> alreadyRead.add(row.getAnnouncement().getId()));
        for (PlatformAnnouncement announcement : active) {
            if (alreadyRead.contains(announcement.getId())) continue;
            PlatformAnnouncementRead row = new PlatformAnnouncementRead();
            row.setAnnouncement(announcement);
            row.setUser(me);
            row.setReadAt(now);
            announcementReads.save(row);
        }
    }

    /** Called after a booking transaction commits. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void createBookingNotification(Long bookingId, String kind, String origin, LocalDateTime previousStartTime) {
        if (bookingId == null || kind == null) return;
        if (!BookingChangePublisher.BOOKING_CREATED.equals(kind)
                && !BookingChangePublisher.BOOKING_RESCHEDULED.equals(kind)
                && !BookingChangePublisher.BOOKING_CANCELLED.equals(kind)) return;

        SessionBooking booking = bookings.findById(bookingId).orElse(null);
        if (booking == null || booking.getCompany() == null) return;
        String resolvedOrigin = resolveOrigin(booking, kind, origin);
        if (!isExternalOrigin(resolvedOrigin)) return;

        Map<Long, User> recipients = new LinkedHashMap<>();
        if (booking.getConsultant() != null && booking.getConsultant().isActive() && booking.getConsultant().getId() != null) {
            recipients.put(booking.getConsultant().getId(), booking.getConsultant());
        }
        for (User user : users.findAllByCompanyId(booking.getCompany().getId())) {
            if (!user.isActive() || user.getId() == null) continue;
            if (user.getRole() == Role.ADMIN || user.getRole() == Role.SUPER_ADMIN) recipients.put(user.getId(), user);
        }
        if (recipients.isEmpty()) return;

        String clientName = clientName(booking.getClient());
        String serviceName = serviceName(booking);
        String title = switch (kind) {
            case BookingChangePublisher.BOOKING_CREATED -> "Nova rezervacija";
            case BookingChangePublisher.BOOKING_RESCHEDULED -> "Termin je bil prestavljen";
            case BookingChangePublisher.BOOKING_CANCELLED -> "Termin je bil odpovedan";
            default -> "Sprememba rezervacije";
        };
        String message = bookingMessage(kind, clientName, serviceName, booking.getStartTime(), previousStartTime);
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("clientName", clientName);
        metadata.put("serviceName", serviceName);
        metadata.put("startTime", booking.getStartTime() == null ? null : booking.getStartTime().toString());
        metadata.put("previousStartTime", previousStartTime == null ? null : previousStartTime.toString());
        metadata.put("origin", resolvedOrigin);
        String metadataJson;
        try {
            metadataJson = objectMapper.writeValueAsString(metadata);
        } catch (Exception ignored) {
            metadataJson = "{}";
        }
        String eventVersion = booking.getUpdatedAt() == null ? Instant.now().toString() : booking.getUpdatedAt().toString();
        for (User recipient : recipients.values()) {
            String dedupeKey = kind + ":" + booking.getId() + ":" + eventVersion;
            if (notifications.existsByRecipientIdAndDedupeKey(recipient.getId(), dedupeKey)) continue;
            TenantNotification row = new TenantNotification();
            row.setCompany(booking.getCompany());
            row.setRecipient(recipient);
            row.setCategory("BOOKING");
            row.setType(kind);
            row.setSeverity("NORMAL");
            row.setTitle(title);
            row.setMessage(message);
            row.setSource(resolvedOrigin);
            row.setEntityType("SESSION_BOOKING");
            row.setEntityId(booking.getId());
            String notificationDate = booking.getStartTime() == null ? "" : booking.getStartTime().toLocalDate().toString();
            row.setActionUrl("/calendar?notificationBookingId=" + booking.getId()
                    + (notificationDate.isBlank() ? "" : "&notificationDate=" + notificationDate));
            row.setDedupeKey(dedupeKey);
            row.setMetadataJson(metadataJson);
            row.setExpiresAt(Instant.now().plusSeconds(90L * 24L * 60L * 60L));
            notifications.save(row);
        }
    }

    private NotificationItem toItem(TenantNotification row) {
        return new NotificationItem(
                "N-" + row.getId(), row.getCategory(), row.getType(), row.getSeverity(), row.getTitle(),
                row.getMessage(), row.getSource(), row.getActionUrl(), row.getEntityId(),
                row.getCreatedAt() == null ? Instant.EPOCH.toString() : row.getCreatedAt().toString(),
                row.getReadAt() == null, false
        );
    }

    private NotificationItem toItem(PlatformAnnouncement row, boolean unread) {
        return new NotificationItem(
                "A-" + row.getId(), "SYSTEM", "PLATFORM_ANNOUNCEMENT", row.getSeverity(), row.getTitle(),
                row.getMessage(), "PLATFORM_ADMIN", row.getActionUrl(), row.getId(),
                row.getCreatedAt() == null ? row.getStartsAt().toString() : row.getCreatedAt().toString(), unread, true
        );
    }

    private boolean targetsCompany(PlatformAnnouncement announcement, Long companyId) {
        String raw = announcement.getTargetCompanyIdsJson();
        if (raw == null || raw.isBlank()) return true;
        try {
            List<Long> ids = objectMapper.readValue(raw, new TypeReference<List<Long>>() {});
            return ids.isEmpty() || ids.contains(companyId);
        } catch (Exception ignored) {
            return true;
        }
    }

    private String resolveOrigin(SessionBooking booking, String kind, String origin) {
        if (origin != null && !origin.isBlank()) return origin.trim().toUpperCase(Locale.ROOT);
        if (!BookingChangePublisher.BOOKING_CREATED.equals(kind)) return "STAFF";
        String source = booking.getSourceChannel();
        return source == null ? "STAFF" : source.trim().toUpperCase(Locale.ROOT);
    }

    private boolean isExternalOrigin(String origin) {
        return "WEBSITE_WIDGET".equals(origin) || "GUEST_APP".equals(origin) || "PUBLIC_LINK".equals(origin);
    }

    private String clientName(Client client) {
        if (client == null) return "Stranka";
        String name = ((client.getFirstName() == null ? "" : client.getFirstName()) + " "
                + (client.getLastName() == null ? "" : client.getLastName())).trim();
        return name.isBlank() ? "Stranka" : name;
    }

    private String serviceName(SessionBooking booking) {
        if (booking.getType() == null) return "Storitev";
        String description = booking.getType().getDescription();
        if (description != null && !description.isBlank()) return description.trim();
        String name = booking.getType().getName();
        return name == null || name.isBlank() ? "Storitev" : name.trim();
    }

    private String bookingMessage(String kind, String clientName, String serviceName, LocalDateTime start, LocalDateTime previousStart) {
        String current = start == null ? "" : start.format(DATE_TIME);
        if (BookingChangePublisher.BOOKING_CREATED.equals(kind)) {
            return clientName + " · " + serviceName + (current.isBlank() ? "" : " · " + current);
        }
        if (BookingChangePublisher.BOOKING_RESCHEDULED.equals(kind)) {
            String previous = previousStart == null ? "" : previousStart.format(DateTimeFormatter.ofPattern("HH:mm"));
            String next = start == null ? "" : start.format(DateTimeFormatter.ofPattern("HH:mm"));
            String movement = previous.isBlank() ? current : previous + " → " + next;
            return clientName + " · " + movement;
        }
        return clientName + (current.isBlank() ? "" : " · " + current);
    }

    private String normalizeCategory(String raw) {
        if (raw == null) return "ALL";
        String normalized = raw.trim().toUpperCase(Locale.ROOT);
        return Set.of("ALL", "BOOKING", "SYSTEM").contains(normalized) ? normalized : "ALL";
    }

    private java.util.Optional<Long> parseId(String raw) {
        try {
            return java.util.Optional.of(Long.parseLong(raw));
        } catch (Exception ignored) {
            return java.util.Optional.empty();
        }
    }
}
