package com.example.app.session;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Service
public class SessionBookingRealtimeService {
    private static final Logger log = LoggerFactory.getLogger(SessionBookingRealtimeService.class);
    private static final long EMITTER_TIMEOUT_MS = 30L * 60L * 1000L;

    private final Map<Long, CopyOnWriteArrayList<SseEmitter>> emittersByCompany = new ConcurrentHashMap<>();
    private final String instanceId = UUID.randomUUID().toString();
    private final SessionBookingRealtimeProperties properties;
    private final ObjectProvider<StringRedisTemplate> redisProvider;
    private final ObjectMapper objectMapper;

    public SessionBookingRealtimeService(
            SessionBookingRealtimeProperties properties,
            ObjectProvider<StringRedisTemplate> redisProvider,
            ObjectProvider<ObjectMapper> objectMapperProvider
    ) {
        this.properties = properties;
        this.redisProvider = redisProvider;
        this.objectMapper = objectMapperProvider.getIfAvailable(ObjectMapper::new);
    }

    public record BookingUpdatedEvent(
            Long bookingId,
            Long companyId,
            LocalDateTime startTime,
            LocalDateTime endTime,
            String kind
    ) {}

    public SseEmitter subscribe(Long companyId) {
        SseEmitter emitter = new SseEmitter(EMITTER_TIMEOUT_MS);
        emittersByCompany.computeIfAbsent(companyId, ignored -> new CopyOnWriteArrayList<>()).add(emitter);
        emitter.onCompletion(() -> removeEmitter(companyId, emitter));
        emitter.onTimeout(() -> removeEmitter(companyId, emitter));
        emitter.onError(ignored -> removeEmitter(companyId, emitter));
        try {
            emitter.send(SseEmitter.event().name("connected").data("ok"));
        } catch (Exception ex) {
            removeEmitter(companyId, emitter);
        }
        return emitter;
    }

    @Scheduled(fixedDelay = 25_000L)
    public void sendHeartbeat() {
        emittersByCompany.forEach((companyId, emitters) -> {
            if (emitters == null || emitters.isEmpty()) {
                return;
            }
            List<SseEmitter> staleEmitters = new ArrayList<>();
            for (SseEmitter emitter : emitters) {
                try {
                    emitter.send(SseEmitter.event().name("heartbeat").data("ok"));
                } catch (Exception ex) {
                    staleEmitters.add(emitter);
                }
            }
            staleEmitters.forEach(emitter -> removeEmitter(companyId, emitter));
        });
    }

    public void publishBookingUpdated(
            Long companyId,
            Long bookingId,
            LocalDateTime startTime,
            LocalDateTime endTime,
            String kind
    ) {
        BookingUpdatedEvent event = new BookingUpdatedEvent(bookingId, companyId, startTime, endTime, kind);
        sendToLocalSubscribers(event);
        publishToRedis(event);
    }

    void handleRedisMessage(String payload) {
        if (payload == null || payload.isBlank()) {
            return;
        }
        try {
            JsonNode node = objectMapper.readTree(payload);
            if (instanceId.equals(node.path("sourceInstanceId").asText(""))) {
                return;
            }
            BookingUpdatedEvent event = new BookingUpdatedEvent(
                    readLong(node, "bookingId"),
                    readLong(node, "companyId"),
                    readDateTime(node, "startTime"),
                    readDateTime(node, "endTime"),
                    node.path("kind").asText("")
            );
            if (event.companyId() == null || event.bookingId() == null || event.kind() == null || event.kind().isBlank()) {
                return;
            }
            sendToLocalSubscribers(event);
        } catch (Exception ex) {
            log.warn("Ignoring invalid booking realtime Redis message", ex);
        }
    }

    private void publishToRedis(BookingUpdatedEvent event) {
        if (!properties.getRedis().isEnabled()) {
            return;
        }
        StringRedisTemplate redis = redisProvider.getIfAvailable();
        if (redis == null) {
            log.warn("Booking realtime Redis fan-out is enabled but StringRedisTemplate is unavailable.");
            return;
        }
        try {
            Map<String, Object> envelope = new LinkedHashMap<>();
            envelope.put("sourceInstanceId", instanceId);
            envelope.put("bookingId", event.bookingId());
            envelope.put("companyId", event.companyId());
            envelope.put("startTime", event.startTime() == null ? null : event.startTime().toString());
            envelope.put("endTime", event.endTime() == null ? null : event.endTime().toString());
            envelope.put("kind", event.kind());
            redis.convertAndSend(properties.getRedis().getChannel(), objectMapper.writeValueAsString(envelope));
        } catch (Exception ex) {
            log.warn("Failed to publish booking realtime event to Redis companyId={} bookingId={}", event.companyId(), event.bookingId(), ex);
        }
    }

    private void sendToLocalSubscribers(BookingUpdatedEvent event) {
        if (event == null || event.companyId() == null) {
            return;
        }
        var emitters = emittersByCompany.get(event.companyId());
        if (emitters == null || emitters.isEmpty()) {
            return;
        }
        List<SseEmitter> staleEmitters = new ArrayList<>();
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event().name("booking-updated").data(event));
            } catch (Exception ex) {
                staleEmitters.add(emitter);
            }
        }
        staleEmitters.forEach(emitter -> removeEmitter(event.companyId(), emitter));
    }

    private Long readLong(JsonNode node, String fieldName) {
        JsonNode value = node.path(fieldName);
        if (value.isMissingNode() || value.isNull()) return null;
        if (value.isNumber()) return value.asLong();
        String text = value.asText("").trim();
        if (text.isBlank()) return null;
        try {
            return Long.parseLong(text);
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private LocalDateTime readDateTime(JsonNode node, String fieldName) {
        String value = node.path(fieldName).asText("").trim();
        if (value.isBlank()) return null;
        try {
            return LocalDateTime.parse(value);
        } catch (Exception ex) {
            return null;
        }
    }

    private void removeEmitter(Long companyId, SseEmitter emitter) {
        var emitters = emittersByCompany.get(companyId);
        if (emitters == null) {
            return;
        }
        emitters.remove(emitter);
        if (emitters.isEmpty()) {
            emittersByCompany.remove(companyId, emitters);
        }
    }
}
