package com.example.app.session;

import com.example.app.company.CompanyRepository;
import com.example.app.security.SecurityUtils;
import com.example.app.user.Role;
import com.example.app.user.User;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/bookings")
public class SessionBookingController {
    private final SessionBookingRepository repo;
    private final BookableSlotRepository bookableSlots;
    private final PersonalCalendarBlockRepository personalBlocks;
    private final CalendarTodoRepository calendarTodos;
    private final CompanyRepository companies;
    private final SessionBookingCreationService bookingCreationService;

    public SessionBookingController(SessionBookingRepository repo,
                                    BookableSlotRepository bookableSlots,
                                    PersonalCalendarBlockRepository personalBlocks, CalendarTodoRepository calendarTodos,
                                    CompanyRepository companies,
                                    SessionBookingCreationService bookingCreationService) {
        this.repo = repo;
        this.bookableSlots = bookableSlots;
        this.personalBlocks = personalBlocks;
        this.calendarTodos = calendarTodos;
        this.companies = companies;
        this.bookingCreationService = bookingCreationService;
    }

    public record BookingRequest(Long clientId, Long consultantId, String startTime, String endTime, Long spaceId, Long typeId, String notes, String meetingLink, Boolean online, String meetingProvider, Boolean allowPersonalBlockOverlap) {}
    public record UserSummary(Long id, String firstName, String lastName, String email, Role role) {}
    public record ClientSummary(Long id, String firstName, String lastName, String email, String phone) {}
    public record SpaceSummary(Long id, String name) {}
    public record TypeSummary(Long id, String name) {}
    public record BookingResponse(
            Long id,
            ClientSummary client,
            UserSummary consultant,
            LocalDateTime startTime,
            LocalDateTime endTime,
            SpaceSummary space,
            TypeSummary type,
            String notes,
            String meetingLink,
            String meetingProvider
    ) {}
    public record BookableSlotResponse(
            Long id,
            java.time.DayOfWeek dayOfWeek,
            java.time.LocalTime startTime,
            java.time.LocalTime endTime,
            UserSummary consultant,
            boolean indefinite,
            java.time.LocalDate startDate,
            java.time.LocalDate endDate
    ) {}

    @GetMapping
    @Transactional(readOnly = true)
    public List<BookingResponse> list(@AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var rows = SecurityUtils.isAdmin(me)
                ? repo.findAllByCompanyId(companyId)
                : repo.findByConsultantIdAndCompanyId(me.getId(), companyId);
        return rows.stream().map(SessionBookingController::toResponse).toList();
    }

    @PostMapping
    public BookingResponse create(@RequestBody BookingRequest req, @AuthenticationPrincipal User me) {
        return bookingCreationService.create(req, me);
    }

    @PutMapping("/{id}")
    public BookingResponse update(@PathVariable Long id, @RequestBody BookingRequest req, @AuthenticationPrincipal User me) {
        return bookingCreationService.update(id, req, me);
    }

