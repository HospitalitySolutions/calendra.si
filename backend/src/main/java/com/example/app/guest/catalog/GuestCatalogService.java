package com.example.app.guest.catalog;

import com.example.app.guest.common.GuestDtos;
import com.example.app.guest.common.GuestSettingsService;
import com.example.app.guest.model.GuestProduct;
import com.example.app.guest.model.GuestProductRepository;
import com.example.app.session.BookableSlot;
import com.example.app.session.BookableSlotRepository;
import com.example.app.session.SessionBookingCreationService;
import com.example.app.session.SessionType;
import com.example.app.session.SessionTypeRepository;
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
    private final UserRepository users;
    private final SessionBookingCreationService bookingCreationService;
    private final GuestSettingsService guestSettings;
    private final ZoneId zoneId;

    public GuestCatalogService(
            SessionTypeRepository sessionTypes,
            GuestProductRepository guestProducts,
            BookableSlotRepository bookableSlots,
            UserRepository users,
            SessionBookingCreationService bookingCreationService,
            GuestSettingsService guestSettings,
            @Value("${app.reminders.timezone:Europe/Ljubljana}") String timezoneId
    ) {
        this.sessionTypes = sessionTypes;
        this.guestProducts = guestProducts;
        this.bookableSlots = bookableSlots;
        this.users = users;
        this.bookingCreationService = bookingCreationService;
        this.guestSettings = guestSettings;
        this.zoneId = ZoneId.of((timezoneId == null || timezoneId.isBlank()) ? "Europe/Ljubljana" : timezoneId.trim());
    }

    @Transactional(readOnly = true)
    public List<GuestDtos.ProductResponse> products(Long companyId) {
        List<GuestDtos.ProductResponse> out = new ArrayList<>();
        for (SessionType type : sessionTypes.findAllWithLinkedServicesByCompanyId(companyId)) {
            if (!isGuestBookable(type)) continue;
            BigDecimal price = type.getLinkedServices() == null ? null : type.getLinkedServices().stream()
                    .map(link -> link.getPrice())
                    .filter(Objects::nonNull)
                    .min(BigDecimal::compareTo)
                    .orElse(BigDecimal.ZERO);
            String productType = Boolean.TRUE.equals(type.isWidgetGroupBookingEnabled()) ? "CLASS_TICKET" : "SESSION_SINGLE";
            out.add(new GuestDtos.ProductResponse(
                    derivedProductId(type),
                    type.getName(),
                    productType,
                    price.doubleValue(),
                    "EUR",
                    String.valueOf(type.getId()),
                    type.getName(),
                    true,
                    type.getGuestBookingDescription(),
                    type.getDurationMinutes() == null ? 60 : type.getDurationMinutes()
            ));
        }
        for (GuestProduct product : guestProducts.findAllByCompanyIdAndActiveTrueAndGuestVisibleTrueOrderBySortOrderAscIdAsc(companyId)) {
            if (product.getSessionType() != null && !isGuestBookable(product.getSessionType())) continue;
            out.add(new GuestDtos.ProductResponse(
                    String.valueOf(product.getId()),
                    product.getName(),
                    product.getProductType().name(),
                    product.getPriceGross().doubleValue(),
                    product.getCurrency(),
                    product.getSessionType() == null ? null : String.valueOf(product.getSessionType().getId()),
                    product.getSessionType() == null ? null : product.getSessionType().getName(),
                    product.isBookable(),
                    product.getDescription() != null ? product.getDescription() : product.getSessionType() == null ? null : product.getSessionType().getGuestBookingDescription(),
                    product.getSessionType() != null && product.getSessionType().getDurationMinutes() != null ? product.getSessionType().getDurationMinutes() : 60
            ));
        }
        out.sort(Comparator.comparing(GuestDtos.ProductResponse::name, String.CASE_INSENSITIVE_ORDER));
        return out;
    }

    @Transactional(readOnly = true)
    public GuestDtos.AvailabilityResponse availability(Long companyId, Long sessionTypeId, String dateText) {
        LocalDate date = LocalDate.parse(dateText);
        SessionType type = sessionTypes.findById(sessionTypeId)
                .filter(t -> Objects.equals(t.getCompany().getId(), companyId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Service not found."));
        LocalDate today = LocalDate.now(zoneId);
        if (date.isBefore(today)) {
            return new GuestDtos.AvailabilityResponse(String.valueOf(type.getId()), date.toString(), List.of());
        }
        int durationMinutes = type.getDurationMinutes() == null ? 60 : type.getDurationMinutes();

        Map<String, GuestDtos.AvailabilitySlotResponse> merged = new LinkedHashMap<>();
        addSlotsFromBookableWindows(companyId, type, date, durationMinutes, merged);
        addSlotsFromWorkingHours(companyId, type, date, durationMinutes, merged);

        List<GuestDtos.AvailabilitySlotResponse> sorted = merged.values().stream()
                .sorted(Comparator.comparing(GuestDtos.AvailabilitySlotResponse::startsAt).thenComparing(GuestDtos.AvailabilitySlotResponse::endsAt))
                .toList();
        return new GuestDtos.AvailabilityResponse(String.valueOf(type.getId()), date.toString(), sorted);
    }

    public ResolvedProduct resolveProduct(Long companyId, String productId) {
        if (productId == null || productId.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing product identifier.");
        if (productId.startsWith("session-")) {
            Long typeId = parseId(productId.substring("session-".length()));
            SessionType type = sessionTypes.findById(typeId)
                    .filter(t -> Objects.equals(t.getCompany().getId(), companyId))
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Service not found."));
            if (!isGuestBookable(type)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This service is not enabled for the guest app.");
            }
            BigDecimal price = type.getLinkedServices() == null ? null : type.getLinkedServices().stream()
                    .map(link -> link.getPrice())
                    .filter(Objects::nonNull)
                    .min(BigDecimal::compareTo)
                    .orElse(BigDecimal.ZERO);
            return new ResolvedProduct(null, type, type.getName(), type.isWidgetGroupBookingEnabled() ? "CLASS_TICKET" : "SESSION_SINGLE", price, "EUR", true);
        }
        GuestProduct product = guestProducts.findByIdAndCompanyId(parseId(productId), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Product not found."));
        if (product.getSessionType() != null && !isGuestBookable(product.getSessionType())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This service is not enabled for the guest app.");
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
                                             Map<String, GuestDtos.AvailabilitySlotResponse> merged) {
        DayOfWeek dayOfWeek = date.getDayOfWeek();
        List<BookableSlot> windows = bookableSlots.findAllForWidgetByCompanyId(companyId).stream()
                .filter(slot -> slot.getConsultant() != null)
                .filter(slot -> slot.getConsultant().isActive())
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
                if (!isGuestSlotStartInFuture(date, start)) {
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
                                          Map<String, GuestDtos.AvailabilitySlotResponse> merged) {
        for (User consultant : supportedGuestConsultants(companyId, type)) {
            Optional<TimeWindow> dayWindow = resolveConsultantWorkingWindow(consultant, date);
            if (dayWindow.isEmpty()) {
                continue;
            }
            LocalTime rangeEnd = dayWindow.get().end();
            LocalTime cursor = dayWindow.get().start();
            while (!cursor.plusMinutes(durationMinutes).isAfter(rangeEnd)) {
                LocalDateTime start = date.atTime(cursor);
                LocalDateTime end = start.plusMinutes(durationMinutes);
                if (!isGuestSlotStartInFuture(date, start)) {
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

    private boolean isGuestSlotStartInFuture(LocalDate date, LocalDateTime slotStart) {
        LocalDate today = LocalDate.now(zoneId);
        if (date.isBefore(today)) {
            return false;
        }
        if (date.isAfter(today)) {
            return true;
        }
        return slotStart.isAfter(LocalDateTime.now(zoneId));
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

    private boolean isGuestBookable(SessionType type) {
        return type != null && type.isGuestBookingEnabled();
    }

    public static String derivedProductId(SessionType type) {
        return "session-" + type.getId();
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
