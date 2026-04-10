package com.example.app.widget;

import com.example.app.client.Client;
import com.example.app.client.ClientRepository;
import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.session.BookableSlot;
import com.example.app.session.BookableSlotRepository;
import com.example.app.session.SessionBookingController;
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
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.stream.Collectors;
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
    private final UserRepository users;
    private final ClientRepository clients;
    private final SessionBookingCreationService bookingCreationService;
    private final ZoneId widgetZoneId;

    public PublicBookingWidgetService(
            CompanyRepository companies,
            AppSettingRepository settings,
            SessionTypeRepository types,
            BookableSlotRepository bookableSlots,
            UserRepository users,
            ClientRepository clients,
            SessionBookingCreationService bookingCreationService,
            @Value("${app.reminders.timezone:Europe/Ljubljana}") String widgetTimezoneId
    ) {
        this.companies = companies;
        this.settings = settings;
        this.types = types;
        this.bookableSlots = bookableSlots;
        this.users = users;
        this.clients = clients;
        this.bookingCreationService = bookingCreationService;
        this.widgetZoneId = (widgetTimezoneId == null || widgetTimezoneId.isBlank())
                ? ZoneId.of("Europe/Ljubljana")
                : ZoneId.of(widgetTimezoneId.trim());
    }

    public PublicBookingWidgetController.WidgetConfigResponse config(String tenantCode) {
        Company company = resolveCompany(tenantCode);
        var cfg = loadConfig(company.getId());
        return new PublicBookingWidgetController.WidgetConfigResponse(
                company.getTenantCode(),
                cfg.companyName(),
                cfg.availabilityEnabled(),
                cfg.typesEnabled(),
                cfg.sessionLengthMinutes(),
                cfg.workingHoursStart().toString(),
                cfg.workingHoursEnd().toString(),
                widgetZoneId.getId()
        );
    }

    public List<PublicBookingWidgetController.WidgetServiceResponse> services(String tenantCode) {
        Company company = resolveCompany(tenantCode);
        return types.findAllWithLinkedServicesByCompanyId(company.getId()).stream()
                .sorted(Comparator.comparing(SessionType::getName, String.CASE_INSENSITIVE_ORDER))
                .map(type -> new PublicBookingWidgetController.WidgetServiceResponse(
                        type.getId(),
                        type.getName(),
                        type.getDescription(),
                        type.getDurationMinutes() != null ? type.getDurationMinutes() : 60,
                        toPriceLabel(type)
                ))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<PublicBookingWidgetController.WidgetConsultantResponse> consultants(String tenantCode, Long typeId) {
        Company company = resolveCompany(tenantCode);
        SessionType type = resolveType(company.getId(), typeId);
        return supportedConsultants(company.getId(), type).stream()
                .map(consultant -> new PublicBookingWidgetController.WidgetConsultantResponse(
                        consultant.getId(),
                        consultantFullName(consultant)
                ))
                .toList();
    }

    @Transactional(readOnly = true)
    public PublicBookingWidgetController.AvailabilityResponse availability(String tenantCode, Long typeId, String dateText, Long consultantId) {
        Company company = resolveCompany(tenantCode);
        WidgetConfig cfg = loadConfig(company.getId());
        LocalDate date = parseDate(dateText);
        SessionType type = resolveType(company.getId(), typeId);
        Long resolvedConsultantId = consultantId != null ? resolveConsultantForBooking(company.getId(), consultantId, false).getId() : null;

        List<PublicBookingWidgetController.AvailabilitySlotResponse> slots;
        if (cfg.availabilityEnabled()) {
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

        return new PublicBookingWidgetController.AvailabilityResponse(cfg.availabilityEnabled(), DATE_FORMAT.format(date), slots);
    }

    @Transactional
    public PublicBookingWidgetController.BookingResponse createBooking(String tenantCode, PublicBookingWidgetController.BookingRequest request) {
        Company company = resolveCompany(tenantCode);
        WidgetConfig cfg = loadConfig(company.getId());
        SessionType type = resolveType(company.getId(), request.typeId());
        LocalDate date = parseDate(request.date());
        LocalDateTime start = parseStartTime(request.startTime(), date);
        LocalDateTime end = start.plusMinutes(type.getDurationMinutes() != null ? type.getDurationMinutes() : cfg.sessionLengthMinutes());

        if (!start.isAfter(LocalDateTime.now(widgetZoneId))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected time is in the past.");
        }

        User consultant = resolveConsultantForBooking(company.getId(), request.consultantId(), cfg.availabilityEnabled());
        User actor = consultant != null ? consultant : resolveAdminActor(company.getId());
        Client client = findOrCreateClient(company, actor, request);

        SessionBookingController.BookingRequest internalRequest = new SessionBookingController.BookingRequest(
                client.getId(),
                consultant != null ? consultant.getId() : null,
                DATE_TIME_FORMAT.format(start),
                DATE_TIME_FORMAT.format(end),
                null,
                type.getId(),
                "Booked via website widget",
                null,
                false,
                null,
                false
        );

        var booking = bookingCreationService.create(internalRequest, actor);
        String consultantName = booking.consultant() == null
                ? null
                : (booking.consultant().firstName() + " " + booking.consultant().lastName()).trim();
        return new PublicBookingWidgetController.BookingResponse(
                booking.id(),
                booking.type() == null ? type.getName() : booking.type().name(),
                booking.startTime().format(DATE_TIME_FORMAT),
                booking.startTime().format(HUMAN_FORMAT),
                client.getEmail(),
                consultantName
        );
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
                            cursor.format(SLOT_LABEL_FORMAT),
                            iso,
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
                            cursor.format(SLOT_LABEL_FORMAT),
                            iso,
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
            items.add(new PublicBookingWidgetController.AvailabilitySlotResponse(
                    cursor.format(SLOT_LABEL_FORMAT),
                    DATE_TIME_FORMAT.format(start),
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
                    consultantId,
                    null,
                    start,
                    end,
                    typeId,
                    SessionBookingCreationService.bookingExcludeIds((Long) null),
                    bookingCreationService.isSpacesEnabled(companyId),
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
        return types.findAllWithLinkedServicesByCompanyId(companyId).stream()
                .filter(type -> type.getId().equals(typeId))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid service."));
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
