package com.example.app.widget.manage;

import com.example.app.activitylog.ActivityAction;
import com.example.app.activitylog.ActivityActorType;
import com.example.app.activitylog.ActivityLogService;
import com.example.app.activitylog.ActivityModule;
import com.example.app.client.Client;
import com.example.app.common.TimeService;
import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.location.Location;
import com.example.app.location.LocationPublicPresentationService;
import com.example.app.billing.OpenBillSyncService;
import com.example.app.reminder.ReminderService;
import com.example.app.session.AvailabilityWindowGrid;
import com.example.app.session.BookableSlot;
import com.example.app.session.BookableSlotRepository;
import com.example.app.session.BookingChangePublisher;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingCreationService;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.SessionBookingStatus;
import com.example.app.session.SessionServicePlanService;
import com.example.app.session.SessionType;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.settings.TenantReservationRulesService;
import com.example.app.user.User;
import com.example.app.user.ConsultantLocationService;
import com.example.app.widget.WebsiteWidgetSettingsService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PublicBookingManageService {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ISO_LOCAL_DATE;
    private static final DateTimeFormatter DATE_TIME_FORMAT = DateTimeFormatter.ISO_LOCAL_DATE_TIME;
    private static final DateTimeFormatter SLOT_LABEL_FORMAT = DateTimeFormatter.ofPattern("HH:mm");
    private static final DateTimeFormatter HUMAN_FORMAT = DateTimeFormatter.ofPattern("EEEE, d MMMM yyyy 'at' HH:mm", Locale.ENGLISH);

    private final PublicBookingManageTokenService tokenService;
    private final CompanyRepository companies;
    private final AppSettingRepository settings;
    private final SessionBookingRepository bookings;
    private final BookableSlotRepository bookableSlots;
    private final SessionBookingCreationService bookingCreationService;
    private final SessionServicePlanService servicePlans;
    private final ReminderService reminderService;
    private final BookingChangePublisher bookingChangePublisher;
    private final OpenBillSyncService openBillSyncService;
    private final WebsiteWidgetSettingsService websiteWidgetSettingsService;
    private final TenantReservationRulesService reservationRulesService;
    private final LocationPublicPresentationService locationPresentationService;
    private final TimeService timeService;
    private final ZoneId zoneId;

    @Autowired(required = false)
    private ActivityLogService activityLogs;

    @Autowired(required = false)
    private ConsultantLocationService consultantLocations;

    public PublicBookingManageService(
            PublicBookingManageTokenService tokenService,
            CompanyRepository companies,
            AppSettingRepository settings,
            SessionBookingRepository bookings,
            BookableSlotRepository bookableSlots,
            SessionBookingCreationService bookingCreationService,
            SessionServicePlanService servicePlans,
            ReminderService reminderService,
            BookingChangePublisher bookingChangePublisher,
            OpenBillSyncService openBillSyncService,
            WebsiteWidgetSettingsService websiteWidgetSettingsService,
            TenantReservationRulesService reservationRulesService,
            LocationPublicPresentationService locationPresentationService,
            TimeService timeService,
            @Value("${app.reminders.timezone:Europe/Ljubljana}") String bookingTimezoneId
    ) {
        this.tokenService = tokenService;
        this.companies = companies;
        this.settings = settings;
        this.bookings = bookings;
        this.bookableSlots = bookableSlots;
        this.bookingCreationService = bookingCreationService;
        this.servicePlans = servicePlans;
        this.reminderService = reminderService;
        this.bookingChangePublisher = bookingChangePublisher;
        this.openBillSyncService = openBillSyncService;
        this.websiteWidgetSettingsService = websiteWidgetSettingsService;
        this.reservationRulesService = reservationRulesService;
        this.locationPresentationService = locationPresentationService;
        this.timeService = timeService;
        this.zoneId = ZoneId.of(bookingTimezoneId == null || bookingTimezoneId.isBlank() ? "Europe/Ljubljana" : bookingTimezoneId.trim());
    }

    @Transactional
    public PublicBookingManageController.BookingManageResponse get(String rawToken) {
        PublicBookingManageToken token = tokenService.resolve(rawToken);
        return toManageResponse(token.getBooking(), token.getCompany(), rulesFor(token.getBooking()));
    }

    @Transactional
    public PublicBookingManageController.AvailabilityResponse availability(String rawToken, String dateText) {
        PublicBookingManageToken token = tokenService.resolve(rawToken);
        SessionBooking booking = token.getBooking();
        Company company = token.getCompany();
        TenantReservationRulesService.TenantReservationRules rules = rulesFor(booking);
        if (!canModify(booking, rules)) {
            return new PublicBookingManageController.AvailabilityResponse(dateText, List.of());
        }
        LocalDate date = parseDate(dateText);
        List<PublicBookingManageController.AvailabilitySlotResponse> slots = isGroupSession(booking)
                ? buildGroupSessionAvailabilitySlots(company, booking, date, rules)
                : buildAvailabilitySlots(company, booking, date, rules);
        return new PublicBookingManageController.AvailabilityResponse(DATE_FORMAT.format(date), slots);
    }

    @Transactional
    public PublicBookingManageController.RescheduleResponse reschedule(
            String rawToken,
            PublicBookingManageController.RescheduleRequest request
    ) {
        PublicBookingManageToken token = tokenService.resolve(rawToken);
        SessionBooking booking = bookings.findByIdAndCompanyId(token.getBooking().getId(), token.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Booking not found."));
        Company company = token.getCompany();
        TenantReservationRulesService.TenantReservationRules rules = rulesFor(booking);
        if (!canModify(booking, rules)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, modifyBlockedReason(booking, rules));
        }
        if (isGroupSession(booking)) {
            return moveGroupParticipant(token, booking, request, company, rules);
        }
        SessionType type = booking.getType();
        if (type == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Booking has no service.");
        }
        LocalDateTime newStart = parseStartTime(request.startTime());
        int durationMinutes = durationMinutes(booking);
        LocalDateTime newEnd = newStart.plusMinutes(durationMinutes);
        if (!slotAllowedByReservationRules(booking, newStart, rules)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected time is outside the allowed reservation window.");
        }

        List<SessionBooking> grouped = bookings.findByBookingGroupKeyAndCompanyIdOrderByIdAsc(groupKey(booking), company.getId());
        if (grouped == null || grouped.isEmpty()) {
            grouped = List.of(booking);
        }
        List<Long> excludeIds = grouped.stream().map(SessionBooking::getId).filter(Objects::nonNull).toList();
        Long consultantId = booking.getConsultant() == null ? null : booking.getConsultant().getId();
        Long locationId = booking.getLocation() == null ? null : booking.getLocation().getId();
        if (consultantId != null && consultantLocations != null
                && !consultantLocations.isAvailableAt(booking.getConsultant(), locationId)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "This employee is no longer available at the booking location."
            );
        }
        bookingCreationService.validateExistingBookingWindow(
                booking,
                clientIdsOf(List.of(booking)),
                consultantId,
                newStart,
                newEnd,
                excludeIds,
                bookingCreationService.isSpacesEnabled(company.getId()),
                bookingCreationService.isMultipleSessionsPerSpaceEnabled(company.getId()),
                bookingCreationService.isMultipleClientsPerSessionEnabled(company.getId()),
                isOnline(booking),
                false
        );

        LocalDateTime oldStart = booking.getStartTime();
        LocalDateTime oldEnd = booking.getEndTime();
        bookingCreationService.applyExistingBookingTime(booking, newStart, newEnd);
        booking = bookings.save(booking);
        reminderService.sendSessionRescheduled(booking, oldStart, oldEnd);
        bookingChangePublisher.publish(
                company.getId(),
                booking.getId(),
                booking.getStartTime(),
                booking.getEndTime(),
                BookingChangePublisher.BOOKING_RESCHEDULED,
                "PUBLIC_LINK",
                oldStart
        );
        openBillSyncService.syncSessionGroup(company.getId(), groupKey(booking));
        openBillSyncService.enqueueBookingsSync(company.getId(), List.of(booking));
        recordPublicBookingActivity(booking, ActivityAction.SESSION_RESCHEDULED, oldStart, oldEnd);
        return new PublicBookingManageController.RescheduleResponse(
                type.getName(),
                booking.getStartTime().format(DATE_TIME_FORMAT),
                booking.getEndTime().format(DATE_TIME_FORMAT),
                booking.getStartTime().format(HUMAN_FORMAT)
        );
    }

    @Transactional
    public PublicBookingManageController.CancelResponse cancel(
            String rawToken,
            PublicBookingManageController.CancelRequest request
    ) {
        PublicBookingManageToken token = tokenService.resolve(rawToken);
        SessionBooking booking = bookings.findByIdAndCompanyId(token.getBooking().getId(), token.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Booking not found."));
        Company company = token.getCompany();
        TenantReservationRulesService.TenantReservationRules rules = rulesFor(booking);
        if (!canCancel(booking, rules)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, cancelBlockedReason(booking, rules));
        }
        boolean groupSession = isGroupSession(booking);
        if (groupSession) {
            companies.findByIdForUpdate(company.getId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Company not found."));
        }
        if (request != null && request.reason() != null && !request.reason().isBlank()) {
            String existing = booking.getNotes() == null ? "" : booking.getNotes().trim();
            String note = "Public cancellation reason: " + request.reason().trim();
            booking.setNotes(existing.isBlank() ? note : existing + "\n" + note);
        }

        if (groupSession) {
            // Staff removal from Group details uses this exact same cancellation core.
            // This prevents the last-participant case from having a separate persistence path.
            booking = bookingCreationService.cancelGroupParticipantBooking(booking, "PUBLIC_LINK").booking();
        } else {
            booking.setBookingStatus(SessionBookingStatus.CANCELLED);
            booking = bookings.save(booking);
            reminderService.sendSessionCancelled(booking);
            bookingCreationService.restoreGuestCreditsForBookings(List.of(booking));
            openBillSyncService.removeSessionRowsFromOpenBills(company.getId(), List.of(booking.getId()));
            openBillSyncService.syncSessionGroup(company.getId(), groupKey(booking));
            openBillSyncService.enqueueBookingsSync(company.getId(), List.of(booking));
            bookingChangePublisher.publish(
                    company.getId(),
                    booking.getId(),
                    booking.getStartTime(),
                    booking.getEndTime(),
                    BookingChangePublisher.BOOKING_CANCELLED,
                    "PUBLIC_LINK",
                    null
            );
        }
        recordPublicBookingActivity(booking, ActivityAction.SESSION_CANCELLED, booking.getStartTime(), booking.getEndTime());
        return new PublicBookingManageController.CancelResponse("CANCELLED", "Booking cancelled.");
    }

    private PublicBookingManageController.BookingManageResponse toManageResponse(
            SessionBooking booking,
            Company company,
            TenantReservationRulesService.TenantReservationRules rules
    ) {
        Location location = requireBookingLocation(booking);
        LocationPublicPresentationService.PublicPresentation presentation = locationPresentationService.resolve(location);
        ZoneId bookingZone = zoneForBooking(booking);
        return new PublicBookingManageController.BookingManageResponse(
                company.getTenantCode(),
                location.getId(),
                presentation == null ? location.getName() : presentation.publicName(),
                presentation == null ? null : presentation.publicLogoUrl(),
                presentation == null ? null : presentation.publicAddress(),
                presentation == null ? null : presentation.publicPhone(),
                presentation == null ? null : presentation.publicEmail(),
                booking.getType() == null ? "" : booking.getType().getName(),
                booking.getStartTime() == null ? null : booking.getStartTime().format(DATE_TIME_FORMAT),
                booking.getEndTime() == null ? null : booking.getEndTime().format(DATE_TIME_FORMAT),
                booking.getStartTime() == null ? "" : booking.getStartTime().format(HUMAN_FORMAT),
                booking.getConsultant() == null ? "" : consultantName(booking.getConsultant()),
                SessionBookingStatus.normalizeStored(booking.getBookingStatus()),
                isGroupSession(booking),
                canModify(booking, rules),
                canCancel(booking, rules),
                modifyBlockedReason(booking, rules),
                cancelBlockedReason(booking, rules),
                bookingZone.getId(),
                "If payment has already been made, the business will handle any refund according to its own terms."
        );
    }

    private List<PublicBookingManageController.AvailabilitySlotResponse> buildAvailabilitySlots(
            Company company,
            SessionBooking booking,
            LocalDate date,
            TenantReservationRulesService.TenantReservationRules rules
    ) {
        if (date == null || booking.getType() == null) return List.of();
        LocalDate today = timeService.localDate(zoneForBooking(booking));
        if (date.isBefore(today) || date.isAfter(today.plusDays(rules.maxAdvanceBookingDays()))) return List.of();

        int duration = durationMinutes(booking);
        Long consultantId = booking.getConsultant() == null ? null : booking.getConsultant().getId();
        Long locationId = booking.getLocation() == null ? null : booking.getLocation().getId();
        if (consultantId != null && consultantLocations != null
                && !consultantLocations.isAvailableAt(booking.getConsultant(), locationId)) {
            return List.of();
        }
        List<LocalTime> starts = new ArrayList<>();
        if (consultantId != null) {
            starts.addAll(bookableStarts(company, booking, date, consultantId, duration));
            if (starts.isEmpty()) {
                resolveConsultantWorkingWindow(booking.getConsultant(), date, locationId)
                        .ifPresent(window -> addWindowStarts(starts, date, window.start(), window.end(), duration));
            }
        } else {
            WidgetConfig cfg = loadConfig(company.getId());
            addWindowStarts(starts, date, cfg.workingHoursStart(), cfg.workingHoursEnd(), duration);
        }

        Map<LocalDateTime, PublicBookingManageController.AvailabilitySlotResponse> out = new LinkedHashMap<>();
        List<Long> excludeIds = List.of(booking.getId());
        for (LocalTime t : starts.stream().distinct().sorted().toList()) {
            LocalDateTime start = date.atTime(t);
            LocalDateTime end = start.plusMinutes(duration);
            if (Objects.equals(start, booking.getStartTime())) continue;
            if (!slotAllowedByReservationRules(booking, start, rules)) continue;
            try {
                bookingCreationService.validateExistingBookingWindow(
                        booking,
                        clientIdsOf(List.of(booking)),
                        consultantId,
                        start,
                        end,
                        excludeIds,
                        bookingCreationService.isSpacesEnabled(company.getId()),
                        bookingCreationService.isMultipleSessionsPerSpaceEnabled(company.getId()),
                        bookingCreationService.isMultipleClientsPerSessionEnabled(company.getId()),
                        isOnline(booking),
                        false
                );
                out.putIfAbsent(start, new PublicBookingManageController.AvailabilitySlotResponse(
                        start.format(DATE_TIME_FORMAT),
                        t.format(SLOT_LABEL_FORMAT),
                        start.format(DATE_TIME_FORMAT),
                        end.format(DATE_TIME_FORMAT)
                ));
            } catch (ResponseStatusException ignored) {
                // Not available.
            }
        }
        return out.values().stream()
                .sorted(Comparator.comparing(PublicBookingManageController.AvailabilitySlotResponse::startTime))
                .toList();
    }

    private List<PublicBookingManageController.AvailabilitySlotResponse> buildGroupSessionAvailabilitySlots(
            Company company,
            SessionBooking booking,
            LocalDate date,
            TenantReservationRulesService.TenantReservationRules rules
    ) {
        if (date == null || booking.getType() == null || booking.getClient() == null) return List.of();
        LocalDate today = timeService.localDate(zoneForBooking(booking));
        if (date.isBefore(today) || date.isAfter(today.plusDays(rules.maxAdvanceBookingDays()))) return List.of();

        LocalDateTime from = date.atStartOfDay();
        LocalDateTime to = date.plusDays(1).atStartOfDay();
        List<SessionBooking> candidates = bookings.findPublicGroupSessionCandidates(
                company.getId(),
                booking.getType().getId(),
                from,
                to
        );
        if (candidates == null || candidates.isEmpty()) return List.of();

        Map<String, List<SessionBooking>> grouped = candidates.stream()
                .collect(Collectors.groupingBy(
                        this::groupKey,
                        LinkedHashMap::new,
                        Collectors.toList()
                ));
        String currentGroupKey = groupKey(booking);
        List<PublicBookingManageController.AvailabilitySlotResponse> out = new ArrayList<>();
        for (Map.Entry<String, List<SessionBooking>> entry : grouped.entrySet()) {
            if (Objects.equals(entry.getKey(), currentGroupKey)) continue;
            List<SessionBooking> activeRows = activeGroupRows(entry.getValue());
            if (activeRows.isEmpty()) continue;
            SessionBooking representative = activeRows.stream()
                    .min(Comparator.comparing(SessionBooking::getId))
                    .orElse(null);
            if (representative == null || representative.getClientGroup() == null) continue;
            if (!sameLocation(booking, representative)) continue;
            if (representative.getType() == null
                    || !Objects.equals(representative.getType().getId(), booking.getType().getId())) continue;
            if (representative.getStartTime() == null || !representative.getStartTime().isAfter(timeService.localDateTime(zoneForBooking(booking)))) continue;
            if (!slotAllowedByReservationRules(booking, representative.getStartTime(), rules)) continue;
            if (groupContainsClient(activeRows, booking.getClient().getId())) continue;

            int bookedParticipants = activeParticipantCount(activeRows);
            Integer maxParticipants = representative.getMaxParticipantsOverride() != null && representative.getMaxParticipantsOverride() > 0
                    ? representative.getMaxParticipantsOverride()
                    : representative.getType().getMaxParticipantsPerSession();
            if (maxParticipants != null && bookedParticipants >= maxParticipants) continue;

            List<Long> excludeIds = new ArrayList<>(activeRows.stream()
                    .map(SessionBooking::getId)
                    .filter(Objects::nonNull)
                    .toList());
            if (booking.getId() != null) excludeIds.add(booking.getId());
            try {
                bookingCreationService.validateExistingBookingWindow(
                        representative,
                        clientIdsOf(List.of(booking)),
                        representative.getConsultant() == null ? null : representative.getConsultant().getId(),
                        representative.getStartTime(),
                        representative.getEndTime(),
                        excludeIds,
                        bookingCreationService.isSpacesEnabled(company.getId()),
                        bookingCreationService.isMultipleSessionsPerSpaceEnabled(company.getId()),
                        true,
                        isOnline(representative),
                        false
                );
            } catch (ResponseStatusException ignored) {
                continue;
            }

            String label = groupSessionSlotLabel(representative);
            out.add(new PublicBookingManageController.AvailabilitySlotResponse(
                    String.valueOf(representative.getId()),
                    label,
                    representative.getStartTime().format(DATE_TIME_FORMAT),
                    representative.getEndTime().format(DATE_TIME_FORMAT)
            ));
        }
        return out.stream()
                .sorted(Comparator.comparing(PublicBookingManageController.AvailabilitySlotResponse::startTime))
                .toList();
    }

    private PublicBookingManageController.RescheduleResponse moveGroupParticipant(
            PublicBookingManageToken token,
            SessionBooking booking,
            PublicBookingManageController.RescheduleRequest request,
            Company company,
            TenantReservationRulesService.TenantReservationRules rules
    ) {
        if (booking.getClient() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This group-session link is not assigned to a guest.");
        }
        companies.findByIdForUpdate(company.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Company not found."));
        Long targetId = request == null ? null : request.targetGroupSessionId();
        if (targetId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Select another group session.");
        }
        SessionBooking requestedTarget = bookings.findByIdAndCompanyId(targetId, company.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected group session was not found."));
        if (!isGroupSession(requestedTarget)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected booking is not a group session.");
        }
        if (!sameLocation(booking, requestedTarget)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Select a group session at the original booking location.");
        }
        if (Objects.equals(groupKey(booking), groupKey(requestedTarget))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Select a different group session.");
        }

        List<SessionBooking> targetRows = bookings.findByBookingGroupKeyAndCompanyIdOrderByIdAsc(
                groupKey(requestedTarget), company.getId());
        List<SessionBooking> activeTargetRows = activeGroupRows(targetRows);
        SessionBooking target = activeTargetRows.stream()
                .min(Comparator.comparing(SessionBooking::getId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected group session is no longer available."));
        if (!sameLocation(booking, target)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Select a group session at the original booking location.");
        }
        if (target.getType() == null || booking.getType() == null
                || !Objects.equals(target.getType().getId(), booking.getType().getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected group session uses a different service.");
        }
        if (!target.getStartTime().isAfter(timeService.localDateTime(zoneForBooking(booking)))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected group session is in the past.");
        }
        if (!slotAllowedByReservationRules(booking, target.getStartTime(), rules)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected group session is outside the allowed reservation window.");
        }
        Long clientId = booking.getClient().getId();
        if (groupContainsClient(activeTargetRows, clientId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "You are already booked into the selected group session.");
        }
        int bookedParticipants = activeParticipantCount(activeTargetRows);
        Integer maxParticipants = target.getMaxParticipantsOverride() != null && target.getMaxParticipantsOverride() > 0
                ? target.getMaxParticipantsOverride()
                : target.getType().getMaxParticipantsPerSession();
        if (maxParticipants != null && bookedParticipants >= maxParticipants) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected group session has no available spaces.");
        }

        List<Long> excludeIds = new ArrayList<>(activeTargetRows.stream()
                .map(SessionBooking::getId)
                .filter(Objects::nonNull)
                .toList());
        excludeIds.add(booking.getId());
        bookingCreationService.validateExistingBookingWindow(
                target,
                List.of(clientId),
                target.getConsultant() == null ? null : target.getConsultant().getId(),
                target.getStartTime(),
                target.getEndTime(),
                excludeIds,
                bookingCreationService.isSpacesEnabled(company.getId()),
                bookingCreationService.isMultipleSessionsPerSpaceEnabled(company.getId()),
                true,
                isOnline(target),
                false
        );

        String oldGroupKey = groupKey(booking);
        LocalDateTime oldStart = booking.getStartTime();
        LocalDateTime oldEnd = booking.getEndTime();
        Optional<SessionBooking> placeholder = ensureGroupSessionRemainsWhenParticipantLeaves(booking);

        Location originalLocation = requireBookingLocation(booking);
        copyGroupSessionFields(target, booking);
        booking.setLocation(originalLocation);
        booking.setBookingStatus(SessionBookingStatus.RESERVED);
        booking = bookings.save(booking);
        token.setExpiresAt(booking.getEndTime().atZone(zoneForBooking(booking)).toInstant());

        reminderService.sendSessionRescheduled(booking, oldStart, oldEnd);
        bookingChangePublisher.publish(
                company.getId(),
                booking.getId(),
                booking.getStartTime(),
                booking.getEndTime(),
                BookingChangePublisher.BOOKING_RESCHEDULED,
                "PUBLIC_LINK",
                oldStart
        );
        openBillSyncService.syncSessionGroup(company.getId(), oldGroupKey);
        openBillSyncService.syncSessionGroup(company.getId(), groupKey(booking));
        List<SessionBooking> rowsToSync = new ArrayList<>();
        rowsToSync.add(booking);
        placeholder.ifPresent(rowsToSync::add);
        openBillSyncService.enqueueBookingsSync(company.getId(), rowsToSync);
        recordPublicBookingActivity(booking, ActivityAction.SESSION_RESCHEDULED, oldStart, oldEnd);

        return new PublicBookingManageController.RescheduleResponse(
                booking.getType().getName(),
                booking.getStartTime().format(DATE_TIME_FORMAT),
                booking.getEndTime().format(DATE_TIME_FORMAT),
                booking.getStartTime().format(HUMAN_FORMAT)
        );
    }

    private void recordPublicBookingActivity(
            SessionBooking booking,
            ActivityAction action,
            LocalDateTime beforeStart,
            LocalDateTime beforeEnd
    ) {
        if (activityLogs == null || booking == null || booking.getCompany() == null) return;
        Client client = booking.getClient();
        String clientLabel = clientLabel(client);
        String typeLabel = booking.getType() == null ? "Session" : booking.getType().getName();
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("beforeStartTime", beforeStart);
        details.put("beforeEndTime", beforeEnd);
        details.put("startTime", booking.getStartTime());
        details.put("endTime", booking.getEndTime());
        details.put("bookingStatus", SessionBookingStatus.normalizeStored(booking.getBookingStatus()));
        activityLogs.recordExternal(
                booking.getCompany(), ActivityActorType.GUEST, clientLabel, "PUBLIC_LINK",
                ActivityModule.CALENDAR, action, "SESSION", booking.getId(), typeLabel,
                client == null ? null : "CLIENT", client == null ? null : client.getId(), client == null ? null : clientLabel,
                (action == ActivityAction.SESSION_CANCELLED ? "Cancelled" : "Rescheduled") + " booking " + typeLabel,
                booking.getLocation() == null ? null : booking.getLocation().getId(),
                booking.getSpace() == null ? null : booking.getSpace().getId(), details
        );
    }

    private static String clientLabel(Client client) {
        if (client == null) return "Guest";
        String label = (Objects.toString(client.getFirstName(), "").trim() + " "
                + Objects.toString(client.getLastName(), "").trim()).trim();
        return label.isBlank() ? "Guest" : label;
    }

    private Optional<SessionBooking> ensureGroupSessionRemainsWhenParticipantLeaves(SessionBooking participant) {
        if (!isGroupSession(participant) || participant.getClient() == null) return Optional.empty();
        List<SessionBooking> rows = bookings.findByBookingGroupKeyAndCompanyIdOrderByIdAsc(
                groupKey(participant), participant.getCompany().getId());
        boolean hasActivePlaceholder = rows.stream()
                .filter(row -> !Objects.equals(row.getId(), participant.getId()))
                .anyMatch(row -> row.getClient() == null && SessionBookingStatus.isAvailabilityBlocking(row.getBookingStatus()));
        boolean hasOtherActiveParticipant = rows.stream()
                .filter(row -> !Objects.equals(row.getId(), participant.getId()))
                .anyMatch(row -> row.getClient() != null && SessionBookingStatus.isAvailabilityBlocking(row.getBookingStatus()));
        if (hasActivePlaceholder || hasOtherActiveParticipant) return Optional.empty();

        SessionBooking placeholder = new SessionBooking();
        placeholder.setCompany(participant.getCompany());
        placeholder.setLocation(participant.getLocation());
        placeholder.setBookingGroupKey(groupKey(participant));
        placeholder.setRecurrenceSeriesKey(participant.getRecurrenceSeriesKey());
        placeholder.setConsultant(participant.getConsultant());
        servicePlans.copy(participant, placeholder);
        if (placeholder.getLocation() == null) placeholder.setLocation(participant.getLocation());
        placeholder.setNotes(participant.getNotes());
        placeholder.setMeetingLink(participant.getMeetingLink());
        placeholder.setMeetingProvider(participant.getMeetingProvider());
        placeholder.setMeetingProvisioningStatus(participant.getMeetingProvisioningStatus());
        placeholder.setMeetingProvisioningError(participant.getMeetingProvisioningError());
        placeholder.setMeetingProvisioningAttempts(participant.getMeetingProvisioningAttempts());
        placeholder.setMeetingProvisioningStartedAt(participant.getMeetingProvisioningStartedAt());
        placeholder.setMeetingProvisioningNextAttemptAt(participant.getMeetingProvisioningNextAttemptAt());
        placeholder.setMeetingConfirmationPending(false);
        placeholder.setBookingStatus(SessionBookingStatus.RESERVED);
        placeholder.setSourceChannel("STAFF");
        placeholder.setBookingSource(com.example.app.session.BookingSource.MANUAL);
        placeholder.setClientGroup(participant.getClientGroup());
        placeholder.setSessionGroupEmailOverride(participant.getSessionGroupEmailOverride());
        placeholder.setSessionGroupBillingCompany(participant.getSessionGroupBillingCompany());
        placeholder = bookings.save(placeholder);
        bookings.flush();
        bookingChangePublisher.publish(
                participant.getCompany().getId(),
                placeholder.getId(),
                placeholder.getStartTime(),
                placeholder.getEndTime(),
                BookingChangePublisher.BOOKING_CREATED,
                "PUBLIC_LINK",
                null
        );
        return Optional.of(placeholder);
    }

    private void copyGroupSessionFields(SessionBooking source, SessionBooking target) {
        target.setCompany(source.getCompany());
        target.setBookingGroupKey(groupKey(source));
        target.setRecurrenceSeriesKey(source.getRecurrenceSeriesKey());
        target.setConsultant(source.getConsultant());
        servicePlans.copy(source, target);
        target.setNotes(source.getNotes());
        target.setMeetingLink(source.getMeetingLink());
        target.setMeetingProvider(source.getMeetingProvider());
        target.setMeetingProvisioningStatus(source.getMeetingProvisioningStatus());
        target.setMeetingProvisioningError(source.getMeetingProvisioningError());
        target.setMeetingProvisioningAttempts(source.getMeetingProvisioningAttempts());
        target.setMeetingProvisioningStartedAt(source.getMeetingProvisioningStartedAt());
        target.setMeetingProvisioningNextAttemptAt(source.getMeetingProvisioningNextAttemptAt());
        target.setMeetingConfirmationPending(source.isMeetingConfirmationPending());
        target.setClientGroup(source.getClientGroup());
        target.setSessionGroupEmailOverride(source.getSessionGroupEmailOverride());
        target.setSessionGroupBillingCompany(source.getSessionGroupBillingCompany());
    }

    private List<SessionBooking> activeGroupRows(List<SessionBooking> rows) {
        if (rows == null) return List.of();
        return rows.stream()
                .filter(row -> SessionBookingStatus.isAvailabilityBlocking(row.getBookingStatus()))
                .toList();
    }

    private boolean groupContainsClient(List<SessionBooking> rows, Long clientId) {
        if (clientId == null || rows == null) return false;
        return rows.stream()
                .map(SessionBooking::getClient)
                .filter(Objects::nonNull)
                .map(Client::getId)
                .anyMatch(clientId::equals);
    }

    private int activeParticipantCount(List<SessionBooking> rows) {
        if (rows == null) return 0;
        return Math.toIntExact(rows.stream()
                .map(SessionBooking::getClient)
                .filter(Objects::nonNull)
                .map(Client::getId)
                .filter(Objects::nonNull)
                .distinct()
                .count());
    }

    private String groupSessionSlotLabel(SessionBooking representative) {
        StringBuilder label = new StringBuilder(representative.getStartTime().format(SLOT_LABEL_FORMAT));
        if (representative.getConsultant() != null) {
            String name = consultantName(representative.getConsultant());
            if (!name.isBlank()) label.append(" · ").append(name);
        }
        if (representative.getLocation() != null
                && representative.getLocation().getName() != null
                && !representative.getLocation().getName().isBlank()) {
            label.append(" · ").append(representative.getLocation().getName().trim());
        }
        return label.toString();
    }

    private List<LocalTime> bookableStarts(Company company, SessionBooking booking, LocalDate date, Long consultantId, int duration) {
        DayOfWeek dayOfWeek = date.getDayOfWeek();
        List<LocalTime> starts = new ArrayList<>();
        Long locationId = booking.getLocation() == null ? null : booking.getLocation().getId();
        if (locationId == null) return starts;
        List<BookableSlot> windows = bookableSlots.findAllForWidgetByCompanyIdAndLocationIdAndDate(company.getId(), locationId, dayOfWeek, date, consultantId).stream()
                .filter(slot -> slot.getConsultant() != null)
                .filter(slot -> slot.getConsultant().getId().equals(consultantId))
                .filter(slot -> consultantSupportsType(slot.getConsultant(), booking.getType()))
                .toList();
        for (BookableSlot window : windows) {
            addWindowStarts(starts, date, window.getStartTime(), window.getEndTime(), duration);
        }
        return starts;
    }

    private void addWindowStarts(
            List<LocalTime> starts,
            LocalDate date,
            LocalTime from,
            LocalTime to,
            int duration
    ) {
        AvailabilityWindowGrid.starts(date, from, to, duration, 30).stream()
                .map(LocalDateTime::toLocalTime)
                .forEach(starts::add);
    }

    private boolean canModify(SessionBooking booking, TenantReservationRulesService.TenantReservationRules rules) {
        if (!isManageableBooking(booking)) return false;
        if (rules != null && !rules.modificationAllowed()) return false;
        return beforeCutoff(booking, rules.rescheduleUntilHours());
    }

    private boolean canCancel(SessionBooking booking, TenantReservationRulesService.TenantReservationRules rules) {
        if (!isManageableBooking(booking)) return false;
        if (rules != null && !rules.cancellationAllowed()) return false;
        return beforeCutoff(booking, rules.cancelUntilHours());
    }

    private String modifyBlockedReason(SessionBooking booking, TenantReservationRulesService.TenantReservationRules rules) {
        if (canModify(booking, rules)) return null;
        if (!isManageableBooking(booking)) return "This booking can no longer be changed.";
        if (rules != null && !rules.modificationAllowed()) return "This booking cannot be changed online.";
        return "This booking can no longer be changed because the reschedule deadline has passed.";
    }

    private String cancelBlockedReason(SessionBooking booking, TenantReservationRulesService.TenantReservationRules rules) {
        if (canCancel(booking, rules)) return null;
        if (!isManageableBooking(booking)) return "This booking can no longer be cancelled.";
        if (rules != null && !rules.cancellationAllowed()) return "This booking cannot be cancelled online.";
        return "This booking can no longer be cancelled because the cancellation deadline has passed.";
    }

    private boolean beforeCutoff(SessionBooking booking, int cutoffHours) {
        if (booking == null || booking.getStartTime() == null) return false;
        LocalDateTime now = timeService.localDateTime(zoneForBooking(booking));
        if (!booking.getStartTime().isAfter(now)) return false;
        LocalDateTime deadline = booking.getStartTime().minusHours(Math.max(0, cutoffHours));
        return !now.isAfter(deadline);
    }

    private boolean isManageableBooking(SessionBooking booking) {
        if (booking == null || booking.getId() == null || booking.getCompany() == null) return false;
        String stored = SessionBookingStatus.normalizeStored(booking.getBookingStatus());
        return SessionBookingStatus.RESERVED.equals(stored);
    }

    private boolean isGroupSession(SessionBooking booking) {
        return booking != null && booking.getClientGroup() != null;
    }

    private TenantReservationRulesService.TenantReservationRules rulesFor(SessionBooking booking) {
        Location location = requireBookingLocation(booking);
        return reservationRulesService.resolve(booking.getCompany().getId(), location.getId());
    }

    private boolean slotAllowedByReservationRules(
            SessionBooking booking,
            LocalDateTime slotStart,
            TenantReservationRulesService.TenantReservationRules rules
    ) {
        ZoneId bookingZone = zoneForBooking(booking);
        return TenantReservationRulesService.slotAllowed(
                rules, slotStart, bookingZone, timeService.localDateTime(bookingZone));
    }

    private LocalDate parseDate(String value) {
        try {
            return LocalDate.parse(value, DATE_FORMAT);
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid date. Use YYYY-MM-DD.");
        }
    }

    private LocalDateTime parseStartTime(String value) {
        try {
            return LocalDateTime.parse(value, DATE_TIME_FORMAT);
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid start time.");
        }
    }

    private int durationMinutes(SessionBooking booking) {
        if (booking.getStartTime() != null && booking.getEndTime() != null && booking.getEndTime().isAfter(booking.getStartTime())) {
            long minutes = java.time.Duration.between(booking.getStartTime(), booking.getEndTime()).toMinutes();
            if (minutes > 0 && minutes <= 24 * 60) return (int) minutes;
        }
        if (booking.getType() != null && booking.getType().getDurationMinutes() != null) {
            return booking.getType().getDurationMinutes();
        }
        return loadConfig(booking.getCompany().getId()).sessionLengthMinutes();
    }

    private List<Long> clientIdsOf(List<SessionBooking> rows) {
        if (rows == null) return List.of();
        return rows.stream()
                .map(SessionBooking::getClient)
                .filter(Objects::nonNull)
                .map(Client::getId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
    }

    private String groupKey(SessionBooking booking) {
        if (booking.getBookingGroupKey() != null && !booking.getBookingGroupKey().isBlank()) {
            return booking.getBookingGroupKey();
        }
        return "legacy-" + booking.getId();
    }

    private boolean isOnline(SessionBooking booking) {
        return booking.isOnlineSession();
    }

    private Location requireBookingLocation(SessionBooking booking) {
        if (booking == null || booking.getLocation() == null || booking.getLocation().getId() == null) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "This booking has no location and cannot be managed online."
            );
        }
        return booking.getLocation();
    }

    private boolean sameLocation(SessionBooking left, SessionBooking right) {
        if (left == null || right == null || left.getLocation() == null || right.getLocation() == null) return false;
        return Objects.equals(left.getLocation().getId(), right.getLocation().getId());
    }

    private ZoneId zoneForBooking(SessionBooking booking) {
        Location location = booking == null ? null : booking.getLocation();
        String timezone = location == null ? null : location.getTimezone();
        if (timezone == null || timezone.isBlank()) return zoneId;
        try {
            return ZoneId.of(timezone.trim());
        } catch (Exception ignored) {
            return zoneId;
        }
    }

    private boolean consultantSupportsType(User consultant, SessionType type) {
        return consultant != null
                && type != null
                && (consultant.getTypes() == null
                || consultant.getTypes().isEmpty()
                || consultant.getTypes().stream().anyMatch(t -> t.getId().equals(type.getId())));
    }

    private String consultantName(User consultant) {
        return (String.valueOf(consultant.getFirstName() == null ? "" : consultant.getFirstName()) + " "
                + String.valueOf(consultant.getLastName() == null ? "" : consultant.getLastName())).trim();
    }

    private Optional<TimeWindow> resolveConsultantWorkingWindow(User consultant, LocalDate date, Long locationId) {
        String raw = consultant == null ? null : (consultantLocations == null
                ? consultant.getWorkingHoursJson()
                : consultantLocations.workingHoursJsonFor(consultant, locationId));
        if (raw == null || raw.isBlank()) return Optional.empty();
        try {
            JsonNode root = JSON.readTree(raw);
            boolean sameForAllDays = root.path("sameForAllDays").asBoolean(false);
            JsonNode block = sameForAllDays ? root.get("allDays") : root.path("byDay").get(date.getDayOfWeek().name());
            if (block == null || block.isNull() || !block.isObject()) return Optional.empty();
            LocalTime start = parseWorkingHoursTime(block.path("start").asText(null));
            LocalTime end = parseWorkingHoursTime(block.path("end").asText(null));
            if (start == null || end == null || !end.isAfter(start)) return Optional.empty();
            return Optional.of(new TimeWindow(start, end));
        } catch (Exception ex) {
            return Optional.empty();
        }
    }

    private static LocalTime parseWorkingHoursTime(String text) {
        if (text == null || text.isBlank()) return null;
        try {
            return LocalTime.parse(text.trim());
        } catch (Exception ex) {
            try {
                return LocalTime.parse(text.trim(), DateTimeFormatter.ofPattern("H:mm"));
            } catch (Exception ignored) {
                return null;
            }
        }
    }

    private WidgetConfig loadConfig(Long companyId) {
        Map<String, String> values = settings.findAllByCompanyId(companyId).stream()
                .collect(Collectors.toMap(AppSetting::getKey, AppSetting::getValue, (a, b) -> b));
        int sessionLengthMinutes = parseInteger(values.get(SettingKey.SESSION_LENGTH_MINUTES.name()), 60);
        LocalTime workingHoursStart = parseTime(values.get(SettingKey.WORKING_HOURS_START.name()), LocalTime.of(8, 0));
        LocalTime workingHoursEnd = parseTime(values.get(SettingKey.WORKING_HOURS_END.name()), LocalTime.of(18, 0));
        return new WidgetConfig(sessionLengthMinutes, workingHoursStart, workingHoursEnd);
    }

    private int parseInteger(String value, int fallback) {
        try {
            return value == null || value.isBlank() ? fallback : Integer.parseInt(value.trim());
        } catch (Exception ex) {
            return fallback;
        }
    }

    private LocalTime parseTime(String value, LocalTime fallback) {
        try {
            return value == null || value.isBlank() ? fallback : LocalTime.parse(value.trim());
        } catch (Exception ex) {
            return fallback;
        }
    }

    private record TimeWindow(LocalTime start, LocalTime end) {}
    private record WidgetConfig(int sessionLengthMinutes, LocalTime workingHoursStart, LocalTime workingHoursEnd) {}
}
