package com.example.app.guest.catalog;

import com.example.app.client.Client;
import com.example.app.common.SimulatedTimeContext;
import com.example.app.common.TimeService;
import com.example.app.guest.common.GuestDtos;
import com.example.app.guest.common.GuestSettingsService;
import com.example.app.guest.model.GuestProduct;
import com.example.app.guest.model.GuestProductRepository;
import com.example.app.guest.model.GuestUser;
import com.example.app.guest.model.ProductType;
import com.example.app.session.BookableSlot;
import com.example.app.session.BookableSlotRepository;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingCreationService;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.SessionBookingStatus;
import com.example.app.session.SessionType;
import com.example.app.session.TypeTransactionService;
import com.example.app.session.SessionTypeRepository;
import com.example.app.settings.CourseModuleAccessService;
import com.example.app.settings.TenantGeneralSettingsService;
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
import java.util.Map;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class GuestCatalogService {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final int SLOT_GRID_MINUTES = 30;

    private final SessionTypeRepository sessionTypes;
    private final GuestProductRepository guestProducts;
    private final BookableSlotRepository bookableSlots;
    private final SessionBookingRepository bookings;
    private final UserRepository users;
    private final SessionBookingCreationService bookingCreationService;
    private final GuestSettingsService guestSettings;
    private final TimeService timeService;
    private final CourseModuleAccessService courseModuleAccessService;
    private final TenantGeneralSettingsService tenantGeneralSettingsService;
    private final ZoneId zoneId;

    public GuestCatalogService(
            SessionTypeRepository sessionTypes,
            GuestProductRepository guestProducts,
            BookableSlotRepository bookableSlots,
            SessionBookingRepository bookings,
            UserRepository users,
            SessionBookingCreationService bookingCreationService,
            GuestSettingsService guestSettings,
            TimeService timeService,
            CourseModuleAccessService courseModuleAccessService,
            TenantGeneralSettingsService tenantGeneralSettingsService,
            @Value("${app.reminders.timezone:Europe/Ljubljana}") String timezoneId
    ) {
        this.sessionTypes = sessionTypes;
        this.guestProducts = guestProducts;
        this.bookableSlots = bookableSlots;
        this.bookings = bookings;
        this.users = users;
        this.bookingCreationService = bookingCreationService;
        this.guestSettings = guestSettings;
        this.timeService = timeService;
        this.courseModuleAccessService = courseModuleAccessService;
        this.tenantGeneralSettingsService = tenantGeneralSettingsService;
        this.zoneId = ZoneId.of((timezoneId == null || timezoneId.isBlank()) ? "Europe/Ljubljana" : timezoneId.trim());
    }

    @Transactional(readOnly = true)
    public List<GuestDtos.ProductResponse> products(Long companyId, GuestUser guestUser) {
        SimulatedTimeContext.set(companyId);
        List<GuestDtos.ProductResponse> out = new ArrayList<>();
        boolean billingEnabled = !Boolean.FALSE.equals(guestSettings.billingEnabled(companyId));
        boolean coursesEnabled = courseModuleAccessService == null || courseModuleAccessService.isEnabled(companyId);
        String defaultCurrency = tenantCurrency(companyId);
        for (SessionType type : sessionTypes.findAllWithLinkedServicesByCompanyId(companyId)) {
            if (!isVisibleInGuestServiceStep(companyId, type, guestUser)) continue;
            BigDecimal price = sessionTypePriceGross(type);
            String productType = Boolean.TRUE.equals(type.isWidgetGroupBookingEnabled()) ? "CLASS_TICKET" : "SESSION_SINGLE";
            out.add(new GuestDtos.ProductResponse(
                    derivedProductId(type),
                    type.getName(),
                    productType,
                    price.doubleValue(),
                    defaultCurrency,
                    String.valueOf(type.getId()),
                    type.getName(),
                    true,
                    type.getDescription(),
                    type.getDurationMinutes() == null ? 60 : type.getDurationMinutes(),
                    null,
                    null,
                    null
            ));
        }
        for (GuestProduct product : guestProducts.findAllByCompanyIdAndActiveTrueAndGuestVisibleTrueOrderBySortOrderAscIdAsc(companyId)) {
            if (product.getCourse() != null) continue;
            if (product.getProductType() == ProductType.COURSE && (!coursesEnabled || product.getSessionType() == null)) continue;
            if (!billingEnabled && !product.isBookable()) continue;
            // Course access entitlements are sellable wallet products that only use
            // their linked service type for accounting/VAT mapping. They should not
            // be hidden just because the linked service type is not visible/bookable
            // in the guest booking service step.
            if (product.getProductType() != ProductType.COURSE
                    && product.getSessionType() != null
                    && !isVisibleInGuestServiceStep(companyId, product.getSessionType(), guestUser)) continue;
            out.add(new GuestDtos.ProductResponse(
                    String.valueOf(product.getId()),
                    product.getName(),
                    product.getProductType().name(),
                    product.getPriceGross().doubleValue(),
                    product.getCurrency(),
                    product.getSessionType() == null ? null : String.valueOf(product.getSessionType().getId()),
                    product.getSessionType() == null ? null : product.getSessionType().getName(),
                    product.isBookable(),
                    product.getDescription() != null ? product.getDescription() : product.getSessionType() == null ? null : product.getSessionType().getDescription(),
                    product.getSessionType() != null && product.getSessionType().getDurationMinutes() != null ? product.getSessionType().getDurationMinutes() : 60,
                    product.getPromoText(),
                    product.getValidityDays(),
                    product.getUsageLimit()
            ));
        }
        out.sort(Comparator.comparing(GuestDtos.ProductResponse::name, String.CASE_INSENSITIVE_ORDER));
        return out;
    }

    @Transactional(readOnly = true)
    public GuestDtos.AvailabilityResponse availability(Long companyId, Long sessionTypeId, String dateText, GuestUser guestUser) {
        return availability(companyId, sessionTypeId, dateText, null, guestUser);
    }

    @Transactional(readOnly = true)
    public GuestDtos.AvailabilityResponse availability(Long companyId, Long sessionTypeId, String dateText, Long consultantId, GuestUser guestUser) {
        SimulatedTimeContext.set(companyId);
        LocalDate date = LocalDate.parse(dateText);
        SessionType type = sessionTypes.findById(sessionTypeId)
                .filter(t -> Objects.equals(t.getCompany().getId(), companyId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Service not found."));
        if (!isVisibleInGuestServiceStep(companyId, type, guestUser)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This service is not available in the guest app.");
        }
        LocalDate today = timeService.localDate(tenantZoneId(companyId));
        if (date.isBefore(today)) {
            return new GuestDtos.AvailabilityResponse(String.valueOf(type.getId()), date.toString(), List.of());
        }
        int durationMinutes = type.getDurationMinutes() == null ? 60 : type.getDurationMinutes();

        if (isGuestGroupService(type)) {
            List<GuestDtos.AvailabilitySlotResponse> groupSlots = guestGroupSessionSlots(companyId, type, date, consultantId, guestUser);
            return new GuestDtos.AvailabilityResponse(String.valueOf(type.getId()), date.toString(), groupSlots);
        }

        Map<String, GuestDtos.AvailabilitySlotResponse> merged = new LinkedHashMap<>();
        addSlotsFromBookableWindows(companyId, type, date, durationMinutes, consultantId, merged);
        addSlotsFromWorkingHours(companyId, type, date, durationMinutes, consultantId, merged);

        List<GuestDtos.AvailabilitySlotResponse> sorted = merged.values().stream()
                .sorted(Comparator.comparing(GuestDtos.AvailabilitySlotResponse::startsAt).thenComparing(GuestDtos.AvailabilitySlotResponse::endsAt))
                .toList();
        return new GuestDtos.AvailabilityResponse(String.valueOf(type.getId()), date.toString(), sorted);
    }

    @Transactional(readOnly = true)
    public List<GuestDtos.ConsultantResponse> consultants(Long companyId, Long sessionTypeId) {
        SessionType type = sessionTypes.findById(sessionTypeId)
                .filter(t -> Objects.equals(t.getCompany().getId(), companyId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Service not found."));
        if (!isGuestBookable(type)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This service is not enabled for the guest app.");
        }
        return supportedGuestConsultants(companyId, type).stream()
                .map(u -> new GuestDtos.ConsultantResponse(
                        String.valueOf(u.getId()),
                        u.getFirstName(),
                        u.getLastName(),
                        u.getEmail()
                ))
                .toList();
    }

    public ResolvedProduct resolveProduct(Long companyId, String productId) {
        return resolveProduct(companyId, productId, null);
    }

    public ResolvedProduct resolveProduct(Long companyId, String productId, GuestUser guestUser) {
        if (productId == null || productId.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing product identifier.");
        if (productId.startsWith("session-")) {
            Long typeId = parseId(productId.substring("session-".length()));
            SessionType type = sessionTypes.findById(typeId)
                    .filter(t -> Objects.equals(t.getCompany().getId(), companyId))
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Service not found."));
            if (!isVisibleInGuestServiceStep(companyId, type, guestUser)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This service is not available in the guest app.");
            }
            BigDecimal price = sessionTypePriceGross(type);
            return new ResolvedProduct(null, type, type.getName(), type.isWidgetGroupBookingEnabled() ? "CLASS_TICKET" : "SESSION_SINGLE", price, tenantCurrency(companyId), true);
        }
        GuestProduct product = guestProducts.findByIdAndCompanyId(parseId(productId), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Product not found."));
        boolean coursesEnabled = courseModuleAccessService == null || courseModuleAccessService.isEnabled(companyId);
        if (product.getCourse() != null || !product.isActive() || !product.isGuestVisible()
                || (product.getProductType() == ProductType.COURSE && (!coursesEnabled || product.getSessionType() == null))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This product is not available in the guest app.");
        }
        if (Boolean.FALSE.equals(guestSettings.billingEnabled(companyId)) && !product.isBookable()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Purchases are disabled for this tenant.");
        }
        // Course access entitlements are non-booking products. The linked service
        // type is required for billing/accounting, but its booking visibility must
        // not block purchase from Wallet Buy / widget / client wallet flows.
        if (product.getProductType() != ProductType.COURSE
                && product.getSessionType() != null
                && !isVisibleInGuestServiceStep(companyId, product.getSessionType(), guestUser)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This service is not available in the guest app.");
        }
        return new ResolvedProduct(product, product.getSessionType(), product.getName(), product.getProductType().name(), product.getPriceGross(), product.getCurrency(), product.isBookable());
    }

    public SlotPayload parseSlotId(String slotId) {
        try {
            String[] parts = slotId.split("\\|");
            return new SlotPayload(Long.parseLong(parts[0]), LocalDateTime.parse(parts[1]), LocalDateTime.parse(parts[2]));
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid slot identifier.");
        }
    }


    public SlotPayload requireBookableRescheduleSlot(
            Long companyId,
            Long sessionTypeId,
            String slotId,
            Long excludeBookingId,
            GuestUser guestUser
    ) {
        if (isGroupSlotToken(slotId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Group-session slots cannot be used for rescheduling.");
        }
        SlotPayload slot = parseSlotId(slotId);
        if (slot.startsAt() == null || slot.endsAt() == null || !slot.endsAt().isAfter(slot.startsAt())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid slot identifier.");
        }
        SessionType type = sessionTypes.findById(sessionTypeId)
                .filter(t -> Objects.equals(t.getCompany().getId(), companyId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Service not found."));
        if (!isVisibleInGuestServiceStep(companyId, type, guestUser)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This service is not available in the guest app.");
        }
        if (isGuestGroupService(type)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Group-session bookings cannot be rescheduled to a private slot.");
        }
        int durationMinutes = type.getDurationMinutes() == null ? 60 : type.getDurationMinutes();
        if (!slot.endsAt().equals(slot.startsAt().plusMinutes(durationMinutes))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected slot no longer matches the booking service duration.");
        }
        LocalDate slotDate = slot.startsAt().toLocalDate();
        if (!isGuestSlotStartInFuture(companyId, slotDate, slot.startsAt())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected slot is no longer bookable.");
        }
        User consultant = users.findByIdAndCompanyId(slot.consultantId(), companyId)
                .filter(User::isActive)
                .filter(this::isBookableGuestConsultant)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Consultant not found."));
        if (!consultantSupportsSessionType(consultant, type)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Consultant does not offer this service.");
        }
        if (!isSlotInsideConfiguredGuestAvailability(companyId, type, consultant, slot, durationMinutes)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected slot is outside the current guest booking availability.");
        }
        try {
            bookingCreationService.validateBookingWindow(
                    companyId,
                    List.of(),
                    consultant.getId(),
                    null,
                    slot.startsAt(),
                    slot.endsAt(),
                    type.getId(),
                    SessionBookingCreationService.bookingExcludeIds(excludeBookingId),
                    bookingCreationService.isSpacesEnabled(companyId),
                    bookingCreationService.isMultipleSessionsPerSpaceEnabled(companyId),
                    bookingCreationService.isMultipleClientsPerSessionEnabled(companyId),
                    false,
                    false
            );
        } catch (ResponseStatusException ex) {
            if (HttpStatus.CONFLICT.equals(ex.getStatusCode())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Selected slot is no longer available. Please choose another time.");
            }
            throw ex;
        }
        return slot;
    }

    public GuestSettingsService.GuestBookingRules bookingRules(Long companyId) {
        return guestSettings.bookingRules(companyId);
    }

    /**
     * Matches public widget semantics: consultants with no explicit session types are treated as offering every type.
     */
    private boolean consultantSupportsSessionType(User consultant, SessionType type) {
        if (consultant == null) {
            return false;
        }
        Set<SessionType> types = consultant.getTypes();
        if (types == null || types.isEmpty()) {
            return true;
        }
        return types.stream().anyMatch(t -> Objects.equals(t.getId(), type.getId()));
    }

    private boolean isBookableGuestConsultant(User user) {
        return user.isConsultant() || user.getRole() == Role.CONSULTANT;
    }

    private List<User> supportedGuestConsultants(Long companyId, SessionType type) {
        return users.findAllByCompanyId(companyId).stream()
                .filter(User::isActive)
                .filter(this::isBookableGuestConsultant)
                .filter(u -> consultantSupportsSessionType(u, type))
                .sorted(Comparator.comparing(u -> ((u.getFirstName() + " " + u.getLastName()).trim()), String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    private void addSlotsFromBookableWindows(Long companyId, SessionType type, LocalDate date, int durationMinutes,
                                             Long requiredConsultantId,
                                             Map<String, GuestDtos.AvailabilitySlotResponse> merged) {
        DayOfWeek dayOfWeek = date.getDayOfWeek();
        List<BookableSlot> windows = bookableSlots.findAllForWidgetByCompanyId(companyId).stream()
                .filter(slot -> slot.getConsultant() != null)
                .filter(slot -> slot.getConsultant().isActive())
                .filter(slot -> requiredConsultantId == null
                        || Objects.equals(slot.getConsultant().getId(), requiredConsultantId))
                .filter(slot -> slot.getDayOfWeek() == dayOfWeek)
                .filter(slot -> slot.isIndefinite() || withinBookableDateRange(slot, date))
                .filter(slot -> consultantSupportsSessionType(slot.getConsultant(), type))
                .sorted(Comparator.comparing((BookableSlot s) -> s.getConsultant().getId()).thenComparing(BookableSlot::getStartTime))
                .toList();

        for (BookableSlot window : windows) {
            LocalTime cursor = window.getStartTime();
            while (!cursor.plusMinutes(durationMinutes).isAfter(window.getEndTime())) {
                LocalDateTime start = date.atTime(cursor);
                LocalDateTime end = start.plusMinutes(durationMinutes);
                if (!isGuestSlotStartInFuture(companyId, date, start)) {
                    cursor = cursor.plusMinutes(SLOT_GRID_MINUTES);
                    continue;
                }
                if (isActuallyGuestBookable(companyId, window.getConsultant().getId(), start, end, type.getId())) {
                    String id = slotToken(window.getConsultant().getId(), start, end);
                    merged.putIfAbsent(availabilityMergeKey(start, end), new GuestDtos.AvailabilitySlotResponse(id, start.toString(), end.toString(), true));
                }
                cursor = cursor.plusMinutes(SLOT_GRID_MINUTES);
            }
        }
    }

    private void addSlotsFromWorkingHours(Long companyId, SessionType type, LocalDate date, int durationMinutes,
                                          Long requiredConsultantId,
                                          Map<String, GuestDtos.AvailabilitySlotResponse> merged) {
        for (User consultant : supportedGuestConsultants(companyId, type)) {
            if (requiredConsultantId != null && !Objects.equals(consultant.getId(), requiredConsultantId)) {
                continue;
            }
            Optional<TimeWindow> dayWindow = resolveConsultantWorkingWindow(consultant, date);
            if (dayWindow.isEmpty()) {
                continue;
            }
            LocalTime rangeEnd = dayWindow.get().end();
            LocalTime cursor = dayWindow.get().start();
            while (!cursor.plusMinutes(durationMinutes).isAfter(rangeEnd)) {
                LocalDateTime start = date.atTime(cursor);
                LocalDateTime end = start.plusMinutes(durationMinutes);
                if (!isGuestSlotStartInFuture(companyId, date, start)) {
                    cursor = cursor.plusMinutes(SLOT_GRID_MINUTES);
                    continue;
                }
                if (isActuallyGuestBookable(companyId, consultant.getId(), start, end, type.getId())) {
                    String id = slotToken(consultant.getId(), start, end);
                    merged.putIfAbsent(availabilityMergeKey(start, end), new GuestDtos.AvailabilitySlotResponse(id, start.toString(), end.toString(), true));
                }
                cursor = cursor.plusMinutes(SLOT_GRID_MINUTES);
            }
        }
    }


    private boolean isSlotInsideConfiguredGuestAvailability(
            Long companyId,
            SessionType type,
            User consultant,
            SlotPayload slot,
            int durationMinutes
    ) {
        LocalDate date = slot.startsAt().toLocalDate();
        if (isSlotInsideBookableWindow(companyId, type, consultant, slot, date, durationMinutes)) {
            return true;
        }
        Optional<TimeWindow> workingWindow = resolveConsultantWorkingWindow(consultant, date);
        return workingWindow
                .map(window -> generatedSlotMatchesWindow(slot, window.start(), window.end(), durationMinutes))
                .orElse(false);
    }

    private boolean isSlotInsideBookableWindow(
            Long companyId,
            SessionType type,
            User consultant,
            SlotPayload slot,
            LocalDate date,
            int durationMinutes
    ) {
        DayOfWeek dayOfWeek = date.getDayOfWeek();
        return bookableSlots.findAllForWidgetByCompanyId(companyId).stream()
                .filter(window -> window.getConsultant() != null)
                .filter(window -> Objects.equals(window.getConsultant().getId(), consultant.getId()))
                .filter(window -> window.getConsultant().isActive())
                .filter(window -> window.getDayOfWeek() == dayOfWeek)
                .filter(window -> window.isIndefinite() || withinBookableDateRange(window, date))
                .filter(window -> consultantSupportsSessionType(window.getConsultant(), type))
                .anyMatch(window -> generatedSlotMatchesWindow(slot, window.getStartTime(), window.getEndTime(), durationMinutes));
    }

    private boolean generatedSlotMatchesWindow(SlotPayload slot, LocalTime windowStart, LocalTime windowEnd, int durationMinutes) {
        if (windowStart == null || windowEnd == null || !windowEnd.isAfter(windowStart)) {
            return false;
        }
        LocalTime cursor = windowStart;
        while (!cursor.plusMinutes(durationMinutes).isAfter(windowEnd)) {
            LocalDateTime candidateStart = slot.startsAt().toLocalDate().atTime(cursor);
            LocalDateTime candidateEnd = candidateStart.plusMinutes(durationMinutes);
            if (candidateStart.equals(slot.startsAt()) && candidateEnd.equals(slot.endsAt())) {
                return true;
            }
            cursor = cursor.plusMinutes(SLOT_GRID_MINUTES);
        }
        return false;
    }

    private boolean isGuestSlotStartInFuture(Long companyId, LocalDate date, LocalDateTime slotStart) {
        ZoneId effectiveZone = tenantZoneId(companyId);
        LocalDate today = timeService.localDate(effectiveZone);
        if (date.isBefore(today)) {
            return false;
        }
        if (date.isAfter(today)) {
            return true;
        }
        return slotStart.isAfter(timeService.localDateTime(effectiveZone));
    }

    private String tenantCurrency(Long companyId) {
        if (tenantGeneralSettingsService == null) return "EUR";
        return TenantGeneralSettingsService.normalizeCurrency(tenantGeneralSettingsService.resolve(companyId).currency());
    }

    private ZoneId tenantZoneId(Long companyId) {
        if (tenantGeneralSettingsService == null) return zoneId;
        return TenantGeneralSettingsService.zoneIdOrDefault(tenantGeneralSettingsService.resolve(companyId).timeZone());
    }

    private boolean isActuallyGuestBookable(Long companyId, Long consultantId, LocalDateTime start, LocalDateTime end, Long typeId) {
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

    private static boolean withinBookableDateRange(BookableSlot slot, LocalDate date) {
        if (slot.getStartDate() != null && date.isBefore(slot.getStartDate())) {
            return false;
        }
        if (slot.getEndDate() != null && date.isAfter(slot.getEndDate())) {
            return false;
        }
        return true;
    }

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

    private boolean isVisibleInGuestServiceStep(Long companyId, SessionType type, GuestUser guestUser) {
        if (!isGuestBookable(type)) {
            return false;
        }
        if (!isGuestGroupService(type)) {
            return true;
        }
        return hasVisibleGuestGroupSession(companyId, type, guestUser);
    }

    private boolean isGuestGroupService(SessionType type) {
        return type != null && type.isGroupBookingEnabled() && type.getMaxParticipantsPerSession() != null;
    }

    private boolean hasVisibleGuestGroupSession(Long companyId, SessionType type, GuestUser guestUser) {
        LocalDateTime now = timeService.localDateTime(tenantZoneId(companyId), companyId);
        LocalDateTime to = now.plusMonths(6);
        return bookings.findPublicGroupSessionCandidates(companyId, type.getId(), now.toLocalDate().atStartOfDay(), to)
                .stream()
                .collect(java.util.stream.Collectors.groupingBy(this::groupKeyOf, LinkedHashMap::new, java.util.stream.Collectors.toList()))
                .values()
                .stream()
                .anyMatch(rows -> guestCanJoinGroupRows(type, rows, guestUser));
    }

    private List<GuestDtos.AvailabilitySlotResponse> guestGroupSessionSlots(
            Long companyId,
            SessionType type,
            LocalDate date,
            Long consultantId,
            GuestUser guestUser
    ) {
        LocalDateTime from = date.atStartOfDay();
        LocalDateTime to = date.plusDays(1).atStartOfDay();
        return bookings.findPublicGroupSessionCandidates(companyId, type.getId(), from, to)
                .stream()
                .collect(java.util.stream.Collectors.groupingBy(this::groupKeyOf, LinkedHashMap::new, java.util.stream.Collectors.toList()))
                .values()
                .stream()
                .map(rows -> toGuestGroupSlot(type, rows, consultantId, guestUser))
                .filter(Objects::nonNull)
                .sorted(Comparator.comparing(GuestDtos.AvailabilitySlotResponse::startsAt))
                .toList();
    }

    private GuestDtos.AvailabilitySlotResponse toGuestGroupSlot(
            SessionType type,
            List<SessionBooking> rows,
            Long consultantId,
            GuestUser guestUser
    ) {
        if (rows == null || rows.isEmpty()) return null;
        SessionBooking representative = rows.stream()
                .min(Comparator.comparing(SessionBooking::getId))
                .orElse(rows.get(0));
        if (representative.getStartTime() == null || !representative.getStartTime().isAfter(timeService.localDateTime(tenantZoneId(representative.getCompany().getId())))) {
            return null;
        }
        if (consultantId != null) {
            Long bookingConsultantId = representative.getConsultant() == null ? null : representative.getConsultant().getId();
            if (!Objects.equals(bookingConsultantId, consultantId)) {
                return null;
            }
        }
        if (!guestCanJoinGroupRows(type, rows, guestUser)) {
            return null;
        }
        String slotId = groupSlotToken(representative.getId(), representative.getStartTime(), representative.getEndTime());
        return new GuestDtos.AvailabilitySlotResponse(
                slotId,
                representative.getStartTime().toString(),
                representative.getEndTime().toString(),
                true
        );
    }

    private boolean guestCanJoinGroupRows(SessionType type, List<SessionBooking> rows, GuestUser guestUser) {
        if (rows == null || rows.isEmpty()) return false;
        SessionBooking representative = rows.stream()
                .min(Comparator.comparing(SessionBooking::getId))
                .orElse(rows.get(0));
        if (representative.getStartTime() == null || !representative.getStartTime().isAfter(timeService.localDateTime(tenantZoneId(representative.getCompany().getId())))) {
            return false;
        }
        boolean hasBlockingSessionRow = rows.stream()
                .anyMatch(row -> SessionBookingStatus.isAvailabilityBlocking(row.getBookingStatus()));
        if (!hasBlockingSessionRow) {
            return false;
        }
        Integer maxParticipants = type.getMaxParticipantsPerSession();
        Set<String> limitedEmails = parseGuestLimitUserEmails(type.getGuestLimitUserEmails());
        String guestEmail = normalizeEmail(guestUser == null ? null : guestUser.getEmail());
        if (!guestEmail.isBlank()) {
            boolean guestAlreadyBooked = rows.stream()
                    .filter(row -> SessionBookingStatus.isAvailabilityBlocking(row.getBookingStatus()))
                    .map(SessionBooking::getClient)
                    .filter(Objects::nonNull)
                    .anyMatch(client -> guestEmail.equals(normalizeEmail(client.getEmail())));
            if (guestAlreadyBooked) {
                return false;
            }
        }
        boolean guestLimited = limitedEmails.contains(guestEmail);
        long totalBookedParticipants = rows.stream()
                .filter(row -> SessionBookingStatus.isAvailabilityBlocking(row.getBookingStatus()))
                .map(SessionBooking::getClient)
                .filter(Objects::nonNull)
                .map(Client::getId)
                .distinct()
                .count();
        if (maxParticipants != null && totalBookedParticipants >= maxParticipants) {
            return false;
        }
        if (limitedEmails.isEmpty() || guestLimited || maxParticipants == null) {
            return true;
        }
        int publicLimit = Math.max(0, maxParticipants - limitedEmails.size());
        if (publicLimit <= 0) {
            return false;
        }
        long publicBookedParticipants = rows.stream()
                .filter(row -> SessionBookingStatus.isAvailabilityBlocking(row.getBookingStatus()))
                .map(SessionBooking::getClient)
                .filter(Objects::nonNull)
                .filter(client -> !limitedEmails.contains(normalizeEmail(client.getEmail())))
                .map(Client::getId)
                .distinct()
                .count();
        return publicBookedParticipants < publicLimit;
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

    private String groupKeyOf(SessionBooking booking) {
        if (booking.getBookingGroupKey() != null && !booking.getBookingGroupKey().isBlank()) {
            return booking.getBookingGroupKey();
        }
        return "legacy-" + booking.getId();
    }

    public static boolean isGroupSlotToken(String slotId) {
        return slotId != null && slotId.startsWith("group|");
    }

    public static Long groupBookingIdFromSlotToken(String slotId) {
        if (!isGroupSlotToken(slotId)) return null;
        String[] parts = slotId.split("\\|");
        if (parts.length < 4) return null;
        try {
            return Long.parseLong(parts[1]);
        } catch (Exception ex) {
            return null;
        }
    }

    private static String groupSlotToken(Long representativeBookingId, LocalDateTime start, LocalDateTime end) {
        return "group|" + representativeBookingId + "|" + start + "|" + end;
    }

    private boolean isGuestBookable(SessionType type) {
        return type != null && type.isActive() && type.isGuestBookingEnabled();
    }

    public static String derivedProductId(SessionType type) {
        return "session-" + type.getId();
    }

    /**
     * Session types store per-linked-service net prices; guest checkout and app UI require gross.
     */
    private static BigDecimal sessionTypePriceGross(SessionType type) {
        if (type == null || type.getLinkedServices() == null || type.getLinkedServices().isEmpty()) {
            return BigDecimal.ZERO;
        }
        BigDecimal total = BigDecimal.ZERO;
        for (TypeTransactionService link : type.getLinkedServices()) {
            if (link == null || link.getTransactionService() == null) {
                continue;
            }
            BigDecimal net = link.getPrice() != null ? link.getPrice() : link.getTransactionService().getNetPrice();
            if (net == null) {
                net = BigDecimal.ZERO;
            }
            BigDecimal multiplier = link.getTransactionService().getTaxRate() == null
                    ? BigDecimal.ZERO
                    : link.getTransactionService().getTaxRate().multiplier;
            BigDecimal gross = net.add(net.multiply(multiplier)).setScale(2, java.math.RoundingMode.HALF_UP);
            total = total.add(gross);
        }
        return total.setScale(2, java.math.RoundingMode.HALF_UP);
    }

    private static String slotToken(Long consultantId, LocalDateTime start, LocalDateTime end) {
        return consultantId + "|" + start + "|" + end;
    }

    private static String availabilityMergeKey(LocalDateTime start, LocalDateTime end) {
        return start + "|" + end;
    }

    private static Long parseId(String raw) {
        try {
            return Long.parseLong(raw.trim());
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid identifier.");
        }
    }

    public record ResolvedProduct(GuestProduct persistedProduct, SessionType sessionType, String name, String productType, BigDecimal priceGross, String currency, boolean bookable) {}
    public record SlotPayload(Long consultantId, LocalDateTime startsAt, LocalDateTime endsAt) {}
}
