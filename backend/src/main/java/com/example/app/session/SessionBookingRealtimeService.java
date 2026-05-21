package com.example.app.session;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Service
public class SessionBookingRealtimeService {
    private static final long EMITTER_TIMEOUT_MS = 30L * 60L * 1000L;

    private final Map<Long, CopyOnWriteArrayList<SseEmitter>> emittersByCompany = new ConcurrentHashMap<>();

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
        var emitters = emittersByCompany.get(companyId);
        if (emitters == null || emitters.isEmpty()) {
            return;
        }
        BookingUpdatedEvent event = new BookingUpdatedEvent(bookingId, companyId, startTime, endTime, kind);
        List<SseEmitter> staleEmitters = new ArrayList<>();
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event().name("booking-updated").data(event));
            } catch (Exception ex) {
                staleEmitters.add(emitter);
            }
        }
        staleEmitters.forEach(emitter -> removeEmitter(companyId, emitter));
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

