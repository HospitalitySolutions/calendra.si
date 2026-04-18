package com.example.app.guest.catalog;

import com.example.app.guest.common.GuestDtos;
import com.example.app.guest.common.GuestSettingsService;
import com.example.app.guest.model.GuestProduct;
import com.example.app.guest.model.GuestProductRepository;
import com.example.app.session.BookableSlot;
import com.example.app.session.BookableSlotRepository;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.SessionType;
import com.example.app.session.SessionTypeRepository;
import com.example.app.user.User;
import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class GuestCatalogService {
    private final SessionTypeRepository sessionTypes;
    private final GuestProductRepository guestProducts;
    private final BookableSlotRepository bookableSlots;
    private final SessionBookingRepository bookings;
    private final GuestSettingsService guestSettings;
    private final ZoneId zoneId;

    public GuestCatalogService(
            SessionTypeRepository sessionTypes,
            GuestProductRepository guestProducts,
            BookableSlotRepository bookableSlots,
            SessionBookingRepository bookings,
            GuestSettingsService guestSettings,
            @Value("${app.reminders.timezone:Europe/Ljubljana}") String timezoneId
    ) {
        this.sessionTypes = sessionTypes;
        this.guestProducts = guestProducts;
        this.bookableSlots = bookableSlots;
        this.bookings = bookings;
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
        int durationMinutes = type.getDurationMinutes() == null ? 60 : type.getDurationMinutes();
        DayOfWeek dayOfWeek = date.getDayOfWeek();
        List<BookableSlot> slots = bookableSlots.findAllForWidgetByCompanyId(companyId).stream()
                .filter(slot -> slot.getDayOfWeek() == dayOfWeek)
                .filter(slot -> slot.isIndefinite() || (slot.getStartDate() == null || !slot.getStartDate().isAfter(date)) && (slot.getEndDate() == null || !slot.getEndDate().isBefore(date)))
                .filter(slot -> consultantSupports(slot.getConsultant(), sessionTypeId))
                .sorted(Comparator.comparing(BookableSlot::getStartTime).thenComparing(slot -> slot.getConsultant().getId()))
                .toList();
        Map<String, GuestDtos.AvailabilitySlotResponse> available = new LinkedHashMap<>();
        for (BookableSlot slot : slots) {
            LocalDateTime start = date.atTime(slot.getStartTime());
            LocalDateTime end = start.plusMinutes(durationMinutes);
            if (!start.isAfter(LocalDateTime.now(zoneId))) continue;
            if (hasOverlappingBooking(companyId, slot.getConsultant().getId(), start, end)) continue;
            String id = slotToken(slot.getConsultant().getId(), start, end);
            available.putIfAbsent(id, new GuestDtos.AvailabilitySlotResponse(id, start.toString(), end.toString(), true));
        }
        return new GuestDtos.AvailabilityResponse(String.valueOf(type.getId()), date.toString(), new ArrayList<>(available.values()));
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

    private boolean consultantSupports(User consultant, Long sessionTypeId) {
        return consultant != null && consultant.getTypes() != null && consultant.getTypes().stream().anyMatch(t -> Objects.equals(t.getId(), sessionTypeId));
    }

    private boolean hasOverlappingBooking(Long companyId, Long consultantId, LocalDateTime start, LocalDateTime end) {
        return bookings.existsOverlappingForConsultantExceptBooking(companyId, consultantId, start, end, -1L);
    }

    private boolean isGuestBookable(SessionType type) {
        return type != null && type.isGuestBookingEnabled();
    }

    public static String derivedProductId(SessionType type) {
        return "session-" + type.getId();
    }

    private static String slotToken(Long consultantId, LocalDateTime start, LocalDateTime end) {
        return consultantId + "|" + start + "|" + end;
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
