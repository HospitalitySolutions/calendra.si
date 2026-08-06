package com.example.app.session;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** Shared compatibility helpers while SessionBooking.type/space remain the primary-service aliases. */
public final class SessionServiceSupport {
    private SessionServiceSupport() {}

    public static List<SessionService> orderedServices(SessionBooking booking) {
        if (booking == null || booking.getServices() == null || booking.getServices().isEmpty()) {
            return List.of();
        }
        return booking.getServices().stream()
                .filter(service -> service != null && service.getSessionType() != null)
                .sorted(Comparator.comparingInt(SessionService::getPosition)
                        .thenComparing(service -> service.getId() == null ? Long.MAX_VALUE : service.getId()))
                .toList();
    }

    public static List<SessionType> orderedTypes(SessionBooking booking) {
        List<SessionService> services = orderedServices(booking);
        if (!services.isEmpty()) {
            return services.stream().map(SessionService::getSessionType).toList();
        }
        return booking != null && booking.getType() != null ? List.of(booking.getType()) : List.of();
    }

    public static LocalDateTime availabilityEnd(SessionBooking booking) {
        if (booking == null) return null;
        List<SessionService> services = orderedServices(booking);
        if (!services.isEmpty()) {
            SessionService last = services.get(services.size() - 1);
            return last.getEndTime().plusMinutes(Math.max(0, last.getBreakMinutesSnapshot()));
        }
        if (booking.getAvailabilityEndTime() != null) return booking.getAvailabilityEndTime();
        int breakMinutes = booking.getType() != null && booking.getType().getBreakMinutes() != null
                ? Math.max(0, booking.getType().getBreakMinutes())
                : 0;
        return booking.getEndTime() == null ? null : booking.getEndTime().plusMinutes(breakMinutes);
    }

    public static int totalServiceMinutes(SessionBooking booking) {
        List<SessionService> services = orderedServices(booking);
        if (!services.isEmpty()) {
            return services.stream().mapToInt(service -> Math.max(0, service.getDurationMinutesSnapshot())).sum();
        }
        if (booking == null || booking.getStartTime() == null || booking.getEndTime() == null) return 0;
        return Math.max(0, (int) java.time.Duration.between(booking.getStartTime(), booking.getEndTime()).toMinutes());
    }

    public static int totalBreakMinutes(SessionBooking booking) {
        List<SessionService> services = orderedServices(booking);
        if (!services.isEmpty()) {
            return services.stream().mapToInt(service -> Math.max(0, service.getBreakMinutesSnapshot())).sum();
        }
        return booking != null && booking.getType() != null && booking.getType().getBreakMinutes() != null
                ? Math.max(0, booking.getType().getBreakMinutes())
                : 0;
    }

    public static String serviceSummary(SessionBooking booking) {
        List<SessionService> services = orderedServices(booking);
        if (!services.isEmpty()) {
            return services.stream()
                    .map(SessionServiceSupport::serviceDescription)
                    .filter(name -> name != null && !name.isBlank())
                    .reduce((left, right) -> left + " + " + right)
                    .orElse("Session");
        }
        return booking != null && booking.getType() != null
                ? typeDescription(booking.getType())
                : "Session";
    }

    public static String serviceListText(SessionBooking booking) {
        List<SessionService> services = orderedServices(booking);
        if (services.isEmpty()) return serviceSummary(booking);
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < services.size(); i++) {
            SessionService service = services.get(i);
            if (i > 0) out.append("\n");
            out.append(i + 1).append(". ").append(serviceDescription(service))
                    .append(" (").append(service.getDurationMinutesSnapshot()).append(" min)");
        }
        return out.toString();
    }

    private static String serviceDescription(SessionService service) {
        if (service == null) return "Session";
        SessionType type = service.getSessionType();
        if (type != null && type.getDescription() != null && !type.getDescription().isBlank()) {
            return type.getDescription().trim();
        }
        if (service.getServiceNameSnapshot() != null && !service.getServiceNameSnapshot().isBlank()) {
            return service.getServiceNameSnapshot().trim();
        }
        return typeDescription(type);
    }

    private static String typeDescription(SessionType type) {
        if (type == null) return "Session";
        if (type.getDescription() != null && !type.getDescription().isBlank()) {
            return type.getDescription().trim();
        }
        return type.getName() != null && !type.getName().isBlank() ? type.getName().trim() : "Session";
    }

    public static List<SessionService> mutableOrderedCopy(SessionBooking booking) {
        return new ArrayList<>(orderedServices(booking));
    }
}
