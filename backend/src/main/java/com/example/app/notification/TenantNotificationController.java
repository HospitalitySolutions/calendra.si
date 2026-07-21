package com.example.app.notification;

import com.example.app.observability.legacy.LegacyEndpointDefinition;
import com.example.app.observability.legacy.TrackLegacyEndpoint;
import com.example.app.user.User;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/notifications")
public class TenantNotificationController {
    private final TenantNotificationService service;

    public TenantNotificationController(TenantNotificationService service) {
        this.service = service;
    }

    @GetMapping
    public TenantNotificationService.NotificationFeed list(
            @AuthenticationPrincipal User me,
            @RequestParam(defaultValue = "ALL") String category,
            @RequestParam(defaultValue = "20") int limit
    ) {
        return service.feed(me, category, limit);
    }

    @GetMapping("/unread-count")
    @TrackLegacyEndpoint(LegacyEndpointDefinition.NOTIFICATIONS_UNREAD_COUNT)
    public java.util.Map<String, Long> unreadCount(@AuthenticationPrincipal User me) {
        return java.util.Map.of("count", service.unreadCount(me));
    }

    @PutMapping("/{key}/read")
    public void markRead(@AuthenticationPrincipal User me, @PathVariable String key) {
        service.markRead(me, key);
    }

    @PutMapping("/read-all")
    public void markAllRead(@AuthenticationPrincipal User me) {
        service.markAllRead(me);
    }
}
