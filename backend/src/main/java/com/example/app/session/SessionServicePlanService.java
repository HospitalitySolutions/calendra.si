package com.example.app.session;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/** Resolves, validates and persists ordered service chains for session bookings. */
@Service
public class SessionServicePlanService {
    private final SessionTypeRepository sessionTypes;
    private final SpaceRepository spaces;
    private final SessionTypeBreakSettingsService breakSettings;

    @Autowired
    public SessionServicePlanService(
            SessionTypeRepository sessionTypes,
            SpaceRepository spaces,
            SessionTypeBreakSettingsService breakSettings
    ) {
        this.sessionTypes = sessionTypes;
        this.spaces = spaces;
        this.breakSettings = breakSettings;
    }

    /** Backwards-compatible constructor for older unit tests. */
    public SessionServicePlanService(SessionTypeRepository sessionTypes, SpaceRepository spaces) {
        this(sessionTypes, spaces, null);
    }

    public record Segment(
            int position,
            SessionType type,
            Space space,
            LocalDateTime startTime,
            LocalDateTime endTime,
            int durationMinutes,
            int breakMinutes,
            String serviceNameSnapshot,
            String colorSnapshot,
            String priceCalculationModeSnapshot,
            Long serviceGroupIdSnapshot,
            String serviceGroupNameSnapshot
    ) {
        public Segment(
                int position,
                SessionType type,
                Space space,
                LocalDateTime startTime,
                LocalDateTime endTime,
                int durationMinutes,
                int breakMinutes
        ) {
            this(
                    position,
                    type,
                    space,
                    startTime,
                    endTime,
                    durationMinutes,
                    breakMinutes,
                    type == null ? null : visibleServiceDescription(type),
                    type == null ? null : type.getColor(),
                    priceModeName(type),
                    type == null || type.getServiceGroup() == null ? null : type.getServiceGroup().getId(),
                    type == null || type.getServiceGroup() == null ? null : type.getServiceGroup().getName()
            );
        }

        public LocalDateTime availabilityEndTime() {
            return endTime.plusMinutes(Math.max(0, breakMinutes));
        }

        private static String priceModeName(SessionType type) {
            SessionPriceCalculationMode mode = type == null || type.getPriceCalculationMode() == null
                    ? SessionPriceCalculationMode.PER_CLIENT
                    : type.getPriceCalculationMode();
            return mode.name();
        }
    }

    public record Plan(
            List<Segment> segments,
            LocalDateTime startTime,
            LocalDateTime endTime,
            LocalDateTime availabilityEndTime,
            boolean explicitServices
    ) {
        public SessionType primaryType() {
            return segments == null || segments.isEmpty() ? null : segments.get(0).type();
        }

        public Space primarySpace() {
            return segments == null || segments.isEmpty() ? null : segments.get(0).space();
        }

        public Long primaryTypeId() {
            return primaryType() == null ? null : primaryType().getId();
        }

        public Long primarySpaceId() {
            return primarySpace() == null ? null : primarySpace().getId();
        }
    }

    public Plan resolve(
            SessionBookingController.BookingRequest request,
            Long companyId,
            LocalDateTime start,
            LocalDateTime legacyEnd
    ) {
        if (request == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Booking request is required.");
        }
        List<SessionBookingController.BookingServiceRequest> requested = request.services();
        if (requested == null || requested.isEmpty()) {
            return resolveLegacy(companyId, request.typeId(), request.spaceId(), request.locationId(), start, legacyEnd);
        }
        if (start == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Booking start time is required.");
        }

        record Indexed(int index, SessionBookingController.BookingServiceRequest value) {}
        List<Indexed> ordered = new ArrayList<>();
        for (int i = 0; i < requested.size(); i++) {
            if (requested.get(i) != null) ordered.add(new Indexed(i, requested.get(i)));
        }
        if (ordered.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "At least one service is required.");
        }
        ordered.sort(Comparator
                .comparingInt((Indexed item) -> item.value().position() == null ? item.index() : item.value().position())
                .thenComparingInt(Indexed::index));

