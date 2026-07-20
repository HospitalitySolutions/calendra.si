package com.example.app.waitlist;

import com.example.app.client.Client;
import com.example.app.client.ClientRepository;
import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.notification.TenantNotificationService;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.session.BookableSlotRepository;
import com.example.app.session.ServiceGroup;
import com.example.app.session.ServiceGroupRepository;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingController;
import com.example.app.session.SessionBookingStatus;
import com.example.app.session.SessionBookingCreationService;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.SessionBookingRealtimeService;
import com.example.app.session.SessionType;
import com.example.app.session.SessionTypeRepository;
import com.example.app.session.Space;
import com.example.app.session.SpaceRepository;
import com.example.app.settings.TenantReservationRulesService;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

@Service
public class WaitlistService {
    private static final ZoneId ZONE = ZoneId.of("Europe/Ljubljana");
    private static final List<WaitlistRequestStatus> DUPLICATE_BLOCKING_STATUSES = List.of(
            WaitlistRequestStatus.ACTIVE,
            WaitlistRequestStatus.OFFERED,
            WaitlistRequestStatus.OFFER_ACCEPTED
    );

    private final WaitlistRequestRepository requests;
    private final WaitlistRequestWindowRepository windows;
    private final WaitlistRequestEmployeeRepository requestEmployees;
    private final WaitlistRequestServiceRepository requestServices;
    private final WaitlistOfferRepository offers;
    private final WaitlistBookingHoldRepository holds;
    private final WaitlistEventRepository events;
    private final WaitlistSlotSkipRepository skips;
    private final ClientRepository clients;
    private final UserRepository users;
    private final SessionTypeRepository sessionTypes;
    private final ServiceGroupRepository serviceGroups;
    private final SpaceRepository spaces;
    private final SessionBookingRepository bookings;
    private final CompanyRepository companies;
    private final AppSettingRepository settings;
    private final BookableSlotRepository bookableSlots;
    private final SessionBookingCreationService bookingValidation;
    private final TenantReservationRulesService reservationRules;
    private final WaitlistSettingsService waitlistSettings;
    private final TenantNotificationService tenantNotifications;
    private final SessionBookingRealtimeService calendarRealtime;
    private final WaitlistGuestNotificationService guestNotifications;
    private final int offerExpiringMinutes;
    private final int expiryBatchSize;

    public WaitlistService(
            WaitlistRequestRepository requests,
            WaitlistRequestWindowRepository windows,
            WaitlistRequestEmployeeRepository requestEmployees,
            WaitlistRequestServiceRepository requestServices,
            WaitlistOfferRepository offers,
            WaitlistBookingHoldRepository holds,
            WaitlistEventRepository events,
            WaitlistSlotSkipRepository skips,
            ClientRepository clients,
            UserRepository users,
            SessionTypeRepository sessionTypes,
            ServiceGroupRepository serviceGroups,
            SpaceRepository spaces,
            SessionBookingRepository bookings,
            CompanyRepository companies,
            AppSettingRepository settings,
            BookableSlotRepository bookableSlots,
            SessionBookingCreationService bookingValidation,
            TenantReservationRulesService reservationRules,
            WaitlistSettingsService waitlistSettings,
            TenantNotificationService tenantNotifications,
            SessionBookingRealtimeService calendarRealtime,
            WaitlistGuestNotificationService guestNotifications,
            @Value("${app.waitlist.offer-expiring-minutes:5}") int offerExpiringMinutes,
            @Value("${app.waitlist.expiry-batch-size:100}") int expiryBatchSize
    ) {
        this.requests = requests;
        this.windows = windows;
        this.requestEmployees = requestEmployees;
        this.requestServices = requestServices;
        this.offers = offers;
        this.holds = holds;
        this.events = events;
        this.skips = skips;
        this.clients = clients;
        this.users = users;
        this.sessionTypes = sessionTypes;
        this.serviceGroups = serviceGroups;
        this.spaces = spaces;
        this.bookings = bookings;
        this.companies = companies;
        this.settings = settings;
        this.bookableSlots = bookableSlots;
        this.bookingValidation = bookingValidation;
        this.reservationRules = reservationRules;
        this.waitlistSettings = waitlistSettings;
        this.tenantNotifications = tenantNotifications;
        this.calendarRealtime = calendarRealtime;
        this.guestNotifications = guestNotifications;
        this.offerExpiringMinutes = Math.max(1, offerExpiringMinutes);
        this.expiryBatchSize = Math.max(10, Math.min(1000, expiryBatchSize));
    }

    public record WindowInput(DayOfWeek dayOfWeek, LocalDate date, LocalTime timeFrom, LocalTime timeTo, Boolean allDay) {}
    public record RequestInput(
            Long clientId,
            Long serviceId,
            WaitlistServiceScope serviceScope,
            Long serviceGroupId,
            Long locationId,
            WaitlistTargetType targetType,
            Long targetSessionId,
            LocalDate dateFrom,
            LocalDate dateTo,
            WaitlistEmployeePreferenceType employeePreferenceType,
            Long specificEmployeeId,
            List<Long> employeeIds,
            Integer requestedParticipants,
            WaitlistSource source,
            String notes,
            List<WindowInput> windows
    ) {}
    public record OfferInput(Long serviceId, LocalDateTime slotStart, LocalDateTime slotEnd, Long employeeId, Long roomId, Long sessionId, Integer validityMinutes) {}
    public record MatchInput(
            Long serviceId,
            LocalDateTime slotStart,
            LocalDateTime slotEnd,
            Long employeeId,
            Long roomId,
            Long sessionId,
            Boolean releasedSlot,
            Integer validityMinutes,
            Integer limit
    ) {}
    public record MatchView(
            Long requestId,
            Long clientId,
            String clientName,
            String clientEmail,
            String clientPhone,
            Long serviceId,
            String serviceName,
            String serviceScope,
            Long serviceGroupId,
            String serviceGroupName,
            String targetType,
            Integer requestedParticipants,
            Instant joinedAt,
            int priority
    ) {}
    public record MatchResult(int count, MatchView first, List<MatchView> matches) {}
    public record WindowView(Long id, String dayOfWeek, LocalDate date, LocalTime timeFrom, LocalTime timeTo, boolean allDay) {}
    public record EmployeeView(Long id, String name) {}
    public record EligibleServiceView(Long id, String name, Integer durationMinutes, Integer breakMinutes, Long serviceGroupId, String serviceGroupName) {}
    public record OfferView(Long id, String status, Long serviceId, String serviceName, Long serviceGroupId, String serviceGroupName,
                            LocalDateTime slotStart, LocalDateTime slotEnd, EmployeeView employee, String roomName,
                            Instant offeredAt, Instant expiresAt, Instant acceptedAt, Instant declinedAt, long secondsRemaining) {}
    public record EventView(Long id, String type, String detail, Instant occurredAt, String actorName) {}
    public record RequestView(
            Long id,
            String clientName,
            String clientEmail,
            String clientPhone,
            Long clientId,
            Long serviceId,
            String serviceName,
            String serviceScope,
            Long serviceGroupId,
            String serviceGroupName,
            List<EligibleServiceView> eligibleServices,
            Integer serviceDurationMinutes,
            Integer breakMinutes,
            Long locationId,
            String locationName,
            String targetType,
            Long targetSessionId,
            LocalDate dateFrom,
            LocalDate dateTo,
            String employeePreferenceType,
            EmployeeView specificEmployee,
            List<EmployeeView> selectedEmployees,
            int requestedParticipants,
            String status,
            String source,
            String notes,
            Instant joinedAt,
            Instant expiresAt,
            Long bookedBookingId,
            List<WindowView> windows,
            OfferView currentOffer,
            List<EventView> history
    ) {}

    private record ServiceSelection(WaitlistServiceScope scope, SessionType exactService, ServiceGroup group, List<SessionType> eligibleServices) {}
    private record MatchCandidate(WaitlistRequest request, SessionType service, LocalDateTime slotEnd) {}

    public record PublicOfferView(
            Long offerId,
            Long requestId,
            String tenantCode,
            String tenantName,
            String tenantLogoUrl,
            String serviceName,
            String slotStart,
            String slotEnd,
            String startsAtLabel,
            String employeeName,
            String locationName,
            String offerStatus,
            String requestStatus,
            String otherSlotsUrl
    ) {}

    @Transactional(readOnly = true)
    public List<RequestView> list(
            User me,
            String view,
            LocalDate dateFrom,
            LocalDate dateTo,
            Long serviceId,
            Long employeeId,
            Long locationId,
            String targetType,
            String source,
            String status,
            String search
    ) {
        Long companyId = companyId(me);
        String normalizedView = normalize(view);
        String normalizedSearch = normalize(search);
        List<WaitlistRequest> rows = requests.findAllDetailedByCompanyId(companyId);
        Map<Long, List<WaitlistRequestWindow>> windowMap = rows.isEmpty() ? Map.of() : windows.findAllByRequestIdIn(ids(rows)).stream()
                .collect(Collectors.groupingBy(row -> row.getRequest().getId()));
        Map<Long, List<WaitlistRequestEmployee>> employeeMap = rows.isEmpty() ? Map.of() : requestEmployees.findAllByRequestIdIn(ids(rows)).stream()
                .collect(Collectors.groupingBy(row -> row.getRequest().getId()));
        Map<Long, List<WaitlistRequestService>> serviceMap = rows.isEmpty() ? Map.of() : requestServices.findAllByRequestIdIn(ids(rows)).stream()
                .collect(Collectors.groupingBy(row -> row.getRequest().getId()));

        return rows.stream()
                .filter(row -> viewMatches(row, normalizedView))
                .filter(row -> dateFrom == null || !row.getDateTo().isBefore(dateFrom))
                .filter(row -> dateTo == null || !row.getDateFrom().isAfter(dateTo))
                .filter(row -> serviceId == null || requestContainsService(row, serviceMap.getOrDefault(row.getId(), List.of()), serviceId))
                .filter(row -> locationId == null || row.getLocation() != null && Objects.equals(row.getLocation().getId(), locationId))
                .filter(row -> targetType == null || targetType.isBlank() || row.getTargetType().name().equalsIgnoreCase(targetType))
                .filter(row -> source == null || source.isBlank() || row.getSource().name().equalsIgnoreCase(source))
                .filter(row -> status == null || status.isBlank() || row.getStatus().name().equalsIgnoreCase(status))
                .filter(row -> employeeMatchesFilter(row, employeeMap.getOrDefault(row.getId(), List.of()), employeeId))
                .filter(row -> searchMatches(row, serviceMap.getOrDefault(row.getId(), List.of()), normalizedSearch))
                .map(row -> toView(row, windowMap.getOrDefault(row.getId(), List.of()), employeeMap.getOrDefault(row.getId(), List.of()), serviceMap.getOrDefault(row.getId(), List.of()), false))
                .toList();
    }

