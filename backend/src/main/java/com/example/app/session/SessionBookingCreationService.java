package com.example.app.session;

import com.example.app.activitylog.ActivityAction;
import com.example.app.activitylog.ActivityActorType;
import com.example.app.activitylog.ActivityLogService;
import com.example.app.activitylog.ActivityModule;
import com.example.app.client.Client;
import com.example.app.common.TimeService;
import com.example.app.consumables.ConsumableService;
import com.example.app.client.ClientRepository;
import com.example.app.billing.OpenBillSyncService;
import com.example.app.company.ClientCompany;
import com.example.app.company.ClientCompanyRepository;
import com.example.app.company.CompanyRepository;
import com.example.app.group.ClientGroup;
import com.example.app.group.ClientGroupRepository;
import com.example.app.location.Location;
import com.example.app.location.LocationService;
import com.example.app.google.GoogleMeetService;
import com.example.app.guest.order.GuestEntitlementService;
import com.example.app.reminder.ReminderService;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.security.SecurityUtils;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import com.example.app.zoom.ZoomService;
import com.example.app.waitlist.WaitlistBookingHold;
import com.example.app.waitlist.WaitlistBookingHoldRepository;
import com.example.app.widget.manage.PublicBookingManageTokenRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class SessionBookingCreationService {
    private static final long EXCLUDE_NONE_SENTINEL = -1L;
    private static final int MAX_SERIES_OCCURRENCES = 200;
    private static final ObjectMapper JSON = new ObjectMapper();

    private final SessionBookingRepository repo;
    private final PersonalCalendarBlockRepository personalBlocks;
    private final ClientRepository clients;
    private final UserRepository users;
    private final SpaceRepository spaces;
    private final SessionTypeRepository types;
    private final SessionServicePlanService servicePlans;
    private final SessionServiceRepository sessionServices;
    private final CompanyRepository companies;
    private final AppSettingRepository settings;
    private final ClientGroupRepository groupRepository;
    private final ClientCompanyRepository clientCompanies;
    private final ReminderService reminderService;
    private final ZoomService zoomService;
    private final GoogleMeetService googleMeetService;
    private final BookingChangePublisher bookingChangePublisher;
    private final OpenBillSyncService openBillSyncService;
    private final GuestEntitlementService guestEntitlementService;
    private final ConsumableService consumableService;
    private final TimeService timeService;
    private final ZoneId bookingZone;

    @Autowired(required = false)
    private WaitlistBookingHoldRepository waitlistHolds;

    @Autowired(required = false)
    private BookingSlotHoldRepository bookingSlotHolds;

    @Autowired(required = false)
    private LocationService locationService;

    @Autowired(required = false)
    private WorkspaceSchedulingLockService workspaceSchedulingLocks;

    @Autowired(required = false)
    private PublicBookingManageTokenRepository publicBookingManageTokens;

    @Autowired(required = false)
    private ActivityLogService activityLogs;

    @Autowired
    public SessionBookingCreationService(
            SessionBookingRepository repo,
            PersonalCalendarBlockRepository personalBlocks,
            ClientRepository clients,
            UserRepository users,
            SpaceRepository spaces,
            SessionTypeRepository types,
            SessionServicePlanService servicePlans,
            SessionServiceRepository sessionServices,
            CompanyRepository companies,
            AppSettingRepository settings,
            ClientGroupRepository groupRepository,
            ClientCompanyRepository clientCompanies,
            ReminderService reminderService,
            ZoomService zoomService,
            GoogleMeetService googleMeetService,
            BookingChangePublisher bookingChangePublisher,
            OpenBillSyncService openBillSyncService,
            GuestEntitlementService guestEntitlementService,
            ConsumableService consumableService,
            TimeService timeService,
            @Value("${app.reminders.timezone:Europe/Ljubljana}") String bookingTimezoneId) {
        this.repo = repo;
        this.personalBlocks = personalBlocks;
        this.clients = clients;
        this.users = users;
        this.spaces = spaces;
        this.types = types;
        this.servicePlans = servicePlans;
        this.sessionServices = sessionServices;
        this.companies = companies;
        this.settings = settings;
        this.groupRepository = groupRepository;
        this.clientCompanies = clientCompanies;
        this.reminderService = reminderService;
        this.zoomService = zoomService;
        this.googleMeetService = googleMeetService;
        this.bookingChangePublisher = bookingChangePublisher;
        this.openBillSyncService = openBillSyncService;
        this.guestEntitlementService = guestEntitlementService;
        this.consumableService = consumableService;
        this.timeService = timeService;
        String zoneId = bookingTimezoneId == null || bookingTimezoneId.isBlank()
                ? "Europe/Ljubljana"
                : bookingTimezoneId.trim();
        this.bookingZone = ZoneId.of(zoneId);
    }

    /** Constructor kept for focused tests that do not exercise guest-wallet credit restoration. */
    SessionBookingCreationService(
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
            GoogleMeetService googleMeetService,
            BookingChangePublisher bookingChangePublisher,
            OpenBillSyncService openBillSyncService) {
        this(repo, personalBlocks, clients, users, spaces, types,
                new SessionServicePlanService(types, spaces), null,
                companies, settings, groupRepository, clientCompanies,
                reminderService, zoomService, googleMeetService, bookingChangePublisher, openBillSyncService, null, null,
                new TimeService(new com.example.app.common.SimulatedTimeService(null, null, null, new com.fasterxml.jackson.databind.ObjectMapper())),
                "Europe/Ljubljana");
    }

    @Transactional
    public List<SessionBookingController.BookingResponse> createSeries(
            List<SessionBookingController.BookingRequest> occurrences,
            User me,
            Long waitlistRequestId
    ) {
        List<SessionBookingController.BookingRequest> requests = requireSeriesRequests(
                occurrences,
                false
        );
        for (int i = 0; i < requests.size(); i++) {
            validateCreateRequest(requests.get(i), me, i == 0 ? waitlistRequestId : null);
        }

        List<SessionBookingController.BookingResponse> responses = new ArrayList<>(requests.size());
        for (int i = 0; i < requests.size(); i++) {
            responses.add(create(requests.get(i), me, i == 0 ? waitlistRequestId : null));
        }
        return responses;
    }

    @Transactional
    public List<SessionBookingController.BookingResponse> updateSeries(
            Long id,
            SessionBookingController.BookingRequest current,
            List<SessionBookingController.BookingRequest> futureOccurrences,
            User me
    ) {
        if (current == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Current booking request is required.");
        }
        List<SessionBookingController.BookingRequest> futureRequests = requireSeriesRequests(
                futureOccurrences,
                true
        );
        for (SessionBookingController.BookingRequest request : futureRequests) {
            validateCreateRequest(request, me, null);
        }

        List<SessionBookingController.BookingResponse> responses = new ArrayList<>(futureRequests.size() + 1);
        responses.add(update(id, current, me));
        for (SessionBookingController.BookingRequest request : futureRequests) {
            responses.add(create(request, me, null));
        }
        return responses;
    }

    private List<SessionBookingController.BookingRequest> requireSeriesRequests(
            List<SessionBookingController.BookingRequest> requests,
            boolean allowEmpty
    ) {
        if (requests == null || (!allowEmpty && requests.isEmpty())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "At least one booking occurrence is required.");
        }
        if (requests.size() > MAX_SERIES_OCCURRENCES) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "A repeating booking can contain at most " + MAX_SERIES_OCCURRENCES + " occurrences."
            );
        }
        if (requests.stream().anyMatch(Objects::isNull)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Booking occurrence is required.");
        }
        return List.copyOf(requests);
    }

    private void validateCreateRequest(
            SessionBookingController.BookingRequest req,
            User me,
            Long waitlistRequestId
    ) {
        if (req == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Booking request is required.");
        }
        var companyId = me.getCompany().getId();
        validateMultipleServicesForCreate(companyId, req);
        LocalDateTime start = parseToLocalDateTime(req.startTime());
        LocalDateTime requestedEnd = parseOptionalEndTime(req.endTime(), start, req.services());
        SessionServicePlanService.Plan servicePlan = servicePlans.resolve(req, companyId, start, requestedEnd);
        LocalDateTime end = servicePlan.endTime();
        resolveRequestedStoredStatusForCreate(companyId, req.bookingStatus());
        Long consultantId = resolveConsultantId(req, me);
        companies.findByIdForUpdate(companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Company not found"));
        boolean spacesEnabled = isSpacesEnabled(companyId);
        boolean multipleSessionsPerSpaceEnabled = isMultipleSessionsPerSpaceEnabled(companyId);
        boolean multipleClientsPerSessionEnabled = isMultipleClientsPerSessionEnabled(companyId);
        ClientGroup clientGroup = resolveGroup(req.groupId(), companyId);
        servicePlans.validateGroupBooking(servicePlan, clientGroup != null);
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
        servicePlans.validateParticipantLimit(servicePlan, requestedClientIds.size());
        Long excludedWaitlistOfferId = resolveMatchingWaitlistOfferId(
                waitlistRequestId,
                companyId,
                requestedClientIds,
                consultantId,
                servicePlan.primarySpaceId(),
                servicePlan.primaryTypeId(),
                start,
                end
        );
        validateBookingWindow(
                companyId,
                requestedClientIds,
                consultantId,
                servicePlan,
                bookingExcludeIds((Long) null),
                spacesEnabled,
                multipleSessionsPerSpaceEnabled,
                clientGroup != null || multipleClientsPerSessionEnabled,
                isOnlineRequest(req),
                Boolean.TRUE.equals(req.allowPersonalBlockOverlap()),
                true,
                excludedWaitlistOfferId,
                null
        );
        String meetingLink = req.meetingLink();
        if (Boolean.TRUE.equals(req.online()) && (meetingLink == null || meetingLink.isBlank()) && consultantId == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Online sessions require a meeting link when no consultant is assigned."
            );
        }
    }

    @Transactional
    public SessionBookingController.BookingResponse create(SessionBookingController.BookingRequest req, User me) {
        return create(req, me, null);
    }

    @Transactional
    public SessionBookingController.BookingResponse create(
            SessionBookingController.BookingRequest req,
            User me,
            Long waitlistRequestId
    ) {
        var companyId = me.getCompany().getId();
        validateMultipleServicesForCreate(companyId, req);
        LocalDateTime start = parseToLocalDateTime(req.startTime());
        LocalDateTime requestedEnd = parseOptionalEndTime(req.endTime(), start, req.services());
        SessionServicePlanService.Plan servicePlan = servicePlans.resolve(req, companyId, start, requestedEnd);
        LocalDateTime end = servicePlan.endTime();
        String targetStoredStatus = resolveRequestedStoredStatusForCreate(companyId, req.bookingStatus());
        Long consultantId = resolveConsultantId(req, me);
        companies.findByIdForUpdate(companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Company not found"));
        boolean spacesEnabled = isSpacesEnabled(companyId);
        boolean multipleSessionsPerSpaceEnabled = isMultipleSessionsPerSpaceEnabled(companyId);
        boolean multipleClientsPerSessionEnabled = isMultipleClientsPerSessionEnabled(companyId);
        ClientGroup clientGroup = resolveGroup(req.groupId(), companyId);
        servicePlans.validateGroupBooking(servicePlan, clientGroup != null);
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
        servicePlans.validateParticipantLimit(servicePlan, requestedClientIds.size());
        Long excludedWaitlistOfferId = resolveMatchingWaitlistOfferId(
                waitlistRequestId,
                companyId,
                requestedClientIds,
                consultantId,
                servicePlan.primarySpaceId(),
                servicePlan.primaryTypeId(),
                start,
                end
        );
        acquireWorkspaceSchedulingLocks(companyId, consultantId, servicePlan);
        validateBookingWindow(
                companyId,
                requestedClientIds,
                consultantId,
                servicePlan,
                bookingExcludeIds((Long) null),
                spacesEnabled,
                multipleSessionsPerSpaceEnabled,
                clientGroup != null || multipleClientsPerSessionEnabled,
                isOnlineRequest(req),
                Boolean.TRUE.equals(req.allowPersonalBlockOverlap()),
                true,
                excludedWaitlistOfferId,
                null
        );
        var meetingLink = req.meetingLink();
        if (Boolean.TRUE.equals(req.online()) && (meetingLink == null || meetingLink.isBlank()) && consultantId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Online sessions require a meeting link when no consultant is assigned.");
        }
        String groupKey = UUID.randomUUID().toString();
        List<SessionBooking> saved = new ArrayList<>();
        if (requestedClientIds.isEmpty()) {
            var booking = new SessionBooking();
            booking.setBookingGroupKey(groupKey);
            applySharedFields(booking, req, me, start, end, companyId, meetingLink, targetStoredStatus);
            synchronizeServicePlan(booking, servicePlan);
            booking.setClient(null);
            booking.setClientGroup(clientGroup);
            mergeSessionGroupOverrides(booking, req, companyId, clientGroup);
            mergeSessionPayeeOverride(booking, req, companyId, null);
            booking = repo.save(booking);
            saved.add(booking);
            booking = sendBookingConfirmationWhenReady(booking);
        } else {
            for (Long clientId : requestedClientIds) {
                var booking = new SessionBooking();
                booking.setBookingGroupKey(groupKey);
                applySharedFields(booking, req, me, start, end, companyId, meetingLink, targetStoredStatus);
                synchronizeServicePlan(booking, servicePlan);
                booking.setClient(requireClient(clientId, companyId, me));
                booking.setClientGroup(clientGroup);
                mergeSessionGroupOverrides(booking, req, companyId, clientGroup);
                mergeSessionPayeeOverride(booking, req, companyId, clientId);
                booking = repo.save(booking);
                saved.add(booking);
                booking = sendBookingConfirmationWhenReady(booking);
            }
        }
        if (consumableService != null) {
            consumableService.ensureSessionDefaultsForBookings(saved, companyId);
            consumableService.applySessionUsageIfCheckedOut(me, saved, java.util.Map.of());
        }
        SessionBookingController.BookingResponse response = SessionBookingController.toGroupedResponse(saved);
        bookingChangePublisher.publish(
                companyId,
                response.id(),
                response.startTime(),
                response.endTime(),
                BookingChangePublisher.BOOKING_CREATED
        );
        openBillSyncService.enqueueBookingsSync(companyId, saved);
        recordBookingActivity(me, ActivityAction.SESSION_CREATED, response, null, null, null, null);
        return response;
    }

    @Transactional
    public SessionBookingController.BookingResponse update(Long id, SessionBookingController.BookingRequest req, User me) {
        var companyId = me.getCompany().getId();
        var booking = repo.findByIdAndCompanyId(id, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        var existingRows = loadGroupedRows(booking, companyId);
        var previouslyStoredStatusById = new java.util.HashMap<Long, String>();
        var previouslyUnbilledById = new java.util.HashMap<Long, Boolean>();
        for (SessionBooking row : existingRows) {
            if (row == null || row.getId() == null) {
                continue;
            }
            previouslyStoredStatusById.put(row.getId(), SessionBookingStatus.normalizeStored(row.getBookingStatus()));
            previouslyUnbilledById.put(row.getId(), row.getBilledAt() == null);
        }
        var representative = existingRows.get(0);
        Map<String, Object> activityBefore = bookingActivitySnapshot(representative);
        Map<Long, String> activityParticipantsBefore = bookingParticipantLabels(existingRows);
        validateMultipleServicesForUpdate(companyId, req, representative);
        LocalDateTime start = parseToLocalDateTime(req.startTime());
        LocalDateTime requestedEnd = parseOptionalEndTime(req.endTime(), start, req.services());
        SessionServicePlanService.Plan servicePlan = resolveUpdateServicePlan(
                req,
                representative,
                companyId,
                start,
                requestedEnd
        );
        LocalDateTime end = servicePlan.endTime();
        String targetStoredStatus = resolveRequestedStoredStatusForUpdate(companyId, req.bookingStatus(), representative, start, end);
        if (!SecurityUtils.isAdmin(me)
                && (representative.getConsultant() == null || !representative.getConsultant().getId().equals(me.getId()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        Long consultantId = resolveConsultantId(req, me);
        companies.findByIdForUpdate(companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Company not found"));
        boolean spacesEnabled = isSpacesEnabled(companyId);
        boolean multipleSessionsPerSpaceEnabled = isMultipleSessionsPerSpaceEnabled(companyId);
        boolean multipleClientsPerSessionEnabled = isMultipleClientsPerSessionEnabled(companyId);
        boolean allowMultipleClientsForRequest =
                representative.getClientGroup() != null || multipleClientsPerSessionEnabled;
        servicePlans.validateGroupBooking(servicePlan, representative.getClientGroup() != null);
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
        servicePlans.validateParticipantLimit(servicePlan, requestedClientIds.size());
        var excludeIds = existingRows.stream().map(SessionBooking::getId).toList();
        acquireWorkspaceSchedulingLocks(companyId, consultantId, servicePlan);
        validateBookingWindow(
                companyId,
                requestedClientIds,
                consultantId,
                servicePlan,
                excludeIds,
                spacesEnabled,
                multipleSessionsPerSpaceEnabled,
                allowMultipleClientsForRequest,
                isOnlineRequest(req),
                Boolean.TRUE.equals(req.allowPersonalBlockOverlap()),
                true,
                null,
                null
        );
        var meetingLink = req.meetingLink();
        if (Boolean.TRUE.equals(req.online()) && (meetingLink == null || meetingLink.isBlank()) && consultantId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Online sessions require a meeting link when no consultant is assigned.");
        }
        String groupKey = SessionBookingController.groupKey(representative);
        if (requestedClientIds.isEmpty() && representative.getClientGroup() != null) {
            SessionBookingController.BookingResponse response = consolidateGroupSessionToPlaceholderRow(
                    existingRows, groupKey, req, me, start, end, companyId, meetingLink, targetStoredStatus, servicePlan);
            ActivityAction activityAction = resolveBookingUpdateAction(activityBefore, response);
            recordBookingActivity(me, activityAction, response, null, null, null,
                    Map.of("before", activityBefore, "after", bookingActivitySnapshot(response)));
            recordParticipantActivityDiff(me, response, activityParticipantsBefore);
            return response;
        }
        var existingByClientId = new java.util.LinkedHashMap<Long, SessionBooking>();
        boolean singleClientReplacement = representative.getClientGroup() == null
                && existingRows.size() == 1
                && requestedClientIds.size() == 1;
        Long replacementClientId = singleClientReplacement ? requestedClientIds.get(0) : null;
        for (var row : existingRows) {
            if (row.getClient() != null) {
                Long mapKey = row.getClient().getId();
                if (singleClientReplacement && replacementClientId != null && replacementClientId > 0) {
                    mapKey = replacementClientId;
                }
                existingByClientId.put(mapKey, row);
            }
        }
        List<SessionBooking> saved = new ArrayList<>();
        for (Long clientId : requestedClientIds) {
            SessionBooking row = existingByClientId.remove(clientId);
            boolean created = false;
            boolean previouslyBlockedAvailability = false;
            LocalDateTime previousStart = null;
            LocalDateTime previousEnd = null;
            Long previousClientId = null;
            boolean clientChanged = false;
            if (row == null) {
                row = new SessionBooking();
                row.setBookingGroupKey(groupKey);
                row.setRecurrenceSeriesKey(representative.getRecurrenceSeriesKey());
                created = true;
            } else {
                previouslyBlockedAvailability = SessionBookingStatus.isAvailabilityBlocking(row.getBookingStatus());
                previousStart = row.getStartTime();
                previousEnd = row.getEndTime();
                previousClientId = row.getClient() != null ? row.getClient().getId() : null;
                clientChanged = previousClientId != null && !Objects.equals(previousClientId, clientId);
                if (clientChanged) {
                    // Switching a one-client session to another guest should move the existing row,
                    // not leave the original client attached through a stale grouped row.
                    reminderService.sendSessionCancelled(row);
                    restoreGuestCreditForBooking(row);
                }
            }
            applySharedFields(row, req, me, start, end, companyId, meetingLink, targetStoredStatus);
            synchronizeServicePlan(row, servicePlan);
            row.setBookingGroupKey(groupKey);
            row.setClient(requireClient(clientId, companyId, me));
            row.setClientGroup(representative.getClientGroup());
            if (clientChanged) {
                row.setGuestUserId(null);
                row.setSourceOrderId(null);
                row.setSourceChannel("STAFF");
                row.setBookingSource(BookingSource.MANUAL);
            }
            mergeSessionGroupOverrides(row, req, companyId, representative.getClientGroup());
            mergeSessionPayeeOverride(row, req, companyId, clientId);
            row = repo.save(row);
            saved.add(row);
            if (created || clientChanged) {
                row = sendBookingConfirmationWhenReady(row);
            } else {
                restoreGuestCreditIfNoLongerBlocking(row, previouslyBlockedAvailability);
                boolean timeChanged = !Objects.equals(previousStart, row.getStartTime()) || !Objects.equals(previousEnd, row.getEndTime());
                if (timeChanged) {
                    reminderService.sendSessionRescheduled(row, previousStart, previousEnd);
                } else {
                    reminderService.recordStaffBookingModified(row);
                }
            }
        }
        if (!existingByClientId.isEmpty()) {
            for (var row : existingByClientId.values()) {
                reminderService.sendSessionCancelled(row);
                bookingChangePublisher.publish(
                        companyId,
                        row.getId(),
                        row.getStartTime(),
                        row.getEndTime(),
                        BookingChangePublisher.BOOKING_DELETED
                );
            }
            restoreGuestCreditsForBookings(existingByClientId.values());
            openBillSyncService.removeSessionRowsFromOpenBills(
                    companyId,
                    existingByClientId.values().stream().map(SessionBooking::getId).toList()
            );
            repo.deleteAll(existingByClientId.values());
            repo.flush();
        } else {
            repo.flush();
        }
        var cancelledUnbilledSessionIds = saved.stream()
                .filter(row -> row != null && row.getId() != null)
                .filter(row -> Boolean.TRUE.equals(previouslyUnbilledById.get(row.getId())))
                .filter(row -> row.getBilledAt() == null)
                .filter(row -> !SessionBookingStatus.CANCELLED.equals(previouslyStoredStatusById.get(row.getId())))
                .filter(row -> SessionBookingStatus.CANCELLED.equals(SessionBookingStatus.normalizeStored(row.getBookingStatus())))
                .map(SessionBooking::getId)
                .distinct()
                .toList();
        if (!cancelledUnbilledSessionIds.isEmpty()) {
            openBillSyncService.removeSessionRowsFromOpenBills(companyId, cancelledUnbilledSessionIds);
        }
        if (consumableService != null) {
            consumableService.ensureSessionDefaultsForBookings(saved, companyId);
            consumableService.applySessionUsageIfCheckedOut(me, saved, previouslyStoredStatusById);
        }
        openBillSyncService.syncSessionGroup(companyId, groupKey);
        openBillSyncService.enqueueBookingsSync(companyId, saved);
        SessionBookingController.BookingResponse response = SessionBookingController.toGroupedResponse(saved);
        bookingChangePublisher.publish(
                companyId,
                response.id(),
                response.startTime(),
                response.endTime(),
                BookingChangePublisher.BOOKING_UPDATED
        );
        ActivityAction activityAction = resolveBookingUpdateAction(activityBefore, response);
        recordBookingActivity(me, activityAction, response, null, null, null,
                Map.of("before", activityBefore, "after", bookingActivitySnapshot(response)));
        recordParticipantActivityDiff(me, response, activityParticipantsBefore);
        return response;
    }

    /**
     * Staff-only convenience operation used by the calendar group-attendee panel.
     * It changes this occurrence only and deliberately does not mutate the saved
     * membership list on {@link ClientGroup}.
     */
    @Transactional
    public SessionBookingController.BookingResponse addGroupSessionParticipant(
            Long representativeBookingId,
            Long clientId,
            User me
    ) {
        if (me == null || me.getCompany() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        Long companyId = me.getCompany().getId();
        SessionBooking representative = repo.findByIdAndCompanyId(representativeBookingId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Group session not found."));
        authorizeStaffGroupSessionMutation(representative, me);

        SessionBooking joined = joinClientToGroupSession(new GroupJoinRequest(
                companyId,
                representative.getId(),
                clientId,
                "STAFF",
                null,
                null,
                SessionBookingStatus.RESERVED,
                true,
                BookingSource.MANUAL
        ), false, false);
        List<SessionBooking> refreshed = loadGroupedRows(joined, companyId);
        SessionBookingController.BookingResponse response = SessionBookingController.toGroupedResponse(refreshed);
        String clientLabel = clientActivityLabel(joined.getClient());
        recordBookingActivity(me, ActivityAction.SESSION_PARTICIPANT_ADDED, response,
                "CLIENT", clientId, clientLabel, Map.of("clientId", clientId));
        return response;
    }

    /**
     * Removes a guest from one group-session occurrence while preserving the
     * empty group session itself. Existing invoices and guest credits attached
     * to the removed participant row are cleaned up in the same way as a normal
     * participant removal through the full booking editor.
     */
    @Transactional
    public SessionBookingController.BookingResponse removeGroupSessionParticipant(
            Long representativeBookingId,
            Long clientId,
            User me
    ) {
        if (me == null || me.getCompany() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        if (clientId == null || clientId <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Client is required.");
        }

        Long companyId = me.getCompany().getId();
        // Serialize group joins/removals with public group booking. This prevents a last-guest
        // removal racing with somebody joining the same occurrence.
        companies.findByIdForUpdate(companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Company not found."));

        SessionBooking representative = repo.findByIdAndCompanyId(representativeBookingId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Group session not found."));
        authorizeStaffGroupSessionMutation(representative, me);

        String groupKey = SessionBookingController.groupKey(representative);
        List<SessionBooking> rows = new ArrayList<>(repo.findByBookingGroupKeyAndCompanyIdOrderByIdAsc(groupKey, companyId));
        if (rows.isEmpty()) {
            rows.add(representative);
        }

        List<SessionBooking> targets = rows.stream()
                .filter(row -> row.getClient() != null)
                .filter(row -> Objects.equals(row.getClient().getId(), clientId))
                .filter(row -> SessionBookingStatus.isAvailabilityBlocking(row.getBookingStatus()))
                .toList();
        if (targets.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Guest is not booked into this group session.");
        }
        String removedClientLabel = clientActivityLabel(targets.get(0).getClient());

        Set<Long> targetIds = targets.stream()
                .map(SessionBooking::getId)
                .filter(Objects::nonNull)
                .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));

        boolean hasActivePlaceholder = rows.stream()
                .filter(row -> row.getId() == null || !targetIds.contains(row.getId()))
                .anyMatch(row -> row.getClient() == null
                        && SessionBookingStatus.isAvailabilityBlocking(row.getBookingStatus()));
        boolean hasOtherActiveParticipant = rows.stream()
                .filter(row -> row.getId() == null || !targetIds.contains(row.getId()))
                .anyMatch(row -> row.getClient() != null
                        && SessionBookingStatus.isAvailabilityBlocking(row.getBookingStatus()));

        // Build cancellation notifications while the participant/client associations still exist.
        // ReminderService prepares the payload inside this transaction and sends it after commit.
        for (SessionBooking target : targets) {
            reminderService.sendSessionCancelled(target);
        }

        // IMPORTANT: when the last active guest leaves, do not INSERT a new placeholder row.
        // INSERT runs all current location/workspace subscription triggers and can reject a
        // grandfathered/migrated session even though merely removing a participant should be valid.
        // Reuse one of the existing participant rows instead. This also avoids counting a synthetic
        // placeholder as a new monthly booking.
        SessionBooking retainedPlaceholder = null;
        if (!hasActivePlaceholder && !hasOtherActiveParticipant) {
            retainedPlaceholder = targets.get(0);
            convertParticipantRowToGroupPlaceholder(retainedPlaceholder);
            repo.save(retainedPlaceholder);
        }

        for (SessionBooking target : targets) {
            if (retainedPlaceholder != null && Objects.equals(target.getId(), retainedPlaceholder.getId())) {
                continue;
            }
            target.setBookingStatus(SessionBookingStatus.CANCELLED);
            repo.save(target);
        }
        repo.flush();

        // Participant-specific wallet usage and draft billing must be detached from the occurrence.
        // The row itself is retained for the last-guest case, so there is no FK-sensitive booking DELETE.
        for (SessionBooking target : targets) {
            restoreGuestCreditForBooking(target);
        }
        if (!targetIds.isEmpty()) {
            openBillSyncService.removeSessionRowsFromOpenBills(companyId, targetIds);
        }

        // Staff removal invalidates old public manage links. Revoke instead of physically deleting
        // token rows so this cleanup cannot create another FK-sensitive delete path.
        if (publicBookingManageTokens != null && !targetIds.isEmpty()) {
            publicBookingManageTokens.revokeByCompanyIdAndBookingIds(companyId, targetIds, Instant.now());
        }

        // No consumable re-anchoring is needed: session-level consumables use bookingGroupKey and,
        // for the last guest, the retained row keeps the same booking id.
        for (SessionBooking target : targets) {
            if (retainedPlaceholder != null && Objects.equals(target.getId(), retainedPlaceholder.getId())) {
                continue;
            }
            bookingChangePublisher.publish(
                    companyId,
                    target.getId(),
                    target.getStartTime(),
                    target.getEndTime(),
                    BookingChangePublisher.BOOKING_CANCELLED
            );
        }

        List<SessionBooking> refreshed = repo.findByBookingGroupKeyAndCompanyIdOrderByIdAsc(groupKey, companyId);
        if (refreshed == null || refreshed.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Group session could not be reloaded after guest removal.");
        }

        openBillSyncService.syncSessionGroup(companyId, groupKey);
        openBillSyncService.enqueueBookingsSync(companyId, refreshed);

        SessionBookingController.BookingResponse response = SessionBookingController.toGroupedResponse(refreshed);
        bookingChangePublisher.publish(
                companyId,
                response.id(),
                response.startTime(),
                response.endTime(),
                BookingChangePublisher.BOOKING_UPDATED
        );
        recordBookingActivity(me, ActivityAction.SESSION_PARTICIPANT_REMOVED, response,
                "CLIENT", clientId, removedClientLabel, Map.of("clientId", clientId), representativeBookingId);
        return response;
    }

    private void convertParticipantRowToGroupPlaceholder(SessionBooking booking) {
        if (booking == null) {
            return;
        }
        booking.setClient(null);
        booking.setBookingStatus(SessionBookingStatus.RESERVED);
        booking.setSourceChannel("STAFF");
        booking.setBookingSource(BookingSource.MANUAL);
        booking.setSourceOrderId(null);
        booking.setGuestUserId(null);
        booking.setPayeeType(null);
        booking.setPayeeCompany(null);
        clearSessionPayeeCustomData(booking);
    }

    private void authorizeStaffGroupSessionMutation(SessionBooking representative, User me) {
        if (representative == null || representative.getClientGroup() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected session is not a group session.");
        }
        if (!SecurityUtils.isAdmin(me)
                && (representative.getConsultant() == null
                || !Objects.equals(representative.getConsultant().getId(), me.getId()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
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
            boolean sendConfirmation,
            BookingSource bookingSource,
            List<SessionBookingController.BookingServiceRequest> services,
            String bookingHoldToken,
            Long locationId
    ) {
        /** Source-compatible constructor for callers created before location-aware public booking. */
        public ChannelBookingRequest(
                Long companyId, Long clientId, Long consultantId, LocalDateTime start, LocalDateTime end,
                Long spaceId, Long typeId, String notes, String meetingLink, Boolean online,
                String meetingProvider, boolean allowPersonalBlockOverlap, String sourceChannel,
                String sourceOrderId, String guestUserId, String bookingStatus, boolean sendConfirmation,
                BookingSource bookingSource, List<SessionBookingController.BookingServiceRequest> services,
                String bookingHoldToken
        ) {
            this(companyId, clientId, consultantId, start, end, spaceId, typeId, notes, meetingLink, online,
                    meetingProvider, allowPersonalBlockOverlap, sourceChannel, sourceOrderId, guestUserId,
                    bookingStatus, sendConfirmation, bookingSource, services, bookingHoldToken, null);
        }

        public ChannelBookingRequest(
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
                boolean sendConfirmation,
                BookingSource bookingSource
        ) {
            this(companyId, clientId, consultantId, start, end, spaceId, typeId, notes, meetingLink,
                    online, meetingProvider, allowPersonalBlockOverlap, sourceChannel, sourceOrderId,
                    guestUserId, bookingStatus, sendConfirmation, bookingSource, null, null);
        }

        public ChannelBookingRequest(
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
        ) {
            this(companyId, clientId, consultantId, start, end, spaceId, typeId, notes, meetingLink,
                    online, meetingProvider, allowPersonalBlockOverlap, sourceChannel, sourceOrderId,
                    guestUserId, bookingStatus, sendConfirmation, null, null, null);
        }
    }

    public record GroupJoinRequest(
            Long companyId,
            Long representativeBookingId,
            Long clientId,
            String sourceChannel,
            String sourceOrderId,
            String guestUserId,
            String bookingStatus,
            boolean sendConfirmation,
            BookingSource bookingSource,
            String bookingHoldToken
    ) {
        public GroupJoinRequest(
                Long companyId,
                Long representativeBookingId,
                Long clientId,
                String sourceChannel,
                String sourceOrderId,
                String guestUserId,
                String bookingStatus,
                boolean sendConfirmation,
                BookingSource bookingSource
        ) {
            this(companyId, representativeBookingId, clientId, sourceChannel, sourceOrderId,
                    guestUserId, bookingStatus, sendConfirmation, bookingSource, null);
        }

        public GroupJoinRequest(
                Long companyId,
                Long representativeBookingId,
                Long clientId,
                String sourceChannel,
                String sourceOrderId,
                String guestUserId,
                String bookingStatus,
                boolean sendConfirmation
        ) {
            this(companyId, representativeBookingId, clientId, sourceChannel, sourceOrderId,
                    guestUserId, bookingStatus, sendConfirmation, null, null);
        }
    }

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
        if (start == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid booking time window.");
        }
        LocalDateTime requestedEnd = request.end();
        if (requestedEnd == null && request.services() != null && !request.services().isEmpty()) {
            requestedEnd = start.plusMinutes(1);
        }
        if (requestedEnd == null || !requestedEnd.isAfter(start)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid booking time window.");
        }

        Client client = requireClientForCompany(request.clientId(), companyId);
        companies.findByIdForUpdate(companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Company not found"));

        String meetingLink = request.meetingLink();
        SessionBookingController.BookingRequest internalRequest = new SessionBookingController.BookingRequest(
                client.getId(),
                List.of(client.getId()),
                request.consultantId(),
                start.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME),
                requestedEnd.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME),
                request.spaceId(),
                request.typeId(),
                request.notes(),
                meetingLink,
                request.online(),
                request.meetingProvider(),
                request.allowPersonalBlockOverlap(),
                null,
                null,
                null,
                null,
                null,
                null,
                request.services(),
                request.locationId()
        );
        SessionServicePlanService.Plan servicePlan = servicePlans.resolve(
                internalRequest,
                companyId,
                start,
                requestedEnd
        );
        LocalDateTime end = servicePlan.endTime();

        boolean spacesEnabled = isSpacesEnabled(companyId);
        boolean multipleSessionsPerSpaceEnabled = isMultipleSessionsPerSpaceEnabled(companyId);
        servicePlans.validateParticipantLimit(servicePlan, 1);
        acquireWorkspaceSchedulingLocks(companyId, request.consultantId(), servicePlan);
        validateBookingWindow(
                companyId,
                List.of(client.getId()),
                request.consultantId(),
                servicePlan,
                bookingExcludeIds((Long) null),
                spacesEnabled,
                multipleSessionsPerSpaceEnabled,
                false,
                Boolean.TRUE.equals(request.online()) || (meetingLink != null && !meetingLink.isBlank()),
                request.allowPersonalBlockOverlap(),
                false,
                null,
                request.bookingHoldToken()
        );

        User actor = resolveAdminActor(companyId);
        if (Boolean.TRUE.equals(request.online()) && (meetingLink == null || meetingLink.isBlank()) && request.consultantId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Online sessions require a meeting link when no consultant is assigned.");
        }

        SessionBooking booking = new SessionBooking();
        booking.setBookingGroupKey(UUID.randomUUID().toString());
        applySharedFields(
                booking,
                internalRequest,
                actor,
                start,
                end,
                companyId,
                meetingLink,
                SessionBookingStatus.RESERVED
        );
        synchronizeServicePlan(booking, servicePlan);
        booking.setClient(client);
        applyChannelMetadata(booking, companyId, request.sourceChannel(), request.sourceOrderId(), request.guestUserId(), request.bookingStatus(), request.bookingSource());
        booking = repo.save(booking);
        repo.flush();
        if (request.sendConfirmation()) {
            booking = sendBookingConfirmationWhenReady(booking);
        }
        if (consumableService != null) {
            consumableService.ensureSessionDefaultsForBookings(java.util.List.of(booking), companyId);
            consumableService.applySessionUsageIfCheckedOut(actor, java.util.List.of(booking), java.util.Map.of());
        }
        bookingChangePublisher.publish(
                companyId,
                booking.getId(),
                booking.getStartTime(),
                booking.getEndTime(),
                BookingChangePublisher.BOOKING_CREATED
        );
        openBillSyncService.enqueueBookingsSync(companyId, java.util.List.of(booking));
        recordExternalBookingActivity(booking, request.bookingSource(), request.sourceChannel(), ActivityAction.SESSION_CREATED, clientActivityLabel(client));
        return booking;
    }

    @Transactional
    public SessionBooking joinClientToGroupSession(GroupJoinRequest request) {
        SessionBooking joined = joinClientToGroupSession(request, true, true);
        recordExternalBookingActivity(joined, request == null ? null : request.bookingSource(),
                request == null ? null : request.sourceChannel(), ActivityAction.SESSION_PARTICIPANT_ADDED,
                clientActivityLabel(joined == null ? null : joined.getClient()));
        return joined;
    }

    private SessionBooking joinClientToGroupSession(
            GroupJoinRequest request,
            boolean requireFutureSession,
            boolean enforceGuestEligibility
    ) {
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
        LocalDateTime now = timeService.localDateTime(bookingZone);
        if (requireFutureSession && !representative.getStartTime().isAfter(now)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected group session is in the past.");
        }
        if (!requireFutureSession && !representative.getEndTime().isAfter(now)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected group session has already ended.");
        }

        List<SessionBooking> existingRows = loadGroupedRows(representative, companyId);
        SessionServicePlanService.Plan representativePlan = servicePlans.fromBooking(representative);
        SessionType type = representativePlan.primaryType();
        if (type == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected group session has no session type.");
        }
        servicePlans.validateGroupBooking(representativePlan, true);

        Client client = requireClientForCompany(request.clientId(), companyId);
        boolean alreadyBooked = existingRows.stream()
                .filter(existing -> SessionBookingStatus.isAvailabilityBlocking(existing.getBookingStatus()))
                .map(SessionBooking::getClient)
                .filter(existing -> existing != null)
                .anyMatch(existing -> existing.getId().equals(client.getId()));
        if (alreadyBooked) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This guest is already booked into the selected group session.");
        }
        if (enforceGuestEligibility) {
            validateGroupSessionJoinCapacity(type, existingRows, client);
        }
        long activeParticipants = existingRows.stream()
                .filter(row -> row.getClient() != null)
                .filter(row -> SessionBookingStatus.isAvailabilityBlocking(row.getBookingStatus()))
                .count();
        servicePlans.validateParticipantLimit(representativePlan, Math.toIntExact(activeParticipants + 1));

        validateBookingWindow(
                companyId,
                List.of(client.getId()),
                representative.getConsultant() != null ? representative.getConsultant().getId() : null,
                representativePlan,
                existingRows.stream().map(SessionBooking::getId).toList(),
                isSpacesEnabled(companyId),
                isMultipleSessionsPerSpaceEnabled(companyId),
                true,
                representative.isOnlineSession(),
                false,
                true,
                null,
                request.bookingHoldToken()
        );

        SessionBooking joined = new SessionBooking();
        joined.setCompany(representative.getCompany());
        joined.setLocation(representative.getLocation());
        joined.setClient(client);
        joined.setBookingGroupKey(SessionBookingController.groupKey(representative));
        joined.setRecurrenceSeriesKey(representative.getRecurrenceSeriesKey());
        joined.setConsultant(representative.getConsultant());
        servicePlans.copy(representative, joined);
        joined.setNotes(representative.getNotes());
        joined.setMeetingLink(representative.getMeetingLink());
        joined.setMeetingProvider(representative.getMeetingProvider());
        joined.setMeetingProvisioningStatus(representative.getMeetingProvisioningStatus());
        joined.setMeetingProvisioningError(representative.getMeetingProvisioningError());
        joined.setMeetingProvisioningAttempts(representative.getMeetingProvisioningAttempts());
        joined.setMeetingProvisioningStartedAt(representative.getMeetingProvisioningStartedAt());
        joined.setMeetingProvisioningNextAttemptAt(representative.getMeetingProvisioningNextAttemptAt());
        joined.setClientGroup(representative.getClientGroup());
        joined.setSessionGroupEmailOverride(representative.getSessionGroupEmailOverride());
        joined.setSessionGroupBillingCompany(representative.getSessionGroupBillingCompany());
        if ("COMPANY".equalsIgnoreCase(String.valueOf(representative.getPayeeType()))
                && representative.getPayeeCompany() != null) {
            joined.setPayeeType("COMPANY");
            joined.setPayeeCompany(representative.getPayeeCompany());
        }
        applyChannelMetadata(joined, companyId, request.sourceChannel(), request.sourceOrderId(), request.guestUserId(), request.bookingStatus(), request.bookingSource());
        joined = repo.save(joined);
        if (request.sendConfirmation()) {
            joined = sendBookingConfirmationWhenReady(joined);
        }
        if (consumableService != null) {
            var refreshedForConsumables = new java.util.ArrayList<>(loadGroupedRows(representative, companyId));
            refreshedForConsumables.add(joined);
            consumableService.ensureSessionDefaultsForBookings(refreshedForConsumables, companyId);
        }
        bookingChangePublisher.publish(
                companyId,
                joined.getId(),
                joined.getStartTime(),
                joined.getEndTime(),
                BookingChangePublisher.BOOKING_CREATED
        );
        repo.flush();
        openBillSyncService.syncSessionGroup(companyId, SessionBookingController.groupKey(representative));
        openBillSyncService.enqueueBookingsSync(companyId, java.util.List.of(representative, joined));
        return joined;
    }

    SessionServicePlanService.Plan planExistingBookingEdit(
            SessionBooking booking,
            LocalDateTime newStart,
            LocalDateTime requestedEnd
    ) {
        if (booking == null || booking.getCompany() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Booking is required.");
        }
        if (!SessionServiceSupport.orderedServices(booking).isEmpty()) {
            // Reschedule-only entry points (guest/public/Google) preserve the booked service
            // duration, breaks, order and snapshots, including legacy bookings migrated to one
            // SessionService row. The staff update API can still explicitly replace a single
            // service or its end time through resolveUpdateServicePlan(...).
            return servicePlans.retimeExisting(booking, newStart);
        }
        return servicePlans.resolveLegacy(
                booking.getCompany().getId(),
                booking.getType() == null ? null : booking.getType().getId(),
                booking.getSpace() == null ? null : booking.getSpace().getId(),
                newStart,
                requestedEnd
        );
    }

    public void validateExistingBookingWindow(
            SessionBooking booking,
            List<Long> clientIds,
            Long consultantId,
            LocalDateTime newStart,
            LocalDateTime requestedEnd,
            List<Long> excludeIds,
            boolean spacesEnabled,
            boolean multipleSessionsPerSpaceEnabled,
            boolean multipleClientsPerSessionEnabled,
            boolean online,
            boolean allowPersonalBlockOverlap
    ) {
        SessionServicePlanService.Plan plan = planExistingBookingEdit(booking, newStart, requestedEnd);
        acquireWorkspaceSchedulingLocks(booking.getCompany().getId(), consultantId, plan);
        validateBookingWindow(
                booking.getCompany().getId(),
                clientIds,
                consultantId,
                plan,
                excludeIds,
                spacesEnabled,
                multipleSessionsPerSpaceEnabled,
                multipleClientsPerSessionEnabled,
                online,
                allowPersonalBlockOverlap,
                false,
                null,
                null
        );
    }

    public void applyExistingBookingTime(
            SessionBooking booking,
            LocalDateTime newStart,
            LocalDateTime requestedEnd
    ) {
        synchronizeServicePlan(booking, planExistingBookingEdit(booking, newStart, requestedEnd));
    }

    private void acquireWorkspaceSchedulingLocks(
            Long companyId,
            Long consultantId,
            SessionServicePlanService.Plan servicePlan
    ) {
        if (workspaceSchedulingLocks == null || servicePlan == null || servicePlan.segments() == null) return;
        List<Long> spaceIds = servicePlan.segments().stream()
                .map(SessionServicePlanService.Segment::space)
                .filter(Objects::nonNull)
                .map(Space::getId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        workspaceSchedulingLocks.lock(companyId, consultantId, spaceIds);
    }

    private void synchronizeServicePlan(SessionBooking booking, SessionServicePlanService.Plan plan) {
        if (booking != null && booking.getId() != null && guestEntitlementService != null) {
            guestEntitlementService.restoreCreditsForRemovedServices(booking, plan);
        }
        servicePlans.synchronize(booking, plan);
        validateServiceLocationVisibility(booking, plan);
    }

    private void validateServiceLocationVisibility(
            SessionBooking booking,
            SessionServicePlanService.Plan plan
    ) {
        if (booking == null || booking.getLocation() == null || plan == null || plan.segments() == null) return;
        Long locationId = booking.getLocation().getId();
        for (SessionServicePlanService.Segment segment : plan.segments()) {
            SessionType type = segment == null ? null : segment.type();
            if (type == null || type.isAvailableAllLocations()) continue;
            boolean allowed = type.getLocations().stream()
                    .anyMatch(location -> Objects.equals(location.getId(), locationId));
            if (!allowed) {
                String serviceName = type.getDescription() == null || type.getDescription().isBlank()
                        ? type.getName()
                        : type.getDescription();
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Service '" + serviceName + "' is not available at the selected location.");
            }
        }
    }

    /**
     * Public-channel full-chain validation used by Calendra Connect, the widget and public booking page.
     * Returns the resolved plan so callers can expose the authoritative end time.
     */
    public SessionServicePlanService.Plan validateServiceChainWindow(
            Long companyId,
            List<Long> clientIds,
            Long consultantId,
            LocalDateTime start,
            List<SessionBookingController.BookingServiceRequest> services,
            List<Long> excludeIds
    ) {
        return validateServiceChainWindow(
                companyId,
                clientIds,
                consultantId,
                start,
                services,
                excludeIds,
                false,
                null
        );
    }

    /**
     * Availability previews can pre-load availability-block markers once per request and
     * ask the shared booking validator to skip only that duplicate marker lookup. The final
     * booking validation keeps the default value ({@code false}) and always re-checks blocks.
     */
    public SessionServicePlanService.Plan validateServiceChainWindow(
            Long companyId,
            List<Long> clientIds,
            Long consultantId,
            LocalDateTime start,
            List<SessionBookingController.BookingServiceRequest> services,
            List<Long> excludeIds,
            boolean allowAvailabilityBlockOverlap
    ) {
        return validateServiceChainWindow(companyId, clientIds, consultantId, start, services, excludeIds,
                allowAvailabilityBlockOverlap, null);
    }

    public SessionServicePlanService.Plan validateServiceChainWindow(
            Long companyId,
            List<Long> clientIds,
            Long consultantId,
            LocalDateTime start,
            List<SessionBookingController.BookingServiceRequest> services,
            List<Long> excludeIds,
            boolean allowAvailabilityBlockOverlap,
            String excludedBookingHoldToken
    ) {
        if (services == null || services.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "At least one service is required.");
        }
        SessionBookingController.BookingRequest request = new SessionBookingController.BookingRequest(
                null, clientIds, consultantId, start == null ? null : start.toString(), null, null,
                services.get(0).typeId(), null, null, false, null, false, null, null, null,
                "CONFIRMED", null, null, services
        );
        SessionServicePlanService.Plan plan = servicePlans.resolve(request, companyId, start, start == null ? null : start.plusMinutes(1));
        validateBookingWindow(
                companyId,
                clientIds,
                consultantId,
                plan,
                excludeIds,
                isSpacesEnabled(companyId),
                isMultipleSessionsPerSpaceEnabled(companyId),
                isMultipleClientsPerSessionEnabled(companyId),
                false,
                false,
                allowAvailabilityBlockOverlap,
                null,
                excludedBookingHoldToken
        );
        return plan;
    }

    public void validateBookingWindow(Long companyId, List<Long> clientIds, Long consultantId, Long spaceId, LocalDateTime start, LocalDateTime end,
                                      Long typeId, List<Long> excludeIds, boolean spacesEnabled, boolean multipleSessionsPerSpaceEnabled,
                                      boolean multipleClientsPerSessionEnabled, boolean online, boolean allowPersonalBlockOverlap) {
        SessionServicePlanService.Plan plan = servicePlans.resolveLegacy(companyId, typeId, spaceId, start, end);
        validateBookingWindow(
                companyId,
                clientIds,
                consultantId,
                plan,
                excludeIds,
                spacesEnabled,
                multipleSessionsPerSpaceEnabled,
                multipleClientsPerSessionEnabled,
                online,
                allowPersonalBlockOverlap,
                false,
                null,
                null
        );
    }

    private void validateBookingWindow(
            Long companyId,
            List<Long> clientIds,
            Long consultantId,
            SessionServicePlanService.Plan servicePlan,
            List<Long> excludeIds,
            boolean spacesEnabled,
            boolean multipleSessionsPerSpaceEnabled,
            boolean multipleClientsPerSessionEnabled,
            boolean online,
            boolean allowPersonalBlockOverlap,
            boolean allowAvailabilityBlockOverlap,
            Long excludedWaitlistOfferId,
            String excludedBookingHoldToken
    ) {
        if (servicePlan == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Service plan is required.");
        }
        var requestedClientIds = clientIds == null
                ? List.<Long>of()
                : clientIds.stream().filter(id -> id != null && id > 0).distinct().toList();
        if (!multipleClientsPerSessionEnabled && requestedClientIds.size() > 1) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Multiple clients per session is disabled.");
        }
        final List<Long> safeExcludeIds = bookingExcludeIds(excludeIds);
        final LocalDateTime start = servicePlan.startTime();
        final LocalDateTime end = servicePlan.endTime();
        final LocalDateTime requestedBusyEnd = servicePlan.availabilityEndTime();
        final Long primarySpaceId = servicePlan.primarySpaceId();
        final boolean hasExplicitSpace = servicePlan.segments().stream().anyMatch(segment -> segment.space() != null);
        final boolean enforceSpaceOverlapProtection = !multipleSessionsPerSpaceEnabled
                && !online
                && (hasExplicitSpace || shouldEnforceSpaceOverlapProtection(
                        companyId,
                        false,
                        false,
                        primarySpaceId
                ));

        if (bookingSlotHolds != null) {
            Instant now = Instant.now();
            String excludedToken = excludedBookingHoldToken == null ? "" : excludedBookingHoldToken.trim();
            boolean heldByEmployee = consultantId != null
                    && bookingSlotHolds.existsActiveConsultantOverlap(
                            companyId, consultantId, start, requestedBusyEnd, now, excludedToken
                    );
            boolean heldWithoutEmployee = consultantId == null
                    && bookingSlotHolds.existsActiveUnassignedOverlap(
                            companyId, start, requestedBusyEnd, now, excludedToken
                    );
            if (heldByEmployee || heldWithoutEmployee) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "This slot is temporarily reserved by another guest.");
            }
        }

        if (waitlistHolds != null) {
            java.time.Instant now = java.time.Instant.now();
            boolean heldByEmployee = consultantId != null
                    && waitlistHolds.existsActiveEmployeeOverlap(
                            companyId,
                            consultantId,
                            start,
                            requestedBusyEnd,
                            now,
                            excludedWaitlistOfferId
                    );
            boolean heldBySpace = false;
            if (enforceSpaceOverlapProtection) {
                List<SessionServicePlanService.Segment> heldRoomSegments = servicePlan.segments().stream()
                        .filter(segment -> segment.space() != null)
                        .toList();
                if (heldRoomSegments.isEmpty()) {
                    heldBySpace = waitlistHolds.existsActiveAnyRoomOverlap(
                            companyId,
                            start,
                            requestedBusyEnd,
                            now,
                            excludedWaitlistOfferId
                    );
                } else {
                    for (SessionServicePlanService.Segment segment : heldRoomSegments) {
                        if (waitlistHolds.existsActiveRoomOverlap(
                                companyId,
                                segment.space().getId(),
                                segment.startTime(),
                                segment.availabilityEndTime(),
                                now,
                                excludedWaitlistOfferId
                        )) {
                            heldBySpace = true;
                            break;
                        }
                    }
                }
            }
            boolean heldWithoutResource = consultantId == null
                    && !enforceSpaceOverlapProtection
                    && primarySpaceId == null
                    && waitlistHolds.existsActiveUnassignedOverlap(
                            companyId,
                            start,
                            requestedBusyEnd,
                            now,
                            excludedWaitlistOfferId
                    );
            if (heldByEmployee || heldBySpace || heldWithoutResource) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "This slot is temporarily held for a waitlist offer.");
            }
        }

        for (Long clientId : requestedClientIds) {
            if (repo.existsAvailabilityBlockingOverlapForClient(companyId, clientId, start, end, safeExcludeIds)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "One of the selected clients already has a session at that time.");
            }
        }

        if (consultantId != null) {
            validateConsultantSupportsServiceChain(companyId, consultantId, servicePlan);
            if (repo.existsAvailabilityBlockingOverlapForConsultant(
                    companyId,
                    consultantId,
                    start,
                    requestedBusyEnd,
                    safeExcludeIds
            )) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "This consultant already has a session at that time.");
            }
            User selectedConsultant = users.findByIdAndCompanyId(consultantId, companyId).orElse(null);
            if (selectedConsultant != null && selectedConsultant.getLoginAccount() != null
                    && selectedConsultant.getCompany() != null && selectedConsultant.getCompany().getWorkspace() != null
                    && repo.existsWorkspaceOverlapForLoginAccount(
                            selectedConsultant.getLoginAccount().getId(),
                            selectedConsultant.getCompany().getWorkspace().getId(),
                            start, requestedBusyEnd, safeExcludeIds)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "This employee already has a session in another location at that time.");
            }
            if (!allowPersonalBlockOverlap
                    && personalBlocks.existsOverlappingRegularPersonalSessionForOwner(consultantId, companyId, start, requestedBusyEnd)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "This consultant already has a personal session at that time.");
            }
            if (!allowPersonalBlockOverlap && selectedConsultant != null && selectedConsultant.getLoginAccount() != null
                    && selectedConsultant.getCompany().getWorkspace() != null
                    && personalBlocks.existsWorkspaceRegularOverlapForLoginAccount(
                            selectedConsultant.getLoginAccount().getId(),
                            selectedConsultant.getCompany().getWorkspace().getId(), start, requestedBusyEnd)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "This employee already has a personal session in another location at that time.");
            }
            if (!allowAvailabilityBlockOverlap
                    && hasOverlappingAvailabilityBlock(consultantId, companyId, start, requestedBusyEnd)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "This consultant is unavailable at that time.");
            }
            if (!allowAvailabilityBlockOverlap && selectedConsultant != null && selectedConsultant.getLoginAccount() != null
                    && selectedConsultant.getCompany().getWorkspace() != null
                    && personalBlocks.findWorkspaceAvailabilityMarkersForLoginAccount(
                            selectedConsultant.getLoginAccount().getId(),
                            selectedConsultant.getCompany().getWorkspace().getId()).stream()
                            .anyMatch(block -> AvailabilityBlockMetadata.overlaps(block, start, requestedBusyEnd))) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "This employee is unavailable in another location at that time.");
            }
        }

        if (enforceSpaceOverlapProtection) {
            boolean spaceOverlap = false;
            List<SessionServicePlanService.Segment> roomSegments = servicePlan.segments().stream()
                    .filter(segment -> segment.space() != null)
                    .toList();
            if (!roomSegments.isEmpty()) {
                for (SessionServicePlanService.Segment segment : roomSegments) {
                    if (sessionServices != null) {
                        spaceOverlap = sessionServices.existsAvailabilityBlockingOverlapForSpace(
                                companyId,
                                segment.space().getId(),
                                segment.startTime(),
                                segment.availabilityEndTime(),
                                safeExcludeIds
                        );
                    } else {
                        spaceOverlap = repo.existsAvailabilityBlockingOverlapForSpace(
                                companyId,
                                segment.space().getId(),
                                segment.startTime(),
                                segment.availabilityEndTime(),
                                safeExcludeIds
                        );
                    }
                    if (spaceOverlap) break;
                }
            } else {
                spaceOverlap = repo.existsAvailabilityBlockingOverlapForAnyPhysicalSpace(
                        companyId,
                        start,
                        requestedBusyEnd,
                        safeExcludeIds
                );
            }
            if (spaceOverlap) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "This space is already booked at that time.");
            }
        }
    }

    private Long resolveMatchingWaitlistOfferId(
            Long waitlistRequestId,
            Long companyId,
            List<Long> requestedClientIds,
            Long consultantId,
            Long spaceId,
            Long typeId,
            LocalDateTime start,
            LocalDateTime end
    ) {
        if (waitlistRequestId == null || waitlistRequestId <= 0 || waitlistHolds == null) return null;
        WaitlistBookingHold hold = waitlistHolds.findActiveByRequestIdAndCompanyId(
                        waitlistRequestId,
                        companyId,
                        java.time.Instant.now()
                )
                .orElse(null);
        // A request can also be converted directly without an offer. In that
        // case there is no hold to exclude and normal overlap validation applies.
        if (hold == null) return null;
        var offer = hold.getOffer();
        var request = offer == null ? null : offer.getRequest();
        Long requestClientId = request == null || request.getClient() == null ? null : request.getClient().getId();
        Long requestTypeId = request == null || request.getService() == null ? null : request.getService().getId();
        Long holdEmployeeId = hold.getEmployee() == null ? null : hold.getEmployee().getId();
        Long holdRoomId = hold.getRoom() == null ? null : hold.getRoom().getId();
        boolean clientMatches = requestClientId == null || requestedClientIds.contains(requestClientId);
        boolean exactOfferSlot = offer != null
                && Objects.equals(offer.getSlotStart(), start)
                && Objects.equals(offer.getSlotEnd(), end);
        boolean matches = clientMatches
                && Objects.equals(requestTypeId, typeId)
                && Objects.equals(holdEmployeeId, consultantId)
                && Objects.equals(holdRoomId, spaceId)
                && exactOfferSlot;
        if (!matches) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "The booking details do not match the active waitlist offer."
            );
        }
        return offer.getId();
    }

    private void validateConsultantSupportsServiceChain(
            Long companyId,
            Long consultantId,
            SessionServicePlanService.Plan servicePlan
    ) {
        if (servicePlan == null || servicePlan.segments() == null || servicePlan.segments().size() <= 1) {
            return;
        }
        User consultant = users.findByIdAndCompanyId(consultantId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid consultant"));
        if (consultant.getTypes() == null || consultant.getTypes().isEmpty()) {
            return;
        }
        java.util.Set<Long> supportedTypeIds = consultant.getTypes().stream()
                .map(SessionType::getId)
                .filter(Objects::nonNull)
                .collect(java.util.stream.Collectors.toSet());
        for (SessionServicePlanService.Segment segment : servicePlan.segments()) {
            Long typeId = segment.type() == null ? null : segment.type().getId();
            if (typeId != null && !supportedTypeIds.contains(typeId)) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Selected consultant does not provide every service in this session."
                );
            }
        }
    }

    private boolean hasOverlappingAvailabilityBlock(Long consultantId, Long companyId, LocalDateTime start, LocalDateTime end) {
        return personalBlocks.findAvailabilityBlockMarkersForOwner(consultantId, companyId).stream()
                .anyMatch(block -> AvailabilityBlockMetadata.overlaps(block, start, end));
    }

    public boolean shouldEnforceSpaceOverlapProtection(
            Long companyId,
            boolean multipleSessionsPerSpaceEnabled,
            boolean online,
            Long spaceId) {
        if (multipleSessionsPerSpaceEnabled || online) {
            return false;
        }
        if (spaceId != null) {
            return true;
        }
        return spaces.countByCompanyId(companyId) <= 1;
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

    public static List<Long> bookingExcludeIds(Long excludeId) {
        return excludeId == null ? List.of(EXCLUDE_NONE_SENTINEL) : List.of(excludeId);
    }

    public static List<Long> bookingExcludeIds(List<Long> excludeIds) {
        if (excludeIds == null || excludeIds.isEmpty()) {
            return List.of(EXCLUDE_NONE_SENTINEL);
        }
        List<Long> sanitized = excludeIds.stream()
                .filter(id -> id != null && id > 0)
                .distinct()
                .toList();
        return sanitized.isEmpty() ? List.of(EXCLUDE_NONE_SENTINEL) : sanitized;
    }

    public static List<Long> bookingExcludeIds(Long id1, Long id2) {
        List<Long> ids = new ArrayList<>();
        ids.add(id1);
        ids.add(id2);
        return bookingExcludeIds(ids);
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
        return users.findFirstByCompanyIdAndActiveTrueAndRoleOrderByIdAsc(companyId, Role.ADMIN)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "No admin user available for tenancy."));
    }

    private Location resolveBookingLocation(
            SessionBookingController.BookingRequest request,
            SessionBooking booking,
            User actor
    ) {
        if (request.locationId() != null) {
            Location explicit = locationService.requireForCompany(request.locationId(), actor.getCompany());
            if (booking.getSpace() != null && booking.getSpace().getLocation() != null
                    && !Objects.equals(booking.getSpace().getLocation().getId(), explicit.getId())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected space belongs to another location.");
            }
            if (request.services() != null) {
                for (SessionBookingController.BookingServiceRequest service : request.services()) {
                    if (service == null || service.spaceId() == null) continue;
                    Space serviceSpace = spaces.findByIdAndCompanyId(service.spaceId(), actor.getCompany().getId())
                            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid service space."));
                    if (serviceSpace.getLocation() == null
                            || !Objects.equals(serviceSpace.getLocation().getId(), explicit.getId())) {
                        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "All selected spaces must belong to the booking location.");
                    }
                }
            }
            return explicit;
        }
        if (booking.getSpace() != null && booking.getSpace().getLocation() != null) {
            return booking.getSpace().getLocation();
        }
        Location serviceLocation = null;
        if (request.services() != null) {
            for (SessionBookingController.BookingServiceRequest service : request.services()) {
                if (service == null || service.spaceId() == null) continue;
                Space space = spaces.findByIdAndCompanyId(service.spaceId(), actor.getCompany().getId())
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid service space."));
                if (serviceLocation == null) serviceLocation = space.getLocation();
                else if (!Objects.equals(serviceLocation.getId(), space.getLocation().getId())) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "All spaces in one session must belong to the same location.");
                }
            }
        }
        if (serviceLocation != null) return serviceLocation;
        if (booking.getLocation() != null) return booking.getLocation();
        return locationService.requireDefault(actor.getCompany());
    }

    private void applyChannelMetadata(
            SessionBooking booking,
            Long companyId,
            String sourceChannel,
            String sourceOrderId,
            String guestUserId,
            String bookingStatus,
            BookingSource bookingSource
    ) {
        String normalizedChannel = sourceChannel == null || sourceChannel.isBlank() ? "STAFF" : sourceChannel.trim();
        booking.setSourceChannel(normalizedChannel);
        booking.setBookingSource(BookingSource.resolve(bookingSource, normalizedChannel));
        booking.setSourceOrderId(sourceOrderId == null || sourceOrderId.isBlank() ? null : sourceOrderId.trim());
        booking.setGuestUserId(guestUserId == null || guestUserId.isBlank() ? null : guestUserId.trim());
        booking.setBookingStatus(resolveRequestedStoredStatusForCreate(companyId, bookingStatus));
    }

    private void applySharedFields(
            SessionBooking booking,
            SessionBookingController.BookingRequest req,
            User me,
            LocalDateTime start,
            LocalDateTime end,
            Long companyId,
            String meetingLink,
            String bookingStatus
    ) {
        booking.setCompany(me.getCompany());

        String requestedRecurrenceSeriesKey = normalizeRecurrenceSeriesKey(req.recurrenceSeriesKey());
        if (booking.getRecurrenceSeriesKey() == null && requestedRecurrenceSeriesKey != null) {
            booking.setRecurrenceSeriesKey(requestedRecurrenceSeriesKey);
        }

        if (SecurityUtils.isAdmin(me)) {
            if (req.consultantId() == null) {
                booking.setConsultant(null);
            } else {
                User consultant = users.findByIdAndCompanyId(req.consultantId(), companyId)
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid consultant"));
                if (!consultant.isConsultant()) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected user is not marked as consultant");
                }
                booking.setConsultant(consultant);
            }
        } else {
            booking.setConsultant(me);
        }

        booking.setStartTime(start);
        booking.setEndTime(end);
        booking.setBookingStatus(bookingStatus);
        // For the multi-service contract the resolved plan is authoritative. Avoid validating or
        // applying the legacy root aliases here; synchronize(...) sets them to the first segment.
        if (!hasExplicitServiceSelection(req)) {
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
                if (!type.isActive()) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected service type is inactive.");
                }
                booking.setType(type);
            }
        }
        if (locationService != null) {
            booking.setLocation(resolveBookingLocation(req, booking, me));
        }
        booking.setNotes(req.notes() != null ? req.notes().trim() : "");
        boolean hasMeeting = meetingLink != null && !meetingLink.isBlank();
        boolean onlineRequested = Boolean.TRUE.equals(req.online()) || hasMeeting;
        booking.setMeetingLink(hasMeeting ? meetingLink.trim() : null);
        if (onlineRequested) {
            String provider = req.meetingProvider();
            booking.setMeetingProvider(provider != null && "google".equalsIgnoreCase(provider) ? "google" : "zoom");
            booking.setMeetingProvisioningStatus(hasMeeting ? "READY" : "PENDING");
            booking.setMeetingProvisioningError(null);
            booking.setMeetingProvisioningStartedAt(null);
            booking.setMeetingProvisioningNextAttemptAt(hasMeeting ? null : Instant.now());
            if (hasMeeting) booking.setMeetingProvisioningAttempts(0);
        } else {
            booking.setMeetingProvider(null);
            booking.setMeetingProvisioningStatus("NONE");
            booking.setMeetingProvisioningError(null);
            booking.setMeetingProvisioningStartedAt(null);
            booking.setMeetingProvisioningNextAttemptAt(null);
            booking.setMeetingProvisioningAttempts(0);
            booking.setMeetingConfirmationPending(false);
        }
    }

    private SessionServicePlanService.Plan resolveUpdateServicePlan(
            SessionBookingController.BookingRequest request,
            SessionBooking representative,
            Long companyId,
            LocalDateTime start,
            LocalDateTime requestedEnd
    ) {
        List<SessionService> existingServices = SessionServiceSupport.orderedServices(representative);
        boolean legacyRequest = !hasExplicitServiceSelection(request);
        Long existingPrimaryTypeId = representative.getType() == null ? null : representative.getType().getId();
        boolean preservesPrimaryType = request.typeId() == null
                || Objects.equals(request.typeId(), existingPrimaryTypeId);
        if (legacyRequest && existingServices.size() > 1 && preservesPrimaryType) {
            // Older web/mobile clients only know typeId + endTime. Let them move or edit the
            // booking without accidentally deleting the remaining service chain.
            return servicePlans.retimeExisting(representative, start);
        }
        return servicePlans.resolve(request, companyId, start, requestedEnd);
    }

    private static boolean hasExplicitServiceSelection(SessionBookingController.BookingRequest request) {
        return request != null && request.services() != null && !request.services().isEmpty();
    }

    private void validateMultipleServicesForCreate(
            Long companyId,
            SessionBookingController.BookingRequest request
    ) {
        if (requestedServiceCount(request) <= 1 || multipleServicesEnabled(companyId)) {
            return;
        }
        throw multipleServicesDisabled();
    }

    private void validateMultipleServicesForUpdate(
            Long companyId,
            SessionBookingController.BookingRequest request,
            SessionBooking representative
    ) {
        int requestedCount = requestedServiceCount(request);
        if (requestedCount <= 1 || multipleServicesEnabled(companyId)) {
            return;
        }
        int existingCount = Math.max(1, SessionServiceSupport.orderedServices(representative).size());
        if (requestedCount > existingCount) {
            throw multipleServicesDisabled();
        }
    }

    private static int requestedServiceCount(SessionBookingController.BookingRequest request) {
        if (request == null) return 0;
        if (request.services() != null && !request.services().isEmpty()) {
            return (int) request.services().stream()
                    .filter(Objects::nonNull)
                    .map(SessionBookingController.BookingServiceRequest::typeId)
                    .filter(Objects::nonNull)
                    .count();
        }
        return request.typeId() == null ? 0 : 1;
    }

    private boolean multipleServicesEnabled(Long companyId) {
        if (companyId == null) return false;
        return settings.findByCompanyIdAndKey(companyId, SettingKey.GUEST_APP_SETTINGS_JSON)
                .map(AppSetting::getValue)
                .map(raw -> {
                    try {
                        return JSON.readTree(raw == null ? "{}" : raw)
                                .path("multipleServicesEnabled")
                                .asBoolean(false);
                    } catch (Exception ignored) {
                        return false;
                    }
                })
                .orElse(false);
    }

    private static ResponseStatusException multipleServicesDisabled() {
        return new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "MULTIPLE_SERVICES_DISABLED: Multiple services per appointment are disabled for this tenant."
        );
    }

    private static String normalizeRecurrenceSeriesKey(String raw) {
        if (raw == null) return null;
        String value = raw.trim();
        if (value.isEmpty()) return null;
        if (value.length() > 64) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid recurrence series key.");
        }
        return value;
    }

    private List<SessionBooking> loadGroupedRows(SessionBooking booking, Long companyId) {
        var rows = repo.findByBookingGroupKeyAndCompanyIdOrderByIdAsc(SessionBookingController.groupKey(booking), companyId);
        if (rows == null || rows.isEmpty()) {
            return List.of(booking);
        }
        return rows;
    }

    private SessionBooking sendBookingConfirmationWhenReady(SessionBooking booking) {
        if (booking == null) return null;
        if ("PENDING".equals(booking.getMeetingProvisioningStatus())
                || "RETRY".equals(booking.getMeetingProvisioningStatus())
                || "PROCESSING".equals(booking.getMeetingProvisioningStatus())) {
            booking.setMeetingConfirmationPending(true);
            return repo.save(booking);
        }
        reminderService.sendBookingConfirmation(booking);
        return booking;
    }

    public void restoreGuestCreditsForBookings(Iterable<SessionBooking> bookingsToRestore) {
        if (guestEntitlementService == null || bookingsToRestore == null) {
            return;
        }
        for (SessionBooking booking : bookingsToRestore) {
            restoreGuestCreditForBooking(booking);
        }
    }

    private void restoreGuestCreditIfNoLongerBlocking(SessionBooking booking, boolean previouslyBlockedAvailability) {
        if (!previouslyBlockedAvailability || booking == null) {
            return;
        }
        if (!SessionBookingStatus.isAvailabilityBlocking(booking.getBookingStatus())) {
            restoreGuestCreditForBooking(booking);
        }
    }

    private void restoreGuestCreditForBooking(SessionBooking booking) {
        if (guestEntitlementService == null || booking == null || booking.getId() == null) {
            return;
        }
        guestEntitlementService.maybeRestoreCreditForBooking(booking);
    }

    private void validateGroupSessionJoinCapacity(SessionType type, List<SessionBooking> existingRows, Client joiningClient) {
        Integer maxParticipants = type.getMaxParticipantsPerSession();
        if (maxParticipants == null) {
            return;
        }
        Set<String> limitedEmails = parseGuestLimitUserEmails(type.getGuestLimitUserEmails());
        boolean joiningLimited = limitedEmails.contains(normalizeEmail(joiningClient.getEmail()));
        long totalBookedParticipants = existingRows.stream()
                .filter(row -> SessionBookingStatus.isAvailabilityBlocking(row.getBookingStatus()))
                .map(SessionBooking::getClient)
                .filter(clientRow -> clientRow != null)
                .map(Client::getId)
                .distinct()
                .count();
        if (totalBookedParticipants >= maxParticipants) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This group session is already full.");
        }
        if (!limitedEmails.isEmpty() && !joiningLimited) {
            int publicLimit = Math.max(0, maxParticipants - limitedEmails.size());
            if (publicLimit <= 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This group session is limited to invited guests.");
            }
            long publicBookedParticipants = existingRows.stream()
                    .filter(row -> SessionBookingStatus.isAvailabilityBlocking(row.getBookingStatus()))
                    .map(SessionBooking::getClient)
                    .filter(clientRow -> clientRow != null)
                    .filter(clientRow -> !limitedEmails.contains(normalizeEmail(clientRow.getEmail())))
                    .map(Client::getId)
                    .distinct()
                    .count();
            if (publicBookedParticipants >= publicLimit) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This group session has no public spots left.");
            }
        }
    }

    private Set<String> parseGuestLimitUserEmails(String raw) {
        if (raw == null || raw.isBlank()) return Set.of();
        return raw.lines()
                .map(this::normalizeEmail)
                .filter(email -> email != null && !email.isBlank())
                .collect(java.util.stream.Collectors.toSet());
    }

    private String normalizeEmail(String email) {
        return email == null || email.isBlank() ? "" : email.trim().toLowerCase(Locale.ROOT);
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

    private void mergeSessionPayeeOverride(
            SessionBooking booking,
            SessionBookingController.BookingRequest req,
            Long companyId,
            Long clientId) {
        if (clientId == null || clientId <= 0) {
            booking.setPayeeType(null);
            booking.setPayeeCompany(null);
            clearSessionPayeeCustomData(booking);
            return;
        }
        if (req.payees() == null) {
            return;
        }
        SessionBookingController.BookingPayeeRequest payee = req.payees().stream()
                .filter(p -> p != null && p.clientId() != null && p.clientId().equals(clientId))
                .findFirst()
                .orElse(null);
        if (payee == null) {
            booking.setPayeeType("PERSON");
            booking.setPayeeCompany(null);
            clearSessionPayeeCustomData(booking);
            return;
        }
        String type = payee.payeeType() == null ? "PERSON" : payee.payeeType().trim().toUpperCase(Locale.ROOT);
        boolean customData = Boolean.TRUE.equals(payee.customData());
        if ("COMPANY".equals(type)) {
            booking.setPayeeType("COMPANY");
            if (customData) {
                if (payee.companyId() != null && payee.companyId() > 0) {
                    ClientCompany cc = clientCompanies
                            .findByIdAndOwnerCompanyId(payee.companyId(), companyId)
                            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid payee company"));
                    booking.setPayeeCompany(cc);
                } else {
                    booking.setPayeeCompany(null);
                }
                applySessionCustomCompanyPayee(booking, payee);
                return;
            }
            if (payee.companyId() == null || payee.companyId() <= 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Payee company is required for company payer.");
            }
            ClientCompany cc = clientCompanies
                    .findByIdAndOwnerCompanyId(payee.companyId(), companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid payee company"));
            booking.setPayeeCompany(cc);
            clearSessionPayeeCustomData(booking);
        } else {
            booking.setPayeeType("PERSON");
            booking.setPayeeCompany(null);
            if (customData) {
                applySessionCustomPersonPayee(booking, payee);
            } else {
                clearSessionPayeeCustomData(booking);
            }
        }
    }

    private static void clearSessionPayeeCustomData(SessionBooking booking) {
        booking.setPayeeCustomData(false);
        booking.setPayeePersonFirstName(null);
        booking.setPayeePersonLastName(null);
        booking.setPayeePersonEmail(null);
        booking.setPayeeCompanyName(null);
        booking.setPayeeCompanyAddress(null);
        booking.setPayeeCompanyCity(null);
        booking.setPayeeCompanyPostalCode(null);
        booking.setPayeeCompanyVatId(null);
        booking.setPayeeCompanyEmail(null);
    }

    private static void applySessionCustomPersonPayee(SessionBooking booking, SessionBookingController.BookingPayeeRequest payee) {
        booking.setPayeeCustomData(true);
        booking.setPayeePersonFirstName(trimToNull(payee.firstName()));
        booking.setPayeePersonLastName(trimToNull(payee.lastName()));
        booking.setPayeePersonEmail(trimToNull(payee.email()));
        booking.setPayeeCompanyName(null);
        booking.setPayeeCompanyAddress(null);
        booking.setPayeeCompanyCity(null);
        booking.setPayeeCompanyPostalCode(null);
        booking.setPayeeCompanyVatId(null);
        booking.setPayeeCompanyEmail(null);
    }

    private static void applySessionCustomCompanyPayee(SessionBooking booking, SessionBookingController.BookingPayeeRequest payee) {
        booking.setPayeeCustomData(true);
        booking.setPayeePersonFirstName(null);
        booking.setPayeePersonLastName(null);
        booking.setPayeePersonEmail(null);
        booking.setPayeeCompanyName(trimToNull(payee.companyName()));
        booking.setPayeeCompanyAddress(trimToNull(payee.address()));
        booking.setPayeeCompanyCity(trimToNull(payee.city()));
        booking.setPayeeCompanyPostalCode(trimToNull(payee.postalCode()));
        booking.setPayeeCompanyVatId(trimToNull(payee.vatId()));
        booking.setPayeeCompanyEmail(trimToNull(payee.companyEmail()));
    }

    private static String trimToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static boolean isOnlineRequest(SessionBookingController.BookingRequest req) {
        if (Boolean.TRUE.equals(req.online())) return true;
        return req.meetingLink() != null && !req.meetingLink().isBlank();
    }

    private LocalDateTime parseOptionalEndTime(
            String value,
            LocalDateTime start,
            List<SessionBookingController.BookingServiceRequest> services
    ) {
        if (value == null || value.isBlank()) {
            if (services != null && !services.isEmpty()) {
                return start.plusMinutes(1);
            }
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "startTime/endTime are required");
        }
        return parseToLocalDateTime(value);
    }

    private LocalDateTime parseToLocalDateTime(String value) {
        if (value == null || value.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "startTime/endTime are required");
        }
        try {
            if (value.endsWith("Z") || value.matches(".*[+-]\\d\\d:\\d\\d$")) {
                return OffsetDateTime.parse(value).atZoneSameInstant(bookingZone).toLocalDateTime();
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
            String meetingLink,
            String bookingStatus,
            SessionServicePlanService.Plan servicePlan) {
        ClientGroup group = existingRows.get(0).getClientGroup();
        String existingRecurrenceSeriesKey = existingRows.stream()
                .map(SessionBooking::getRecurrenceSeriesKey)
                .filter(value -> value != null && !value.isBlank())
                .findFirst()
                .orElse(null);
        SessionBooking sourceRepresentative = existingRows.get(0);
        BookingSource existingBookingSource = sourceRepresentative.getBookingSource() == null
                ? BookingSource.fromSourceChannel(sourceRepresentative.getSourceChannel())
                : sourceRepresentative.getBookingSource();
        String existingSourceChannel = sourceRepresentative.getSourceChannel();
        String existingSourceOrderId = sourceRepresentative.getSourceOrderId();
        String existingGuestUserId = sourceRepresentative.getGuestUserId();
        SessionBooking keep =
                existingRows.stream().filter(row -> row.getClient() == null).findFirst().orElse(null);
        SessionBooking retainedRow = keep;
        Long retainedRowId = retainedRow == null ? null : retainedRow.getId();
        var copy = new ArrayList<>(existingRows);
        var deletedSessionIds = copy.stream()
                .filter(row -> retainedRowId == null || row.getId() == null || !row.getId().equals(retainedRowId))
                .map(SessionBooking::getId)
                .filter(java.util.Objects::nonNull)
                .toList();
        if (!deletedSessionIds.isEmpty()) {
            openBillSyncService.removeSessionRowsFromOpenBills(companyId, deletedSessionIds);
        }
        for (SessionBooking row : copy) {
            if (keep != null && keep.getId() != null && row.getId() != null && row.getId().equals(keep.getId())) {
                continue;
            }
            if (row.getClient() != null) {
                reminderService.sendSessionCancelled(row);
                bookingChangePublisher.publish(
                        companyId,
                        row.getId(),
                        row.getStartTime(),
                        row.getEndTime(),
                        BookingChangePublisher.BOOKING_DELETED
                );
            }
            restoreGuestCreditForBooking(row);
            repo.delete(row);
        }
        repo.flush();
        if (keep == null) {
            keep = new SessionBooking();
            keep.setBookingGroupKey(groupKey);
            keep.setRecurrenceSeriesKey(existingRecurrenceSeriesKey);
            keep.setSourceChannel(existingSourceChannel == null || existingSourceChannel.isBlank() ? "STAFF" : existingSourceChannel);
            keep.setBookingSource(existingBookingSource);
            keep.setSourceOrderId(existingSourceOrderId);
            keep.setGuestUserId(existingGuestUserId);
        }
        applySharedFields(keep, req, me, start, end, companyId, meetingLink, bookingStatus);
        synchronizeServicePlan(keep, servicePlan);
        keep.setBookingGroupKey(groupKey);
        keep.setClient(null);
        keep.setClientGroup(group);
        mergeSessionGroupOverrides(keep, req, companyId, group);
        mergeSessionPayeeOverride(keep, req, companyId, null);
        keep = repo.save(keep);
        SessionBookingController.BookingResponse response = SessionBookingController.toGroupedResponse(List.of(keep));
        bookingChangePublisher.publish(
                companyId,
                response.id(),
                response.startTime(),
                response.endTime(),
                BookingChangePublisher.BOOKING_UPDATED
        );
        openBillSyncService.syncSessionGroup(companyId, groupKey);
        openBillSyncService.enqueueBookingsSync(companyId, java.util.List.of(keep));
        return response;
    }

    private String resolveRequestedStoredStatusForCreate(Long companyId, String requestedStatus) {
        String normalized = SessionBookingStatus.normalizeRequestedStored(requestedStatus);
        String target = normalized == null ? SessionBookingStatus.RESERVED : normalized;
        ensureNoShowStatusEnabled(companyId, target);
        return target;
    }

    private String resolveRequestedStoredStatusForUpdate(
            Long companyId,
            String requestedStatus,
            SessionBooking existingRepresentative,
            LocalDateTime effectiveStart,
            LocalDateTime effectiveEnd
    ) {
        String existingStored = SessionBookingStatus.normalizeStored(existingRepresentative.getBookingStatus());
        String targetStored = SessionBookingStatus.normalizeRequestedStored(requestedStatus);
        if (targetStored == null) {
            targetStored = existingStored;
        }
        LocalDateTime start = effectiveStart != null ? effectiveStart : existingRepresentative.getStartTime();
        LocalDateTime end = effectiveEnd != null ? effectiveEnd : existingRepresentative.getEndTime();
        ensureNoShowStatusEnabled(companyId, targetStored);
        if (!SessionBookingStatus.allowsStoredStatusUpdate(
                start,
                end,
                existingRepresentative.getBookingStatus(),
                targetStored,
                timeService.localDateTime(bookingZone)
        )) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Unsupported booking status transition.");
        }
        return targetStored;
    }

    private void ensureNoShowStatusEnabled(Long companyId, String targetStoredStatus) {
        if (!SessionBookingStatus.NO_SHOW.equals(SessionBookingStatus.normalizeStored(targetStoredStatus))) {
            return;
        }
        if (!isNoShowStatusEnabled(companyId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "NO SHOW status is disabled for this tenant.");
        }
    }

    private boolean isNoShowStatusEnabled(Long companyId) {
        if (companyId == null) return true;
        return settings.findByCompanyIdAndKey(companyId, SettingKey.NO_SHOW_ENABLED)
                .map(AppSetting::getValue)
                .map(value -> !"false".equalsIgnoreCase(value == null ? "" : value.trim()))
                .orElse(true);
    }

    private void recordBookingActivity(
            User actor, ActivityAction action, SessionBookingController.BookingResponse response,
            String secondaryType, Long secondaryId, String secondaryLabel, Map<String, ?> extraDetails) {
        recordBookingActivity(actor, action, response, secondaryType, secondaryId, secondaryLabel, extraDetails, null);
    }

    private void recordBookingActivity(
            User actor, ActivityAction action, SessionBookingController.BookingResponse response,
            String secondaryType, Long secondaryId, String secondaryLabel, Map<String, ?> extraDetails,
            Long primaryEntityIdOverride) {
        if (activityLogs == null || response == null) return;
        String typeLabel = response.type() == null ? "Session" : response.type().name();
        String summary = switch (action) {
            case SESSION_CREATED -> "Created session " + typeLabel;
            case SESSION_PARTICIPANT_ADDED -> "Added " + Objects.toString(secondaryLabel, "client") + " to session " + typeLabel;
            case SESSION_PARTICIPANT_REMOVED -> "Removed " + Objects.toString(secondaryLabel, "client") + " from session " + typeLabel;
            case SESSION_CANCELLED -> "Cancelled session " + typeLabel;
            case SESSION_RESCHEDULED -> "Rescheduled session " + typeLabel;
            default -> "Updated session " + typeLabel;
        };
        Map<String, Object> details = new java.util.LinkedHashMap<>();
        details.putAll(bookingActivitySnapshot(response));
        if (extraDetails != null) details.putAll(extraDetails);
        Long primaryEntityId = primaryEntityIdOverride != null ? primaryEntityIdOverride : response.id();
        activityLogs.recordUser(actor, ActivityModule.CALENDAR, action, "SESSION", primaryEntityId, typeLabel,
                secondaryType, secondaryId, secondaryLabel, summary,
                response.location() == null ? null : response.location().id(),
                response.space() == null ? null : response.space().id(), details);
    }

    private void recordParticipantActivityDiff(
            User actor,
            SessionBookingController.BookingResponse response,
            Map<Long, String> beforeParticipants
    ) {
        if (activityLogs == null || response == null) return;
        Map<Long, String> before = beforeParticipants == null ? Map.of() : beforeParticipants;
        Map<Long, String> after = bookingParticipantLabels(response);
        for (Map.Entry<Long, String> entry : after.entrySet()) {
            if (!before.containsKey(entry.getKey())) {
                recordBookingActivity(actor, ActivityAction.SESSION_PARTICIPANT_ADDED, response,
                        "CLIENT", entry.getKey(), entry.getValue(), Map.of("clientId", entry.getKey()));
            }
        }
        for (Map.Entry<Long, String> entry : before.entrySet()) {
            if (!after.containsKey(entry.getKey())) {
                recordBookingActivity(actor, ActivityAction.SESSION_PARTICIPANT_REMOVED, response,
                        "CLIENT", entry.getKey(), entry.getValue(), Map.of("clientId", entry.getKey()));
            }
        }
    }

    private static Map<Long, String> bookingParticipantLabels(List<SessionBooking> rows) {
        Map<Long, String> out = new java.util.LinkedHashMap<>();
        if (rows == null) return out;
        for (SessionBooking row : rows) {
            if (row == null || row.getClient() == null || row.getClient().getId() == null) continue;
            out.put(row.getClient().getId(), clientActivityLabel(row.getClient()));
        }
        return out;
    }

    private static Map<Long, String> bookingParticipantLabels(SessionBookingController.BookingResponse response) {
        Map<Long, String> out = new java.util.LinkedHashMap<>();
        if (response == null) return out;
        List<SessionBookingController.ClientSummary> clients = response.clients();
        if ((clients == null || clients.isEmpty()) && response.client() != null) {
            clients = List.of(response.client());
        }
        if (clients == null) return out;
        for (SessionBookingController.ClientSummary client : clients) {
            if (client == null || client.id() == null) continue;
            String label = (Objects.toString(client.firstName(), "").trim() + " "
                    + Objects.toString(client.lastName(), "").trim()).trim();
            out.put(client.id(), label.isBlank() ? "Client #" + client.id() : label);
        }
        return out;
    }

    private static Map<String, Object> bookingActivitySnapshot(SessionBooking booking) {
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        if (booking == null) return out;
        out.put("startTime", booking.getStartTime());
        out.put("endTime", booking.getEndTime());
        out.put("type", booking.getType() == null ? null : booking.getType().getName());
        out.put("space", booking.getSpace() == null ? null : booking.getSpace().getName());
        out.put("location", booking.getLocation() == null ? null : booking.getLocation().getName());
        out.put("bookingStatus", SessionBookingStatus.normalizeStored(booking.getBookingStatus()));
        return out;
    }

    private static Map<String, Object> bookingActivitySnapshot(SessionBookingController.BookingResponse response) {
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        if (response == null) return out;
        out.put("startTime", response.startTime());
        out.put("endTime", response.endTime());
        out.put("type", response.type() == null ? null : response.type().name());
        out.put("space", response.space() == null ? null : response.space().name());
        out.put("location", response.location() == null ? null : response.location().name());
        out.put("bookingStatus", SessionBookingStatus.normalizeStored(response.bookingStatus()));
        return out;
    }


    private void recordExternalBookingActivity(
            SessionBooking booking, BookingSource bookingSource, String sourceChannel, ActivityAction action, String clientLabel) {
        if (activityLogs == null || booking == null || booking.getCompany() == null) return;
        BookingSource resolved = BookingSource.resolve(bookingSource, sourceChannel);
        if (resolved == BookingSource.MANUAL) return;
        ActivityActorType actorType = resolved == BookingSource.MOBILE_APP
                ? ActivityActorType.GUEST_APP
                : ActivityActorType.WEBSITE_WIDGET;
        String actorName = resolved == BookingSource.MOBILE_APP ? "Guest app" : "Website widget";
        String typeLabel = booking.getType() == null ? "Session" : booking.getType().getName();
        String summary = action == ActivityAction.SESSION_PARTICIPANT_ADDED
                ? "Added " + Objects.toString(clientLabel, "client") + " to session " + typeLabel
                : "Created booking for " + Objects.toString(clientLabel, "client");
        Map<String, Object> details = bookingActivitySnapshot(booking);
        if (booking.getClient() != null) details.put("clientId", booking.getClient().getId());
        activityLogs.recordExternal(booking.getCompany(), actorType, actorName, resolved.name(),
                ActivityModule.CALENDAR, action, "SESSION", booking.getId(), typeLabel,
                booking.getClient() == null ? null : "CLIENT",
                booking.getClient() == null ? null : booking.getClient().getId(),
                booking.getClient() == null ? null : clientLabel, summary,
                booking.getLocation() == null ? null : booking.getLocation().getId(),
                booking.getSpace() == null ? null : booking.getSpace().getId(), details);
    }

    private static ActivityAction resolveBookingUpdateAction(Map<String, Object> before, SessionBookingController.BookingResponse afterResponse) {
        Map<String, Object> after = bookingActivitySnapshot(afterResponse);
        String beforeStatus = Objects.toString(before == null ? null : before.get("bookingStatus"), "");
        String afterStatus = Objects.toString(after.get("bookingStatus"), "");
        if (!SessionBookingStatus.CANCELLED.equals(beforeStatus) && SessionBookingStatus.CANCELLED.equals(afterStatus)) {
            return ActivityAction.SESSION_CANCELLED;
        }
        if (!Objects.equals(before == null ? null : before.get("startTime"), after.get("startTime"))
                || !Objects.equals(before == null ? null : before.get("endTime"), after.get("endTime"))) {
            return ActivityAction.SESSION_RESCHEDULED;
        }
        return ActivityAction.SESSION_UPDATED;
    }

    private static String clientActivityLabel(Client client) {
        if (client == null) return "Client";
        String label = (Objects.toString(client.getFirstName(), "").trim() + " " + Objects.toString(client.getLastName(), "").trim()).trim();
        return label.isBlank() ? "Client #" + Objects.toString(client.getId(), "") : label;
    }

}
