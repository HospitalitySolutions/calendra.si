package com.example.app.session;

import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.guest.catalog.GuestCatalogService;
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

    public BookingSlotHoldService(
            BookingSlotHoldRepository holds,
            CompanyRepository companies,
            UserRepository users,
            SessionBookingRepository bookings,
            SessionBookingCreationService bookingCreationService
    ) {
        this.holds = holds;
        this.companies = companies;
        this.users = users;
        this.bookings = bookings;
        this.bookingCreationService = bookingCreationService;
    }

    public record HoldRequest(String slotId, List<Long> serviceTypeIds, String previousHoldToken) {}
    public record HoldResponse(String holdToken, Instant expiresAt, String slotId) {}

    @Transactional
    public HoldResponse create(Long companyId, HoldRequest request) {
        if (companyId == null) throw badRequest("Company is required.");
        Company company = companies.findByIdForUpdate(companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Company not found."));
        String slotId = clean(request == null ? null : request.slotId(), 500);
        if (slotId.isBlank()) throw badRequest("Slot is required.");
        String previous = clean(request == null ? null : request.previousHoldToken(), 100);
        Instant now = Instant.now();
        holds.deleteExpired(now);
        if (!previous.isBlank()) {
            holds.findByHoldToken(previous)
                    .filter(row -> Objects.equals(row.getCompany().getId(), companyId))
                    .ifPresent(holds::delete);
        }

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
            SessionServicePlanService.Plan plan = bookingCreationService.validateServiceChainWindow(
                    companyId, List.of(), consultant.getId(), slot.startsAt(), services, List.of(), false, previous
            );
            if (!Objects.equals(plan.endTime(), slot.endsAt())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "This time no longer matches the selected services.");
            }
            hold.setConsultant(consultant);
            hold.setSlotStart(plan.startTime());
            hold.setSlotEnd(plan.endTime());
            hold.setBusyEnd(plan.availabilityEndTime());
        }

        holds.saveAndFlush(hold);
        return new HoldResponse(hold.getHoldToken(), hold.getExpiresAt(), hold.getSlotId());
    }

    @Transactional(readOnly = true)
    public BookingSlotHold requireValid(Long companyId, String token, String slotId) {
        String cleanToken = clean(token, 100);
        if (cleanToken.isBlank()) return null; // Backwards compatibility for older app/widget versions.
        BookingSlotHold hold = holds.findByHoldToken(cleanToken)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "Your 15-minute reservation has expired. Please choose the time again."));
        if (hold.getCompany() == null || !Objects.equals(hold.getCompany().getId(), companyId)
                || hold.getExpiresAt() == null || !hold.getExpiresAt().isAfter(Instant.now())
                || slotId == null || !slotId.trim().equals(hold.getSlotId())) {
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