    @Transactional(readOnly = true)
    public RequestView detail(User me, Long id) {
        WaitlistRequest row = requestDetailed(id, companyId(me));
        return toView(row, windows.findAllByRequestIdOrderByDateAscDayOfWeekAscTimeFromAsc(id), requestEmployees.findAllByRequestId(id),
                requestServices.findAllByRequestIdOrderBySortOrderSnapshotAscIdAsc(id), true);
    }

    @Transactional
    public RequestView create(User me, RequestInput input) {
        Long companyId = companyId(me);
        WaitlistSettingsService.WaitlistSettings cfg = waitlistSettings.get(companyId);
        if (!cfg.enabled() || !cfg.staffManualEntryEnabled()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Manual waitlist entry is disabled.");
        }
        input = normalizeInput(input, cfg);
        validateInput(input, cfg);
        Client client = clients.findByIdAndCompanyId(input.clientId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Client not found."));
        ServiceSelection selection = resolveServiceSelection(input, companyId);
        Space location = input.locationId() == null ? null : spaces.findByIdAndCompanyId(input.locationId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Location not found."));
        SessionBooking targetSession = input.targetSessionId() == null ? null : bookings.findByIdAndCompanyId(input.targetSessionId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Target session not found."));
        User specificEmployee = input.specificEmployeeId() == null ? null : users.findByIdAndCompanyIdAndActiveTrue(input.specificEmployeeId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Employee not found."));
        List<User> selectedEmployees = resolveEmployees(input.employeeIds(), companyId);
        String duplicateKey = duplicateKey(companyId, client.getId(), input, selectedEmployees, selection.eligibleServices());
        if (requests.existsByCompanyIdAndDuplicateKeyAndStatusIn(companyId, duplicateKey, DUPLICATE_BLOCKING_STATUSES)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "An equivalent active waitlist request already exists.");
        }
        WaitlistRequest row = new WaitlistRequest();
        row.setCompany(companies.getReferenceById(companyId));
        row.setClient(client);
        applyServiceSelection(row, selection);
        row.setLocation(location);
        row.setTargetType(input.targetType());
        row.setTargetSession(targetSession);
        row.setDateFrom(input.dateFrom());
        row.setDateTo(input.dateTo());
        row.setEmployeePreferenceType(Optional.ofNullable(input.employeePreferenceType()).orElse(WaitlistEmployeePreferenceType.ANY));
        row.setSpecificEmployee(specificEmployee);
        row.setRequestedParticipants(Math.max(1, Optional.ofNullable(input.requestedParticipants()).orElse(1)));
        row.setStatus(WaitlistRequestStatus.ACTIVE);
        row.setSource(Optional.ofNullable(input.source()).orElse(WaitlistSource.STAFF));
        row.setNotes(trimToNull(input.notes()));
        row.setJoinedAt(Instant.now());
        row.setExpiresAt(input.dateTo().plusDays(1).atStartOfDay(ZONE).toInstant());
        row.setDuplicateKey(duplicateKey);
        row = requests.save(row);
        replaceWindows(row, input.windows());
        replaceEmployees(row, selectedEmployees);
        replaceEligibleServices(row, selection.eligibleServices());
        String selectionName = serviceSelectionName(row);
        addEvent(row, null, me, WaitlistEventType.JOINED, "Stranka je bila dodana na čakalno vrsto za " + selectionName + ".");
        tenantNotifications.createWaitlistNotification(companyId, row.getId(), "WAITLIST_JOINED", "Nova stranka na čakalni vrsti",
                clientName(client) + " čaka na termin za " + selectionName + ".", "/appointments?requestId=" + row.getId());
        guestNotifications.publish(row, null, WaitlistGuestNotificationService.EventKind.JOINED);
        return detail(me, row.getId());
    }

    /**
     * Creates a guest-submitted request from the public website booking flow.
     * The public controller resolves the tenant, service and client identity first;
     * this method keeps the same validation, duplicate prevention, notifications and
     * audit history as a staff-created request without requiring an authenticated user.
     */
    @Transactional
    public RequestView createFromWidget(Long companyId, Client client, RequestInput input) {
        if (companyId == null || client == null || client.getId() == null
                || client.getCompany() == null || !Objects.equals(client.getCompany().getId(), companyId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A tenant client is required.");
        }
        WaitlistSettingsService.WaitlistSettings cfg = waitlistSettings.get(companyId);
        if (!cfg.enabled() || !cfg.widgetEnabled()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Website waitlist entry is disabled.");
        }
        if (requests.countByCompanyIdAndClientIdAndStatusIn(companyId, client.getId(), DUPLICATE_BLOCKING_STATUSES)
                >= cfg.maxActiveRequestsPerGuest()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "The maximum number of active waitlist requests has been reached.");
        }

        input = new RequestInput(
                client.getId(),
                input == null ? null : input.serviceId(),
                input == null ? null : input.serviceScope(),
                input == null ? null : input.serviceGroupId(),
                input == null ? null : input.locationId(),
                input == null ? null : input.targetType(),
                input == null ? null : input.targetSessionId(),
                input == null ? null : input.dateFrom(),
                input == null ? null : input.dateTo(),
                input == null ? null : input.employeePreferenceType(),
                input == null ? null : input.specificEmployeeId(),
                input == null ? List.of() : input.employeeIds(),
                input == null ? 1 : input.requestedParticipants(),
                WaitlistSource.WIDGET,
                input == null ? null : input.notes(),
                input == null ? List.of() : input.windows()
        );
        input = normalizeInput(input, cfg);
        validateInput(input, cfg);

        ServiceSelection selection = resolveServiceSelection(input, companyId);
        Space location = input.locationId() == null ? null : spaces.findByIdAndCompanyId(input.locationId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Location not found."));
        SessionBooking targetSession = input.targetSessionId() == null ? null : bookings.findByIdAndCompanyId(input.targetSessionId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Target session not found."));
        User specificEmployee = input.specificEmployeeId() == null ? null : users.findByIdAndCompanyIdAndActiveTrue(input.specificEmployeeId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Employee not found."));
        List<User> selectedEmployees = resolveEmployees(input.employeeIds(), companyId);
        String duplicateKey = duplicateKey(companyId, client.getId(), input, selectedEmployees, selection.eligibleServices());
        if (requests.existsByCompanyIdAndDuplicateKeyAndStatusIn(companyId, duplicateKey, DUPLICATE_BLOCKING_STATUSES)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "An equivalent active waitlist request already exists.");
        }

        WaitlistRequest row = new WaitlistRequest();
        row.setCompany(companies.getReferenceById(companyId));
        row.setClient(client);
        applyServiceSelection(row, selection);
        row.setLocation(location);
        row.setTargetType(input.targetType());
        row.setTargetSession(targetSession);
        row.setDateFrom(input.dateFrom());
        row.setDateTo(input.dateTo());
        row.setEmployeePreferenceType(Optional.ofNullable(input.employeePreferenceType()).orElse(WaitlistEmployeePreferenceType.ANY));
        row.setSpecificEmployee(specificEmployee);
        row.setRequestedParticipants(Math.max(1, Optional.ofNullable(input.requestedParticipants()).orElse(1)));
        row.setStatus(WaitlistRequestStatus.ACTIVE);
        row.setSource(WaitlistSource.WIDGET);
        row.setNotes(trimToNull(input.notes()));
        row.setJoinedAt(Instant.now());
        row.setExpiresAt(input.dateTo().plusDays(1).atStartOfDay(ZONE).toInstant());
        row.setDuplicateKey(duplicateKey);
        row = requests.save(row);
        replaceWindows(row, input.windows());
        replaceEmployees(row, selectedEmployees);
        replaceEligibleServices(row, selection.eligibleServices());

        String selectionName = serviceSelectionName(row);
        addEvent(row, null, null, WaitlistEventType.JOINED, "Stranka se je prek spletnega naročanja pridružila čakalni vrsti za " + selectionName + ".");
        tenantNotifications.createWaitlistNotification(companyId, row.getId(), "WAITLIST_JOINED", "Nova stranka na čakalni vrsti",
                clientName(client) + " čaka na termin za " + selectionName + ".", "/appointments?requestId=" + row.getId());
        guestNotifications.publish(row, null, WaitlistGuestNotificationService.EventKind.JOINED);

        return toView(
                row,
                windows.findAllByRequestIdOrderByDateAscDayOfWeekAscTimeFromAsc(row.getId()),
                requestEmployees.findAllByRequestId(row.getId()),
                requestServices.findAllByRequestIdOrderBySortOrderSnapshotAscIdAsc(row.getId()),
                true
        );
    }

    @Transactional
    public RequestView update(User me, Long id, RequestInput input) {
        Long companyId = companyId(me);
        WaitlistRequest row = requests.findForUpdateByIdAndCompanyId(id, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Waitlist request not found."));
        if (row.getStatus() == WaitlistRequestStatus.OFFERED || row.getStatus() == WaitlistRequestStatus.OFFER_ACCEPTED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A request cannot be edited while an offer is active.");
        }
        WaitlistSettingsService.WaitlistSettings cfg = waitlistSettings.get(companyId);
        input = normalizeInput(input, cfg);
        validateInput(input, cfg);
        ServiceSelection selection = resolveServiceSelection(input, companyId);
        row.setClient(clients.findByIdAndCompanyId(input.clientId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Client not found.")));
        applyServiceSelection(row, selection);
        row.setLocation(input.locationId() == null ? null : spaces.findByIdAndCompanyId(input.locationId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Location not found.")));
        row.setTargetSession(input.targetSessionId() == null ? null : bookings.findByIdAndCompanyId(input.targetSessionId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Target session not found.")));
        row.setTargetType(input.targetType());
        row.setDateFrom(input.dateFrom());
        row.setDateTo(input.dateTo());
        row.setEmployeePreferenceType(Optional.ofNullable(input.employeePreferenceType()).orElse(WaitlistEmployeePreferenceType.ANY));
        row.setSpecificEmployee(input.specificEmployeeId() == null ? null : users.findByIdAndCompanyIdAndActiveTrue(input.specificEmployeeId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Employee not found.")));
        List<User> selected = resolveEmployees(input.employeeIds(), companyId);
        row.setRequestedParticipants(Math.max(1, Optional.ofNullable(input.requestedParticipants()).orElse(1)));
        row.setNotes(trimToNull(input.notes()));
        row.setExpiresAt(input.dateTo().plusDays(1).atStartOfDay(ZONE).toInstant());
        row.setDuplicateKey(duplicateKey(companyId, row.getClient().getId(), input, selected, selection.eligibleServices()));
        requests.save(row);
        replaceWindows(row, input.windows());
        replaceEmployees(row, selected);
        replaceEligibleServices(row, selection.eligibleServices());
        addEvent(row, null, me, WaitlistEventType.EDITED, "Zahteva na čakalni vrsti je bila posodobljena.");
        guestNotifications.publish(row, null, WaitlistGuestNotificationService.EventKind.UPDATED);
        return detail(me, id);
    }

    @Transactional
    public RequestView offer(User me, Long requestId, OfferInput input) {
        return offerInternal(companyId(me), requestId, input, me, false, false);
    }

    @Transactional(readOnly = true)
    public MatchResult findMatches(User me, MatchInput input) {
        return matchResult(companyId(me), input);
    }

    @Transactional
    public RequestView offerFirst(User me, MatchInput input) {
        Long companyId = companyId(me);
        MatchResult result = matchResult(companyId, input);
        if (result.first() == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No eligible waitlist request matches this slot.");
        }
        return offerInternal(
                companyId,
                result.first().requestId(),
                new OfferInput(
                        result.first().serviceId(),
                        required(input.slotStart(), "slotStart"),
                        required(input.slotEnd(), "slotEnd"),
                        input.employeeId(),
                        input.roomId(),
                        input.sessionId(),
                        input.validityMinutes()
                ),
                me,
                false,
                Boolean.TRUE.equals(input.releasedSlot())
        );
    }

    @Transactional
    public RequestView accept(User me, Long offerId) {
        Long companyId = companyId(me);
        WaitlistOffer offer = offers.findForUpdateByIdAndCompanyId(offerId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Offer not found."));
        acceptOfferAndCreateBooking(offer, me);
        return detail(me, offer.getRequest().getId());
    }

    @Transactional
    public RequestView decline(User me, Long offerId) {
        Long companyId = companyId(me);
        WaitlistOffer offer = offers.findForUpdateByIdAndCompanyId(offerId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Offer not found."));
        if (offer.getStatus() != WaitlistOfferStatus.PENDING) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Offer is no longer pending.");
        }
        offer.setStatus(WaitlistOfferStatus.DECLINED);
        offer.setDeclinedAt(Instant.now());
        offers.save(offer);
        releaseHold(offer, WaitlistHoldStatus.RELEASED);
        WaitlistRequest request = offer.getRequest();
        request.setStatus(WaitlistRequestStatus.ACTIVE);
        requests.save(request);
        addEvent(request, offer, me, WaitlistEventType.OFFER_DECLINED, "Ponudba termina je bila zavrnjena.");
        tenantNotifications.createWaitlistNotification(companyId, request.getId(), "WAITLIST_OFFER_DECLINED", "Ponudba termina zavrnjena",
                clientName(request.getClient()) + " je zavrnil/a ponujeni termin.", "/appointments?requestId=" + request.getId());
        offerNextCandidate(companyId, offer.getSlotStart(), offerAvailableEnd(offer), id(offer.getEmployee()), id(offer.getRoom()), id(offer.getSession()), request.getId());
        return detail(me, request.getId());
    }

    @Transactional
    public RequestView declineAndLeave(User me, Long offerId) {
        Long companyId = companyId(me);
        WaitlistOffer offer = offers.findForUpdateByIdAndCompanyId(offerId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Offer not found."));
        declineOffer(offer, me, true);
        return detail(me, offer.getRequest().getId());
    }

    @Transactional
    public PublicOfferView publicOffer(Long offerId) {
        WaitlistOffer offer = offers.findById(offerId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Offer not found."));
        expireIfNeeded(offer);
        return toPublicOfferView(offer);
    }

    @Transactional
    public PublicOfferView publicAccept(Long offerId) {
        WaitlistOffer offer = offers.findForUpdateById(offerId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Offer not found."));
        acceptOfferAndCreateBooking(offer, null);
        return toPublicOfferView(offer);
    }

    private SessionBooking acceptOfferAndCreateBooking(WaitlistOffer offer, User actor) {
        expireIfNeeded(offer);
        WaitlistRequest request = offer.getRequest();
        if (request == null || request.getCompany() == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Waitlist request not found.");
        }
        if (request.getBookedBooking() != null && request.getStatus() == WaitlistRequestStatus.BOOKED) {
            return request.getBookedBooking();
        }
        if (offer.getStatus() != WaitlistOfferStatus.PENDING && offer.getStatus() != WaitlistOfferStatus.ACCEPTED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Offer is no longer available.");
        }
        if (request.getClient() == null || request.getClient().getId() == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A waitlist client is required to create the booking.");
        }

        Long companyId = request.getCompany().getId();
        offer.setStatus(WaitlistOfferStatus.ACCEPTED);
        if (offer.getAcceptedAt() == null) offer.setAcceptedAt(Instant.now());
        offers.save(offer);

        SessionBooking booking;
        boolean joinsExistingSession = offer.getSession() != null
                && (request.getTargetType() == WaitlistTargetType.GROUP_SESSION
                || request.getTargetType() == WaitlistTargetType.COURSE_OCCURRENCE);
        if (joinsExistingSession) {
            // The group-session join validator excludes the existing session rows, but it
            // must not be blocked by this request's own temporary offer hold.
            releaseHold(offer, WaitlistHoldStatus.CONVERTED);
            booking = bookingValidation.joinClientToGroupSession(new SessionBookingCreationService.GroupJoinRequest(
                    companyId,
                    offer.getSession().getId(),
                    request.getClient().getId(),
                    "WAITLIST",
                    String.valueOf(request.getId()),
                    request.getGuestUserId() == null ? null : String.valueOf(request.getGuestUserId()),
                    SessionBookingStatus.RESERVED,
                    true
            ));
        } else {
            User bookingActor = users.findFirstByCompanyIdAndActiveTrueAndRoleOrderByIdAsc(companyId, Role.ADMIN)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "No administrator is available to create the booking."));
            SessionBookingController.BookingRequest bookingRequest = new SessionBookingController.BookingRequest(
                    request.getClient().getId(),
                    List.of(request.getClient().getId()),
                    id(offer.getEmployee()),
                    offer.getSlotStart().toString(),
                    offer.getSlotEnd().toString(),
                    id(offer.getRoom()),
                    offer.getService().getId(),
                    request.getNotes(),
                    null,
                    false,
                    null,
                    false,
                    null,
                    null,
                    null,
                    SessionBookingStatus.RESERVED,
                    null,
                    null
            );
            SessionBookingController.BookingResponse created = bookingValidation.create(bookingRequest, bookingActor, request.getId());
            booking = bookings.findByIdAndCompanyId(created.id(), companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Created booking could not be loaded."));
            booking.setSourceChannel("WAITLIST");
            booking.setSourceOrderId(String.valueOf(request.getId()));
            booking.setGuestUserId(request.getGuestUserId() == null ? null : String.valueOf(request.getGuestUserId()));
            booking = bookings.save(booking);
            releaseHold(offer, WaitlistHoldStatus.CONVERTED);
        }

        request.setBookedBooking(booking);
        request.setStatus(WaitlistRequestStatus.BOOKED);
        requests.save(request);
        addEvent(request, offer, actor, WaitlistEventType.OFFER_ACCEPTED, "Ponudba termina je bila sprejeta.");
        addEvent(request, offer, actor, WaitlistEventType.CONVERTED_TO_BOOKING,
                "Ponudba je bila samodejno pretvorjena v rezervacijo #" + booking.getId() + ".");
        tenantNotifications.createWaitlistNotification(companyId, request.getId(), "WAITLIST_OFFER_ACCEPTED", "Termin potrjen in rezerviran",
                clientName(request.getClient()) + " je sprejel/a ponujeni termin. Rezervacija #" + booking.getId() + " je bila ustvarjena.",
                "/calendar?bookingId=" + booking.getId());
        guestNotifications.publish(request, offer, WaitlistGuestNotificationService.EventKind.BOOKED);
        return booking;
    }

    @Transactional
    public PublicOfferView publicDecline(Long offerId) {
        WaitlistOffer offer = offers.findForUpdateById(offerId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Offer not found."));
        expireIfNeeded(offer);
        if (offer.getStatus() == WaitlistOfferStatus.PENDING) {
            offer.setStatus(WaitlistOfferStatus.DECLINED);
            offer.setDeclinedAt(Instant.now());
            offers.save(offer);
            releaseHold(offer, WaitlistHoldStatus.RELEASED);
            WaitlistRequest request = offer.getRequest();
            request.setStatus(WaitlistRequestStatus.ACTIVE);
            requests.save(request);
            addEvent(request, offer, null, WaitlistEventType.OFFER_DECLINED, "Ponudba termina je bila zavrnjena.");
            tenantNotifications.createWaitlistNotification(companyId(request.getCompany()), request.getId(), "WAITLIST_OFFER_DECLINED", "Ponudba termina zavrnjena",
                    clientName(request.getClient()) + " je zavrnil/a ponujeni termin.", "/appointments?requestId=" + request.getId());
            offerNextCandidate(companyId(request.getCompany()), offer.getSlotStart(), offerAvailableEnd(offer), id(offer.getEmployee()), id(offer.getRoom()), id(offer.getSession()), request.getId());
        }
        return toPublicOfferView(offer);
    }

    @Transactional
    public PublicOfferView publicDeclineAndLeave(Long offerId) {
        WaitlistOffer offer = offers.findForUpdateById(offerId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Offer not found."));
        expireIfNeeded(offer);
        if (offer.getStatus() == WaitlistOfferStatus.PENDING) declineOffer(offer, null, true);
        return toPublicOfferView(offer);
    }

    private void declineOffer(WaitlistOffer offer, User actor, boolean leaveWaitlist) {
        if (offer.getStatus() != WaitlistOfferStatus.PENDING) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Offer is no longer pending.");
        }
        offer.setStatus(WaitlistOfferStatus.DECLINED);
        offer.setDeclinedAt(Instant.now());
        offers.save(offer);
        releaseHold(offer, WaitlistHoldStatus.RELEASED);
        WaitlistRequest request = offer.getRequest();
        request.setStatus(leaveWaitlist ? WaitlistRequestStatus.CANCELLED : WaitlistRequestStatus.ACTIVE);
        requests.save(request);
        addEvent(request, offer, actor, WaitlistEventType.OFFER_DECLINED,
                leaveWaitlist ? "Ponudba je bila zavrnjena in stranka je zapustila čakalno vrsto." : "Ponudba termina je bila zavrnjena; zahteva ostaja aktivna.");
        Long companyId = companyId(request.getCompany());
        tenantNotifications.createWaitlistNotification(companyId, request.getId(), "WAITLIST_OFFER_DECLINED", "Ponudba termina zavrnjena",
                clientName(request.getClient()) + (leaveWaitlist ? " je zavrnil/a ponudbo in zapustil/a čakalno vrsto." : " je zavrnil/a ponudbo in ostaja na čakalni vrsti."),
                "/appointments?requestId=" + request.getId());
        offerNextCandidate(companyId, offer.getSlotStart(), offerAvailableEnd(offer), id(offer.getEmployee()), id(offer.getRoom()), id(offer.getSession()), request.getId());
    }

    @Transactional
    public void revokeOffer(User me, Long offerId) {
        Long companyId = companyId(me);
        WaitlistOffer offer = offers.findForUpdateByIdAndCompanyId(offerId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Offer not found."));
        if (offer.getStatus() != WaitlistOfferStatus.PENDING) return;
        offer.setStatus(WaitlistOfferStatus.REVOKED);
        offers.save(offer);
        releaseHold(offer, WaitlistHoldStatus.RELEASED);
        WaitlistRequest request = offer.getRequest();
        if (request.getStatus() == WaitlistRequestStatus.OFFERED) {
            request.setStatus(WaitlistRequestStatus.ACTIVE);
            requests.save(request);
        }
        addEvent(request, offer, me, WaitlistEventType.OFFER_REVOKED, "Ponudba termina je bila preklicana.");
    }

    @Transactional
    public RequestView convertToBooking(User me, Long requestId, Long bookingId) {
        Long companyId = companyId(me);
        WaitlistRequest request = requests.findForUpdateByIdAndCompanyId(requestId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Waitlist request not found."));
        SessionBooking booking = bookings.findByIdAndCompanyId(bookingId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Booking not found."));
        if (request.getClient() != null && booking.getClient() != null && !Objects.equals(request.getClient().getId(), booking.getClient().getId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Booking belongs to another client.");
        }
        request.setBookedBooking(booking);
        request.setStatus(WaitlistRequestStatus.BOOKED);
        requests.save(request);
        WaitlistOffer convertedOffer = offers.findFirstByRequestIdAndStatusOrderByOfferedAtDesc(requestId, WaitlistOfferStatus.ACCEPTED)
                .orElseGet(() -> offers.findFirstByRequestIdAndStatusOrderByOfferedAtDesc(requestId, WaitlistOfferStatus.PENDING).orElse(null));
        if (convertedOffer != null) {
            if (convertedOffer.getStatus() == WaitlistOfferStatus.PENDING) {
                convertedOffer.setStatus(WaitlistOfferStatus.ACCEPTED);
                convertedOffer.setAcceptedAt(Instant.now());
                offers.save(convertedOffer);
            }
            releaseHold(convertedOffer, WaitlistHoldStatus.CONVERTED);
        }
        addEvent(request, null, me, WaitlistEventType.CONVERTED_TO_BOOKING, "Čakalna zahteva je bila pretvorjena v rezervacijo #" + bookingId + ".");
        guestNotifications.publish(request, convertedOffer, WaitlistGuestNotificationService.EventKind.BOOKED);
        if (waitlistSettings.get(companyId).closeEquivalentAfterBooking()) {
            requests.findAllDetailedByCompanyId(companyId).stream()
                    .filter(other -> !Objects.equals(other.getId(), request.getId()))
                    .filter(other -> DUPLICATE_BLOCKING_STATUSES.contains(other.getStatus()))
                    .filter(other -> Objects.equals(other.getDuplicateKey(), request.getDuplicateKey()))
                    .forEach(other -> {
                        other.setStatus(WaitlistRequestStatus.CANCELLED);
                        requests.save(other);
                        addEvent(other, null, me, WaitlistEventType.CANCELLED_BY_STAFF, "Enakovredna zahteva je bila zaprta po rezervaciji.");
                        guestNotifications.publish(other, null, WaitlistGuestNotificationService.EventKind.CANCELLED);
                    });
        }
        return detail(me, requestId);
    }

    @Transactional
    public RequestView skip(User me, Long requestId, OfferInput input) {
        Long companyId = companyId(me);
        WaitlistRequest request = requests.findForUpdateByIdAndCompanyId(requestId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Waitlist request not found."));
        User employee = input.employeeId() == null ? null : users.findByIdAndCompanyId(input.employeeId(), companyId).orElse(null);
        WaitlistSlotSkip skip = new WaitlistSlotSkip();
        skip.setRequest(request);
        skip.setSlotStart(required(input.slotStart(), "slotStart"));
        skip.setSlotEnd(required(input.slotEnd(), "slotEnd"));
        skip.setEmployee(employee);
        skip.setSkippedBy(me);
        skips.save(skip);
        addEvent(request, null, me, WaitlistEventType.SKIPPED_FOR_SLOT, "Stranka je bila preskočena za termin " + input.slotStart() + ".");
        return detail(me, requestId);
    }

    @Transactional
    public void remove(User me, Long requestId) {
        Long companyId = companyId(me);
        WaitlistRequest request = requests.findForUpdateByIdAndCompanyId(requestId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Waitlist request not found."));
        revokePendingOffer(request);
        request.setStatus(WaitlistRequestStatus.REMOVED);
        requests.save(request);
        addEvent(request, null, me, WaitlistEventType.REMOVED_BY_STAFF, "Zahteva je bila odstranjena s čakalne vrste.");
        guestNotifications.publish(request, null, WaitlistGuestNotificationService.EventKind.CANCELLED);
    }

    /** Invoked after a booking cancellation/deletion/reschedule commits. */
    @Transactional
    public void handleReleasedSlot(Long companyId, Long bookingId, LocalDateTime slotStart, LocalDateTime slotEnd, String kind, LocalDateTime previousStart) {
        if (companyId == null || slotStart == null || slotEnd == null) return;
        WaitlistSettingsService.WaitlistSettings cfg = waitlistSettings.get(companyId);
        if (!cfg.enabled() || !cfg.autoOfferEnabled()) return;
        SessionBooking booking = bookingId == null ? null : bookings.findById(bookingId).orElse(null);
        if (booking == null && previousStart == null) return;
        LocalDateTime releasedStart = previousStart != null ? previousStart : slotStart;
        LocalDateTime releasedEnd = previousStart != null ? previousStart.plus(Duration.between(slotStart, slotEnd)) : slotEnd;
        Long serviceId = booking == null || booking.getType() == null ? null : booking.getType().getId();
        if (serviceId == null) return;
        Long employeeId = id(booking.getConsultant());
        Long roomId = id(booking.getSpace());
        // A manual offer can be created immediately before the cancellation is committed.
        // In that case the hold already owns the released slot, so automatic offering
        // must not attempt to notify another candidate for the same availability.
        if (hasActiveHold(companyId, employeeId, roomId, releasedStart, releasedEnd, null)) return;
        offerNextCandidate(companyId, releasedStart, releasedEnd, employeeId, roomId, bookingId, null);
    }

    /**
     * Processes a bounded expiry batch. Scheduling and cross-instance locking live in
     * {@link WaitlistExpiryScheduler}; this method only owns the database transaction.
     */
    @Transactional
    public int expireOffersBatch() {
        Instant now = Instant.now();
        Instant expiringThreshold = now.plus(Duration.ofMinutes(offerExpiringMinutes));
        var page = PageRequest.of(0, expiryBatchSize);
        int processed = 0;

        for (WaitlistOffer offer : offers.findPendingExpiring(now, expiringThreshold, page)) {
            if (offer.getStatus() != WaitlistOfferStatus.PENDING || offer.getExpiringNotifiedAt() != null) continue;
            offer.setExpiringNotifiedAt(now);
            offers.save(offer);
            guestNotifications.publish(offer.getRequest(), offer, WaitlistGuestNotificationService.EventKind.OFFER_EXPIRING);
            processed++;
        }
        for (WaitlistOffer offer : offers.findExpiredPending(now, page)) {
            if (offer.getStatus() != WaitlistOfferStatus.PENDING) continue;
            offer.setStatus(WaitlistOfferStatus.EXPIRED);
            offers.save(offer);
            releaseHold(offer, WaitlistHoldStatus.EXPIRED);
            WaitlistRequest request = offer.getRequest();
            if (request.getStatus() == WaitlistRequestStatus.OFFERED) {
                request.setStatus(request.getExpiresAt() != null && !request.getExpiresAt().isAfter(now)
                        ? WaitlistRequestStatus.EXPIRED : WaitlistRequestStatus.ACTIVE);
                requests.save(request);
            }
            addEvent(request, offer, null, WaitlistEventType.OFFER_EXPIRED, "Ponudba termina je potekla.");
            tenantNotifications.createWaitlistNotification(request.getCompany().getId(), request.getId(), "WAITLIST_OFFER_EXPIRED", "Ponudba termina je potekla",
                    "Ponudba za " + clientName(request.getClient()) + " je potekla.", "/appointments?requestId=" + request.getId());
            guestNotifications.publish(request, offer, WaitlistGuestNotificationService.EventKind.OFFER_EXPIRED);
            offerNextCandidate(request.getCompany().getId(), offer.getSlotStart(), offerAvailableEnd(offer), id(offer.getEmployee()), id(offer.getRoom()), id(offer.getSession()), request.getId());
            processed++;
        }
        for (WaitlistBookingHold hold : holds.findExpiredActive(now, page)) {
            if (hold.getStatus() != WaitlistHoldStatus.ACTIVE) continue;
            hold.setStatus(WaitlistHoldStatus.EXPIRED);
            holds.save(hold);
            publishCalendarRefreshAfterCommit(hold, "WAITLIST_OFFER_EXPIRED");
            processed++;
        }
        return processed;
    }

    public boolean hasActiveHold(Long companyId, Long employeeId, Long roomId, LocalDateTime start, LocalDateTime end, Long excludeOfferId) {
        return holds.existsActiveOverlap(companyId, employeeId, roomId, start, end, Instant.now(), excludeOfferId);
    }

    private MatchResult matchResult(Long companyId, MatchInput input) {
        if (input == null || input.serviceId() == null || input.slotStart() == null || input.slotEnd() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "serviceId, slotStart and slotEnd are required.");
        }
        LocalDateTime start = input.slotStart();
        LocalDateTime availableEnd = input.slotEnd();
        if (!availableEnd.isAfter(start)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "slotEnd must be after slotStart.");
        }
        SessionType selectedService = sessionTypes.findByIdAndCompanyIdWithLinkedServices(input.serviceId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Service not found."));
        User employee = input.employeeId() == null ? null : users.findByIdAndCompanyIdAndActiveTrue(input.employeeId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Employee not found."));
        Space room = input.roomId() == null ? null : spaces.findByIdAndCompanyId(input.roomId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Room not found."));
        SessionBooking session = input.sessionId() == null ? null : bookings.findByIdAndCompanyId(input.sessionId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Session not found."));
        boolean releasedSlot = Boolean.TRUE.equals(input.releasedSlot());
        if (!releasedSlot && session != null && session.getType() != null && !Objects.equals(session.getType().getId(), selectedService.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The selected session uses another service.");
        }
        List<MatchCandidate> matched = new ArrayList<>();
        for (WaitlistRequest request : requests.findActiveCandidates(companyId, start.toLocalDate(), Instant.now())) {
            if (skips.existsByRequestIdAndSlotStartAndEmployeeId(request.getId(), start, input.employeeId())) continue;
            List<WaitlistRequestWindow> requestWindows = windows.findAllByRequestIdOrderByDateAscDayOfWeekAscTimeFromAsc(request.getId());
            List<WaitlistRequestEmployee> selectedEmployees = requestEmployees.findAllByRequestId(request.getId());
            List<SessionType> eligible = eligibleServicesForRequest(request);
            if (!releasedSlot) {
                eligible = eligible.stream().filter(service -> Objects.equals(service.getId(), selectedService.getId())).toList();
            }
            MatchCandidate best = null;
            for (SessionType service : eligible) {
                if (service == null || !service.isActive()) continue;
                LocalDateTime concreteEnd = session != null && !releasedSlot ? session.getEndTime() : serviceEnd(start, service);
                if (concreteEnd == null || concreteEnd.isAfter(availableEnd)) continue;
                if (!requestMatchesSlot(request, requestWindows, selectedEmployees, start, concreteEnd, employee, room, session)) continue;
                try {
                    validateSlotAvailable(request, service, start, concreteEnd, employee, room, session, null, releasedSlot);
                    MatchCandidate candidate = new MatchCandidate(request, service, concreteEnd);
                    if (best == null || compareCandidateServices(candidate, best, availableEnd) < 0) best = candidate;
                } catch (ResponseStatusException ignored) {
                    // Normal conflict validation can make a request ineligible for this concrete service.
                }
            }
            if (best != null) matched.add(best);
        }
        matched.sort(Comparator
                .comparingInt((MatchCandidate candidate) -> matchPriority(candidate.request(), session))
                .thenComparing(candidate -> candidate.request().getJoinedAt(), Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(candidate -> candidate.request().getId()));
        int total = matched.size();
        int limit = Math.max(1, Math.min(Optional.ofNullable(input.limit()).orElse(10), 50));
        List<MatchView> views = matched.stream().limit(limit).map(candidate -> toMatchView(candidate, session)).toList();
        return new MatchResult(total, views.isEmpty() ? null : views.get(0), views);
    }

    private int compareCandidateServices(MatchCandidate left, MatchCandidate right, LocalDateTime availableEnd) {
        long leftUnused = Math.max(0, Duration.between(left.slotEnd(), availableEnd).toMinutes());
        long rightUnused = Math.max(0, Duration.between(right.slotEnd(), availableEnd).toMinutes());
        int unused = Long.compare(leftUnused, rightUnused);
        if (unused != 0) return unused;
        int order = Integer.compare(left.service().getGuestSortOrder(), right.service().getGuestSortOrder());
        if (order != 0) return order;
        return Long.compare(left.service().getId(), right.service().getId());
    }

    private int matchPriority(WaitlistRequest request, SessionBooking session) {
        if (request.getTargetSession() != null && session != null
                && Objects.equals(request.getTargetSession().getId(), session.getId())) return 0;
        if (request.getTargetType() == WaitlistTargetType.EXACT_TIME
                || request.getTargetType() == WaitlistTargetType.GROUP_SESSION
                || request.getTargetType() == WaitlistTargetType.COURSE_OCCURRENCE) return 1;
        if (request.getTargetType() == WaitlistTargetType.FLEXIBLE_WINDOW) return 2;
        return 3;
    }

    private MatchView toMatchView(MatchCandidate candidate, SessionBooking session) {
        WaitlistRequest request = candidate.request();
        ServiceGroup group = candidate.service().getServiceGroup();
        return new MatchView(
                request.getId(),
                id(request.getClient()),
                clientName(request.getClient()),
                request.getClient() == null ? null : request.getClient().getEmail(),
                request.getClient() == null ? null : request.getClient().getPhone(),
                candidate.service().getId(),
                candidate.service().getName(),
                request.getServiceScope().name(),
                group == null ? request.getServiceGroupIdSnapshot() : group.getId(),
                group == null ? request.getServiceGroupNameSnapshot() : group.getName(),
                request.getTargetType().name(),
                request.getRequestedParticipants(),
                request.getJoinedAt(),
                matchPriority(request, session)
        );
    }

    private RequestView offerInternal(Long companyId, Long requestId, OfferInput input, User actor, boolean automatic, boolean releasedSlot) {
        WaitlistRequest request = requests.findForUpdateByIdAndCompanyId(requestId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Waitlist request not found."));
        if (request.getStatus() != WaitlistRequestStatus.ACTIVE) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only an active request can receive an offer.");
        }
        LocalDateTime start = required(input.slotStart(), "slotStart");
        LocalDateTime availableEnd = required(input.slotEnd(), "slotEnd");
        if (!availableEnd.isAfter(start)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "slotEnd must be after slotStart.");
        SessionType concreteService = resolveOfferService(request, input.serviceId(), companyId);
        User employee = input.employeeId() == null ? null : users.findByIdAndCompanyIdAndActiveTrue(input.employeeId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Employee not found."));
        Space room = input.roomId() == null ? null : spaces.findByIdAndCompanyId(input.roomId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Room not found."));
        SessionBooking session = input.sessionId() == null ? null : bookings.findByIdAndCompanyId(input.sessionId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Session not found."));
        if (!releasedSlot && session != null && session.getType() != null && !Objects.equals(session.getType().getId(), concreteService.getId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "The selected session uses another service.");
        }
        LocalDateTime end = session != null && !releasedSlot ? session.getEndTime() : serviceEnd(start, concreteService);
        SessionBooking offeredSession = releasedSlot ? null : session;
        if (end == null || end.isAfter(availableEnd)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "The selected service does not fit inside the proposed slot.");
        }
        List<WaitlistRequestWindow> requestWindows = windows.findAllByRequestIdOrderByDateAscDayOfWeekAscTimeFromAsc(requestId);
        List<WaitlistRequestEmployee> selected = requestEmployees.findAllByRequestId(requestId);
        List<WaitlistRequestService> eligible = requestServices.findAllByRequestIdOrderBySortOrderSnapshotAscIdAsc(requestId);
        if (!requestMatchesSlot(request, requestWindows, selected, start, end, employee, room, session)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "The proposed slot does not match the waitlist request.");
        }
        validateSlotAvailable(request, concreteService, start, end, employee, room, session, null, releasedSlot);
        int validity = Math.max(5, Math.min(Optional.ofNullable(input.validityMinutes()).orElse(waitlistSettings.get(companyId).offerValidityMinutes()), 1440));
        Instant now = Instant.now();
        WaitlistOffer offer = new WaitlistOffer();
        offer.setCompany(request.getCompany());
        offer.setRequest(request);
        offer.setService(concreteService);
        offer.setServiceNameSnapshot(concreteService.getName());
        ServiceGroup group = concreteService.getServiceGroup();
        offer.setServiceGroupIdSnapshot(group == null ? null : group.getId());
        offer.setServiceGroupNameSnapshot(group == null ? null : group.getName());
        offer.setSlotStart(start);
        offer.setSlotEnd(end);
        offer.setAvailableSlotEnd(availableEnd);
        offer.setEmployee(employee);
        offer.setRoom(room);
        offer.setSession(offeredSession);
        offer.setStatus(WaitlistOfferStatus.PENDING);
        offer.setOfferedAt(now);
        offer.setExpiresAt(now.plus(Duration.ofMinutes(validity)));
        offer.setSecureTokenHash(sha256(UUID.randomUUID().toString()));
        offer = offers.save(offer);

        WaitlistBookingHold hold = new WaitlistBookingHold();
        hold.setCompany(request.getCompany());
        hold.setOffer(offer);
        hold.setSlotStart(start);
        int serviceBreakMinutes = concreteService.getBreakMinutes() == null ? 0 : Math.max(0, concreteService.getBreakMinutes());
        hold.setSlotEnd(end.plusMinutes(serviceBreakMinutes));
        hold.setEmployee(employee);
        hold.setRoom(room);
        hold.setSession(offeredSession);
        hold.setStatus(WaitlistHoldStatus.ACTIVE);
        hold.setExpiresAt(offer.getExpiresAt());
        holds.save(hold);
        publishCalendarRefreshAfterCommit(hold, "WAITLIST_OFFER_CREATED");

        request.setStatus(WaitlistRequestStatus.OFFERED);
        requests.save(request);
        addEvent(request, offer, actor, WaitlistEventType.OFFER_SENT,
                (automatic ? "Samodejna" : "Ročna") + " ponudba za " + concreteService.getName() + " je bila poslana. Velja do " + offer.getExpiresAt() + ".");
        tenantNotifications.createWaitlistNotification(companyId, request.getId(), "WAITLIST_OFFER_SENT", "Ponudba prostega termina",
                "Ponudba za " + clientName(request.getClient()) + " (" + concreteService.getName() + ") velja do " + offer.getExpiresAt() + ".", "/appointments?requestId=" + request.getId());
        guestNotifications.publish(request, offer, WaitlistGuestNotificationService.EventKind.SLOT_AVAILABLE);
        return toView(request, requestWindows, selected, eligible, true);
    }

    private void offerNextCandidate(Long companyId, LocalDateTime start, LocalDateTime availableEnd, Long employeeId, Long roomId, Long sessionId, Long excludedRequestId) {
        if (!waitlistSettings.get(companyId).autoOfferEnabled()) return;
        User employee = employeeId == null ? null : users.findByIdAndCompanyIdAndActiveTrue(employeeId, companyId).orElse(null);
        Space room = roomId == null ? null : spaces.findByIdAndCompanyId(roomId, companyId).orElse(null);
        SessionBooking session = sessionId == null ? null : bookings.findByIdAndCompanyId(sessionId, companyId).orElse(null);
        List<MatchCandidate> candidates = new ArrayList<>();
        for (WaitlistRequest request : requests.findActiveCandidates(companyId, start.toLocalDate(), Instant.now())) {
            if (Objects.equals(request.getId(), excludedRequestId)) continue;
            if (skips.existsByRequestIdAndSlotStartAndEmployeeId(request.getId(), start, employeeId)) continue;
            List<WaitlistRequestWindow> requestWindows = windows.findAllByRequestIdOrderByDateAscDayOfWeekAscTimeFromAsc(request.getId());
            List<WaitlistRequestEmployee> selectedEmployees = requestEmployees.findAllByRequestId(request.getId());
            MatchCandidate best = null;
            for (SessionType service : eligibleServicesForRequest(request)) {
                if (service == null || !service.isActive()) continue;
                LocalDateTime concreteEnd = serviceEnd(start, service);
                if (concreteEnd == null || concreteEnd.isAfter(availableEnd)) continue;
                if (!requestMatchesSlot(request, requestWindows, selectedEmployees, start, concreteEnd, employee, room, session)) continue;
                try {
                    validateSlotAvailable(request, service, start, concreteEnd, employee, room, session, null, true);
                    MatchCandidate candidate = new MatchCandidate(request, service, concreteEnd);
                    if (best == null || compareCandidateServices(candidate, best, availableEnd) < 0) best = candidate;
                } catch (ResponseStatusException ex) {
                    addEvent(request, null, null, WaitlistEventType.MATCH_REJECTED, ex.getReason());
                }
            }
            if (best != null) candidates.add(best);
        }
        candidates.sort(Comparator
                .comparingInt((MatchCandidate candidate) -> matchPriority(candidate.request(), session))
                .thenComparing(candidate -> candidate.request().getJoinedAt(), Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(candidate -> candidate.request().getId()));
        if (!candidates.isEmpty()) {
            MatchCandidate first = candidates.get(0);
            offerInternal(companyId, first.request().getId(),
                    new OfferInput(first.service().getId(), start, availableEnd, employeeId, roomId, sessionId, null), null, true, true);
            return;
        }
        tenantNotifications.createWaitlistNotification(companyId, null, "WAITLIST_ATTENTION", "Prost termin brez ustreznega kandidata",
                "Za sproščeni termin " + start + " ni bilo mogoče samodejno poslati ponudbe.", "/appointments");
    }

    private void validateSlotAvailable(WaitlistRequest request, SessionType service, LocalDateTime start, LocalDateTime end, User employee, Space room, SessionBooking session, Long excludeOfferId, boolean releasedSlot) {
        Long companyId = request.getCompany().getId();
        int breakMinutes = service.getBreakMinutes() == null ? 0 : Math.max(0, service.getBreakMinutes());
        LocalDateTime busyEnd = end.plusMinutes(breakMinutes);
        if (hasActiveHold(companyId, id(employee), id(room), start, busyEnd, excludeOfferId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "The slot is temporarily held for another waitlist offer.");
        }
        LocalDateTime now = LocalDateTime.now(ZONE);
        if (!start.isAfter(now)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "The proposed slot must be in the future.");
        }
        // A waitlist slot is selected explicitly by a tenant user or comes from a released
        // booking. It must therefore not be filtered by the public online-booking notice,
        // booking-horizon or published working-slot rules. Those checks caused valid
        // same-day/manual calendar slots to return zero waitlist matches. Resource, client,
        // personal-block, room and temporary-hold conflicts are still validated below.
        List<Long> clientIds = request.getClient() == null ? List.of() : List.of(request.getClient().getId());
        List<Long> excluded = session == null
                ? List.of(-1L)
                : session.getBookingGroupKey() == null
                ? List.of(session.getId())
                : bookings.findAllByBookingGroupKeyOrderByIdAsc(session.getBookingGroupKey()).stream()
                .map(SessionBooking::getId)
                .toList();
        bookingValidation.validateBookingWindow(companyId, clientIds, id(employee), id(room), start, end, service.getId(),
                excluded.isEmpty() ? List.of(-1L) : excluded, true, false, true, false, false);
        boolean sameServiceSession = session != null
                && session.getType() != null
                && Objects.equals(session.getType().getId(), service.getId());
        if (sameServiceSession) validateGroupCapacity(request, service, session, releasedSlot);
    }

    private boolean isInsideWorkingSlot(Long companyId, Long employeeId, LocalDateTime start, LocalDateTime busyEnd) {
        var slots = bookableSlots.findAllForWidgetByCompanyIdAndDate(companyId, start.getDayOfWeek(), start.toLocalDate(), employeeId);
        if (slots.isEmpty()) return false;
        return slots.stream().anyMatch(slot -> !start.toLocalTime().isBefore(slot.getStartTime()) && !busyEnd.toLocalTime().isAfter(slot.getEndTime()));
    }

    private void validateGroupCapacity(WaitlistRequest request, SessionType service, SessionBooking session, boolean releasedSlot) {
        Integer max = service.getMaxParticipantsPerSession();
        if (max == null || max <= 0) return;
        Collection<SessionBooking> rows = session.getBookingGroupKey() == null
                ? List.of(session)
                : bookings.findByBookingGroupKeyAndCompanyIdOrderByIdAsc(session.getBookingGroupKey(), request.getCompany().getId());
        long occupied = rows.stream().filter(row -> !"CANCELLED".equalsIgnoreCase(row.getBookingStatus()) && !"NO_SHOW".equalsIgnoreCase(row.getBookingStatus())).count();
        if (releasedSlot && occupied > 0) occupied--;
        if (occupied + request.getRequestedParticipants() > max) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "The requested participant count does not fit the remaining capacity.");
        }
    }

    private boolean requestMatchesSlot(WaitlistRequest request, List<WaitlistRequestWindow> requestWindows,
                                       List<WaitlistRequestEmployee> selectedEmployees, LocalDateTime start, LocalDateTime end,
                                       User employee, Space room, SessionBooking session) {
        if (start.toLocalDate().isBefore(request.getDateFrom()) || start.toLocalDate().isAfter(request.getDateTo())) return false;
        if (request.getLocation() != null && (room == null || !Objects.equals(request.getLocation().getId(), room.getId()))) return false;
        if ((request.getTargetType() == WaitlistTargetType.GROUP_SESSION || request.getTargetType() == WaitlistTargetType.COURSE_OCCURRENCE)
                && request.getTargetSession() != null && (session == null || !Objects.equals(request.getTargetSession().getId(), session.getId()))) return false;
        if (request.getEmployeePreferenceType() == WaitlistEmployeePreferenceType.SPECIFIC) {
            if (employee == null || request.getSpecificEmployee() == null || !Objects.equals(employee.getId(), request.getSpecificEmployee().getId())) return false;
        }
        if (request.getEmployeePreferenceType() == WaitlistEmployeePreferenceType.SELECTED) {
            if (employee == null || selectedEmployees.stream().noneMatch(row -> Objects.equals(row.getEmployee().getId(), employee.getId()))) return false;
        }
        if (requestWindows.isEmpty()) return true;
        return requestWindows.stream().anyMatch(window -> {
            if (window.getDate() != null && !Objects.equals(window.getDate(), start.toLocalDate())) return false;
            if (window.getDayOfWeek() != null && window.getDayOfWeek() != start.getDayOfWeek()) return false;
            if (window.isAllDay()) return true;
            LocalTime from = window.getTimeFrom();
            LocalTime to = window.getTimeTo();
            // Waitlist time windows describe acceptable appointment start times.
            return (from == null || !start.toLocalTime().isBefore(from))
                    && (to == null || !start.toLocalTime().isAfter(to));
        });
    }

    private RequestInput normalizeInput(RequestInput input, WaitlistSettingsService.WaitlistSettings cfg) {
        if (input == null || input.targetType() != WaitlistTargetType.ANY_AVAILABLE) return input;
        LocalDate dateFrom = LocalDate.now(ZONE);
        LocalDate dateTo = dateFrom.plusDays(Math.max(0, cfg.maxRequestedDateRangeDays() - 1L));
        return new RequestInput(
                input.clientId(), input.serviceId(), input.serviceScope(), input.serviceGroupId(), input.locationId(), input.targetType(), null,
                dateFrom, dateTo, input.employeePreferenceType(), input.specificEmployeeId(), input.employeeIds(),
                input.requestedParticipants(), input.source(), input.notes(), List.of()
        );
    }

    private void validateInput(RequestInput input, WaitlistSettingsService.WaitlistSettings cfg) {
        if (input == null || input.clientId() == null || input.targetType() == null
                || input.dateFrom() == null || input.dateTo() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Client, service selection, request type and date range are required.");
        }
        WaitlistServiceScope scope = Optional.ofNullable(input.serviceScope()).orElse(WaitlistServiceScope.EXACT_SERVICE);
        if (scope == WaitlistServiceScope.EXACT_SERVICE && input.serviceId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "An exact service is required.");
        }
        if (scope == WaitlistServiceScope.SERVICE_GROUP && input.serviceGroupId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A service group is required.");
        }
        if (input.dateTo().isBefore(input.dateFrom())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "dateTo must be on or after dateFrom.");
        if (Duration.between(input.dateFrom().atStartOfDay(), input.dateTo().plusDays(1).atStartOfDay()).toDays() > cfg.maxRequestedDateRangeDays()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The requested date range is too long.");
        }
        if (input.targetType() == WaitlistTargetType.EXACT_TIME && !cfg.exactTimeEnabled()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Exact-time waitlist requests are disabled.");
        }
        if ((input.targetType() == WaitlistTargetType.FLEXIBLE_WINDOW || input.targetType() == WaitlistTargetType.ANY_AVAILABLE)
                && !cfg.flexibleWindowsEnabled()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Flexible waitlist requests are disabled.");
        }
        if (input.targetType() == WaitlistTargetType.ANY_AVAILABLE && input.targetSessionId() != null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "An any-available request cannot target a specific session.");
        }
        if (input.windows() != null) {
            for (WindowInput window : input.windows()) {
                if (window == null || Boolean.TRUE.equals(window.allDay())) continue;
                if (window.timeFrom() != null && window.timeTo() != null && !window.timeTo().isAfter(window.timeFrom())) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "timeTo must be later than timeFrom.");
                }
            }
        }
        if (Optional.ofNullable(input.requestedParticipants()).orElse(1) < 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "requestedParticipants must be positive.");
        }
    }

    private RequestView toView(WaitlistRequest row, List<WaitlistRequestWindow> requestWindows,
                               List<WaitlistRequestEmployee> selectedEmployees,
                               List<WaitlistRequestService> eligibleServices,
                               boolean includeHistory) {
        WaitlistOffer current = offers.findFirstByRequestIdAndStatusOrderByOfferedAtDesc(row.getId(), WaitlistOfferStatus.PENDING).orElse(null);
        List<EligibleServiceView> eligibleViews = eligibleServices.stream().map(this::eligibleServiceView).toList();
        Integer duration = row.getService() == null ? null : row.getService().getDurationMinutes();
        Integer breakMinutes = row.getService() == null ? null : row.getService().getBreakMinutes();
        return new RequestView(
                row.getId(), clientName(row.getClient()), row.getClient() == null ? null : row.getClient().getEmail(),
                row.getClient() == null ? null : row.getClient().getPhone(), id(row.getClient()), id(row.getService()),
                row.getService() == null ? null : row.getService().getName(), row.getServiceScope().name(), id(row.getServiceGroup()),
                row.getServiceGroupNameSnapshot(), eligibleViews, duration, breakMinutes,
                id(row.getLocation()), row.getLocation() == null ? null : row.getLocation().getName(),
                row.getTargetType().name(), id(row.getTargetSession()), row.getDateFrom(), row.getDateTo(), row.getEmployeePreferenceType().name(),
                employeeView(row.getSpecificEmployee()), selectedEmployees.stream().map(WaitlistRequestEmployee::getEmployee).map(this::employeeView).toList(),
                row.getRequestedParticipants(), row.getStatus().name(), row.getSource().name(), row.getNotes(), row.getJoinedAt(), row.getExpiresAt(),
                id(row.getBookedBooking()), requestWindows.stream().map(this::windowView).toList(), offerView(current),
                includeHistory ? events.findAllByRequestIdOrderByOccurredAtDescIdDesc(row.getId()).stream().map(this::eventView).toList() : List.of());
    }

    private EligibleServiceView eligibleServiceView(WaitlistRequestService row) {
        SessionType service = row.getService();
        return new EligibleServiceView(
                service == null ? null : service.getId(),
                row.getServiceNameSnapshot(),
                row.getDurationMinutesSnapshot(),
                service == null ? null : service.getBreakMinutes(),
                row.getServiceGroupIdSnapshot(),
                row.getServiceGroupNameSnapshot()
        );
    }

    private WindowView windowView(WaitlistRequestWindow row) {
        return new WindowView(row.getId(), row.getDayOfWeek() == null ? null : row.getDayOfWeek().name(), row.getDate(), row.getTimeFrom(), row.getTimeTo(), row.isAllDay());
    }

    private OfferView offerView(WaitlistOffer row) {
        if (row == null) return null;
        long remaining = Math.max(0, Duration.between(Instant.now(), row.getExpiresAt()).getSeconds());
        return new OfferView(row.getId(), row.getStatus().name(), id(row.getService()), row.getServiceNameSnapshot(),
                row.getServiceGroupIdSnapshot(), row.getServiceGroupNameSnapshot(), row.getSlotStart(), row.getSlotEnd(), employeeView(row.getEmployee()),
                row.getRoom() == null ? null : row.getRoom().getName(), row.getOfferedAt(), row.getExpiresAt(), row.getAcceptedAt(), row.getDeclinedAt(), remaining);
    }

    private EventView eventView(WaitlistEvent row) {
        return new EventView(row.getId(), row.getEventType().name(), row.getDetail(), row.getOccurredAt(), employeeName(row.getActor()));
    }

    private EmployeeView employeeView(User user) {
        return user == null ? null : new EmployeeView(user.getId(), employeeName(user));
    }

    private void replaceWindows(WaitlistRequest request, List<WindowInput> input) {
        windows.deleteAllByRequestId(request.getId());
        if (input == null) return;
        for (WindowInput value : input) {
            WaitlistRequestWindow row = new WaitlistRequestWindow();
            row.setRequest(request);
            row.setDayOfWeek(value.dayOfWeek());
            row.setDate(value.date());
            row.setAllDay(Boolean.TRUE.equals(value.allDay()));
            row.setTimeFrom(row.isAllDay() ? null : value.timeFrom());
            row.setTimeTo(row.isAllDay() ? null : value.timeTo());
            windows.save(row);
        }
    }

    private void replaceEmployees(WaitlistRequest request, List<User> employees) {
        requestEmployees.deleteAllByRequestId(request.getId());
        for (User employee : employees) {
            WaitlistRequestEmployee row = new WaitlistRequestEmployee();
            row.setRequest(request);
            row.setEmployee(employee);
            requestEmployees.save(row);
        }
    }

    private ServiceSelection resolveServiceSelection(RequestInput input, Long companyId) {
        WaitlistServiceScope scope = Optional.ofNullable(input.serviceScope()).orElse(WaitlistServiceScope.EXACT_SERVICE);
        if (scope == WaitlistServiceScope.EXACT_SERVICE) {
            SessionType service = sessionTypes.findByIdAndCompanyIdWithLinkedServices(input.serviceId(), companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Service not found."));
            if (!service.isActive()) throw new ResponseStatusException(HttpStatus.CONFLICT, "The selected service is inactive.");
            return new ServiceSelection(scope, service, null, List.of(service));
        }
        ServiceGroup group = serviceGroups.findById(input.serviceGroupId())
                .filter(value -> value.getCompany() != null && Objects.equals(value.getCompany().getId(), companyId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Service group not found."));
        if (!group.isActive()) throw new ResponseStatusException(HttpStatus.CONFLICT, "The selected service group is inactive.");
        List<SessionType> eligible = sessionTypes.findAllByCompanyIdAndServiceGroupId(companyId, group.getId()).stream()
                .filter(SessionType::isActive)
                .sorted(Comparator.comparingInt(SessionType::getGuestSortOrder).thenComparing(SessionType::getName).thenComparing(SessionType::getId))
                .toList();
        if (eligible.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "The selected service group has no active services.");
        }
        return new ServiceSelection(scope, null, group, eligible);
    }

    private void applyServiceSelection(WaitlistRequest request, ServiceSelection selection) {
        request.setServiceScope(selection.scope());
        request.setService(selection.exactService());
        request.setServiceGroup(selection.group());
        ServiceGroup snapshotGroup = selection.group();
        if (snapshotGroup == null && selection.exactService() != null) snapshotGroup = selection.exactService().getServiceGroup();
        request.setServiceGroupIdSnapshot(snapshotGroup == null ? null : snapshotGroup.getId());
        request.setServiceGroupNameSnapshot(snapshotGroup == null ? null : snapshotGroup.getName());
    }

    private void replaceEligibleServices(WaitlistRequest request, List<SessionType> services) {
        requestServices.deleteAllByRequestId(request.getId());
        int order = 0;
        for (SessionType service : services) {
            WaitlistRequestService row = new WaitlistRequestService();
            row.setRequest(request);
            row.setService(service);
            row.setServiceNameSnapshot(service.getName());
            ServiceGroup group = service.getServiceGroup();
            row.setServiceGroupIdSnapshot(group == null ? null : group.getId());
            row.setServiceGroupNameSnapshot(group == null ? null : group.getName());
            row.setDurationMinutesSnapshot(service.getDurationMinutes() == null ? 60 : service.getDurationMinutes());
            row.setSortOrderSnapshot(order++);
            requestServices.save(row);
        }
    }

    private List<SessionType> eligibleServicesForRequest(WaitlistRequest request) {
        List<SessionType> snapshot = requestServices.findAllByRequestIdOrderBySortOrderSnapshotAscIdAsc(request.getId()).stream()
                .map(WaitlistRequestService::getService)
                .filter(Objects::nonNull)
                .filter(SessionType::isActive)
                .filter(service -> request.getServiceScope() != WaitlistServiceScope.SERVICE_GROUP
                        || service.getServiceGroup() != null
                        && Objects.equals(service.getServiceGroup().getId(), request.getServiceGroupIdSnapshot()))
                .toList();
        if (!snapshot.isEmpty()) return snapshot;
        return request.getService() == null || !request.getService().isActive() ? List.of() : List.of(request.getService());
    }

    private SessionType resolveOfferService(WaitlistRequest request, Long serviceId, Long companyId) {
        Long resolvedId = serviceId;
        if (resolvedId == null && request.getServiceScope() == WaitlistServiceScope.EXACT_SERVICE && request.getService() != null) {
            resolvedId = request.getService().getId();
        }
        if (resolvedId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A concrete service must be selected for the offer.");
        }
        SessionType service = sessionTypes.findByIdAndCompanyIdWithLinkedServices(resolvedId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Service not found."));
        if (!service.isActive()) throw new ResponseStatusException(HttpStatus.CONFLICT, "The selected service is inactive.");
        if (request.getServiceScope() == WaitlistServiceScope.SERVICE_GROUP
                && (service.getServiceGroup() == null
                || !Objects.equals(service.getServiceGroup().getId(), request.getServiceGroupIdSnapshot()))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "The selected service no longer belongs to this waitlist group.");
        }
        if (!requestServices.existsByRequestIdAndServiceId(request.getId(), service.getId())
                && (request.getService() == null || !Objects.equals(request.getService().getId(), service.getId()))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "The selected service was not included in this waitlist request.");
        }
        return service;
    }

    private LocalDateTime offerAvailableEnd(WaitlistOffer offer) {
        return offer.getAvailableSlotEnd() == null ? offer.getSlotEnd() : offer.getAvailableSlotEnd();
    }

    private LocalDateTime serviceEnd(LocalDateTime start, SessionType service) {
        int duration = service == null || service.getDurationMinutes() == null ? 60 : Math.max(1, service.getDurationMinutes());
        return start.plusMinutes(duration);
    }

    private String serviceSelectionName(WaitlistRequest request) {
        if (request.getServiceScope() == WaitlistServiceScope.SERVICE_GROUP) {
            return request.getServiceGroupNameSnapshot() == null ? "skupino storitev" : request.getServiceGroupNameSnapshot();
        }
        return request.getService() == null ? "storitev" : request.getService().getName();
    }

    private List<User> resolveEmployees(List<Long> ids, Long companyId) {
        if (ids == null || ids.isEmpty()) return List.of();
        List<User> result = new ArrayList<>();
        for (Long id : ids.stream().filter(Objects::nonNull).distinct().toList()) {
            result.add(users.findByIdAndCompanyIdAndActiveTrue(id, companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Employee not found: " + id)));
        }
        return result;
    }

    private void addEvent(WaitlistRequest request, WaitlistOffer offer, User actor, WaitlistEventType type, String detail) {
        WaitlistEvent event = new WaitlistEvent();
        event.setRequest(request);
        event.setOffer(offer);
        event.setActor(actor);
        event.setEventType(type);
        event.setDetail(trimToNull(detail));
        event.setOccurredAt(Instant.now());
        events.save(event);
    }

    private void releaseHold(WaitlistOffer offer, WaitlistHoldStatus status) {
        holds.findByOfferId(offer.getId()).ifPresent(hold -> {
            if (hold.getStatus() == WaitlistHoldStatus.ACTIVE) {
                hold.setStatus(status);
                holds.save(hold);
                publishCalendarRefreshAfterCommit(hold, "WAITLIST_OFFER_RELEASED");
            }
        });
    }

    private void publishCalendarRefreshAfterCommit(WaitlistBookingHold hold, String kind) {
        if (calendarRealtime == null || hold == null || hold.getCompany() == null || hold.getCompany().getId() == null) return;
        Long companyId = hold.getCompany().getId();
        Long referenceId = hold.getOffer() != null && hold.getOffer().getId() != null
                ? hold.getOffer().getId()
                : hold.getId();
        if (referenceId == null) return;
        LocalDateTime start = hold.getSlotStart();
        LocalDateTime end = hold.getSlotEnd();
        String eventKind = kind == null || kind.isBlank() ? "WAITLIST_OFFER_UPDATED" : kind;
        Runnable publish = () -> calendarRealtime.publishBookingUpdated(companyId, referenceId, start, end, eventKind);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    publish.run();
                }
            });
        } else {
            publish.run();
        }
    }

    private void expireIfNeeded(WaitlistOffer offer) {
        if (offer.getStatus() == WaitlistOfferStatus.PENDING && !offer.getExpiresAt().isAfter(Instant.now())) {
            offer.setStatus(WaitlistOfferStatus.EXPIRED);
            offers.save(offer);
            releaseHold(offer, WaitlistHoldStatus.EXPIRED);
            WaitlistRequest request = offer.getRequest();
            request.setStatus(WaitlistRequestStatus.ACTIVE);
            requests.save(request);
            addEvent(request, offer, null, WaitlistEventType.OFFER_EXPIRED, "Ponudba termina je potekla.");
            guestNotifications.publish(request, offer, WaitlistGuestNotificationService.EventKind.OFFER_EXPIRED);
        }
    }

    private void revokePendingOffer(WaitlistRequest request) {
        offers.findFirstByRequestIdAndStatusOrderByOfferedAtDesc(request.getId(), WaitlistOfferStatus.PENDING).ifPresent(offer -> {
            offer.setStatus(WaitlistOfferStatus.REVOKED);
            offers.save(offer);
            releaseHold(offer, WaitlistHoldStatus.RELEASED);
            addEvent(request, offer, null, WaitlistEventType.OFFER_REVOKED, "Aktivna ponudba je bila preklicana.");
        });
    }

    private WaitlistRequest requestDetailed(Long id, Long companyId) {
        return requests.findDetailedByIdAndCompanyId(id, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Waitlist request not found."));
    }

    private boolean viewMatches(WaitlistRequest row, String view) {
        if (view == null || view.isBlank() || "ACTIVE".equals(view)) return row.getStatus() == WaitlistRequestStatus.ACTIVE;
        if ("OFFERED".equals(view)) return row.getStatus() == WaitlistRequestStatus.OFFERED || row.getStatus() == WaitlistRequestStatus.OFFER_ACCEPTED;
        if ("HISTORY".equals(view)) return !List.of(WaitlistRequestStatus.ACTIVE, WaitlistRequestStatus.OFFERED, WaitlistRequestStatus.OFFER_ACCEPTED).contains(row.getStatus());
        return true;
    }

    private boolean employeeMatchesFilter(WaitlistRequest row, List<WaitlistRequestEmployee> selected, Long employeeId) {
        if (employeeId == null) return true;
        if (row.getSpecificEmployee() != null && Objects.equals(row.getSpecificEmployee().getId(), employeeId)) return true;
        return selected.stream().anyMatch(item -> Objects.equals(item.getEmployee().getId(), employeeId));
    }

    private boolean searchMatches(WaitlistRequest row, List<WaitlistRequestService> eligible, String search) {
        if (search == null || search.isBlank()) return true;
        Client client = row.getClient();
        String serviceNames = eligible.stream().map(WaitlistRequestService::getServiceNameSnapshot).collect(Collectors.joining(" "));
        String haystack = String.join(" ", clientName(client), client == null ? "" : String.valueOf(client.getEmail()),
                client == null ? "" : String.valueOf(client.getPhone()), row.getServiceGroupNameSnapshot() == null ? "" : row.getServiceGroupNameSnapshot(),
                row.getService() == null ? "" : row.getService().getName(), serviceNames).toLowerCase(Locale.ROOT);
        return haystack.contains(search.toLowerCase(Locale.ROOT));
    }

    private boolean requestContainsService(WaitlistRequest row, List<WaitlistRequestService> eligible, Long serviceId) {
        if (serviceId == null) return true;
        if (row.getService() != null && Objects.equals(row.getService().getId(), serviceId)) return true;
        return eligible.stream().anyMatch(item -> item.getService() != null && Objects.equals(item.getService().getId(), serviceId));
    }

    private String duplicateKey(Long companyId, Long clientId, RequestInput input, List<User> selectedEmployees, List<SessionType> eligible) {
        String raw = companyId + "|" + clientId + "|" + Optional.ofNullable(input.serviceScope()).orElse(WaitlistServiceScope.EXACT_SERVICE)
                + "|" + input.serviceId() + "|" + input.serviceGroupId() + "|" + eligible.stream().map(SessionType::getId).sorted().toList()
                + "|" + input.targetType() + "|" + input.targetSessionId()
                + "|" + input.dateFrom() + "|" + input.dateTo() + "|" + input.employeePreferenceType() + "|" + input.specificEmployeeId()
                + "|" + selectedEmployees.stream().map(User::getId).sorted().toList() + "|" + normalizeWindows(input.windows());
        return sha256(raw);
    }

    private String normalizeWindows(List<WindowInput> values) {
        if (values == null) return "";
        return values.stream().map(v -> String.valueOf(v.date()) + ":" + v.dayOfWeek() + ":" + v.timeFrom() + ":" + v.timeTo() + ":" + v.allDay())
                .sorted().collect(Collectors.joining(","));
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    private PublicOfferView toPublicOfferView(WaitlistOffer offer) {
        WaitlistRequest request = offer.getRequest();
        Company company = request == null ? null : request.getCompany();
        Long companyId = company == null ? null : company.getId();
        String tenantCode = company == null ? null : trimToNull(company.getTenantCode());
        return new PublicOfferView(
                offer.getId(),
                request == null ? null : request.getId(),
                tenantCode,
                tenantName(company),
                tenantLogoUrl(companyId),
                offer.getServiceNameSnapshot() == null ? "" : offer.getServiceNameSnapshot(),
                offer.getSlotStart() == null ? null : offer.getSlotStart().toString(),
                offer.getSlotEnd() == null ? null : offer.getSlotEnd().toString(),
                offer.getSlotStart() == null ? null : offer.getSlotStart().toString(),
                offer.getEmployee() == null ? "" : employeeName(offer.getEmployee()),
                offer.getRoom() != null
                        ? trimToNull(offer.getRoom().getName())
                        : request != null && request.getLocation() != null ? trimToNull(request.getLocation().getName()) : null,
                offer.getStatus().name(),
                request == null || request.getStatus() == null ? null : request.getStatus().name(),
                tenantCode == null ? null : "/widget/" + tenantCode
        );
    }

    private String tenantName(Company company) {
        if (company == null || company.getId() == null) return "Calendra";
        String value = settings.findByCompanyIdAndKey(company.getId(), SettingKey.COMPANY_NAME)
                .map(AppSetting::getValue)
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .orElse(company.getName());
        return value == null || value.isBlank() ? "Calendra" : value;
    }

    private String tenantLogoUrl(Long companyId) {
        if (companyId == null) return null;
        return settings.findByCompanyIdAndKey(companyId, SettingKey.COMPANY_LOGO_URL)
                .map(AppSetting::getValue)
                .map(String::trim)
                .filter(value -> !value.isEmpty())
                .orElse(null);
    }


    private static Long companyId(Company company) {
        if (company == null || company.getId() == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Company not found.");
        return company.getId();
    }

    private static Long companyId(User me) {
        if (me == null || me.getCompany() == null || me.getCompany().getId() == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        return me.getCompany().getId();
    }

    private static <T> T required(T value, String field) {
        if (value == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, field + " is required.");
        return value;
    }

    private static String normalize(String value) {
        return value == null ? null : value.trim().toUpperCase(Locale.ROOT);
    }

    private static String trimToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String clientName(Client client) {
        if (client == null) return "—";
        return (String.valueOf(client.getFirstName()) + " " + String.valueOf(client.getLastName())).trim();
    }

    private static String employeeName(User user) {
        if (user == null) return null;
        return (String.valueOf(user.getFirstName()) + " " + String.valueOf(user.getLastName())).trim();
    }

    private static Long id(Object entity) {
        if (entity == null) return null;
        if (entity instanceof Client value) return value.getId();
        if (entity instanceof User value) return value.getId();
        if (entity instanceof Space value) return value.getId();
        if (entity instanceof SessionType value) return value.getId();
        if (entity instanceof SessionBooking value) return value.getId();
        return null;
    }

    private static List<Long> ids(List<WaitlistRequest> rows) {
        return rows.stream().map(WaitlistRequest::getId).toList();
    }
}