    @PostMapping("/swap")
    @Transactional
    public List<BookingResponse> swap(@RequestBody SwapRequest req, @AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        companies.findByIdForUpdate(companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Company not found"));
        var a = repo.findByIdAndCompanyId(req.firstId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        var b = repo.findByIdAndCompanyId(req.secondId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (a.getConsultant() == null || b.getConsultant() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot swap unassigned sessions.");
        }
        if (!SecurityUtils.isAdmin(me) && (!a.getConsultant().getId().equals(me.getId()) || !b.getConsultant().getId().equals(me.getId()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        boolean spacesEnabled = bookingCreationService.isSpacesEnabled(companyId);
        var aStart = a.getStartTime();
        var aEnd = a.getEndTime();
        var bStart = b.getStartTime();
        var bEnd = b.getEndTime();
        a.setStartTime(bStart);
        a.setEndTime(bEnd);
        b.setStartTime(aStart);
        b.setEndTime(aEnd);
        var excludes = SessionBookingCreationService.bookingExcludeIds(a.getId(), b.getId());
        boolean aOnline = a.getMeetingLink() != null && !a.getMeetingLink().isBlank();
        boolean bOnline = b.getMeetingLink() != null && !b.getMeetingLink().isBlank();
        bookingCreationService.validateBookingWindow(companyId, a.getConsultant().getId(), a.getSpace() != null ? a.getSpace().getId() : null,
                a.getStartTime(), a.getEndTime(), a.getType() != null ? a.getType().getId() : null, excludes, spacesEnabled, aOnline, false);
        bookingCreationService.validateBookingWindow(companyId, b.getConsultant().getId(), b.getSpace() != null ? b.getSpace().getId() : null,
                b.getStartTime(), b.getEndTime(), b.getType() != null ? b.getType().getId() : null, excludes, spacesEnabled, bOnline, false);
        if (intervalsOverlap(a.getStartTime(), effectiveEnd(a), b.getStartTime(), effectiveEnd(b))) {
            if (!spacesEnabled) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Swapped sessions would overlap.");
            }
            boolean sameConsultant = a.getConsultant().getId().equals(b.getConsultant().getId());
            Long spaceA = a.getSpace() != null ? a.getSpace().getId() : null;
            Long spaceB = b.getSpace() != null ? b.getSpace().getId() : null;
            boolean sameSpace = spaceA != null && spaceA.equals(spaceB);
            boolean bothLive = !aOnline && !bOnline;
            if (sameConsultant || (bothLive && sameSpace)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Swapped sessions would overlap.");
            }
        }
        repo.save(a);
        repo.save(b);
        return List.of(toResponse(a), toResponse(b));
    }

    public record SwapRequest(Long firstId, Long secondId) {}

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var booking = repo.findByIdAndCompanyId(id, companyId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!SecurityUtils.isAdmin(me)
                && (booking.getConsultant() == null || !booking.getConsultant().getId().equals(me.getId()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        repo.delete(booking);
    }

    public record PersonalBlockSummary(Long id, Long ownerId, LocalDateTime startTime, LocalDateTime endTime, String task, String notes) {}
    public record TodoSummary(Long id, Long ownerId, LocalDateTime startTime, String task, String notes) {}

    @GetMapping("/calendar")
    @Transactional(readOnly = true)
    public Map<String, Object> calendar(@RequestParam LocalDate from, @RequestParam LocalDate to, @AuthenticationPrincipal User me) {
        var result = new HashMap<String, Object>();
        var companyId = me.getCompany().getId();
        var bookings = (SecurityUtils.isAdmin(me) ? repo.findAllByCompanyId(companyId) : repo.findByConsultantIdAndCompanyId(me.getId(), companyId)).stream()
                .filter(b -> !b.getStartTime().toLocalDate().isBefore(from) && !b.getStartTime().toLocalDate().isAfter(to))
                .map(SessionBookingController::toResponse)
                .toList();
        var slots = (SecurityUtils.isAdmin(me) ? bookableSlots.findAllByCompanyId(companyId) : bookableSlots.findByConsultantIdAndCompanyId(me.getId(), companyId)).stream()
                .filter(s -> s.isIndefinite() || (s.getStartDate() != null && s.getEndDate() != null && !(to.isBefore(s.getStartDate()) || from.isAfter(s.getEndDate()))))
                .map(SessionBookingController::toResponse)
                .toList();
        var rangeStart = from.atStartOfDay();
        var rangeEnd = to.plusDays(1).atStartOfDay();
        var personal = (SecurityUtils.isAdmin(me)
                ? personalBlocks.findOverlappingByCompany(companyId, rangeStart, rangeEnd)
                : personalBlocks.findOverlapping(me.getId(), companyId, rangeStart, rangeEnd)).stream()
                .map(b -> new PersonalBlockSummary(b.getId(), b.getOwner().getId(), b.getStartTime(), b.getEndTime(), b.getTask(), b.getNotes()))
                .toList();
        var todos = (SecurityUtils.isAdmin(me)
                ? calendarTodos.findByCompanyAndDateRange(companyId, rangeStart, rangeEnd)
                : calendarTodos.findByOwnerAndDateRange(me.getId(), companyId, rangeStart, rangeEnd)).stream()
                .map(t -> new TodoSummary(t.getId(), t.getOwner().getId(), t.getStartTime(), t.getTask(), t.getNotes()))
                .toList();
        result.put("booked", bookings);
        result.put("bookable", slots);
        result.put("personal", personal);
        result.put("todos", todos);
        return result;
    }

    static BookingResponse toResponse(SessionBooking b) {
        var c = b.getClient();
        var client = new ClientSummary(c.getId(), c.getFirstName(), c.getLastName(), c.getEmail(), c.getPhone());
        var u = b.getConsultant();
        UserSummary consultant = u == null ? null
                : new UserSummary(u.getId(), u.getFirstName(), u.getLastName(), u.getEmail(), u.getRole());
        var space = b.getSpace() == null ? null : new SpaceSummary(b.getSpace().getId(), b.getSpace().getName());
        var type = b.getType() == null ? null : new TypeSummary(b.getType().getId(), b.getType().getName());
        String provider = b.getMeetingProvider();
        if (provider == null && b.getMeetingLink() != null && b.getMeetingLink().contains("meet.google.com")) provider = "google";
        if (provider == null) provider = "zoom";
        return new BookingResponse(b.getId(), client, consultant, b.getStartTime(), b.getEndTime(), space, type, b.getNotes(), b.getMeetingLink(), provider);
    }

    private static BookableSlotResponse toResponse(BookableSlot s) {
        var u = s.getConsultant();
        var consultant = new UserSummary(u.getId(), u.getFirstName(), u.getLastName(), u.getEmail(), u.getRole());
        return new BookableSlotResponse(
                s.getId(),
                s.getDayOfWeek(),
                s.getStartTime(),
                s.getEndTime(),
                consultant,
                s.isIndefinite(),
                s.getStartDate(),
                s.getEndDate()
        );
    }

    private static boolean intervalsOverlap(LocalDateTime aStart, LocalDateTime aEnd, LocalDateTime bStart, LocalDateTime bEnd) {
        return aStart.isBefore(bEnd) && aEnd.isAfter(bStart);
    }

    private static LocalDateTime effectiveEnd(SessionBooking booking) {
        int breakMinutes = 0;
        if (booking.getType() != null && booking.getType().getBreakMinutes() != null) {
            breakMinutes = Math.max(0, booking.getType().getBreakMinutes());
        }
        return breakMinutes > 0 ? booking.getEndTime().plusMinutes(breakMinutes) : booking.getEndTime();
    }
}
