package com.example.app.session;

import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.guest.catalog.GuestCatalogService;
import com.example.app.location.Location;
import com.example.app.location.LocationRepository;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class BookingSlotHoldService {
    public static final Duration HOLD_DURATION = Duration.ofMinutes(15);

    private final BookingSlotHoldRepository holds;
    private final CompanyRepository companies;
    private final UserRepository users;
    private final SessionBookingRepository bookings;
    private final SessionBookingCreationService bookingCreationService;
    private final LocationRepository locations;
    private final SessionTypeRepository sessionTypes;

    public BookingSlotHoldService(
            BookingSlotHoldRepository holds,
            CompanyRepository companies,
            UserRepository users,
            SessionBookingRepository bookings,
            SessionBookingCreationService bookingCreationService,
            LocationRepository locations,
            SessionTypeRepository sessionTypes
    ) {
        this.holds = holds;
        this.companies = companies;
        this.users = users;
        this.bookings = bookings;
        this.bookingCreationService = bookingCreationService;
        this.locations = locations;
        this.sessionTypes = sessionTypes;
    }

    public record HoldRequest(Long locationId, String slotId, List<Long> serviceTypeIds, String previousHoldToken) {
        public HoldRequest(String slotId, List<Long> serviceTypeIds, String previousHoldToken) {
            this(null, slotId, serviceTypeIds, previousHoldToken);
        }
    }
    public record HoldResponse(String holdToken, Instant expiresAt, String slotId) {}

    @Transactional
    public HoldResponse create(Long companyId, HoldRequest request) {
        return create(companyId, request, List.of());
    }

    @Transactional
    public HoldResponse create(Long companyId, HoldRequest request, List<Long> clientIds) {
        if (companyId == null) throw badRequest("Company is required.");
        List<Long> validatedClientIds = clientIds == null
                ? List.of()
                : clientIds.stream().filter(id -> id != null && id > 0).distinct().toList();
        Company company = companies.findByIdForUpdate(companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Company not found."));
        String slotId = clean(request == null ? null : request.slotId(), 500);
        if (slotId.isBlank()) throw badRequest("Slot is required.");
        String previous = clean(request == null ? null : request.previousHoldToken(), 100);
        Instant now = Instant.now();
        holds.deleteExpired(now);
        BookingSlotHold previousHold = previous.isBlank()
                ? null
                : holds.findByHoldToken(previous)
                        .filter(row -> row.getCompany() != null
                                && Objects.equals(row.getCompany().getId(), companyId))
                        .orElse(null);
        String excludedPreviousToken = previousHold == null ? "" : previousHold.getHoldToken();

        BookingSlotHold hold = new BookingSlotHold();
        hold.setCompany(company);
        hold.setSlotId(slotId);
        hold.setHoldToken(UUID.randomUUID().toString());
        hold.setExpiresAt(now.plus(HOLD_DURATION));

        if (GuestCatalogService.isGroupSlotToken(slotId)) {
            Long groupSessionId = GuestCatalogService.groupBookingIdFromSlotToken(slotId);
            String[] parts = slotId.split("\\|");
            if (groupSessionId == null || parts.length < 4) throw badRequest("Invalid slot identifier.");
            LocalDateTime start = parseDateTime(parts[2]);
            LocalDateTime end = parseDateTime(parts[3]);
            SessionBooking group = bookings.findById(groupSessionId)
                    .filter(row -> row.getCompany() != null && Objects.equals(row.getCompany().getId(), companyId))
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "This time is no longer available."));
            Location location = group.getLocation();
            if (location == null || !location.isActive() || !location.isPublicBookingEnabled()) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "This location is no longer available.");
            }
            if (request != null && request.locationId() != null && !Objects.equals(request.locationId(), location.getId())) {
                throw badRequest("The selected group session belongs to another location.");
            }
            hold.setLocation(location);
            hold.setGroupSessionId(groupSessionId);
            hold.setSlotStart(start);
            hold.setSlotEnd(end);
            hold.setBusyEnd(end);
            // Group sessions have capacity rather than exclusive availability. The hold token
            // is still required at order creation, while normal group capacity validation remains authoritative.
        } else {
            List<Long> serviceTypeIds = request == null || request.serviceTypeIds() == null
                    ? List.of()
                    : request.serviceTypeIds().stream().filter(id -> id != null && id > 0).toList();
            if (serviceTypeIds.isEmpty()) throw badRequest("At least one service is required.");
            Location location = resolveRequiredLocation(companyId, request == null ? null : request.locationId());
            for (Long serviceTypeId : serviceTypeIds) {
                SessionType type = sessionTypes.findByIdAndCompanyId(serviceTypeId, companyId)
                        .orElseThrow(() -> badRequest("Service is not available."));
                if (!serviceAvailableAt(type, location.getId())) {
                    throw badRequest("Service " + type.getName() + " is not available at the selected location.");
                }
            }
            hold.setLocation(location);
            GuestCatalogService.SlotPayload slot;
            try {
                String[] parts = slotId.split("\\|");
                slot = new GuestCatalogService.SlotPayload(Long.parseLong(parts[0]), parseDateTime(parts[1]), parseDateTime(parts[2]));
            } catch (Exception ex) {
                throw badRequest("Invalid slot identifier.");
            }
            User consultant = users.findById(slot.consultantId())
                    .filter(user -> user.getCompany() != null && Objects.equals(user.getCompany().getId(), companyId))
                    .filter(User::isActive)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "This employee is no longer available."));
            List<SessionBookingController.BookingServiceRequest> services = new java.util.ArrayList<>();
            for (int index = 0; index < serviceTypeIds.size(); index++) {
                services.add(new SessionBookingController.BookingServiceRequest(serviceTypeIds.get(index), index, null));
            }
            SessionServicePlanService.Plan plan = bookingCreationService.validateServiceChainWindowAtLocation(
                    companyId,
                    validatedClientIds,
                    consultant.getId(),
                    slot.startsAt(),
                    services,
                    List.of(),
                    false,
                    excludedPreviousToken,
                    location.getId()
            );
            if (!Objects.equals(plan.endTime(), slot.endsAt())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "This time no longer matches the selected services.");
            }
            hold.setConsultant(consultant);
            hold.setSlotStart(plan.startTime());
            hold.setSlotEnd(plan.endTime());
            hold.setBusyEnd(plan.availabilityEndTime());
        }

        // Keep the previous hold active until the replacement has passed all validation. This makes
        // replacement atomic from the guest's perspective and prevents a failed replacement from
        // losing the original reservation. The old token is excluded during overlap validation above.
        if (previousHold != null) {
            holds.delete(previousHold);
        }
        holds.saveAndFlush(hold);
        return new HoldResponse(hold.getHoldToken(), hold.getExpiresAt(), hold.getSlotId());
    }

    @Transactional(readOnly = true)
    public BookingSlotHold requireValid(Long companyId, String token, String slotId) {
        return requireValid(companyId, token, slotId, null);
    }

    @Transactional(readOnly = true)
    public BookingSlotHold requireValid(Long companyId, String token, String slotId, Long locationId) {
        String cleanToken = clean(token, 100);
        if (cleanToken.isBlank()) return null; // Backwards compatibility for older app/widget versions.
        BookingSlotHold hold = holds.findByHoldToken(cleanToken)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "Your 15-minute reservation has expired. Please choose the time again."));
        if (hold.getCompany() == null || !Objects.equals(hold.getCompany().getId(), companyId)
                || hold.getExpiresAt() == null || !hold.getExpiresAt().isAfter(Instant.now())
                || slotId == null || !slotId.trim().equals(hold.getSlotId())
                || (locationId != null && (hold.getLocation() == null || !Objects.equals(hold.getLocation().getId(), locationId)))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Your 15-minute reservation has expired. Please choose the time again.");
        }
        return hold;
    }

    @Transactional
    public void release(Long companyId, String token) {
        String cleanToken = clean(token, 100);
        if (cleanToken.isBlank()) return;
        holds.findByHoldToken(cleanToken)
                .filter(row -> row.getCompany() != null && Objects.equals(row.getCompany().getId(), companyId))
                .ifPresent(holds::delete);
    }

    @Transactional
    public void consume(Long companyId, String token) {
        release(companyId, token);
    }

    private Location resolveRequiredLocation(Long companyId, Long locationId) {
        if (locationId != null) {
            return locations.findByIdAndCompanyId(locationId, companyId)
                    .filter(Location::isActive)
                    .filter(Location::isPublicBookingEnabled)
                    .orElseThrow(() -> badRequest("Location is not available."));
        }
        List<Location> active = locations.findAllByCompanyIdAndActiveTrueOrderByDefaultLocationDescNameAscIdAsc(companyId).stream()
                .filter(Location::isPublicBookingEnabled)
                .toList();
        if (active.size() == 1) return active.get(0);
        throw badRequest("Location selection is required.");
    }

    private static boolean serviceAvailableAt(SessionType type, Long locationId) {
        if (type == null || locationId == null) return false;
        if (type.isAvailableAllLocations()) return true;
        return type.getLocations() != null && type.getLocations().stream()
                .filter(Objects::nonNull)
                .anyMatch(location -> Objects.equals(location.getId(), locationId));
    }

    private static LocalDateTime parseDateTime(String value) {
        try { return LocalDateTime.parse(value); }
        catch (Exception ex) { throw badRequest("Invalid slot identifier."); }
    }

    private static String clean(String value, int max) {
        String text = value == null ? "" : value.trim();
        return text.length() <= max ? text : text.substring(0, max);
    }

    private static ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
