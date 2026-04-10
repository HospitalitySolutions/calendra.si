package com.example.app.session;

import com.example.app.client.ClientRepository;
import com.example.app.company.CompanyRepository;
import com.example.app.google.GoogleMeetService;
import com.example.app.reminder.ReminderService;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.security.SecurityUtils;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import com.example.app.zoom.ZoomService;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class SessionBookingCreationService {
    private static final long EXCLUDE_NONE_SENTINEL = -1L;

    private final SessionBookingRepository repo;
    private final PersonalCalendarBlockRepository personalBlocks;
    private final ClientRepository clients;
    private final UserRepository users;
    private final SpaceRepository spaces;
    private final SessionTypeRepository types;
    private final CompanyRepository companies;
    private final AppSettingRepository settings;
    private final ReminderService reminderService;
    private final ZoomService zoomService;
    private final GoogleMeetService googleMeetService;

    public SessionBookingCreationService(
            SessionBookingRepository repo,
            PersonalCalendarBlockRepository personalBlocks,
            ClientRepository clients,
            UserRepository users,
            SpaceRepository spaces,
            SessionTypeRepository types,
            CompanyRepository companies,
            AppSettingRepository settings,
            ReminderService reminderService,
            ZoomService zoomService,
            GoogleMeetService googleMeetService) {
        this.repo = repo;
        this.personalBlocks = personalBlocks;
        this.clients = clients;
        this.users = users;
        this.spaces = spaces;
        this.types = types;
        this.companies = companies;
        this.settings = settings;
        this.reminderService = reminderService;
        this.zoomService = zoomService;
        this.googleMeetService = googleMeetService;
    }

    @Transactional
    public SessionBookingController.BookingResponse create(SessionBookingController.BookingRequest req, User me) {
        var companyId = me.getCompany().getId();
        LocalDateTime start = parseToLocalDateTime(req.startTime());
        LocalDateTime end = parseToLocalDateTime(req.endTime());
        Long consultantId = resolveConsultantId(req, me);
        companies.findByIdForUpdate(companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Company not found"));
        validateBookingWindow(
            companyId,
            consultantId,
            req.spaceId(),
            start,
            end,
            req.typeId(),
            bookingExcludeIds(null),
            isSpacesEnabled(companyId),
            isOnlineRequest(req),
            Boolean.TRUE.equals(req.allowPersonalBlockOverlap())
        );
        var booking = new SessionBooking();
        var meetingLink = req.meetingLink();
        if (Boolean.TRUE.equals(req.online()) && (meetingLink == null || meetingLink.isBlank())) {
            if (consultantId == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Online sessions require a meeting link when no consultant is assigned.");
            }
            meetingLink = createMeetingUrl(consultantId, start, end, req.meetingProvider());
        }
        apply(booking, req, me, start, end, companyId, meetingLink);
        booking = repo.save(booking);
        reminderService.sendBookingConfirmation(booking);
        return SessionBookingController.toResponse(booking);
    }

    @Transactional
    public SessionBookingController.BookingResponse update(Long id, SessionBookingController.BookingRequest req, User me) {
        var companyId = me.getCompany().getId();
        var booking = repo.findByIdAndCompanyId(id, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!SecurityUtils.isAdmin(me)
                && (booking.getConsultant() == null || !booking.getConsultant().getId().equals(me.getId()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        LocalDateTime start = parseToLocalDateTime(req.startTime());
        LocalDateTime end = parseToLocalDateTime(req.endTime());
        Long consultantId = resolveConsultantId(req, me);
        companies.findByIdForUpdate(companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Company not found"));
        validateBookingWindow(
            companyId,
            consultantId,
            req.spaceId(),
            start,
            end,
            req.typeId(),
            bookingExcludeIds(id),
            isSpacesEnabled(companyId),
            isOnlineRequest(req),
            Boolean.TRUE.equals(req.allowPersonalBlockOverlap())
        );
        var meetingLink = req.meetingLink();
        if (Boolean.TRUE.equals(req.online()) && (meetingLink == null || meetingLink.isBlank())) {
            if (consultantId == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Online sessions require a meeting link when no consultant is assigned.");
            }
            meetingLink = createMeetingUrl(consultantId, start, end, req.meetingProvider());
        }
        LocalDateTime previousStart = booking.getStartTime();
        LocalDateTime previousEnd = booking.getEndTime();
        apply(booking, req, me, start, end, companyId, meetingLink);
        booking = repo.save(booking);
        boolean timeChanged = !previousStart.equals(booking.getStartTime()) || !previousEnd.equals(booking.getEndTime());
        if (timeChanged) {
            reminderService.sendSessionRescheduled(booking, previousStart, previousEnd);
        }
        return SessionBookingController.toResponse(booking);
    }

    public void validateBookingWindow(Long companyId, Long consultantId, Long spaceId, LocalDateTime start, LocalDateTime end,
                                      Long typeId, List<Long> excludeIds, boolean spacesEnabled, boolean online, boolean allowPersonalBlockOverlap) {
        final int requestedBreakMinutes = getRequestedBreakMinutes(companyId, typeId);
        final LocalDateTime requestedBusyEnd = effectiveEnd(end, requestedBreakMinutes);
        final var companyBookings = repo.findAllByCompanyId(companyId);

        if (spacesEnabled) {
            if (consultantId != null) {
                boolean consultantOverlap = companyBookings.stream()
                        .filter(existing -> !excludeIds.contains(existing.getId()))
                        .filter(existing -> existing.getConsultant() != null && consultantId.equals(existing.getConsultant().getId()))
                        .anyMatch(existing -> intervalsOverlap(start, requestedBusyEnd, existing.getStartTime(), effectiveEnd(existing)));
                if (consultantOverlap) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "This consultant already has a session at that time.");
                }
                if (!allowPersonalBlockOverlap && personalBlocks.existsOverlappingForOwner(consultantId, companyId, start, requestedBusyEnd)) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "This consultant already has a personal session at that time.");
                }
            } else {
                // When a physical space is selected, enforce overlap by space (below) rather than
                // globally across all unassigned sessions; otherwise one unassigned booking would
                // incorrectly block every other space at the same time.
                boolean useGlobalUnassignedPool = online || spaceId == null;
                if (useGlobalUnassignedPool) {
                    boolean unassignedOverlap = companyBookings.stream()
                            .filter(existing -> !excludeIds.contains(existing.getId()))
                            .filter(existing -> existing.getConsultant() == null)
                            .anyMatch(existing -> intervalsOverlap(start, requestedBusyEnd, existing.getStartTime(), effectiveEnd(existing)));
                    if (unassignedOverlap) {
                        throw new ResponseStatusException(HttpStatus.CONFLICT, "Another unassigned session already occupies this time.");
                    }
                }
            }
            if (!online && spaceId != null) {
                boolean spaceOverlap = companyBookings.stream()
                        .filter(existing -> !excludeIds.contains(existing.getId()))
                        .filter(existing -> existing.getSpace() != null && spaceId.equals(existing.getSpace().getId()))
                        .filter(existing -> existing.getMeetingLink() == null || existing.getMeetingLink().isBlank())
                        .anyMatch(existing -> intervalsOverlap(start, requestedBusyEnd, existing.getStartTime(), effectiveEnd(existing)));
                if (spaceOverlap) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "This space is already booked at that time.");
                }
            }
        } else {
            boolean companyOverlap = companyBookings.stream()
                    .filter(existing -> !excludeIds.contains(existing.getId()))
                    .anyMatch(existing -> intervalsOverlap(start, requestedBusyEnd, existing.getStartTime(), effectiveEnd(existing)));
            if (companyOverlap) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "A session already exists at that time.");
            }
            if (consultantId != null && !allowPersonalBlockOverlap
                    && personalBlocks.existsOverlappingForOwner(consultantId, companyId, start, requestedBusyEnd)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "This consultant already has a personal session at that time.");
            }
        }
    }

    private int getRequestedBreakMinutes(Long companyId, Long typeId) {
        if (typeId == null) return 0;
        var type = types.findById(typeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid type"));
        if (!type.getCompany().getId().equals(companyId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid type for this company");
        }
        return Math.max(0, type.getBreakMinutes() != null ? type.getBreakMinutes() : 0);
    }

    private static LocalDateTime effectiveEnd(LocalDateTime end, int breakMinutes) {
        return breakMinutes > 0 ? end.plusMinutes(breakMinutes) : end;
    }

    private static LocalDateTime effectiveEnd(SessionBooking booking) {
        int breakMinutes = 0;
        if (booking.getType() != null && booking.getType().getBreakMinutes() != null) {
            breakMinutes = Math.max(0, booking.getType().getBreakMinutes());
        }
        return effectiveEnd(booking.getEndTime(), breakMinutes);
    }

    private static boolean intervalsOverlap(LocalDateTime startA, LocalDateTime endA, LocalDateTime startB, LocalDateTime endB) {
        return startA.isBefore(endB) && endA.isAfter(startB);
    }

    public static List<Long> bookingExcludeIds(Long excludeId) {
        return excludeId == null ? List.of(EXCLUDE_NONE_SENTINEL) : List.of(excludeId);
    }

    public static List<Long> bookingExcludeIds(Long id1, Long id2) {
        return List.of(id1, id2);
    }

    public boolean isSpacesEnabled(Long companyId) {
        return settings.findByCompanyIdAndKey(companyId, SettingKey.SPACES_ENABLED)
                .map(s -> "true".equalsIgnoreCase(s.getValue().trim()))
                .orElse(false);
    }

    private Long resolveConsultantId(SessionBookingController.BookingRequest req, User me) {
        if (SecurityUtils.isAdmin(me)) {
            return req.consultantId();
        }
        return me.getId();
    }

    private void apply(SessionBooking booking, SessionBookingController.BookingRequest req, User me, LocalDateTime start, LocalDateTime end, Long companyId, String meetingLink) {
        booking.setCompany(me.getCompany());

        var client = clients.findByIdAndCompanyId(req.clientId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid client"));
        if (!SecurityUtils.isAdmin(me) && client.getAssignedTo() != null && !client.getAssignedTo().getId().equals(me.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Client is not assigned to you.");
        }
        booking.setClient(client);

        if (SecurityUtils.isAdmin(me)) {
            if (req.consultantId() == null) {
                booking.setConsultant(null);
            } else {
                User consultant = users.findByIdAndCompanyId(req.consultantId(), companyId)
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid consultant"));
                if (!consultant.isConsultant() && consultant.getRole() != Role.CONSULTANT) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected user is not marked as consultant");
                }
                booking.setConsultant(consultant);
            }
        } else {
            booking.setConsultant(me);
        }

        booking.setStartTime(start);
        booking.setEndTime(end);
        if (req.spaceId() == null) {
            booking.setSpace(null);
        } else {
            booking.setSpace(spaces.findByIdAndCompanyId(req.spaceId(), companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid space")));
        }

        if (req.typeId() == null) {
            booking.setType(null);
        } else {
            var type = types.findById(req.typeId()).orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid type"));
            if (!type.getCompany().getId().equals(companyId)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid type for this company");
            }
            booking.setType(type);
        }
        booking.setNotes(req.notes() != null ? req.notes().trim() : "");
        boolean hasMeeting = meetingLink != null && !meetingLink.isBlank();
        booking.setMeetingLink(hasMeeting ? meetingLink : null);
        if (hasMeeting) {
            String provider = req.meetingProvider();
            booking.setMeetingProvider(provider != null && "google".equalsIgnoreCase(provider) ? "google" : "zoom");
        } else {
            booking.setMeetingProvider(null);
        }
    }

    private String createMeetingUrl(Long consultantId, LocalDateTime start, LocalDateTime end, String provider) {
        if (provider != null && "google".equalsIgnoreCase(provider)) {
            return googleMeetService.createMeetingUrl(consultantId, start, end, "Session");
        }
        return zoomService.createMeetingUrl(consultantId, start, end, "Session");
    }

    private static boolean isOnlineRequest(SessionBookingController.BookingRequest req) {
        if (Boolean.TRUE.equals(req.online())) return true;
        return req.meetingLink() != null && !req.meetingLink().isBlank();
    }

    private static LocalDateTime parseToLocalDateTime(String value) {
        if (value == null || value.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "startTime/endTime are required");
        }
        try {
            if (value.endsWith("Z") || value.matches(".*[+-]\\d\\d:\\d\\d$")) {
                return OffsetDateTime.parse(value).toLocalDateTime();
            }
            return LocalDateTime.parse(value, DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid date-time: " + value);
        }
    }
}
