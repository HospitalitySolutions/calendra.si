package com.example.app.waitlist;

import com.example.app.client.Client;
import com.example.app.client.ClientRepository;
import com.example.app.company.CompanyRepository;
import com.example.app.notification.TenantNotificationService;
import com.example.app.session.BookableSlotRepository;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingCreationService;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.SessionType;
import com.example.app.session.SessionTypeRepository;
import com.example.app.session.Space;
import com.example.app.session.SpaceRepository;
import com.example.app.settings.TenantReservationRulesService;
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
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
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
    private final WaitlistOfferRepository offers;
    private final WaitlistBookingHoldRepository holds;
    private final WaitlistEventRepository events;
    private final WaitlistSlotSkipRepository skips;
    private final ClientRepository clients;
    private final UserRepository users;
    private final SessionTypeRepository sessionTypes;
    private final SpaceRepository spaces;
    private final SessionBookingRepository bookings;
    private final CompanyRepository companies;
    private final BookableSlotRepository bookableSlots;
    private final SessionBookingCreationService bookingValidation;
    private final TenantReservationRulesService reservationRules;
    private final WaitlistSettingsService waitlistSettings;
    private final TenantNotificationService tenantNotifications;

    public WaitlistService(
            WaitlistRequestRepository requests,
            WaitlistRequestWindowRepository windows,
            WaitlistRequestEmployeeRepository requestEmployees,
            WaitlistOfferRepository offers,
            WaitlistBookingHoldRepository holds,
            WaitlistEventRepository events,
            WaitlistSlotSkipRepository skips,
            ClientRepository clients,
            UserRepository users,
            SessionTypeRepository sessionTypes,
            SpaceRepository spaces,
            SessionBookingRepository bookings,
            CompanyRepository companies,
            BookableSlotRepository bookableSlots,
            SessionBookingCreationService bookingValidation,
            TenantReservationRulesService reservationRules,
            WaitlistSettingsService waitlistSettings,
            TenantNotificationService tenantNotifications
    ) {
        this.requests = requests;
        this.windows = windows;
        this.requestEmployees = requestEmployees;
        this.offers = offers;
        this.holds = holds;
        this.events = events;
        this.skips = skips;
        this.clients = clients;
        this.users = users;
        this.sessionTypes = sessionTypes;
        this.spaces = spaces;
        this.bookings = bookings;
        this.companies = companies;
        this.bookableSlots = bookableSlots;
        this.bookingValidation = bookingValidation;
        this.reservationRules = reservationRules;
        this.waitlistSettings = waitlistSettings;
        this.tenantNotifications = tenantNotifications;
    }

    public record WindowInput(DayOfWeek dayOfWeek, LocalDate date, LocalTime timeFrom, LocalTime timeTo, Boolean allDay) {}
    public record RequestInput(
            Long clientId,
            Long serviceId,
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
    public record OfferInput(LocalDateTime slotStart, LocalDateTime slotEnd, Long employeeId, Long roomId, Long sessionId, Integer validityMinutes) {}
    public record WindowView(Long id, String dayOfWeek, LocalDate date, LocalTime timeFrom, LocalTime timeTo, boolean allDay) {}
    public record EmployeeView(Long id, String name) {}
    public record OfferView(Long id, String status, LocalDateTime slotStart, LocalDateTime slotEnd, EmployeeView employee, String roomName,
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

        return rows.stream()
                .filter(row -> viewMatches(row, normalizedView))
                .filter(row -> dateFrom == null || !row.getDateTo().isBefore(dateFrom))
                .filter(row -> dateTo == null || !row.getDateFrom().isAfter(dateTo))
                .filter(row -> serviceId == null || Objects.equals(row.getService().getId(), serviceId))
                .filter(row -> locationId == null || row.getLocation() != null && Objects.equals(row.getLocation().getId(), locationId))
                .filter(row -> targetType == null || targetType.isBlank() || row.getTargetType().name().equalsIgnoreCase(targetType))
                .filter(row -> source == null || source.isBlank() || row.getSource().name().equalsIgnoreCase(source))
                .filter(row -> status == null || status.isBlank() || row.getStatus().name().equalsIgnoreCase(status))
                .filter(row -> employeeMatchesFilter(row, employeeMap.getOrDefault(row.getId(), List.of()), employeeId))
                .filter(row -> searchMatches(row, normalizedSearch))
                .map(row -> toView(row, windowMap.getOrDefault(row.getId(), List.of()), employeeMap.getOrDefault(row.getId(), List.of()), false))
                .toList();
    }

    @Transactional(readOnly = true)
    public RequestView detail(User me, Long id) {
        WaitlistRequest row = requestDetailed(id, companyId(me));
        return toView(row, windows.findAllByRequestIdOrderByDateAscDayOfWeekAscTimeFromAsc(id), requestEmployees.findAllByRequestId(id), true);
    }

    @Transactional
    public RequestView create(User me, RequestInput input) {
        Long companyId = companyId(me);
        WaitlistSettingsService.WaitlistSettings cfg = waitlistSettings.get(companyId);
        if (!cfg.enabled() || !cfg.staffManualEntryEnabled()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Manual waitlist entry is disabled.");
        }
        validateInput(input, cfg);
        Client client = clients.findByIdAndCompanyId(input.clientId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Client not found."));
        SessionType service = sessionTypes.findByIdAndCompanyIdWithLinkedServices(input.serviceId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Service not found."));
        Space location = input.locationId() == null ? null : spaces.findByIdAndCompanyId(input.locationId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Location not found."));
        SessionBooking targetSession = input.targetSessionId() == null ? null : bookings.findByIdAndCompanyId(input.targetSessionId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Target session not found."));
        User specificEmployee = input.specificEmployeeId() == null ? null : users.findByIdAndCompanyIdAndActiveTrue(input.specificEmployeeId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Employee not found."));
        List<User> selectedEmployees = resolveEmployees(input.employeeIds(), companyId);
        String duplicateKey = duplicateKey(companyId, client.getId(), input, selectedEmployees);
        if (requests.existsByCompanyIdAndDuplicateKeyAndStatusIn(companyId, duplicateKey, DUPLICATE_BLOCKING_STATUSES)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "An equivalent active waitlist request already exists.");
        }
        WaitlistRequest row = new WaitlistRequest();
        row.setCompany(companies.getReferenceById(companyId));
        row.setClient(client);
        row.setService(service);
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
        addEvent(row, null, me, WaitlistEventType.JOINED, "Stranka je bila dodana na čakalno vrsto.");
        tenantNotifications.createWaitlistNotification(companyId, row.getId(), "WAITLIST_JOINED", "Nova stranka na čakalni vrsti",
                clientName(client) + " čaka na termin za " + service.getName() + ".", "/appointments?tab=waitlist&requestId=" + row.getId());
        return detail(me, row.getId());
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
        validateInput(input, cfg);
        row.setClient(clients.findByIdAndCompanyId(input.clientId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Client not found.")));
        row.setService(sessionTypes.findByIdAndCompanyIdWithLinkedServices(input.serviceId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Service not found.")));
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
        row.setDuplicateKey(duplicateKey(companyId, row.getClient().getId(), input, selected));
        requests.save(row);
        replaceWindows(row, input.windows());
        replaceEmployees(row, selected);
        addEvent(row, null, me, WaitlistEventType.EDITED, "Zahteva na čakalni vrsti je bila posodobljena.");
        return detail(me, id);
    }

    @Transactional
    public RequestView offer(User me, Long requestId, OfferInput input) {
        return offerInternal(companyId(me), requestId, input, me, false);
    }

    @Transactional
    public RequestView accept(User me, Long offerId) {
        Long companyId = companyId(me);
        WaitlistOffer offer = offers.findForUpdateByIdAndCompanyId(offerId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Offer not found."));
        expireIfNeeded(offer);
        if (offer.getStatus() != WaitlistOfferStatus.PENDING) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Offer is no longer available.");
        }
        offer.setStatus(WaitlistOfferStatus.ACCEPTED);
        offer.setAcceptedAt(Instant.now());
        offers.save(offer);
        WaitlistRequest request = offer.getRequest();
        request.setStatus(WaitlistRequestStatus.OFFER_ACCEPTED);
        requests.save(request);
        addEvent(request, offer, me, WaitlistEventType.OFFER_ACCEPTED, "Ponudba termina je bila sprejeta.");
        tenantNotifications.createWaitlistNotification(companyId, request.getId(), "WAITLIST_OFFER_ACCEPTED", "Ponudba termina sprejeta",
                clientName(request.getClient()) + " je sprejel/a ponujeni termin.", "/appointments?tab=waitlist&requestId=" + request.getId());
        return detail(me, request.getId());
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
                clientName(request.getClient()) + " je zavrnil/a ponujeni termin.", "/appointments?tab=waitlist&requestId=" + request.getId());
        offerNextCandidate(companyId, offer.getSlotStart(), offer.getSlotEnd(), id(offer.getEmployee()), id(offer.getRoom()), id(offer.getSession()), request.getService().getId(), request.getId());
        return detail(me, request.getId());
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
        offers.findFirstByRequestIdAndStatusOrderByOfferedAtDesc(requestId, WaitlistOfferStatus.ACCEPTED).ifPresent(offer -> releaseHold(offer, WaitlistHoldStatus.CONVERTED));
        addEvent(request, null, me, WaitlistEventType.CONVERTED_TO_BOOKING, "Čakalna zahteva je bila pretvorjena v rezervacijo #" + bookingId + ".");
        if (waitlistSettings.get(companyId).closeEquivalentAfterBooking()) {
            requests.findAllDetailedByCompanyId(companyId).stream()
                    .filter(other -> !Objects.equals(other.getId(), request.getId()))
                    .filter(other -> DUPLICATE_BLOCKING_STATUSES.contains(other.getStatus()))
                    .filter(other -> Objects.equals(other.getDuplicateKey(), request.getDuplicateKey()))
                    .forEach(other -> {
                        other.setStatus(WaitlistRequestStatus.CANCELLED);
                        requests.save(other);
                        addEvent(other, null, me, WaitlistEventType.CANCELLED_BY_STAFF, "Enakovredna zahteva je bila zaprta po rezervaciji.");
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
        offerNextCandidate(companyId, releasedStart, releasedEnd, id(booking.getConsultant()), id(booking.getSpace()), bookingId, serviceId, null);
    }

    @Scheduled(fixedDelayString = "${app.waitlist.expiry-check-ms:60000}")
    @Transactional
    public void expireOffers() {
        Instant now = Instant.now();
        for (WaitlistOffer offer : offers.findExpiredPending(now)) {
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
                    "Ponudba za " + clientName(request.getClient()) + " je potekla.", "/appointments?tab=waitlist&requestId=" + request.getId());
            offerNextCandidate(request.getCompany().getId(), offer.getSlotStart(), offer.getSlotEnd(), id(offer.getEmployee()), id(offer.getRoom()), id(offer.getSession()), request.getService().getId(), request.getId());
        }
        for (WaitlistBookingHold hold : holds.findExpiredActive(now)) {
            hold.setStatus(WaitlistHoldStatus.EXPIRED);
            holds.save(hold);
        }
    }

    public boolean hasActiveHold(Long companyId, Long employeeId, Long roomId, LocalDateTime start, LocalDateTime end, Long excludeOfferId) {
        return holds.existsActiveOverlap(companyId, employeeId, roomId, start, end, Instant.now(), excludeOfferId);
    }

    private RequestView offerInternal(Long companyId, Long requestId, OfferInput input, User actor, boolean automatic) {
        WaitlistRequest request = requests.findForUpdateByIdAndCompanyId(requestId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Waitlist request not found."));
        if (request.getStatus() != WaitlistRequestStatus.ACTIVE) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only an active request can receive an offer.");
        }
        LocalDateTime start = required(input.slotStart(), "slotStart");
        LocalDateTime end = required(input.slotEnd(), "slotEnd");
        if (!end.isAfter(start)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "slotEnd must be after slotStart.");
        User employee = input.employeeId() == null ? null : users.findByIdAndCompanyIdAndActiveTrue(input.employeeId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Employee not found."));
        Space room = input.roomId() == null ? null : spaces.findByIdAndCompanyId(input.roomId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Room not found."));
        SessionBooking session = input.sessionId() == null ? null : bookings.findByIdAndCompanyId(input.sessionId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Session not found."));
        List<WaitlistRequestWindow> requestWindows = windows.findAllByRequestIdOrderByDateAscDayOfWeekAscTimeFromAsc(requestId);
        List<WaitlistRequestEmployee> selected = requestEmployees.findAllByRequestId(requestId);
        if (!requestMatchesSlot(request, requestWindows, selected, start, end, employee, room, session)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "The proposed slot does not match the waitlist request.");
        }
        validateSlotAvailable(request, start, end, employee, room, session, null);
        int validity = Math.max(5, Math.min(Optional.ofNullable(input.validityMinutes()).orElse(waitlistSettings.get(companyId).offerValidityMinutes()), 1440));
        Instant now = Instant.now();
        WaitlistOffer offer = new WaitlistOffer();
        offer.setCompany(request.getCompany());
        offer.setRequest(request);
        offer.setSlotStart(start);
        offer.setSlotEnd(end);
        offer.setEmployee(employee);
        offer.setRoom(room);
        offer.setSession(session);
        offer.setStatus(WaitlistOfferStatus.PENDING);
        offer.setOfferedAt(now);
        offer.setExpiresAt(now.plus(Duration.ofMinutes(validity)));
        offer.setSecureTokenHash(sha256(UUID.randomUUID().toString()));
        offer = offers.save(offer);

        WaitlistBookingHold hold = new WaitlistBookingHold();
        hold.setCompany(request.getCompany());
        hold.setOffer(offer);
        hold.setSlotStart(start);
        hold.setSlotEnd(end);
        hold.setEmployee(employee);
        hold.setRoom(room);
        hold.setSession(session);
        hold.setStatus(WaitlistHoldStatus.ACTIVE);
        hold.setExpiresAt(offer.getExpiresAt());
        holds.save(hold);

        request.setStatus(WaitlistRequestStatus.OFFERED);
        requests.save(request);
        addEvent(request, offer, actor, WaitlistEventType.OFFER_SENT,
                (automatic ? "Samodejna" : "Ročna") + " ponudba termina je bila poslana. Velja do " + offer.getExpiresAt() + ".");
        tenantNotifications.createWaitlistNotification(companyId, request.getId(), "WAITLIST_OFFER_SENT", "Ponudba prostega termina",
                "Ponudba za " + clientName(request.getClient()) + " velja do " + offer.getExpiresAt() + ".", "/appointments?tab=waitlist&requestId=" + request.getId());
        return toView(request, requestWindows, selected, true);
    }

    private void offerNextCandidate(Long companyId, LocalDateTime start, LocalDateTime end, Long employeeId, Long roomId, Long sessionId, Long serviceId, Long excludedRequestId) {
        if (!waitlistSettings.get(companyId).autoOfferEnabled()) return;
        User employee = employeeId == null ? null : users.findByIdAndCompanyIdAndActiveTrue(employeeId, companyId).orElse(null);
        Space room = roomId == null ? null : spaces.findByIdAndCompanyId(roomId, companyId).orElse(null);
        SessionBooking session = sessionId == null ? null : bookings.findByIdAndCompanyId(sessionId, companyId).orElse(null);
        for (WaitlistRequest candidate : requests.findActiveCandidates(companyId, start.toLocalDate(), Instant.now())) {
            if (Objects.equals(candidate.getId(), excludedRequestId)) continue;
            if (!Objects.equals(candidate.getService().getId(), serviceId)) continue;
            if (skips.existsByRequestIdAndSlotStartAndEmployeeId(candidate.getId(), start, employeeId)) continue;
            List<WaitlistRequestWindow> candidateWindows = windows.findAllByRequestIdOrderByDateAscDayOfWeekAscTimeFromAsc(candidate.getId());
            List<WaitlistRequestEmployee> candidateEmployees = requestEmployees.findAllByRequestId(candidate.getId());
            if (!requestMatchesSlot(candidate, candidateWindows, candidateEmployees, start, end, employee, room, session)) continue;
            try {
                validateSlotAvailable(candidate, start, end, employee, room, session, null);
                offerInternal(companyId, candidate.getId(), new OfferInput(start, end, employeeId, roomId, sessionId, null), null, true);
                return;
            } catch (ResponseStatusException ex) {
                addEvent(candidate, null, null, WaitlistEventType.MATCH_REJECTED, ex.getReason());
            }
        }
        tenantNotifications.createWaitlistNotification(companyId, null, "WAITLIST_ATTENTION", "Prost termin brez ustreznega kandidata",
                "Za sproščeni termin " + start + " ni bilo mogoče samodejno poslati ponudbe.", "/appointments?tab=waitlist");
    }

    private void validateSlotAvailable(WaitlistRequest request, LocalDateTime start, LocalDateTime end, User employee, Space room, SessionBooking session, Long excludeOfferId) {
        Long companyId = request.getCompany().getId();
        int breakMinutes = request.getService().getBreakMinutes() == null ? 0 : Math.max(0, request.getService().getBreakMinutes());
        LocalDateTime busyEnd = end.plusMinutes(breakMinutes);
        if (hasActiveHold(companyId, id(employee), id(room), start, busyEnd, excludeOfferId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "The slot is temporarily held for another waitlist offer.");
        }
        var rules = reservationRules.resolve(companyId);
        LocalDateTime now = LocalDateTime.now(ZONE);
        if (start.isBefore(now.plusMinutes(rules.minBookingNoticeMinutes()))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "The slot violates the minimum booking notice.");
        }
        if (start.toLocalDate().isAfter(now.toLocalDate().plusDays(rules.maxAdvanceBookingDays()))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "The slot is outside the maximum booking horizon.");
        }
        if (employee != null && !isInsideWorkingSlot(companyId, employee.getId(), start, busyEnd)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "The employee is not working during the proposed slot.");
        }
        List<Long> clientIds = request.getClient() == null ? List.of() : List.of(request.getClient().getId());
        List<Long> excluded = session == null
                ? List.of(-1L)
                : session.getBookingGroupKey() == null
                ? List.of(session.getId())
                : bookings.findAllByBookingGroupKeyOrderByIdAsc(session.getBookingGroupKey()).stream()
                .map(SessionBooking::getId)
                .toList();
        bookingValidation.validateBookingWindow(companyId, clientIds, id(employee), id(room), start, end, request.getService().getId(),
                excluded.isEmpty() ? List.of(-1L) : excluded, true, false, true, false, false);
        if (session != null) validateGroupCapacity(request, session);
    }

    private boolean isInsideWorkingSlot(Long companyId, Long employeeId, LocalDateTime start, LocalDateTime busyEnd) {
        var slots = bookableSlots.findAllForWidgetByCompanyIdAndDate(companyId, start.getDayOfWeek(), start.toLocalDate(), employeeId);
        if (slots.isEmpty()) return false;
        return slots.stream().anyMatch(slot -> !start.toLocalTime().isBefore(slot.getStartTime()) && !busyEnd.toLocalTime().isAfter(slot.getEndTime()));
    }

    private void validateGroupCapacity(WaitlistRequest request, SessionBooking session) {
        Integer max = request.getService().getMaxParticipantsPerSession();
        if (max == null || max <= 0) return;
        Collection<SessionBooking> rows = session.getBookingGroupKey() == null
                ? List.of(session)
                : bookings.findByBookingGroupKeyAndCompanyIdOrderByIdAsc(session.getBookingGroupKey(), request.getCompany().getId());
        long occupied = rows.stream().filter(row -> !"CANCELLED".equalsIgnoreCase(row.getBookingStatus()) && !"NO_SHOW".equalsIgnoreCase(row.getBookingStatus())).count();
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
            return (from == null || !start.toLocalTime().isBefore(from)) && (to == null || !end.toLocalTime().isAfter(to));
        });
    }

    private void validateInput(RequestInput input, WaitlistSettingsService.WaitlistSettings cfg) {
        if (input == null || input.clientId() == null || input.serviceId() == null || input.targetType() == null
                || input.dateFrom() == null || input.dateTo() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Client, service, request type and date range are required.");
        }
        if (input.dateTo().isBefore(input.dateFrom())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "dateTo must be on or after dateFrom.");
        if (Duration.between(input.dateFrom().atStartOfDay(), input.dateTo().plusDays(1).atStartOfDay()).toDays() > cfg.maxRequestedDateRangeDays()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The requested date range is too long.");
        }
        if (input.targetType() == WaitlistTargetType.EXACT_TIME && !cfg.exactTimeEnabled()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Exact-time waitlist requests are disabled.");
        }
        if (input.targetType() == WaitlistTargetType.FLEXIBLE_WINDOW && !cfg.flexibleWindowsEnabled()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Flexible waitlist requests are disabled.");
        }
        if (Optional.ofNullable(input.requestedParticipants()).orElse(1) < 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "requestedParticipants must be positive.");
        }
    }

    private RequestView toView(WaitlistRequest row, List<WaitlistRequestWindow> requestWindows,
                               List<WaitlistRequestEmployee> selectedEmployees, boolean includeHistory) {
        WaitlistOffer current = offers.findFirstByRequestIdAndStatusOrderByOfferedAtDesc(row.getId(), WaitlistOfferStatus.PENDING).orElse(null);
        return new RequestView(
                row.getId(), clientName(row.getClient()), row.getClient() == null ? null : row.getClient().getEmail(),
                row.getClient() == null ? null : row.getClient().getPhone(), id(row.getClient()), id(row.getService()),
                row.getService() == null ? null : row.getService().getName(), row.getService() == null ? null : row.getService().getDurationMinutes(),
                row.getService() == null ? null : row.getService().getBreakMinutes(), id(row.getLocation()), row.getLocation() == null ? null : row.getLocation().getName(),
                row.getTargetType().name(), id(row.getTargetSession()), row.getDateFrom(), row.getDateTo(), row.getEmployeePreferenceType().name(),
                employeeView(row.getSpecificEmployee()), selectedEmployees.stream().map(WaitlistRequestEmployee::getEmployee).map(this::employeeView).toList(),
                row.getRequestedParticipants(), row.getStatus().name(), row.getSource().name(), row.getNotes(), row.getJoinedAt(), row.getExpiresAt(),
                id(row.getBookedBooking()), requestWindows.stream().map(this::windowView).toList(), offerView(current),
                includeHistory ? events.findAllByRequestIdOrderByOccurredAtDescIdDesc(row.getId()).stream().map(this::eventView).toList() : List.of());
    }

    private WindowView windowView(WaitlistRequestWindow row) {
        return new WindowView(row.getId(), row.getDayOfWeek() == null ? null : row.getDayOfWeek().name(), row.getDate(), row.getTimeFrom(), row.getTimeTo(), row.isAllDay());
    }

    private OfferView offerView(WaitlistOffer row) {
        if (row == null) return null;
        long remaining = Math.max(0, Duration.between(Instant.now(), row.getExpiresAt()).getSeconds());
        return new OfferView(row.getId(), row.getStatus().name(), row.getSlotStart(), row.getSlotEnd(), employeeView(row.getEmployee()),
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
            }
        });
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

    private boolean searchMatches(WaitlistRequest row, String search) {
        if (search == null || search.isBlank()) return true;
        Client client = row.getClient();
        String haystack = String.join(" ", clientName(client), client == null ? "" : String.valueOf(client.getEmail()),
                client == null ? "" : String.valueOf(client.getPhone()), row.getService() == null ? "" : row.getService().getName()).toLowerCase(Locale.ROOT);
        return haystack.contains(search.toLowerCase(Locale.ROOT));
    }

    private String duplicateKey(Long companyId, Long clientId, RequestInput input, List<User> selectedEmployees) {
        String raw = companyId + "|" + clientId + "|" + input.serviceId() + "|" + input.targetType() + "|" + input.targetSessionId()
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
