package com.example.app.widget.manage;

import com.example.app.client.Client;
import com.example.app.common.TimeService;
import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.billing.OpenBillSyncService;
import com.example.app.reminder.ReminderService;
import com.example.app.session.BookableSlot;
import com.example.app.session.BookableSlotRepository;
import com.example.app.session.BookingChangePublisher;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingCreationService;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.SessionBookingStatus;
import com.example.app.session.SessionType;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.settings.TenantReservationRulesService;
import com.example.app.user.User;
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
    private final ReminderService reminderService;
    private final BookingChangePublisher bookingChangePublisher;
    private final OpenBillSyncService openBillSyncService;
    private final WebsiteWidgetSettingsService websiteWidgetSettingsService;
    private final TimeService timeService;
    private final ZoneId zoneId;

    public PublicBookingManageService(
            PublicBookingManageTokenService tokenService,
            CompanyRepository companies,
            AppSettingRepository settings,
            SessionBookingRepository bookings,
            BookableSlotRepository bookableSlots,
            SessionBookingCreationService bookingCreationService,
            ReminderService reminderService,
            BookingChangePublisher bookingChangePublisher,
            OpenBillSyncService openBillSyncService,
            WebsiteWidgetSettingsService websiteWidgetSettingsService,
            TimeService timeService,
            @Value("${app.reminders.timezone:Europe/Ljubljana}") String bookingTimezoneId
    ) {
        this.tokenService = tokenService;
        this.companies = companies;
        this.settings = settings;
        this.bookings = bookings;
        this.bookableSlots = bookableSlots;
        this.bookingCreationService = bookingCreationService;
        this.reminderService = reminderService;
        this.bookingChangePublisher = bookingChangePublisher;
        this.openBillSyncService = openBillSyncService;
        this.websiteWidgetSettingsService = websiteWidgetSettingsService;
        this.timeService = timeService;
        this.zoneId = ZoneId.of(bookingTimezoneId == null || bookingTimezoneId.isBlank() ? "Europe/Ljubljana" : bookingTimezoneId.trim());
    }

    @Transactional
    public PublicBookingManageController.BookingManageResponse get(String rawToken) {
        PublicBookingManageToken token = tokenService.resolve(rawToken);
        return toManageResponse(token.getBooking(), token.getCompany(), rules(token.getCompany().getId()));
    }

    @Transactional
    public PublicBookingManageController.AvailabilityResponse availability(String rawToken, String dateText) {
        PublicBookingManageToken token = tokenService.resolve(rawToken);
        SessionBooking booking = token.getBooking();
        Company company = token.getCompany();
        TenantReservationRulesService.TenantReservationRules rules = rules(company.getId());
        if (!canModify(booking, rules)) {
            return new PublicBookingManageController.AvailabilityResponse(dateText, List.of());
        }
        LocalDate date = parseDate(dateText);
        List<PublicBookingManageController.AvailabilitySlotResponse> slots = buildAvailabilitySlots(company, booking, date, rules);
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
        TenantReservationRulesService.TenantReservationRules rules = rules(company.getId());
        if (!canModify(booking, rules)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, modifyBlockedReason(booking, rules));
        }
        SessionType type = booking.getType();
        if (type == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Booking has no service.");
        }
        LocalDateTime newStart = parseStartTime(request.startTime());
        int durationMinutes = durationMinutes(booking);
        LocalDateTime newEnd = newStart.plusMinutes(durationMinutes);
        if (!slotAllowedByReservationRules(newStart, rules)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected time is outside the allowed reservation window.");
        }

        List<SessionBooking> grouped = bookings.findByBookingGroupKeyAndCompanyIdOrderByIdAsc(groupKey(booking), company.getId());
        if (grouped == null || grouped.isEmpty()) {
            grouped = List.of(booking);
        }
        List<Long> excludeIds = grouped.stream().map(SessionBooking::getId).filter(Objects::nonNull).toList();
        Long consultantId = booking.getConsultant() == null ? null : booking.getConsultant().getId();
        Long spaceId = booking.getSpace() == null ? null : booking.getSpace().getId();
        bookingCreationService.validateBookingWindow(
                company.getId(),
                clientIdsOf(List.of(booking)),
                consultantId,
                spaceId,
                newStart,
                newEnd,
                type.getId(),
                excludeIds,
                bookingCreationService.isSpacesEnabled(company.getId()),
                bookingCreationService.isMultipleSessionsPerSpaceEnabled(company.getId()),
                bookingCreationService.isMultipleClientsPerSessionEnabled(company.getId()),
                isOnline(booking),
                false
        );

        LocalDateTime oldStart = booking.getStartTime();
        LocalDateTime oldEnd = booking.getEndTime();
        booking.setStartTime(newStart);
        booking.setEndTime(newEnd);
        booking = bookings.save(booking);
        reminderService.sendSessionRescheduled(booking, oldStart, oldEnd);
        bookingChangePublisher.publish(
                company.getId(),
                booking.getId(),
                booking.getStartTime(),
                booking.getEndTime(),
                BookingChangePublisher.BOOKING_UPDATED
        );
        openBillSyncService.syncSessionGroup(company.getId(), groupKey(booking));
        openBillSyncService.enqueueBookingsSync(company.getId(), List.of(booking));
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
        TenantReservationRulesService.TenantReservationRules rules = rules(company.getId());
        if (!canCancel(booking, rules)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, cancelBlockedReason(booking, rules));
        }
        booking.setBookingStatus(SessionBookingStatus.CANCELLED);
        if (request != null && request.reason() != null && !request.reason().isBlank()) {
            String existing = booking.getNotes() == null ? "" : booking.getNotes().trim();
            String note = "Public cancellation reason: " + request.reason().trim();
            booking.setNotes(existing.isBlank() ? note : existing + "\n" + note);
        }
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
                BookingChangePublisher.BOOKING_CANCELLED
        );
        return new PublicBookingManageController.CancelResponse("CANCELLED", "Booking cancelled.");
    }

    private PublicBookingManageController.BookingManageResponse toManageResponse(
            SessionBooking booking,
            Company company,
            TenantReservationRulesService.TenantReservationRules rules
    ) {
        return new PublicBookingManageController.BookingManageResponse(
                company.getTenantCode(),
                tenantName(company),
                booking.getType() == null ? "" : booking.getType().getName(),
                booking.getStartTime() == null ? null : booking.getStartTime().format(DATE_TIME_FORMAT),
                booking.getEndTime() == null ? null : booking.getEndTime().format(DATE_TIME_FORMAT),
                booking.getStartTime() == null ? "" : booking.getStartTime().format(HUMAN_FORMAT),
                booking.getConsultant() == null ? "" : consultantName(booking.getConsultant()),
                SessionBookingStatus.normalizeStored(booking.getBookingStatus()),
                canModify(booking, rules),
                canCancel(booking, rules),
                modifyBlockedReason(booking, rules),
                cancelBlockedReason(booking, rules),
                zoneId.getId(),
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
        LocalDate today = timeService.localDate(zoneId);
        if (date.isBefore(today) || date.isAfter(today.plusDays(rules.maxAdvanceBookingDays()))) return List.of();

        int duration = durationMinutes(booking);
        Long consultantId = booking.getConsultant() == null ? null : booking.getConsultant().getId();
        List<LocalTime> starts = new ArrayList<>();
        if (consultantId != null) {
            starts.addAll(bookableStarts(company, booking, date, consultantId, duration));
            if (starts.isEmpty()) {
                resolveConsultantWorkingWindow(booking.getConsultant(), date)
                        .ifPresent(window -> addWindowStarts(starts, window.start(), window.end(), duration));
            }
        } else {
            WidgetConfig cfg = loadConfig(company.getId());
            addWindowStarts(starts, cfg.workingHoursStart(), cfg.workingHoursEnd(), duration);
        }

        Map<LocalDateTime, PublicBookingManageController.AvailabilitySlotResponse> out = new LinkedHashMap<>();
        List<Long> excludeIds = List.of(booking.getId());
        for (LocalTime t : starts.stream().distinct().sorted().toList()) {
            LocalDateTime start = date.atTime(t);
            LocalDateTime end = start.plusMinutes(duration);
            if (Objects.equals(start, booking.getStartTime())) continue;
            if (!slotAllowedByReservationRules(start, rules)) continue;
            try {
                bookingCreationService.validateBookingWindow(
                        company.getId(),
                        clientIdsOf(List.of(booking)),
                        consultantId,
                        booking.getSpace() == null ? null : booking.getSpace().getId(),
                        start,
                        end,
                        booking.getType().getId(),
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

    private List<LocalTime> bookableStarts(Company company, SessionBooking booking, LocalDate date, Long consultantId, int duration) {
        DayOfWeek dayOfWeek = date.getDayOfWeek();
        List<LocalTime> starts = new ArrayList<>();
        List<BookableSlot> windows = bookableSlots.findAllForWidgetByCompanyIdAndDate(company.getId(), dayOfWeek, date, consultantId).stream()
                .filter(slot -> slot.getConsultant() != null)
                .filter(slot -> slot.getConsultant().getId().equals(consultantId))
                .filter(slot -> consultantSupportsType(slot.getConsultant(), booking.getType()))
                .toList();
        for (BookableSlot window : windows) {
            addWindowStarts(starts, window.getStartTime(), window.getEndTime(), duration);
        }
        return starts;
    }

    private void addWindowStarts(List<LocalTime> starts, LocalTime from, LocalTime to, int duration) {
        if (from == null || to == null || !to.isAfter(from)) return;
        LocalTime cursor = from;
        while (!cursor.plusMinutes(duration).isAfter(to)) {
            starts.add(cursor);
            cursor = cursor.plusMinutes(30);
        }
    }

    private boolean canModify(SessionBooking booking, TenantReservationRulesService.TenantReservationRules rules) {
        if (!isManageableWidgetBooking(booking)) return false;
        if (rules != null && !rules.modificationAllowed()) return false;
        if (booking.getClientGroup() != null) return false;
        return beforeCutoff(booking, rules.rescheduleUntilHours());
    }

    private boolean canCancel(SessionBooking booking, TenantReservationRulesService.TenantReservationRules rules) {
        if (!isManageableWidgetBooking(booking)) return false;
        if (rules != null && !rules.cancellationAllowed()) return false;
        return beforeCutoff(booking, rules.cancelUntilHours());
    }

    private String modifyBlockedReason(SessionBooking booking, TenantReservationRulesService.TenantReservationRules rules) {
        if (canModify(booking, rules)) return null;
        if (!isManageableWidgetBooking(booking)) return "This booking can no longer be changed.";
        if (rules != null && !rules.modificationAllowed()) return "This booking cannot be changed online.";
        if (booking != null && booking.getClientGroup() != null) return "Group sessions cannot be rescheduled from this link.";
        return "This booking can no longer be changed because the reschedule deadline has passed.";
    }

    private String cancelBlockedReason(SessionBooking booking, TenantReservationRulesService.TenantReservationRules rules) {
        if (canCancel(booking, rules)) return null;
        if (!isManageableWidgetBooking(booking)) return "This booking can no longer be cancelled.";
        if (rules != null && !rules.cancellationAllowed()) return "This booking cannot be cancelled online.";
        return "This booking can no longer be cancelled because the cancellation deadline has passed.";
    }

    private boolean beforeCutoff(SessionBooking booking, int cutoffHours) {
        if (booking == null || booking.getStartTime() == null) return false;
        LocalDateTime now = timeService.localDateTime(zoneId);
        if (!booking.getStartTime().isAfter(now)) return false;
        LocalDateTime deadline = booking.getStartTime().minusHours(Math.max(0, cutoffHours));
        return !now.isAfter(deadline);
    }

    private boolean isManageableWidgetBooking(SessionBooking booking) {
        if (booking == null || booking.getId() == null) return false;
        if (!"WEBSITE_WIDGET".equalsIgnoreCase(String.valueOf(booking.getSourceChannel()))) return false;
        String stored = SessionBookingStatus.normalizeStored(booking.getBookingStatus());
        return SessionBookingStatus.RESERVED.equals(stored);
    }

    private TenantReservationRulesService.TenantReservationRules rules(Long companyId) {
        return TenantReservationRulesService.resolve(settings.findAllByCompanyId(companyId).stream()
                .collect(Collectors.toMap(AppSetting::getKey, AppSetting::getValue, (a, b) -> b)));
    }

    private boolean slotAllowedByReservationRules(LocalDateTime slotStart, TenantReservationRulesService.TenantReservationRules rules) {
        return TenantReservationRulesService.slotAllowed(rules, slotStart, zoneId, timeService.localDateTime(zoneId));
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
        return booking.getMeetingLink() != null && !booking.getMeetingLink().isBlank();
    }

    private String tenantName(Company company) {
        if (company == null) return "Calendra";
        String value = settings.findByCompanyIdAndKey(company.getId(), SettingKey.COMPANY_NAME)
                .map(AppSetting::getValue)
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .orElse(company.getName());
        return value == null || value.isBlank() ? "Calendra" : value;
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

    private Optional<TimeWindow> resolveConsultantWorkingWindow(User consultant, LocalDate date) {
        String raw = consultant == null ? null : consultant.getWorkingHoursJson();
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
