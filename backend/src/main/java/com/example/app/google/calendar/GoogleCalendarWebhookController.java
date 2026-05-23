package com.example.app.google.calendar;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/google/calendar")
public class GoogleCalendarWebhookController {
    private static final Logger log = LoggerFactory.getLogger(GoogleCalendarWebhookController.class);
    private final GoogleCalendarConfig config;
    private final GoogleCalendarConnectionRepository connections;
    private final GoogleCalendarSyncQueueService queueService;

    public GoogleCalendarWebhookController(GoogleCalendarConfig config, GoogleCalendarConnectionRepository connections, GoogleCalendarSyncQueueService queueService) {
        this.config = config;
        this.connections = connections;
        this.queueService = queueService;
    }

    @PostMapping("/webhook")
    public ResponseEntity<Void> webhook(
            @RequestHeader(value = "X-Goog-Channel-ID", required = false) String channelId,
            @RequestHeader(value = "X-Goog-Resource-ID", required = false) String resourceId,
            @RequestHeader(value = "X-Goog-Resource-State", required = false) String resourceState,
            @RequestHeader(value = "X-Goog-Channel-Token", required = false) String channelToken) {
        if (channelId == null || resourceId == null) return ResponseEntity.ok().build();
        var connection = connections.findByChannelIdAndResourceId(channelId, resourceId).orElse(null);
        if (connection == null) { log.debug("Ignoring Google Calendar webhook for unknown channel/resource: {}/{}", channelId, resourceId); return ResponseEntity.ok().build(); }
        if (config.getWebhookToken() != null && !config.getWebhookToken().isBlank()) {
            String expectedPrefix = config.getWebhookToken() + ":";
            if (channelToken == null || !channelToken.startsWith(expectedPrefix)) { log.warn("Ignoring Google Calendar webhook with invalid token for connection {}", connection.getId()); return ResponseEntity.ok().build(); }
        }
        if (!"sync".equalsIgnoreCase(resourceState)) queueService.enqueuePull(connection);
        return ResponseEntity.ok().build();
    }
}
