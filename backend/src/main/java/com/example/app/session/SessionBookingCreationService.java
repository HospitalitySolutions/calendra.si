package com.example.app.session;

import com.example.app.client.Client;
import com.example.app.client.ClientRepository;
import com.example.app.company.ClientCompany;
import com.example.app.company.ClientCompanyRepository;
import com.example.app.company.CompanyRepository;
import com.example.app.group.ClientGroup;
import com.example.app.group.ClientGroupRepository;
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
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;
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
    private final ClientGroupRepository groupRepository;
    private final ClientCompanyRepository clientCompanies;
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
            ClientGroupRepository groupRepository,
            ClientCompanyRepository clientCompanies,
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
        this.groupRepository = groupRepository;
        this.clientCompanies = clientCompanies;
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
        boolean spacesEnabled = isSpacesEnabled(companyId);
        boolean multipleSessionsPerSpaceEnabled = isMultipleSessionsPerSpaceEnabled(companyId);
        boolean multipleClientsPerSessionEnabled = isMultipleClientsPerSessionEnabled(companyId);
        ClientGroup clientGroup = resolveGroup(req.groupId(), companyId);
        List<Long> requestedClientIds;
        if (clientGroup != null) {
            boolean explicitEmptySessionClients =
                    req.clientIds() != null
                            && req.clientIds().isEmpty()
                            && (req.clientId() == null || req.clientId() <= 0);
            if (explicitEmptySessionClients) {
                requestedClientIds = List.of();
            } else if (hasPositiveClientIdsInRequest(req)) {
                requestedClientIds = resolveRequestedClientIds(req, true);
            } else {
                requestedClientIds = clientGroup.getMembers().stream().map(Client::getId).toList();
            }
        } else {
            requestedClientIds = resolveRequestedClientIds(req, multipleClientsPerSessionEnabled);
        }
        validateTypeParticipantLimit(req.typeId(), companyId, requestedClientIds.size());
        validateBookingWindow(
                companyId,
                requestedClientIds,
                consultantId,
                req.spaceId(),
                start,
                end,
                req.typeId(),
                bookingExcludeIds(null),
                spacesEnabled,
                multipleSessionsPerSpaceEnabled,
                clientGroup != null || multipleClientsPerSessionEnabled,
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
        String groupKey = UUID.randomUUID().toString();
        List<SessionBooking> saved = new ArrayList<>();
        if (requestedClientIds.isEmpty()) {
            var booking = new SessionBooking();
            booking.setBookingGroupKey(groupKey);
            applySharedFields(booking, req, me, start, end, companyId, meetingLink);
            booking.setClient(null);
            booking.setClientGroup(clientGroup);
            mergeSessionGroupOverrides(booking, req, companyId, clientGroup);
            booking = repo.save(booking);
            saved.add(booking);
            reminderService.sendBookingConfirmation(booking);
        } else {
            for (Long clientId : requestedClientIds) {
                var booking = new SessionBooking();
                booking.setBookingGroupKey(groupKey);
                applySharedFields(booking, req, me, start, end, companyId, meetingLink);
                booking.setClient(requireClient(clientId, companyId, me));
                booking.setClientGroup(clientGroup);
                mergeSessionGroupOverrides(booking, req, companyId, clientGroup);
                booking = repo.save(booking);
                saved.add(booking);
                reminderService.sendBookingConfirmation(booking);
            }
        }
        return SessionBookingController.toGroupedResponse(saved);
    }

    @Transactional
    public SessionBookingController.BookingResponse update(Long id, SessionBookingController.BookingRequest req, User me) {
        var companyId = me.getCompany().getId();
        var booking = repo.findByIdAndCompanyId(id, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        var existingRows = loadGroupedRows(booking, companyId);
        var representative = existingRows.get(0);
        if (!SecurityUtils.isAdmin(me)
                && (representative.getConsultant() == null || !representative.getConsultant().getId().equals(me.getId()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        LocalDateTime start = parseToLocalDateTime(req.startTime());
        LocalDateTime end = parseToLocalDateTime(req.endTime());
        Long consultantId = resolveConsultantId(req, me);
        companies.findByIdForUpdate(companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Company not found"));
        boolean spacesEnabled = isSpacesEnabled(companyId);
        boolean multipleSessionsPerSpaceEnabled = isMultipleSessionsPerSpaceEnabled(companyId);
        boolean multipleClientsPerSessionEnabled = isMultipleClientsPerSessionEnabled(companyId);
        boolean allowMultipleClientsForRequest =
                representative.getClientGroup() != null || multipleClientsPerSessionEnabled;
        List<Long> requestedClientIds;
        if (representative.getClientGroup() != null) {
            boolean explicitEmpty =
                    req.clientIds() != null
                            && req.clientIds().isEmpty()
                            && (req.clientId() == null || req.clientId() <= 0);
            if (explicitEmpty) {
                requestedClientIds = List.of();
            } else if (hasPositiveClientIdsInRequest(req)) {
                requestedClientIds = resolveRequestedClientIds(req, true);
            } else {
                requestedClientIds = existingRows.stream()
                        .map(SessionBooking::getClient)
                        .filter(client -> client != null)
                        .map(Client::getId)
                        .distinct()
                        .toList();
            }
        } else {
            requestedClientIds = resolveRequestedClientIds(req, allowMultipleClientsForRequest);
        }
        validateTypeParticipantLimit(req.typeId(), companyId, requestedClientIds.size());
        var excludeIds = existingRows.stream().map(SessionBooking::getId).toList();
        validateBookingWindow(
                companyId,
                requestedClientIds,
                consultantId,
                req.spaceId(),
                start,
                end,
                req.typeId(),
                excludeIds,
                spacesEnabled,
                multipleSessionsPerSpaceEnabled,
                allowMultipleClientsForRequest,
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
        String groupKey = SessionBookingController.groupKey(representative);
        if (requestedClientIds.isEmpty() && representative.getClientGroup() != null) {
            return consolidateGroupSessionToPlaceholderRow(
                    existingRows, groupKey, req, me, start, end, companyId, meetingLink);
        }
        var existingByClientId = new java.util.LinkedHashMap<Long, SessionBooking>();
        for (var row : existingRows) {
            if (row.getClient() != null) {
                existingByClientId.put(row.getClient().getId(), row);
            }
        }
        List<SessionBooking> saved = new ArrayList<>();
        for (Long clientId : requestedClientIds) {
            SessionBooking row = existingByClientId.remove(clientId);
            boolean created = false;
            LocalDateTime previousStart = null;
            LocalDateTime previousEnd = null;
            if (row == null) {
                row = new SessionBooking();
                row.setBookingGroupKey(groupKey);
                created = true;
            } else {
                previousStart = row.getStartTime();
                previousEnd = row.getEndTime();
            }
            applySharedFields(row, req, me, start, end, companyId, meetingLink);
            row.setBookingGroupKey(groupKey);
            row.setClient(requireClient(clientId, companyId, me));
            row.setClientGroup(representative.getClientGroup());
            mergeSessionGroupOverrides(row, req, companyId, representative.getClientGroup());
            row = repo.save(row);
            saved.add(row);
            if (created) {
                reminderService.sendBookingConfirmation(row);
            } else if (!previousStart.equals(row.getStartTime()) || !previousEnd.equals(row.getEndTime())) {
                reminderService.sendSessionRescheduled(row, previousStart, previousEnd);
            }
        }
        if (!existingByClientId.isEmpty()) {
            for (var row : existingByClientId.values()) {
                reminderService.sendSessionCancelled(row);
            }
            repo.deleteAll(existingByClientId.values());
        }
        return SessionBookingController.toGroupedResponse(saved);
    }


    public record ChannelBookingRequest(
            Long companyId,
            Long clientId,
            Long consultantId,
            LocalDateTime start,
            LocalDateTime end,
            Long spaceId,
            Long typeId,
            String notes,
            String meetingLink,
            Boolean online,
            String meetingProvider,
            boolean allowPersonalBlockOverlap,
            String sourceChannel,
            String sourceOrderId,
            String guestUserId,
            String bookingStatus,
            boolean sendConfirmation
    ) {}

    public record GroupJoinRequest(
            Long companyId,
            Long representativeBookingId,
            Long clientId,
            String sourceChannel,
            String sourceOrderId,
            String guestUserId,
            String bookingStatus,
            boolean sendConfirmation
    ) {}

    @Transactional
    public SessionBooking createChannelBooking(ChannelBookingRequest request) {
        if (request == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Booking request is required.");
        }
        Long companyId = request.companyId();
        if (companyId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Company is required.");
        }
        LocalDateTime start = request.start();
        LocalDateTime end = request.end();
        if (start == null || end == null || !end.isAfter(start)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid booking time window.");
        }

        Client client = requireClientForCompany(request.clientId(), companyId);
        companies.findByIdForUpdate(companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Company not found"));

        boolean spacesEnabled = isSpacesEnabled(companyId);
        boolean multipleSessionsPerSpaceEnabled = isMultipleSessionsPerSpaceEnabled(companyId);
        validateTypeParticipantLimit(request.typeId(), companyId, 1);
        validateBookingWindow(
                companyId,
                List.of(client.getId()),
                request.consultantId(),
                request.spaceId(),
                start,
                end,
                request.typeId(),
                bookingExcludeIds((Long) null),
                spacesEnabled,
                multipleSessionsPerSpaceEnabled,
                false,
                Boolean.TRUE.equals(request.online()) || (request.meetingLink() != null && !request.meetingLink().isBlank()),
                request.allowPersonalBlockOverlap()
        );

        User actor = resolveAdminActor(companyId);
        String meetingLink = request.meetingLink();
        if (Boolean.TRUE.equals(request.online()) && (meetingLink == null || meetingLink.isBlank())) {
            if (request.consultantId() == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Online sessions require a meeting link when no consultant is assigned.");
            }
            meetingLink = createMeetingUrl(request.consultantId(), start, end, request.meetingProvider());
        }

        SessionBookingController.BookingRequest internalRequest = new SessionBookingController.BookingRequest(
                client.getId(),
                List.of(client.getId()),
                request.consultantId(),
                start.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME),
                end.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME),
                request.spaceId(),
                request.typeId(),
                request.notes(),
                meetingLink,
                request.online(),
                request.meetingProvider(),
                request.allowPersonalBlockOverlap(),
                null,
                null,
                null
        );

        SessionBooking booking = new SessionBooking();
        booking.setBookingGroupKey(UUID.randomUUID().toString());
        applySharedFields(booking, internalRequest, actor, start, end, companyId, meetingLink);
        booking.setClient(client);
        applyChannelMetadata(booking, request.sourceChannel(), request.sourceOrderId(), request.guestUserId(), request.bookingStatus());
        booking = repo.save(booking);
        if (request.sendConfirmation()) {
            reminderService.sendBookingConfirmation(booking);
        }
        return booking;
    }

    @Transactional
    public SessionBooking joinClientToGroupSession(GroupJoinRequest request) {
        if (request == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Group join request is required.");
        }
        Long companyId = request.companyId();
        if (companyId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Company is required.");
        }
        if (request.representativeBookingId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Group session is required.");
        }

        companies.findByIdForUpdate(companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Company not found"));

        SessionBooking representative = repo.findByIdAndCompanyId(request.representativeBookingId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Group session not found."));
        if (representative.getClientGroup() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected session is not a group session.");
        }
        if (!representative.getStartTime().isAfter(LocalDateTime.now())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected group session is in the past.");
        }

        List<SessionBooking> existingRows = loadGroupedRows(representative, companyId);
        long bookedParticipants = existingRows.stream()
                .map(SessionBooking::getClient)
                .filter(clientRow -> clientRow != null)
                .map(Client::getId)
                .distinct()
                .count();
        SessionType type = representative.getType();
        if (type == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected group session has no session type.");
        }
        Integer maxParticipants = type.getMaxParticipantsPerSession();
        if (maxParticipants != null && bookedParticipants >= maxParticipants) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This group session is already full.");
        }

        Client client = requireClientForCompany(request.clientId(), companyId);
        boolean alreadyBooked = existingRows.stream()
                .map(SessionBooking::getClient)
                .filter(existing -> existing != null)
                .anyMatch(existing -> existing.getId().equals(client.getId()));
        if (alreadyBooked) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This guest is already booked into the selected group session.");
        }

        validateBookingWindow(
                companyId,
                List.of(client.getId()),
                representative.getConsultant() != null ? representative.getConsultant().getId() : null,
                representative.getSpace() != null ? representative.getSpace().getId() : null,
                representative.getStartTime(),
                representative.getEndTime(),
                representative.getType() != null ? representative.getType().getId() : null,
                existingRows.stream().map(SessionBooking::getId).toList(),
                isSpacesEnabled(companyId),
                isMultipleSessionsPerSpaceEnabled(companyId),
                true,
                representative.getMeetingLink() != null && !representative.getMeetingLink().isBlank(),
                false
        );

        SessionBooking joined = new SessionBooking();
        joined.setCompany(representative.getCompany());
        joined.setClient(client);
        joined.setBookingGroupKey(SessionBookingController.groupKey(representative));
        joined.setConsultant(representative.getConsultant());
        joined.setStartTime(representative.getStartTime());
        joined.setEndTime(representative.getEndTime());
        joined.setSpace(representative.getSpace());
        joined.setType(representative.getType());
        joined.setNotes(representative.getNotes());
        joined.setMeetingLink(representative.getMeetingLink());
        joined.setMeetingProvider(representative.getMeetingProvider());
        joined.setClientGroup(representative.getClientGroup());
        joined.setSessionGroupEmailOverride(representative.getSessionGroupEmailOverride());
        joined.setSessionGroupBillingCompany(representative.getSessionGroupBillingCompany());
        applyChannelMetadata(joined, request.sourceChannel(), request.sourceOrderId(), request.guestUserId(), request.bookingStatus());
        joined = repo.save(joined);
        if (request.sendConfirmation()) {
            reminderService.sendBookingConfirmation(joined);
        }
        return joined;
    }

    public void validateBookingWindow(Long companyId, List<Long> clientIds, Long consultantId, Long spaceId, LocalDateTime start, LocalDateTime end,
                                      Long typeId, List<Long> excludeIds, boolean spacesEnabled, boolean multipleSessionsPerSpaceEnabled,
                                      boolean multipleClientsPerSessionEnabled, boolean online, boolean allowPersonalBlockOverlap) {
        var requestedClientIds = clientIds == null ? List.<Long>of() : clientIds.stream().filter(id -> id != null && id > 0).distinct().toList();
        if (!multipleClientsPerSessionEnabled && requestedClientIds.size() > 1) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Multiple clients per session is disabled.");
        }
        final int requestedBreakMinutes = getRequestedBreakMinutes(companyId, typeId);
        final LocalDateTime requestedBusyEnd = effectiveEnd(end, requestedBreakMinutes);
        final var companyBookings = repo.findAllByCompanyId(companyId);

        for (Long clientId : requestedClientIds) {
            boolean clientOverlap = companyBookings.stream()
                    .filter(existing -> !excludeIds.contains(existing.getId()))
                    .filter(existing -> existing.getClient() != null && clientId.equals(existing.getClient().getId()))
                    .anyMatch(existing -> intervalsOverlap(start, end, existing.getStartTime(), existing.getEndTime()));
            if (clientOverlap) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "One of the selected clients already has a session at that time.");
            }
        }

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
        }

        if (spacesEnabled && !multipleSessionsPerSpaceEnabled && !online && spaceId != null) {
            boolean spaceOverlap = companyBookings.stream()
                    .filter(existing -> !excludeIds.contains(existing.getId()))
                    .filter(existing -> existing.getSpace() != null && spaceId.equals(existing.getSpace().getId()))
                    .filter(existing -> existing.getMeetingLink() == null || existing.getMeetingLink().isBlank())
                    .anyMatch(existing -> intervalsOverlap(start, requestedBusyEnd, existing.getStartTime(), effectiveEnd(existing)));
            if (spaceOverlap) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "This space is already booked at that time.");
            }
        }
    }

    private static boolean hasPositiveClientIdsInRequest(SessionBookingController.BookingRequest req) {
        if (req.clientId() != null && req.clientId() > 0) {
            return true;
        }
        if (req.clientIds() == null) {
            return false;
        }
        return req.clientIds().stream().anyMatch(id -> id != null && id > 0);
    }

    private List<Long> resolveRequestedClientIds(SessionBookingController.BookingRequest req, boolean multipleClientsPerSessionEnabled) {
        LinkedHashSet<Long> ids = new LinkedHashSet<>();
        if (req.clientIds() != null) {
            req.clientIds().stream()
                    .filter(id -> id != null && id > 0)
                    .forEach(ids::add);
        }
        if (req.clientId() != null && req.clientId() > 0) {
            ids.add(req.clientId());
        }
        if (ids.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid client");
        }
        if (!multipleClientsPerSessionEnabled && ids.size() > 1) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Multiple clients per session is disabled.");
        }
        return List.copyOf(ids);
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
        return isBooleanSettingEnabled(companyId, SettingKey.SPACES_ENABLED, false);
    }

    public boolean isMultipleSessionsPerSpaceEnabled(Long companyId) {
        return isBooleanSettingEnabled(companyId, SettingKey.MULTIPLE_SESSIONS_PER_SPACE_ENABLED, false);
    }

    public boolean isMultipleClientsPerSessionEnabled(Long companyId) {
        return isBooleanSettingEnabled(companyId, SettingKey.MULTIPLE_CLIENTS_PER_SESSION_ENABLED, false);
    }

    private boolean isBooleanSettingEnabled(Long companyId, SettingKey key, boolean defaultValue) {
        return settings.findByCompanyIdAndKey(companyId, key)
                .map(s -> "true".equalsIgnoreCase(s.getValue().trim()))
                .orElse(defaultValue);
    }

    private Long resolveConsultantId(SessionBookingController.BookingRequest req, User me) {
        if (SecurityUtils.isAdmin(me)) {
            return req.consultantId();
        }
        return me.getId();
    }

    private Client requireClient(Long clientId, Long companyId, User me) {
        var client = clients.findByIdAndCompanyId(clientId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid client"));
        if (!SecurityUtils.isAdmin(me) && client.getAssignedTo() != null && !client.getAssignedTo().getId().equals(me.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Client is not assigned to you.");
        }
        return client;
    }

    private Client requireClientForCompany(Long clientId, Long companyId) {
        if (clientId == null || clientId <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid client");
        }
        return clients.findByIdAndCompanyId(clientId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid client"));
    }

    private User resolveAdminActor(Long companyId) {
        return users.findAllByCompanyId(companyId).stream()
                .filter(User::isActive)
                .filter(user -> user.getRole() == Role.ADMIN)
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "No admin user available for tenancy."));
    }

    private void applyChannelMetadata(SessionBooking booking, String sourceChannel, String sourceOrderId, String guestUserId, String bookingStatus) {
        booking.setSourceChannel(sourceChannel == null || sourceChannel.isBlank() ? "STAFF" : sourceChannel.trim());
        booking.setSourceOrderId(sourceOrderId == null || sourceOrderId.isBlank() ? null : sourceOrderId.trim());
        booking.setGuestUserId(guestUserId == null || guestUserId.isBlank() ? null : guestUserId.trim());
        booking.setBookingStatus(bookingStatus == null || bookingStatus.isBlank() ? "CONFIRMED" : bookingStatus.trim());
    }

    private void applySharedFields(SessionBooking booking, SessionBookingController.BookingRequest req, User me, LocalDateTime start, LocalDateTime end, Long companyId, String meetingLink) {
        booking.setCompany(me.getCompany());

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

    private List<SessionBooking> loadGroupedRows(SessionBooking booking, Long companyId) {
        var rows = repo.findByBookingGroupKeyAndCompanyIdOrderByIdAsc(SessionBookingController.groupKey(booking), companyId);
        if (rows == null || rows.isEmpty()) {
            return List.of(booking);
        }
        return rows;
    }

    private String createMeetingUrl(Long consultantId, LocalDateTime start, LocalDateTime end, String provider) {
        if (provider != null && "google".equalsIgnoreCase(provider)) {
            return googleMeetService.createMeetingUrl(consultantId, start, end, "Session");
        }
        return zoomService.createMeetingUrl(consultantId, start, end, "Session");
    }

    private void validateTypeParticipantLimit(Long typeId, Long companyId, int participantCount) {
        if (typeId == null) return;
        var type = types.findById(typeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid type"));
        if (!type.getCompany().getId().equals(companyId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid type for this company");
        }
        Integer maxParticipants = type.getMaxParticipantsPerSession();
        if (maxParticipants == null) return;
        if (participantCount > maxParticipants) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "This service type allows at most " + maxParticipants + " participants per session.");
        }
    }

    private ClientGroup resolveGroup(Long groupId, Long companyId) {
        if (groupId == null) return null;
        return groupRepository.findByIdAndCompanyId(groupId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Group not found."));
    }

    /**
     * Session-only overrides for group email / billing company. Null request fields leave existing row values unchanged.
     */
    private void mergeSessionGroupOverrides(
            SessionBooking booking,
            SessionBookingController.BookingRequest req,
            Long companyId,
            ClientGroup clientGroup) {
        if (clientGroup == null) {
            booking.setSessionGroupEmailOverride(null);
            booking.setSessionGroupBillingCompany(null);
            return;
        }
        if (req.groupEmailOverride() != null) {
            String t = req.groupEmailOverride().trim();
            booking.setSessionGroupEmailOverride(t.isEmpty() ? null : t);
        }
        if (req.groupBillingCompanyIdOverride() != null) {
            long id = req.groupBillingCompanyIdOverride();
            if (id <= 0) {
                booking.setSessionGroupBillingCompany(null);
            } else {
                ClientCompany cc = clientCompanies
                        .findByIdAndOwnerCompanyId(id, companyId)
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid billing company"));
                booking.setSessionGroupBillingCompany(cc);
            }
        }
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

    /**
     * Replaces all per-client rows with a single booking row (client null) for an empty group session.
     */
    private SessionBookingController.BookingResponse consolidateGroupSessionToPlaceholderRow(
            List<SessionBooking> existingRows,
            String groupKey,
            SessionBookingController.BookingRequest req,
            User me,
            LocalDateTime start,
            LocalDateTime end,
            Long companyId,
            String meetingLink) {
        ClientGroup group = existingRows.get(0).getClientGroup();
        SessionBooking keep =
                existingRows.stream().filter(row -> row.getClient() == null).findFirst().orElse(null);
        var copy = new ArrayList<>(existingRows);
        for (SessionBooking row : copy) {
            if (keep != null && keep.getId() != null && row.getId() != null && row.getId().equals(keep.getId())) {
                continue;
            }
            if (row.getClient() != null) {
                reminderService.sendSessionCancelled(row);
            }
            repo.delete(row);
        }
        if (keep == null) {
            keep = new SessionBooking();
            keep.setBookingGroupKey(groupKey);
        }
        applySharedFields(keep, req, me, start, end, companyId, meetingLink);
        keep.setBookingGroupKey(groupKey);
        keep.setClient(null);
        keep.setClientGroup(group);
        mergeSessionGroupOverrides(keep, req, companyId, group);
        keep = repo.save(keep);
        return SessionBookingController.toGroupedResponse(List.of(keep));
    }
}
