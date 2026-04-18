package com.example.app.session;

import com.example.app.company.CompanyRepository;
import com.example.app.reminder.ReminderService;
import com.example.app.security.SecurityUtils;
import com.example.app.user.Role;
import com.example.app.user.User;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
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
    private final ReminderService reminderService;

    public SessionBookingController(SessionBookingRepository repo,
                                    BookableSlotRepository bookableSlots,
                                    PersonalCalendarBlockRepository personalBlocks, CalendarTodoRepository calendarTodos,
                                    CompanyRepository companies,
                                    SessionBookingCreationService bookingCreationService,
                                    ReminderService reminderService) {
        this.repo = repo;
        this.bookableSlots = bookableSlots;
        this.personalBlocks = personalBlocks;
        this.calendarTodos = calendarTodos;
        this.companies = companies;
        this.bookingCreationService = bookingCreationService;
        this.reminderService = reminderService;
    }

    public record BookingRequest(
            Long clientId,
            List<Long> clientIds,
            Long consultantId,
            String startTime,
            String endTime,
            Long spaceId,
            Long typeId,
            String notes,
            String meetingLink,
            Boolean online,
            String meetingProvider,
            Boolean allowPersonalBlockOverlap,
            Long groupId,
            /** When non-null, replaces session-only group email override (empty string clears). */
            String groupEmailOverride,
            /** When non-null: &gt;0 = company id, &lt;=0 clears billing company override for this session. */
            Long groupBillingCompanyIdOverride
    ) {}

    public record UserSummary(Long id, String firstName, String lastName, String email, Role role) {}
    public record ClientSummary(Long id, String firstName, String lastName, String email, String phone) {}
    public record SpaceSummary(Long id, String name) {}
    public record TypeSummary(Long id, String name, Integer durationMinutes, Integer breakMinutes, Integer maxParticipantsPerSession) {}
    public record GroupBillingCompanySummary(Long id, String name) {}

    public record BookingResponse(
            Long id,
            String bookingGroupKey,
            ClientSummary client,
            List<ClientSummary> clients,
            UserSummary consultant,
            LocalDateTime startTime,
            LocalDateTime endTime,
            SpaceSummary space,
            TypeSummary type,
            String notes,
            String meetingLink,
            String meetingProvider,
            Long groupId,
            String sessionGroupEmailOverride,
            GroupBillingCompanySummary sessionGroupBillingCompany
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
        return groupedBookingResponses(rows);
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
        var aGroup = loadGroupedRows(a, companyId);
        var bGroup = loadGroupedRows(b, companyId);
        var aRep = aGroup.get(0);
        var bRep = bGroup.get(0);
        if (aRep.getConsultant() == null || bRep.getConsultant() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot swap unassigned sessions.");
        }
        if (!SecurityUtils.isAdmin(me)
                && (!aRep.getConsultant().getId().equals(me.getId()) || !bRep.getConsultant().getId().equals(me.getId()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        boolean spacesEnabled = bookingCreationService.isSpacesEnabled(companyId);
        boolean multipleSessionsPerSpaceEnabled = bookingCreationService.isMultipleSessionsPerSpaceEnabled(companyId);
        boolean multipleClientsPerSessionEnabled = bookingCreationService.isMultipleClientsPerSessionEnabled(companyId);
        var aStart = aRep.getStartTime();
        var aEnd = aRep.getEndTime();
        var bStart = bRep.getStartTime();
        var bEnd = bRep.getEndTime();
        for (var row : aGroup) {
            row.setStartTime(bStart);
            row.setEndTime(bEnd);
        }
        for (var row : bGroup) {
            row.setStartTime(aStart);
            row.setEndTime(aEnd);
        }
        var excludes = new ArrayList<Long>();
        aGroup.forEach(row -> excludes.add(row.getId()));
        bGroup.forEach(row -> excludes.add(row.getId()));
        boolean aOnline = aRep.getMeetingLink() != null && !aRep.getMeetingLink().isBlank();
        boolean bOnline = bRep.getMeetingLink() != null && !bRep.getMeetingLink().isBlank();
        bookingCreationService.validateBookingWindow(
                companyId,
                clientIdsOf(aGroup),
                aRep.getConsultant().getId(),
                aRep.getSpace() != null ? aRep.getSpace().getId() : null,
                aRep.getStartTime(),
                aRep.getEndTime(),
                aRep.getType() != null ? aRep.getType().getId() : null,
                excludes,
                spacesEnabled,
                multipleSessionsPerSpaceEnabled,
                multipleClientsPerSessionEnabled,
                aOnline,
                false
        );
        bookingCreationService.validateBookingWindow(
                companyId,
                clientIdsOf(bGroup),
                bRep.getConsultant().getId(),
                bRep.getSpace() != null ? bRep.getSpace().getId() : null,
                bRep.getStartTime(),
                bRep.getEndTime(),
                bRep.getType() != null ? bRep.getType().getId() : null,
                excludes,
                spacesEnabled,
                multipleSessionsPerSpaceEnabled,
                multipleClientsPerSessionEnabled,
                bOnline,
                false
        );
        if (intervalsOverlap(aRep.getStartTime(), effectiveEnd(aRep), bRep.getStartTime(), effectiveEnd(bRep))) {
            boolean sameConsultant = aRep.getConsultant().getId().equals(bRep.getConsultant().getId());
            boolean sameClient = clientIdsOf(aGroup).stream().anyMatch(clientIdsOf(bGroup)::contains);
            Long spaceA = aRep.getSpace() != null ? aRep.getSpace().getId() : null;
            Long spaceB = bRep.getSpace() != null ? bRep.getSpace().getId() : null;
            boolean bothLive = !aOnline && !bOnline;
            boolean sameSpace = spacesEnabled && !multipleSessionsPerSpaceEnabled && bothLive && spaceA != null && spaceA.equals(spaceB);
            if (sameConsultant) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "This consultant already has a session at that time.");
            }
            if (sameClient) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "One of the selected clients already has a session at that time.");
            }
            if (sameSpace) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "This space is already booked at that time.");
            }
        }
        repo.saveAll(aGroup);
        repo.saveAll(bGroup);
        if (!aRep.getStartTime().equals(aStart) || !aRep.getEndTime().equals(aEnd)) {
            for (var row : aGroup) {
                reminderService.sendSessionRescheduled(row, aStart, aEnd);
            }
        }
        if (!bRep.getStartTime().equals(bStart) || !bRep.getEndTime().equals(bEnd)) {
            for (var row : bGroup) {
                reminderService.sendSessionRescheduled(row, bStart, bEnd);
            }
        }
        return List.of(toGroupedResponse(aGroup), toGroupedResponse(bGroup));
    }

    public record SwapRequest(Long firstId, Long secondId) {}

    @DeleteMapping("/{id}")
    @Transactional
    public void delete(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var booking = repo.findByIdAndCompanyId(id, companyId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        var grouped = loadGroupedRows(booking, companyId);
        var representative = grouped.get(0);
        if (!SecurityUtils.isAdmin(me)
                && (representative.getConsultant() == null || !representative.getConsultant().getId().equals(me.getId()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        for (var row : grouped) {
            reminderService.sendSessionCancelled(row);
        }
        repo.deleteAll(grouped);
    }

    public record PersonalBlockSummary(Long id, Long ownerId, LocalDateTime startTime, LocalDateTime endTime, String task, String notes) {}
    public record TodoSummary(Long id, Long ownerId, LocalDateTime startTime, String task, String notes) {}

    @GetMapping("/calendar")
    @Transactional(readOnly = true)
    public Map<String, Object> calendar(@RequestParam LocalDate from, @RequestParam LocalDate to, @AuthenticationPrincipal User me) {
        var result = new HashMap<String, Object>();
        var companyId = me.getCompany().getId();
        var bookings = groupedBookingResponses((SecurityUtils.isAdmin(me) ? repo.findAllByCompanyId(companyId) : repo.findByConsultantIdAndCompanyId(me.getId(), companyId)).stream()
                .filter(b -> !b.getStartTime().toLocalDate().isBefore(from) && !b.getStartTime().toLocalDate().isAfter(to))
                .toList());
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
        return toGroupedResponse(List.of(b));
    }

    static List<BookingResponse> groupedBookingResponses(List<SessionBooking> rows) {
        Map<String, List<SessionBooking>> grouped = new LinkedHashMap<>();
        rows.stream()
                .sorted((a, b) -> {
                    int byStart = a.getStartTime().compareTo(b.getStartTime());
                    if (byStart != 0) return byStart;
                    return a.getId().compareTo(b.getId());
                })
                .forEach(row -> grouped.computeIfAbsent(groupKey(row), ignored -> new ArrayList<>()).add(row));
        return grouped.values().stream().map(SessionBookingController::toGroupedResponse).toList();
    }

    static BookingResponse toGroupedResponse(List<SessionBooking> rows) {
        if (rows == null || rows.isEmpty()) {
            throw new IllegalArgumentException("rows are required");
        }
        var ordered = rows.stream().sorted((a, b) -> a.getId().compareTo(b.getId())).toList();
        var representative = ordered.get(0);
        var clientSummaries = ordered.stream()
                .map(SessionBooking::getClient)
                .filter(Objects::nonNull)
                .collect(
                        LinkedHashMap<Long, ClientSummary>::new,
                        (map, client) -> map.putIfAbsent(client.getId(), new ClientSummary(
                                client.getId(),
                                client.getFirstName(),
                                client.getLastName(),
                                client.getEmail(),
                                client.getPhone()
                        )),
                        LinkedHashMap::putAll
                )
                .values()
                .stream()
                .toList();
        var client = clientSummaries.isEmpty() ? null : clientSummaries.get(0);
        var u = representative.getConsultant();
        UserSummary consultant = u == null ? null
                : new UserSummary(u.getId(), u.getFirstName(), u.getLastName(), u.getEmail(), u.getRole());
        var space = representative.getSpace() == null ? null : new SpaceSummary(representative.getSpace().getId(), representative.getSpace().getName());
        var type = representative.getType() == null ? null : new TypeSummary(
                representative.getType().getId(),
                representative.getType().getName(),
                representative.getType().getDurationMinutes(),
                representative.getType().getBreakMinutes(),
                representative.getType().getMaxParticipantsPerSession()
        );
        String provider = representative.getMeetingProvider();
        if (provider == null && representative.getMeetingLink() != null && representative.getMeetingLink().contains("meet.google.com")) provider = "google";
        if (provider == null) provider = "zoom";
        var bcOv = representative.getSessionGroupBillingCompany();
        GroupBillingCompanySummary bcSumm =
                bcOv == null ? null : new GroupBillingCompanySummary(bcOv.getId(), bcOv.getName());
        return new BookingResponse(
                representative.getId(),
                groupKey(representative),
                client,
                clientSummaries,
                consultant,
                representative.getStartTime(),
                representative.getEndTime(),
                space,
                type,
                representative.getNotes(),
                representative.getMeetingLink(),
                provider,
                representative.getClientGroup() != null ? representative.getClientGroup().getId() : null,
                representative.getSessionGroupEmailOverride(),
                bcSumm
        );
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

    static String groupKey(SessionBooking booking) {
        if (booking.getBookingGroupKey() != null && !booking.getBookingGroupKey().isBlank()) {
            return booking.getBookingGroupKey();
        }
        return "legacy-" + booking.getId();
    }

    private List<SessionBooking> loadGroupedRows(SessionBooking booking, Long companyId) {
        var rows = repo.findByBookingGroupKeyAndCompanyIdOrderByIdAsc(groupKey(booking), companyId);
        if (rows == null || rows.isEmpty()) {
            return List.of(booking);
        }
        return rows;
    }

    private static List<Long> clientIdsOf(List<SessionBooking> rows) {
        return rows.stream()
                .map(SessionBooking::getClient)
                .filter(Objects::nonNull)
                .map(client -> client.getId())
                .distinct()
                .toList();
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
