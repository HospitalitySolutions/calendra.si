package com.example.app.delivery;

import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.user.User;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import jakarta.persistence.criteria.Predicate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/delivery-logs")
@PreAuthorize("hasAnyRole('ADMIN','SUPER_ADMIN')")
public class MessageDeliveryLogController {
    private final MessageDeliveryLogRepository logs;
    private final AppSettingRepository appSettings;

    @Autowired
    public MessageDeliveryLogController(MessageDeliveryLogRepository logs, AppSettingRepository appSettings) {
        this.logs = logs;
        this.appSettings = appSettings;
    }

    /** Backwards-compatible constructor used by older unit tests. */
    public MessageDeliveryLogController(MessageDeliveryLogRepository logs) {
        this(logs, null);
    }

    @GetMapping
    public DeliveryLogListResponse list(
            @AuthenticationPrincipal User me,
            @RequestParam(required = false) String channel,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String messageType,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size
    ) {
        Long companyId = me.getCompany().getId();
        MessageDeliveryChannel channelFilter = parseEnum(MessageDeliveryChannel.class, channel);
        MessageDeliveryStatus statusFilter = parseEnum(MessageDeliveryStatus.class, status);
        String normalizedType = lowerBlankToNull(messageType);
        String normalizedSearchPattern = likePatternOrNull(search);
        Set<MessageDeliveryChannel> visibleChannels = visibleChannelsFor(companyId);
        Instant fromInstant = parseInstant(from);
        Instant toInstant = parseInstant(to);
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(1, size), 100);
        var result = logs.findAll(
                tenantLogSpec(
                        companyId,
                        channelFilter,
                        statusFilter,
                        normalizedType,
                        normalizedSearchPattern,
                        fromInstant,
                        toInstant,
                        visibleChannels
                ),
                PageRequest.of(safePage, safeSize, Sort.by(Sort.Direction.DESC, "createdAt"))
        );
        Instant summarySince = Instant.now().minus(30, ChronoUnit.DAYS);
        return new DeliveryLogListResponse(
                result.getContent().stream().map(DeliveryLogItem::from).toList(),
                result.getTotalElements(),
                result.getNumber(),
                result.getSize(),
                result.getTotalPages(),
                DeliveryLogSummary.from(logs, companyId, summarySince, visibleChannels)
        );
    }


    private static Specification<MessageDeliveryLog> tenantLogSpec(
            Long companyId,
            MessageDeliveryChannel channel,
            MessageDeliveryStatus status,
            String messageTypeLower,
            String searchPattern,
            Instant from,
            Instant to,
            Set<MessageDeliveryChannel> visibleChannels
    ) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("company").get("id"), companyId));

            if (visibleChannels == null || visibleChannels.isEmpty()) {
                return cb.disjunction();
            }
            if (channel != null) {
                if (!visibleChannels.contains(channel)) {
                    return cb.disjunction();
                }
                predicates.add(cb.equal(root.get("channel"), channel));
            } else {
                predicates.add(root.get("channel").in(visibleChannels));
            }
            if (status != null) {
                predicates.add(cb.equal(root.get("status"), status));
            }
            if (messageTypeLower != null) {
                predicates.add(cb.equal(cb.lower(root.<String>get("messageType")), messageTypeLower));
            }
            if (from != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.<Instant>get("createdAt"), from));
            }
            if (to != null) {
                predicates.add(cb.lessThan(root.<Instant>get("createdAt"), to));
            }
            if (searchPattern != null) {
                predicates.add(cb.or(
                        cb.like(cb.lower(cb.coalesce(root.<String>get("recipient"), "")), searchPattern),
                        cb.like(cb.lower(cb.coalesce(root.<String>get("subject"), "")), searchPattern),
                        cb.like(cb.lower(cb.coalesce(root.<String>get("messagePreview"), "")), searchPattern),
                        cb.like(cb.lower(cb.coalesce(root.<String>get("referenceId"), "")), searchPattern),
                        cb.like(cb.lower(cb.coalesce(root.<String>get("errorMessage"), "")), searchPattern)
                ));
            }

            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    private Set<MessageDeliveryChannel> visibleChannelsFor(Long companyId) {
        EnumSet<MessageDeliveryChannel> visible = EnumSet.noneOf(MessageDeliveryChannel.class);
        boolean notificationsEnabled = booleanSetting(companyId, SettingKey.NOTIFICATIONS_ENABLED, true);
        if (notificationsEnabled) {
            if (booleanSetting(companyId, SettingKey.NOTIFICATIONS_EMAIL_ALERTS_ENABLED, true)) {
                visible.add(MessageDeliveryChannel.EMAIL);
            }
            if (booleanSetting(companyId, SettingKey.NOTIFICATIONS_SMS_ALERTS_ENABLED, false)) {
                visible.add(MessageDeliveryChannel.SMS);
            }
            if (booleanSetting(companyId, SettingKey.NOTIFICATIONS_GUEST_APP_ALERTS_ENABLED, true)) {
                visible.add(MessageDeliveryChannel.GUEST_APP);
                visible.add(MessageDeliveryChannel.PUSH);
            }
        }
        visible.add(MessageDeliveryChannel.WHATSAPP);
        visible.add(MessageDeliveryChannel.VIBER);
        return visible;
    }

    private boolean booleanSetting(Long companyId, SettingKey key, boolean fallback) {
        if (appSettings == null || companyId == null || key == null) return fallback;
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

    private static String lowerBlankToNull(String value) {
        if (value == null || value.isBlank()) return null;
        return value.trim().toLowerCase(Locale.ROOT);
    }

    private static String likePatternOrNull(String value) {
        String normalized = lowerBlankToNull(value);
        return normalized == null ? null : "%" + normalized + "%";
    }

    private static Instant parseInstant(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            String trimmed = value.trim();
            if (trimmed.length() == 10) return Instant.parse(trimmed + "T00:00:00Z");
            return Instant.parse(trimmed);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static <E extends Enum<E>> E parseEnum(Class<E> type, String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return Enum.valueOf(type, value.trim().toUpperCase(Locale.ROOT));
        } catch (Exception ignored) {
            return null;
        }
    }

    public record DeliveryLogListResponse(
            List<DeliveryLogItem> items,
            long total,
            int page,
            int size,
            int totalPages,
            DeliveryLogSummary summary
    ) {}

    public record DeliveryLogItem(
            Long id,
            String createdAt,
            String updatedAt,
            String channel,
            String status,
            String messageType,
            String recipient,
            String subject,
            String messagePreview,
            String referenceType,
            String referenceId,
            String providerMessageId,
            String providerStatusCode,
            String errorMessage,
            Integer retryCount,
            String sentAt,
            String deliveredAt,
            String failedAt
    ) {
        static DeliveryLogItem from(MessageDeliveryLog log) {
            return new DeliveryLogItem(
                    log.getId(),
                    iso(log.getCreatedAt()),
                    iso(log.getUpdatedAt()),
                    log.getChannel() == null ? null : log.getChannel().name(),
                    log.getStatus() == null ? null : log.getStatus().name(),
                    log.getMessageType(),
                    log.getRecipient(),
                    log.getSubject(),
                    log.getMessagePreview(),
                    log.getReferenceType(),
                    log.getReferenceId(),
                    log.getProviderMessageId(),
                    log.getProviderStatusCode(),
                    log.getErrorMessage(),
                    log.getRetryCount(),
                    iso(log.getSentAt()),
                    iso(log.getDeliveredAt()),
                    iso(log.getFailedAt())
            );
        }
    }

    public record DeliveryLogSummary(
            long totalLast30Days,
            Map<MessageDeliveryStatus, Long> byStatus,
            Map<MessageDeliveryChannel, Long> byChannel
    ) {
        static DeliveryLogSummary from(
                MessageDeliveryLogRepository logs,
                Long companyId,
                Instant since,
                Set<MessageDeliveryChannel> visibleChannels
        ) {
            Map<MessageDeliveryStatus, Long> statuses = new EnumMap<>(MessageDeliveryStatus.class);
            for (MessageDeliveryStatus status : MessageDeliveryStatus.values()) {
                statuses.put(status, logs.count(tenantLogSpec(companyId, null, status, null, null, since, null, visibleChannels)));
            }
            Map<MessageDeliveryChannel, Long> channels = new EnumMap<>(MessageDeliveryChannel.class);
            for (MessageDeliveryChannel channel : MessageDeliveryChannel.values()) {
                channels.put(channel, logs.count(tenantLogSpec(companyId, channel, null, null, null, since, null, visibleChannels)));
            }
            return new DeliveryLogSummary(
                    logs.count(tenantLogSpec(companyId, null, null, null, null, since, null, visibleChannels)),
                    statuses,
                    channels
            );
        }
    }

    private static String iso(Instant instant) {
        return instant == null ? null : instant.toString();
    }
}
