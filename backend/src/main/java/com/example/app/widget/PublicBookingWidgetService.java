package com.example.app.widget;

import com.example.app.billing.PaymentMethod;
import com.example.app.billing.PaymentMethodRepository;
import com.example.app.billing.PaymentType;
import com.example.app.client.Client;
import com.example.app.client.ClientRepository;
import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.guest.common.GuestSettingsService;
import com.example.app.session.BookableSlot;
import com.example.app.session.BookableSlotRepository;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.SessionBookingCreationService;
import com.example.app.session.SessionType;
import com.example.app.session.SessionTypeRepository;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
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
import java.util.Objects;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.stream.Collectors;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PublicBookingWidgetService {
    private static final ObjectMapper JSON = new ObjectMapper();

    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ISO_LOCAL_DATE;
    private static final DateTimeFormatter DATE_TIME_FORMAT = DateTimeFormatter.ISO_LOCAL_DATE_TIME;
    private static final DateTimeFormatter SLOT_LABEL_FORMAT = DateTimeFormatter.ofPattern("HH:mm");
    private static final DateTimeFormatter HUMAN_FORMAT = DateTimeFormatter.ofPattern("EEEE, d MMMM yyyy 'at' HH:mm", Locale.ENGLISH);

    private final CompanyRepository companies;
    private final AppSettingRepository settings;
    private final SessionTypeRepository types;
    private final BookableSlotRepository bookableSlots;
    private final SessionBookingRepository bookings;
    private final UserRepository users;
    private final ClientRepository clients;
    private final SessionBookingCreationService bookingCreationService;
    private final ZoneId widgetZoneId;
    private final WidgetOriginValidator widgetOriginValidator;
    private final WidgetRateLimiter widgetRateLimiter;
    private final WidgetTurnstileService widgetTurnstileService;
    private final WidgetBookingIdempotencyService widgetBookingIdempotencyService;
    private final WidgetPublicAuditLogger widgetPublicAuditLogger;
    private final GuestSettingsService guestSettingsService;
    private final PaymentMethodRepository paymentMethods;

    public PublicBookingWidgetService(
            CompanyRepository companies,
            AppSettingRepository settings,
            SessionTypeRepository types,
            BookableSlotRepository bookableSlots,
            SessionBookingRepository bookings,
            UserRepository users,
            ClientRepository clients,
            SessionBookingCreationService bookingCreationService,
            WidgetOriginValidator widgetOriginValidator,
            WidgetRateLimiter widgetRateLimiter,
            WidgetTurnstileService widgetTurnstileService,
            WidgetBookingIdempotencyService widgetBookingIdempotencyService,
            WidgetPublicAuditLogger widgetPublicAuditLogger,
            GuestSettingsService guestSettingsService,
            PaymentMethodRepository paymentMethods,
            @Value("${app.reminders.timezone:Europe/Ljubljana}") String widgetTimezoneId
    ) {
        this.companies = companies;
        this.settings = settings;
        this.types = types;
        this.bookableSlots = bookableSlots;
        this.bookings = bookings;
        this.users = users;
        this.clients = clients;
        this.bookingCreationService = bookingCreationService;
        this.widgetOriginValidator = widgetOriginValidator;
        this.widgetRateLimiter = widgetRateLimiter;
        this.widgetTurnstileService = widgetTurnstileService;
        this.widgetBookingIdempotencyService = widgetBookingIdempotencyService;
        this.widgetPublicAuditLogger = widgetPublicAuditLogger;
        this.guestSettingsService = guestSettingsService;
        this.paymentMethods = paymentMethods;
        this.widgetZoneId = (widgetTimezoneId == null || widgetTimezoneId.isBlank())
                ? ZoneId.of("Europe/Ljubljana")
                : ZoneId.of(widgetTimezoneId.trim());
    }

    public PublicBookingWidgetController.WidgetConfigResponse config(String tenantCode, HttpServletRequest request) {
        Company company = resolveCompany(tenantCode);
        guardPublicWidgetRequest(company, request, false, "config");
        var cfg = loadConfig(company.getId());
        var publicSettings = guestSettingsService.publicSettings(company.getId());
        var allowedPaymentMethods = resolveAllowedPaymentMethods(company);
        return new PublicBookingWidgetController.WidgetConfigResponse(
                company.getTenantCode(),
                cfg.companyName(),
                cfg.availabilityEnabled(),
                cfg.typesEnabled(),
                cfg.sessionLengthMinutes(),
                cfg.workingHoursStart().toString(),
                cfg.workingHoursEnd().toString(),
                widgetZoneId.getId(),
                widgetTurnstileService.isEnabled(company),
                widgetTurnstileService.siteKey(company),
                publicSettings.employeeSelectionStep(),
                allowedPaymentMethods
        );
    }

    /**
     * Computes the widget's allowed payment methods for a single bookable session
     * ({@code SESSION_SINGLE}) by mirroring the rules applied in
     * {@code GuestOrderService.assertPaymentMethodAllowed}.
     */
    private PublicBookingWidgetController.AllowedPaymentMethodsResponse resolveAllowedPaymentMethods(Company company) {
        GuestSettingsService.GuestBookingRules rules = guestSettingsService.bookingRules(company.getId());
        List<PaymentMethod> methods = paymentMethods.findAllByCompanyIdOrderByNameAsc(company.getId());
        boolean cardConfigured = methods.stream().anyMatch(pm ->
                pm.isGuestEnabled() && pm.getPaymentType() == PaymentType.CARD && pm.isStripeEnabled());
        boolean bankConfigured = methods.stream().anyMatch(pm ->
                pm.isGuestEnabled() && pm.getPaymentType() == PaymentType.BANK_TRANSFER);
        String productType = "SESSION_SINGLE";
        boolean card = cardConfigured && rules.allowCardFor().contains(productType);
        boolean bankTransfer = bankConfigured && rules.allowBankTransferFor().contains(productType);
        boolean paypal = company.getPaypalMerchantId() != null
                && !company.getPaypalMerchantId().isBlank()
                && rules.allowCardFor().contains(productType);
        return new PublicBookingWidgetController.AllowedPaymentMethodsResponse(card, bankTransfer, paypal);
    }

    public List<PublicBookingWidgetController.WidgetServiceResponse> services(String tenantCode, HttpServletRequest request) {
        Company company = resolveCompany(tenantCode);
        guardPublicWidgetRequest(company, request, false, "services");
        return types.findAllWithLinkedServicesByCompanyId(company.getId()).stream()
                .filter(this::isWebsiteBookingEnabled)
                .sorted(Comparator.comparing(SessionType::getName, String.CASE_INSENSITIVE_ORDER))
                .map(type -> new PublicBookingWidgetController.WidgetServiceResponse(
                        type.getId(),
                        type.getName(),
                        type.getDescription(),
                        type.getDurationMinutes() != null ? type.getDurationMinutes() : 60,
                        toPriceLabel(type),
                        type.getMaxParticipantsPerSession(),
                        isWebsiteBookingEnabled(type)
                ))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<PublicBookingWidgetController.WidgetConsultantResponse> consultants(String tenantCode, Long typeId, HttpServletRequest request) {
        Company company = resolveCompany(tenantCode);
        guardPublicWidgetRequest(company, request, false, "consultants");
        SessionType type = resolveType(company.getId(), typeId);
        if (isGroupWebsiteBookingOnly(type)) {
            return List.of();
        }
        return supportedConsultants(company.getId(), type).stream()
                .map(consultant -> new PublicBookingWidgetController.WidgetConsultantResponse(
                        consultant.getId(),
                        consultantFullName(consultant)
                ))
                .toList();
    }

    @Transactional(readOnly = true)
    public PublicBookingWidgetController.AvailabilityResponse availability(String tenantCode, Long typeId, String dateText, Long consultantId, HttpServletRequest request) {
        Company company = resolveCompany(tenantCode);
        guardPublicWidgetRequest(company, request, false, "availability");
        WidgetConfig cfg = loadConfig(company.getId());
        LocalDate date = parseDate(dateText);
        SessionType type = resolveType(company.getId(), typeId);
        boolean groupOnlyWebsiteBooking = isGroupWebsiteBookingOnly(type);
        Long resolvedConsultantId = !groupOnlyWebsiteBooking && consultantId != null
                ? resolveConsultantForBooking(company.getId(), consultantId, false).getId()
                : null;

        List<PublicBookingWidgetController.AvailabilitySlotResponse> slots;
        List<PublicBookingWidgetController.GroupSessionSlotResponse> groupSessions = buildGroupSessions(company, type, date, resolvedConsultantId);
        if (groupOnlyWebsiteBooking) {
            slots = List.of();
        } else if (cfg.availabilityEnabled()) {
            Map<String, PublicBookingWidgetController.AvailabilitySlotResponse> merged = new LinkedHashMap<>();
            for (PublicBookingWidgetController.AvailabilitySlotResponse s : buildBookableSlots(company, cfg, type, date, resolvedConsultantId)) {
                merged.put(widgetSlotMergeKey(s, resolvedConsultantId), s);
            }
            for (PublicBookingWidgetController.AvailabilitySlotResponse s : buildWorkingHoursSlots(company, cfg, type, date, resolvedConsultantId)) {
                merged.putIfAbsent(widgetSlotMergeKey(s, resolvedConsultantId), s);
            }
            slots = sortAvailabilitySlots(merged);
        } else {
            slots = buildFallbackSlots(company, cfg, type, date, resolvedConsultantId);
        }

        return new PublicBookingWidgetController.AvailabilityResponse(cfg.availabilityEnabled(), DATE_FORMAT.format(date), slots, groupSessions);
    }

    @Transactional
    public PublicBookingWidgetController.BookingResponse createBooking(String tenantCode, PublicBookingWidgetController.BookingRequest request, String idempotencyKey, HttpServletRequest httpRequest) {
        Company company = resolveCompany(tenantCode);
        guardPublicWidgetRequest(company, httpRequest, true, "bookings");
        widgetTurnstileService.verifyIfEnabled(company, request.turnstileToken(), widgetPublicAuditLogger.clientIp(httpRequest));
        WidgetConfig cfg = loadConfig(company.getId());
        SessionType type = resolveType(company.getId(), request.typeId());
        try {
            if (request.groupSessionId() != null) {
                PublicBookingWidgetController.BookingResponse response = widgetBookingIdempotencyService.execute(company, "group-booking", idempotencyKey, request, PublicBookingWidgetController.BookingResponse.class, () -> joinGroupSession(company, type, request));
                widgetPublicAuditLogger.logAttempt(company, httpRequest, "booking", "success", "typeId=" + type.getId() + ",groupSessionId=" + request.groupSessionId());
                return response;
            }
            if (isGroupWebsiteBookingOnly(type)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Please select one of the listed group booking time slots for this service.");
            }
            LocalDate date = parseDate(request.date());
            LocalDateTime start = parseStartTime(request.startTime(), date);
            LocalDateTime end = start.plusMinutes(type.getDurationMinutes() != null ? type.getDurationMinutes() : cfg.sessionLengthMinutes());

            if (!start.isAfter(LocalDateTime.now(widgetZoneId))) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected time is in the past.");
            }

            User consultant = resolveConsultantForBooking(company.getId(), request.consultantId(), cfg.availabilityEnabled());
            User actor = consultant != null ? consultant : resolveAdminActor(company.getId());
            Client client = findOrCreateClient(company, actor, request);

            PublicBookingWidgetController.BookingResponse response = widgetBookingIdempotencyService.execute(company, "booking", idempotencyKey, request, PublicBookingWidgetController.BookingResponse.class, () -> {
                SessionBooking booking = bookingCreationService.createChannelBooking(new SessionBookingCreationService.ChannelBookingRequest(
                        company.getId(),
                        client.getId(),
                        consultant != null ? consultant.getId() : null,
                        start,
                        end,
                        null,
                        type.getId(),
                        "Booked via website widget",
                        null,
                        false,
                        null,
                        false,
                        "WEBSITE_WIDGET",
                        null,
                        null,
                        "CONFIRMED",
                        true
                ));
                String consultantName = booking.getConsultant() == null
                        ? null
                        : consultantFullName(booking.getConsultant());
                return new PublicBookingWidgetController.BookingResponse(
                        booking.getId(),
                        booking.getType() == null ? type.getName() : booking.getType().getName(),
                        booking.getStartTime().format(DATE_TIME_FORMAT),
                        booking.getStartTime().format(HUMAN_FORMAT),
                        client.getEmail(),
                        consultantName
                );
            });
            widgetPublicAuditLogger.logAttempt(company, httpRequest, "booking", "success", "typeId=" + type.getId() + ",groupSessionId=null");
            return response;
        } catch (RuntimeException ex) {
            widgetPublicAuditLogger.logAttempt(company, httpRequest, "booking", "failed", ex.getMessage());
            throw ex;
        }
    }

    @Transactional
    protected PublicBookingWidgetController.BookingResponse joinGroupSession(
            Company company,
            SessionType type,
            PublicBookingWidgetController.BookingRequest request
    ) {
        if (!isWebsiteBookingEnabled(type)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This service is not enabled for website booking.");
        }

        SessionBooking representative = bookings.findByIdAndCompanyId(request.groupSessionId(), company.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Group session not found."));
        if (representative.getClientGroup() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected session is not a group session.");
        }
        if (representative.getType() == null || !Objects.equals(representative.getType().getId(), type.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected group session does not match this service.");
        }
        if (!representative.getStartTime().isAfter(LocalDateTime.now(widgetZoneId))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected group session is in the past.");
        }

        User actor = representative.getConsultant() != null ? representative.getConsultant() : resolveAdminActor(company.getId());
        Client client = findOrCreateClient(company, actor, request);
        SessionBooking joined = bookingCreationService.joinClientToGroupSession(new SessionBookingCreationService.GroupJoinRequest(
                company.getId(),
                representative.getId(),
                client.getId(),
                "WEBSITE_WIDGET",
                null,
                null,
                "CONFIRMED",
                true
        ));

        String consultantName = joined.getConsultant() == null
                ? null
                : consultantFullName(joined.getConsultant());
        return new PublicBookingWidgetController.BookingResponse(
                joined.getId(),
                joined.getType() == null ? type.getName() : joined.getType().getName(),
                joined.getStartTime().format(DATE_TIME_FORMAT),
                joined.getStartTime().format(HUMAN_FORMAT),
                client.getEmail(),
                consultantName
        );
    }


    private void guardPublicWidgetRequest(Company company, HttpServletRequest request, boolean bookingRequest, String action) {
        try {
            widgetOriginValidator.validate(company, request);
            widgetRateLimiter.check(company.getTenantCode(), widgetPublicAuditLogger.clientIp(request), bookingRequest);
            widgetPublicAuditLogger.logAttempt(company, request, action, "allowed", "");
        } catch (RuntimeException ex) {
            widgetPublicAuditLogger.logAttempt(company, request, action, "rejected", ex.getMessage());
            throw ex;
        }
    }

    private List<PublicBookingWidgetController.GroupSessionSlotResponse> buildGroupSessions(
            Company company,
            SessionType type,
            LocalDate date,
            Long consultantId
    ) {
        if (!isGroupWebsiteBookingOnly(type)) {
            return List.of();
        }
        LocalDateTime from = date.atStartOfDay();
        LocalDateTime to = date.plusDays(1).atStartOfDay();
        List<SessionBooking> candidates = bookings.findPublicGroupSessionCandidates(company.getId(), type.getId(), from, to);
        if (candidates.isEmpty()) {
            return List.of();
        }

        Map<String, List<SessionBooking>> grouped = new LinkedHashMap<>();
        for (SessionBooking booking : candidates) {
            if (consultantId != null) {
                Long bookingConsultantId = booking.getConsultant() == null ? null : booking.getConsultant().getId();
                if (!Objects.equals(bookingConsultantId, consultantId)) {
                    continue;
                }
            }
            if (!booking.getStartTime().isAfter(LocalDateTime.now(widgetZoneId))) {
                continue;
            }
            grouped.computeIfAbsent(groupKeyOf(booking), ignored -> new ArrayList<>()).add(booking);
        }

        return grouped.values().stream()
                .map(this::toGroupSessionSlot)
                .filter(Objects::nonNull)
                .sorted(Comparator.comparing(PublicBookingWidgetController.GroupSessionSlotResponse::startTime))
                .toList();
    }

    private PublicBookingWidgetController.GroupSessionSlotResponse toGroupSessionSlot(List<SessionBooking> rows) {
        if (rows == null || rows.isEmpty()) {
            return null;
        }
        SessionBooking representative = rows.stream()
                .min(Comparator.comparing(SessionBooking::getId))
                .orElse(rows.get(0));
        SessionType type = representative.getType();
        if (type == null || !isGroupWebsiteBookingOnly(type)) {
            return null;
        }
        int bookedParticipants = (int) rows.stream()
                .map(SessionBooking::getClient)
                .filter(Objects::nonNull)
                .map(Client::getId)
                .distinct()
                .count();
        Integer maxParticipants = type.getMaxParticipantsPerSession();
        if (maxParticipants != null && bookedParticipants >= maxParticipants) {
            return null;
        }
        Integer remainingSpots = maxParticipants == null ? null : Math.max(0, maxParticipants - bookedParticipants);
        return new PublicBookingWidgetController.GroupSessionSlotResponse(
                representative.getId(),
                representative.getStartTime().format(SLOT_LABEL_FORMAT),
                representative.getStartTime().format(DATE_TIME_FORMAT),
                representative.getEndTime().format(DATE_TIME_FORMAT),
                representative.getConsultant() == null ? null : representative.getConsultant().getId(),
                representative.getConsultant() == null ? null : consultantFullName(representative.getConsultant()),
                maxParticipants,
                bookedParticipants,
                remainingSpots
        );
    }

    private List<SessionBooking> loadGroupedRows(SessionBooking booking, Long companyId) {
        List<SessionBooking> rows = bookings.findByBookingGroupKeyAndCompanyIdOrderByIdAsc(groupKeyOf(booking), companyId);
        if (rows == null || rows.isEmpty()) {
            return List.of(booking);
        }
        return rows;
    }

    private String groupKeyOf(SessionBooking booking) {
        if (booking.getBookingGroupKey() != null && !booking.getBookingGroupKey().isBlank()) {
            return booking.getBookingGroupKey();
        }
        return "legacy-" + booking.getId();
    }

    private boolean isWebsiteBookingEnabled(SessionType type) {
        return type != null && type.isWidgetGroupBookingEnabled();
    }

    private boolean isGroupWebsiteBookingOnly(SessionType type) {
        return isWebsiteBookingEnabled(type) && type.getMaxParticipantsPerSession() != null;
    }

    private List<PublicBookingWidgetController.AvailabilitySlotResponse> buildBookableSlots(
            Company company,
            WidgetConfig cfg,
            SessionType type,
            LocalDate date,
            Long consultantId
    ) {
        LocalDate today = LocalDate.now(widgetZoneId);
        if (date.isBefore(today)) {
            return new ArrayList<>();
        }

        int durationMinutes = type.getDurationMinutes() != null ? type.getDurationMinutes() : cfg.sessionLengthMinutes();
        DayOfWeek dayOfWeek = date.getDayOfWeek();

        Map<String, PublicBookingWidgetController.AvailabilitySlotResponse> deduped = new LinkedHashMap<>();
        List<BookableSlot> windows = bookableSlots.findAllForWidgetByCompanyId(company.getId()).stream()
                .filter(slot -> slot.getConsultant() != null)
                .filter(slot -> slot.getConsultant().isActive())
                .filter(slot -> slot.getDayOfWeek() == dayOfWeek)
                .filter(slot -> consultantId == null || slot.getConsultant().getId().equals(consultantId))
                .filter(slot -> slot.isIndefinite() || withinDateRange(slot, date))
                .filter(slot -> consultantSupportsType(slot.getConsultant(), type))
                .sorted(Comparator.comparing((BookableSlot s) -> s.getConsultant().getId()).thenComparing(BookableSlot::getStartTime))
                .toList();

        for (BookableSlot window : windows) {
            LocalTime cursor = window.getStartTime();
            while (!cursor.plusMinutes(durationMinutes).isAfter(window.getEndTime())) {
                LocalDateTime start = date.atTime(cursor);
                LocalDateTime end = start.plusMinutes(durationMinutes);
                if (!isWidgetSlotStartInFuture(date, start)) {
                    cursor = cursor.plusMinutes(30);
                    continue;
                }
                if (isActuallyBookable(company.getId(), window.getConsultant().getId(), start, end, type.getId())) {
                    String iso = DATE_TIME_FORMAT.format(start);
                    String key = consultantId == null
                            ? iso + "::" + window.getConsultant().getId()
                            : iso;
                    deduped.putIfAbsent(key, new PublicBookingWidgetController.AvailabilitySlotResponse(
                            window.getConsultant().getId() + "|" + start + "|" + end,
                            cursor.format(SLOT_LABEL_FORMAT),
                            iso,
                            DATE_TIME_FORMAT.format(end),
                            window.getConsultant().getId(),
                            consultantFullName(window.getConsultant())
                    ));
                }
                cursor = cursor.plusMinutes(30);
            }
        }

        return new ArrayList<>(deduped.values());
    }

    /**
     * 30-minute grid inside each consultant's {@link User#getWorkingHoursJson()} window for {@code date}
     * (same shape as frontend {@code WorkingHoursConfig}); only slots that pass {@link #isActuallyBookable}
     * are included. Consultants without hours for that day contribute nothing.
     */
    private List<PublicBookingWidgetController.AvailabilitySlotResponse> buildWorkingHoursSlots(
            Company company,
            WidgetConfig cfg,
            SessionType type,
            LocalDate date,
            Long consultantId
    ) {
        LocalDate today = LocalDate.now(widgetZoneId);
        if (date.isBefore(today)) {
            return new ArrayList<>();
        }

        int durationMinutes = type.getDurationMinutes() != null ? type.getDurationMinutes() : cfg.sessionLengthMinutes();
        List<User> consultants = supportedConsultants(company.getId(), type).stream()
                .filter(c -> consultantId == null || c.getId().equals(consultantId))
                .toList();

        Map<String, PublicBookingWidgetController.AvailabilitySlotResponse> deduped = new LinkedHashMap<>();
        for (User consultant : consultants) {
            Optional<TimeWindow> dayWindow = resolveConsultantWorkingWindow(consultant, date);
            if (dayWindow.isEmpty()) {
                continue;
            }
            LocalTime rangeEnd = dayWindow.get().end();
            LocalTime cursor = dayWindow.get().start();
            while (!cursor.plusMinutes(durationMinutes).isAfter(rangeEnd)) {
                LocalDateTime start = date.atTime(cursor);
                LocalDateTime end = start.plusMinutes(durationMinutes);
                if (!isWidgetSlotStartInFuture(date, start)) {
                    cursor = cursor.plusMinutes(30);
                    continue;
                }
                if (isActuallyBookable(company.getId(), consultant.getId(), start, end, type.getId())) {
                    String iso = DATE_TIME_FORMAT.format(start);
                    String key = consultantId == null
                            ? iso + "::" + consultant.getId()
                            : iso;
                    deduped.putIfAbsent(key, new PublicBookingWidgetController.AvailabilitySlotResponse(
                            consultant.getId() + "|" + start + "|" + end,
                            cursor.format(SLOT_LABEL_FORMAT),
                            iso,
                            DATE_TIME_FORMAT.format(end),
                            consultant.getId(),
                            consultantFullName(consultant)
                    ));
                }
                cursor = cursor.plusMinutes(30);
            }
        }

        return new ArrayList<>(deduped.values());
    }

    /**
     * Parses {@link User#getWorkingHoursJson()} ({@code sameForAllDays}, {@code allDays}, {@code byDay}) like the
     * calendar frontend. Missing config or closed day yields empty.
     */
    private Optional<TimeWindow> resolveConsultantWorkingWindow(User consultant, LocalDate date) {
        String raw = consultant.getWorkingHoursJson();
        if (raw == null || raw.isBlank()) {
            return Optional.empty();
        }
        try {
            JsonNode root = JSON.readTree(raw);
            boolean sameForAllDays = root.path("sameForAllDays").asBoolean(false);
            JsonNode block;
            if (sameForAllDays) {
                block = root.get("allDays");
            } else {
                block = root.path("byDay").get(date.getDayOfWeek().name());
            }
            if (block == null || block.isNull() || !block.isObject()) {
                return Optional.empty();
            }
            LocalTime start = parseWorkingHoursTime(block.path("start").asText(null));
            LocalTime end = parseWorkingHoursTime(block.path("end").asText(null));
            if (start == null || end == null || !end.isAfter(start)) {
                return Optional.empty();
            }
            return Optional.of(new TimeWindow(start, end));
        } catch (Exception ex) {
            return Optional.empty();
        }
    }

    private static LocalTime parseWorkingHoursTime(String text) {
        if (text == null || text.isBlank()) {
            return null;
        }
        String t = text.trim();
        try {
            return LocalTime.parse(t);
        } catch (Exception ex) {
            try {
                return LocalTime.parse(t, DateTimeFormatter.ofPattern("H:mm"));
            } catch (Exception ex2) {
                return null;
            }
        }
    }

    private record TimeWindow(LocalTime start, LocalTime end) {}

    private static String widgetSlotMergeKey(PublicBookingWidgetController.AvailabilitySlotResponse s, Long requestConsultantId) {
        if (requestConsultantId == null) {
            return s.startTime() + "::" + (s.consultantId() == null ? "0" : s.consultantId());
        }
        return s.startTime();
    }

    private List<PublicBookingWidgetController.AvailabilitySlotResponse> sortAvailabilitySlots(
            Map<String, PublicBookingWidgetController.AvailabilitySlotResponse> merged
    ) {
        TreeMap<LocalDateTime, List<PublicBookingWidgetController.AvailabilitySlotResponse>> byStart = new TreeMap<>();
        for (PublicBookingWidgetController.AvailabilitySlotResponse s : merged.values()) {
            LocalDateTime t = LocalDateTime.parse(s.startTime(), DATE_TIME_FORMAT);
            byStart.computeIfAbsent(t, k -> new ArrayList<>()).add(s);
        }
        List<PublicBookingWidgetController.AvailabilitySlotResponse> out = new ArrayList<>();
        for (List<PublicBookingWidgetController.AvailabilitySlotResponse> group : byStart.values()) {
            group.sort(Comparator.comparing(
                    PublicBookingWidgetController.AvailabilitySlotResponse::consultantName,
                    Comparator.nullsFirst(String.CASE_INSENSITIVE_ORDER)
            ));
            out.addAll(group);
        }
        return out;
    }

    private List<PublicBookingWidgetController.AvailabilitySlotResponse> buildFallbackSlots(
            Company company,
            WidgetConfig cfg,
            SessionType type,
            LocalDate date,
            Long consultantId
    ) {
        LocalDate today = LocalDate.now(widgetZoneId);
        if (date.isBefore(today)) {
            return new ArrayList<>();
        }

        int durationMinutes = type.getDurationMinutes() != null ? type.getDurationMinutes() : cfg.sessionLengthMinutes();
        LocalTime rangeStart;
        LocalTime rangeEnd;
        if (consultantId != null) {
            User consultant = users.findAllByCompanyId(company.getId()).stream()
                    .filter(u -> u.getId().equals(consultantId))
                    .findFirst()
                    .orElse(null);
            if (consultant == null) {
                return new ArrayList<>();
            }
            Optional<TimeWindow> w = resolveConsultantWorkingWindow(consultant, date);
            if (w.isEmpty()) {
                return new ArrayList<>();
            }
            rangeStart = w.get().start();
            rangeEnd = w.get().end();
        } else {
            rangeStart = cfg.workingHoursStart();
            rangeEnd = cfg.workingHoursEnd();
        }

        List<PublicBookingWidgetController.AvailabilitySlotResponse> items = new ArrayList<>();
        LocalTime cursor = rangeStart;
        while (!cursor.plusMinutes(durationMinutes).isAfter(rangeEnd)) {
            LocalDateTime start = date.atTime(cursor);
            if (!isWidgetSlotStartInFuture(date, start)) {
                cursor = cursor.plusMinutes(30);
                continue;
            }
            LocalDateTime fallbackEnd = start.plusMinutes(durationMinutes);
            items.add(new PublicBookingWidgetController.AvailabilitySlotResponse(
                    (consultantId != null ? consultantId : 0L) + "|" + start + "|" + fallbackEnd,
                    cursor.format(SLOT_LABEL_FORMAT),
                    DATE_TIME_FORMAT.format(start),
                    DATE_TIME_FORMAT.format(fallbackEnd),
                    consultantId,
                    null
            ));
            cursor = cursor.plusMinutes(30);
        }
        return items;
    }

    private boolean isWidgetSlotStartInFuture(LocalDate date, LocalDateTime slotStart) {
        LocalDate today = LocalDate.now(widgetZoneId);
        if (date.isBefore(today)) {
            return false;
        }
        if (date.isAfter(today)) {
            return true;
        }
        return slotStart.isAfter(LocalDateTime.now(widgetZoneId));
    }

    private boolean isActuallyBookable(Long companyId, Long consultantId, LocalDateTime start, LocalDateTime end, Long typeId) {
        try {
            bookingCreationService.validateBookingWindow(
                    companyId,
                    List.of(),
                    consultantId,
                    null,
                    start,
                    end,
                    typeId,
                    SessionBookingCreationService.bookingExcludeIds((Long) null),
                    bookingCreationService.isSpacesEnabled(companyId),
                    bookingCreationService.isMultipleSessionsPerSpaceEnabled(companyId),
                    bookingCreationService.isMultipleClientsPerSessionEnabled(companyId),
                    false,
                    false
            );
            return true;
        } catch (ResponseStatusException ex) {
            return false;
        }
    }

    private Client findOrCreateClient(Company company, User actor, PublicBookingWidgetController.BookingRequest request) {
        String normalizedEmail = request.email().trim().toLowerCase(Locale.ROOT);
        String normalizedPhone = request.phone().trim();

        Optional<Client> existing = clients.findAllByCompanyId(company.getId()).stream()
                .filter(client -> client.getEmail() != null && client.getEmail().trim().equalsIgnoreCase(normalizedEmail))
                .findFirst();
        if (existing.isEmpty()) {
            existing = clients.findAllByCompanyId(company.getId()).stream()
                    .filter(client -> client.getPhone() != null && client.getPhone().trim().equals(normalizedPhone))
                    .findFirst();
        }
        if (existing.isPresent()) {
            Client client = existing.get();
            if (client.getAssignedTo() == null) {
                client.setAssignedTo(actor);
            }
            if (client.getEmail() == null || client.getEmail().isBlank()) {
                client.setEmail(normalizedEmail);
            }
            if (client.getPhone() == null || client.getPhone().isBlank()) {
                client.setPhone(normalizedPhone);
                client.setWhatsappPhone(normalizedPhone);
            }
            return clients.save(client);
        }

        Client client = new Client();
        client.setCompany(company);
        client.setAssignedTo(actor);
        client.setFirstName(request.firstName().trim());
        client.setLastName(request.lastName().trim());
        client.setEmail(normalizedEmail);
        client.setPhone(normalizedPhone);
        client.setWhatsappPhone(normalizedPhone);
        client.setWhatsappOptIn(false);
        client.setActive(true);
        client.setBatchPaymentEnabled(false);
        return clients.save(client);
    }

    private User resolveConsultantForBooking(Long companyId, Long consultantId, boolean availabilityEnabled) {
        if (consultantId == null) {
            if (availabilityEnabled) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A consultant-backed slot is required when availability is enabled.");
            }
            return null;
        }

        return users.findAllByCompanyId(companyId).stream()
                .filter(User::isActive)
                .filter(user -> user.getId().equals(consultantId))
                .filter(this::isBookableConsultant)
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid consultant."));
    }

    private User resolveAdminActor(Long companyId) {
        return users.findAllByCompanyId(companyId).stream()
                .filter(User::isActive)
                .filter(user -> user.getRole() == Role.ADMIN)
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "No admin user available for tenancy."));
    }

    private List<User> supportedConsultants(Long companyId, SessionType type) {
        return users.findAllByCompanyId(companyId).stream()
                .filter(User::isActive)
                .filter(this::isBookableConsultant)
                .filter(consultant -> consultantSupportsType(consultant, type))
                .sorted(Comparator.comparing(this::consultantFullName, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    private boolean isBookableConsultant(User user) {
        return user.isConsultant() || user.getRole() == Role.CONSULTANT;
    }

    private boolean consultantSupportsType(User consultant, SessionType type) {
        return consultant.getTypes() == null
                || consultant.getTypes().isEmpty()
                || consultant.getTypes().stream().anyMatch(t -> t.getId().equals(type.getId()));
    }

    private String consultantFullName(User consultant) {
        return (consultant.getFirstName() + " " + consultant.getLastName()).trim();
    }

    private boolean withinDateRange(BookableSlot slot, LocalDate date) {
        if (slot.getStartDate() != null && date.isBefore(slot.getStartDate())) return false;
        if (slot.getEndDate() != null && date.isAfter(slot.getEndDate())) return false;
        return true;
    }

    private SessionType resolveType(Long companyId, Long typeId) {
        SessionType type = types.findAllWithLinkedServicesByCompanyId(companyId).stream()
                .filter(candidate -> candidate.getId().equals(typeId))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid service."));
        if (!isWebsiteBookingEnabled(type)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This service is not available for website booking.");
        }
        return type;
    }

    private Company resolveCompany(String tenantCode) {
        return companies.findAll().stream()
                .filter(company -> company.getTenantCode() != null)
                .filter(company -> company.getTenantCode().equalsIgnoreCase(tenantCode))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown tenant code."));
    }

    private LocalDate parseDate(String value) {
        try {
            return LocalDate.parse(value, DATE_FORMAT);
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid date. Use YYYY-MM-DD.");
        }
    }

    private LocalDateTime parseStartTime(String value, LocalDate fallbackDate) {
        try {
            if (value.contains("T")) {
                return LocalDateTime.parse(value, DATE_TIME_FORMAT);
            }
            return LocalDateTime.of(fallbackDate, LocalTime.parse(value));
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid startTime.");
        }
    }

    private String toPriceLabel(SessionType type) {
        BigDecimal min = type.getLinkedServices() == null ? null : type.getLinkedServices().stream()
                .map(link -> link.getPrice())
                .filter(price -> price != null)
                .min(BigDecimal::compareTo)
                .orElse(null);
        return min == null ? null : "€" + min.stripTrailingZeros().toPlainString();
    }

    private WidgetConfig loadConfig(Long companyId) {
        Map<String, String> values = settings.findAllByCompanyId(companyId).stream()
                .collect(Collectors.toMap(s -> s.getKey(), s -> s.getValue(), (a, b) -> b));
        boolean availabilityEnabled = !"false".equalsIgnoreCase(values.getOrDefault(SettingKey.BOOKABLE_ENABLED.name(), "true"));
        boolean typesEnabled = !"false".equalsIgnoreCase(values.getOrDefault(SettingKey.TYPES_ENABLED.name(), "true"));
        int sessionLengthMinutes = parseInteger(values.get(SettingKey.SESSION_LENGTH_MINUTES.name()), 60);
        LocalTime workingHoursStart = parseTime(values.get(SettingKey.WORKING_HOURS_START.name()), LocalTime.of(8, 0));
        LocalTime workingHoursEnd = parseTime(values.get(SettingKey.WORKING_HOURS_END.name()), LocalTime.of(18, 0));
        String companyName = values.getOrDefault(SettingKey.COMPANY_NAME.name(), "Calendra");
        return new WidgetConfig(companyName, availabilityEnabled, typesEnabled, sessionLengthMinutes, workingHoursStart, workingHoursEnd);
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

    private record WidgetConfig(
            String companyName,
            boolean availabilityEnabled,
            boolean typesEnabled,
            int sessionLengthMinutes,
            LocalTime workingHoursStart,
            LocalTime workingHoursEnd
    ) {}
}