        List<Segment> segments = new ArrayList<>();
        LocalDateTime cursor = start;
        SessionPriceCalculationMode priceMode = null;
        Long normalizedLocationId = null;
        for (int position = 0; position < ordered.size(); position++) {
            var serviceRequest = ordered.get(position).value();
            SessionType type = requireActiveType(serviceRequest.typeId(), companyId);
            SessionPriceCalculationMode currentMode = type.getPriceCalculationMode() == null
                    ? SessionPriceCalculationMode.PER_CLIENT
                    : type.getPriceCalculationMode();
            if (priceMode == null) {
                priceMode = currentMode;
            } else if (priceMode != currentMode) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "All services in one session must use the same price calculation mode."
                );
            }
            int durationMinutes = Math.max(1, type.getDurationMinutes() == null ? 60 : type.getDurationMinutes());
            Long requestedSpaceId = serviceRequest.spaceId() != null ? serviceRequest.spaceId() : request.spaceId();
            Space space = resolveSpace(requestedSpaceId, companyId);
            if (space != null && space.getLocation() != null) {
                Long currentLocationId = space.getLocation().getId();
                if (normalizedLocationId == null) normalizedLocationId = currentLocationId;
                else if (!normalizedLocationId.equals(currentLocationId)) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "All spaces in one session must belong to the same location."
                    );
                }
            }
            Long effectiveLocationId = normalizedLocationId != null ? normalizedLocationId : request.locationId();
            // A combined appointment is continuous. Only the final service contributes its
            // configured cleanup/buffer time after the visible booked block. Inherited breaks
            // resolve through the location override layer.
            int breakMinutes = position == ordered.size() - 1
                    ? effectiveBreakMinutes(type, effectiveLocationId)
                    : 0;
            LocalDateTime serviceEnd = cursor.plusMinutes(durationMinutes);
            segments.add(new Segment(position, type, space, cursor, serviceEnd, durationMinutes, breakMinutes));
            cursor = serviceEnd;
        }
        Segment last = segments.get(segments.size() - 1);
        return new Plan(List.copyOf(segments), start, last.endTime(), last.availabilityEndTime(), true);
    }

    public Plan resolveLegacy(
            Long companyId,
            Long typeId,
            Long spaceId,
            LocalDateTime start,
            LocalDateTime end
    ) {
        return resolveLegacy(companyId, typeId, spaceId, null, start, end);
    }

    public Plan resolveLegacy(
            Long companyId,
            Long typeId,
            Long spaceId,
            Long locationId,
            LocalDateTime start,
            LocalDateTime end
    ) {
        if (start == null || end == null || !end.isAfter(start)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid booking time window.");
        }
        if (typeId == null) {
            return new Plan(List.of(), start, end, end, false);
        }
        SessionType type = requireActiveType(typeId, companyId);
        Space space = resolveSpace(spaceId, companyId);
        int actualDuration = Math.max(1, (int) Duration.between(start, end).toMinutes());
        Long effectiveLocationId = space != null && space.getLocation() != null ? space.getLocation().getId() : locationId;
        int breakMinutes = effectiveBreakMinutes(type, effectiveLocationId);
        Segment segment = new Segment(0, type, space, start, end, actualDuration, breakMinutes);
        return new Plan(List.of(segment), start, end, segment.availabilityEndTime(), false);
    }

    public void validateParticipantLimit(Plan plan, int participantCount) {
        validateParticipantLimit(plan, participantCount, null);
    }

    public void validateParticipantLimit(Plan plan, int participantCount, Integer sessionMaxParticipantsOverride) {
        if (sessionMaxParticipantsOverride != null && sessionMaxParticipantsOverride > 0) {
            if (participantCount > sessionMaxParticipantsOverride) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "This group session allows at most " + sessionMaxParticipantsOverride + " participants."
                );
            }
            return;
        }
        if (plan == null || plan.segments() == null) return;
        for (Segment segment : plan.segments()) {
            Integer maximum = segment.type().getMaxParticipantsPerSession();
            if (maximum != null && maximum > 0 && participantCount > maximum) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "The selected service allows at most " + maximum + " participants per session."
                );
            }
        }
    }

    public void validateGroupBooking(Plan plan, boolean groupSession) {
        if (!groupSession || plan == null) return;
        for (Segment segment : plan.segments()) {
            if (!segment.type().isGroupBookingEnabled()) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Selected service type is not enabled for group bookings: " + segment.type().getName()
                );
            }
        }
    }

    public void synchronize(SessionBooking booking, Plan plan) {
        if (booking == null || plan == null) return;
        booking.setStartTime(plan.startTime());
        booking.setEndTime(plan.endTime());
        booking.setAvailabilityEndTime(plan.availabilityEndTime());
        booking.setType(plan.primaryType());
        booking.setSpace(plan.primarySpace());
        if (plan.primarySpace() != null && plan.primarySpace().getLocation() != null) {
            booking.setLocation(plan.primarySpace().getLocation());
        }

        Map<Integer, SessionService> existingByPosition = new LinkedHashMap<>();
        if (booking.getServices() != null) {
            for (SessionService existing : booking.getServices()) {
                existingByPosition.putIfAbsent(existing.getPosition(), existing);
            }
        }
        List<SessionService> desired = new ArrayList<>();
        for (Segment segment : plan.segments()) {
            SessionService service = existingByPosition.remove(segment.position());
            if (service == null) service = new SessionService();
            service.setSessionBooking(booking);
            service.setSessionType(segment.type());
            service.setSpace(segment.space());
            service.setPosition(segment.position());
            service.setStartTime(segment.startTime());
            service.setEndTime(segment.endTime());
            service.setDurationMinutesSnapshot(segment.durationMinutes());
            service.setBreakMinutesSnapshot(segment.breakMinutes());
            service.setServiceNameSnapshot(
                    segment.serviceNameSnapshot() == null ? visibleServiceDescription(segment.type()) : segment.serviceNameSnapshot());
            service.setColorSnapshot(segment.colorSnapshot());
            service.setPriceCalculationModeSnapshot(
                    segment.priceCalculationModeSnapshot() == null
                            ? Segment.priceModeName(segment.type())
                            : segment.priceCalculationModeSnapshot());
            service.setServiceGroupIdSnapshot(segment.serviceGroupIdSnapshot());
            service.setServiceGroupNameSnapshot(segment.serviceGroupNameSnapshot());
            desired.add(service);
        }
        booking.getServices().removeIf(service -> !desired.contains(service));
        for (SessionService service : desired) {
            if (!booking.getServices().contains(service)) booking.getServices().add(service);
        }
        booking.getServices().sort(Comparator.comparingInt(SessionService::getPosition));
    }

    public Plan fromBooking(SessionBooking booking) {
        if (booking == null || booking.getCompany() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Booking is required.");
        }
        List<SessionService> sourceServices = SessionServiceSupport.orderedServices(booking);
        if (sourceServices.isEmpty()) {
            return resolveLegacy(
                    booking.getCompany().getId(),
                    booking.getType() == null ? null : booking.getType().getId(),
                    booking.getSpace() == null ? null : booking.getSpace().getId(),
                    booking.getStartTime(),
                    booking.getEndTime()
            );
        }
        List<Segment> segments = new ArrayList<>();
        LocalDateTime cursor = booking.getStartTime();
        for (int index = 0; index < sourceServices.size(); index++) {
            SessionService service = sourceServices.get(index);
            int duration = Math.max(1, service.getDurationMinutesSnapshot());
            int breakMinutes = index == sourceServices.size() - 1
                    ? Math.max(0, service.getBreakMinutesSnapshot())
                    : 0;
            LocalDateTime serviceEnd = cursor.plusMinutes(duration);
            segments.add(new Segment(
                    service.getPosition(),
                    service.getSessionType(),
                    service.getSpace(),
                    cursor,
                    serviceEnd,
                    duration,
                    breakMinutes,
                    service.getServiceNameSnapshot(),
                    service.getColorSnapshot(),
                    service.getPriceCalculationModeSnapshot(),
                    service.getServiceGroupIdSnapshot(),
                    service.getServiceGroupNameSnapshot()
            ));
            cursor = serviceEnd;
        }
        Segment first = segments.get(0);
        Segment last = segments.get(segments.size() - 1);
        return new Plan(
                segments,
                first.startTime(),
                last.endTime(),
                last.availabilityEndTime(),
                false
        );
    }

    public Plan retimeExisting(SessionBooking booking, LocalDateTime newStart) {
        if (booking == null || newStart == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Booking and start time are required.");
        }
        Plan current = fromBooking(booking);
        if (current.segments().isEmpty()) {
            LocalDateTime oldStart = booking.getStartTime();
            LocalDateTime oldEnd = booking.getEndTime();
            if (oldStart == null || oldEnd == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid booking time window.");
            }
            return resolveLegacy(
                    booking.getCompany().getId(),
                    booking.getType() == null ? null : booking.getType().getId(),
                    booking.getSpace() == null ? null : booking.getSpace().getId(),
                    newStart,
                    newStart.plus(Duration.between(oldStart, oldEnd))
            );
        }
        LocalDateTime oldStart = current.startTime();
        Duration shift = Duration.between(oldStart, newStart);
        List<Segment> shifted = current.segments().stream()
                .map(segment -> new Segment(
                        segment.position(),
                        segment.type(),
                        segment.space(),
                        segment.startTime().plus(shift),
                        segment.endTime().plus(shift),
                        segment.durationMinutes(),
                        segment.breakMinutes(),
                        segment.serviceNameSnapshot(),
                        segment.colorSnapshot(),
                        segment.priceCalculationModeSnapshot(),
                        segment.serviceGroupIdSnapshot(),
                        segment.serviceGroupNameSnapshot()
                ))
                .toList();
        Segment last = shifted.get(shifted.size() - 1);
        return new Plan(
                shifted,
                newStart,
                last.endTime(),
                last.availabilityEndTime(),
                true
        );
    }

    public void copy(SessionBooking source, SessionBooking target) {
        if (source == null || target == null) return;
        synchronize(target, fromBooking(source));
    }


    private int effectiveBreakMinutes(SessionType type, Long locationId) {
        if (type == null) return 0;
        if (breakSettings != null) return Math.max(0, breakSettings.effectiveBreakMinutes(type, locationId));
        return Math.max(0, type.getBreakMinutes() == null ? 0 : type.getBreakMinutes());
    }

    private static String visibleServiceDescription(SessionType type) {
        if (type == null) return null;
        if (type.getDescription() != null && !type.getDescription().isBlank()) {
            return type.getDescription().trim();
        }
        return type.getName();
    }

    private SessionType requireActiveType(Long typeId, Long companyId) {
        if (typeId == null || typeId <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid type");
        }
        SessionType type = sessionTypes.findByIdAndCompanyIdWithLinkedServices(typeId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid type for this company"));
        if (!type.isActive()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected service type is inactive.");
        }
        return type;
    }

    private Space resolveSpace(Long spaceId, Long companyId) {
        if (spaceId == null) return null;
        return spaces.findByIdAndCompanyId(spaceId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid space"));
    }
}
