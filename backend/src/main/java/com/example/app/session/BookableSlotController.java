package com.example.app.session;

import com.example.app.security.SecurityUtils;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.Instant;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/bookable-slots")
public class BookableSlotController {
    private final BookableSlotRepository repo;
    private final UserRepository users;

    public BookableSlotController(BookableSlotRepository repo, UserRepository users) {
        this.repo = repo;
        this.users = users;
    }

    public record Request(DayOfWeek dayOfWeek, LocalTime startTime, LocalTime endTime, Long consultantId, boolean indefinite, LocalDate startDate, LocalDate endDate) {}
    public record UserSummary(Long id, String firstName, String lastName, String email, Role role) {}
    public record Response(
            Long id,
            DayOfWeek dayOfWeek,
            LocalTime startTime,
            LocalTime endTime,
            UserSummary consultant,
            boolean indefinite,
            LocalDate startDate,
            LocalDate endDate,
            Instant createdAt,
            Instant updatedAt
    ) {}

    @GetMapping
    public List<Response> list(@AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var rows = SecurityUtils.isAdmin(me)
                ? repo.findAllByCompanyId(companyId)
                : repo.findByConsultantIdAndCompanyId(me.getId(), companyId);
        return rows.stream().map(BookableSlotController::toResponse).toList();
    }

    @PostMapping
    public Response create(@RequestBody Request req, @AuthenticationPrincipal User me) {
        var s = new BookableSlot();
        apply(s, req, me);
        validateNoOverlap(s, null);
        return toResponse(repo.save(s));
    }

    @PutMapping("/{id}")
    public Response update(@PathVariable Long id, @RequestBody Request req, @AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var s = repo.findByIdAndCompanyId(id, companyId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!SecurityUtils.isAdmin(me) && !s.getConsultant().getId().equals(me.getId())) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        apply(s, req, me);
        validateNoOverlap(s, id);
        return toResponse(repo.save(s));
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var s = repo.findByIdAndCompanyId(id, companyId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!SecurityUtils.isAdmin(me) && !s.getConsultant().getId().equals(me.getId())) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        repo.delete(s);
    }

    private void apply(BookableSlot s, Request req, User me) {
        s.setCompany(me.getCompany());
        s.setDayOfWeek(req.dayOfWeek());
        s.setStartTime(req.startTime());
        s.setEndTime(req.endTime());
        s.setIndefinite(req.indefinite());
        if (req.startTime() == null || req.endTime() == null || req.dayOfWeek() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Day of week, start time and end time are required");
        }
        if (!req.endTime().isAfter(req.startTime())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "End time must be after start time");
        }
        if (req.indefinite()) {
            // Indefinite slots intentionally have no date bounds.
            s.setStartDate(null);
            s.setEndDate(null);
        } else {
            if (req.startDate() == null || req.endDate() == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Start date and end date are required for limited date range");
            }
            if (req.endDate().isBefore(req.startDate())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "End date must be on or after start date");
            }
            s.setStartDate(req.startDate());
            s.setEndDate(req.endDate());
        }
        var consultant = SecurityUtils.isAdmin(me)
                ? users.findByIdAndCompanyId(req.consultantId(), me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST))
                : me;
        if (!consultant.isConsultant() && consultant.getRole() != Role.CONSULTANT) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected user is not marked as consultant");
        }
        s.setConsultant(consultant);
    }

    private void validateNoOverlap(BookableSlot s, Long excludeId) {
        Long consultantId = s.getConsultant().getId();
        if (consultantId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Consultant is required");
        }
        // PostgreSQL cannot infer type for untyped NULL parameters inside "? is null" checks;
        // pass concrete LocalDate values for query parameters in all cases.
        LocalDate queryStartDate = s.isIndefinite() ? LocalDate.of(1970, 1, 1) : s.getStartDate();
        LocalDate queryEndDate = s.isIndefinite() ? LocalDate.of(2999, 12, 31) : s.getEndDate();
        boolean exists = repo.existsOverlappingSlotByCompanyId(
                s.getCompany().getId(),
                consultantId,
                s.getDayOfWeek(),
                s.getStartTime(),
                s.getEndTime(),
            queryStartDate,
            queryEndDate,
                s.isIndefinite(),
                excludeId
        );
        if (exists) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Overlapping bookable slot for this consultant and time.");
        }
    }

    private static Response toResponse(BookableSlot s) {
        var u = s.getConsultant();
        var consultant = new UserSummary(u.getId(), u.getFirstName(), u.getLastName(), u.getEmail(), u.getRole());
        return new Response(
                s.getId(),
                s.getDayOfWeek(),
                s.getStartTime(),
                s.getEndTime(),
                consultant,
                s.isIndefinite(),
                s.getStartDate(),
                s.getEndDate(),
                s.getCreatedAt(),
                s.getUpdatedAt()
        );
    }
}
