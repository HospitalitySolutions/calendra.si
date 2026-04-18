package com.example.app.session;

import com.example.app.security.SecurityUtils;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/bookings/personal-blocks")
public class PersonalCalendarBlockController {
    private final PersonalCalendarBlockRepository repo;
    private final UserRepository users;

    public PersonalCalendarBlockController(PersonalCalendarBlockRepository repo, UserRepository users) {
        this.repo = repo;
        this.users = users;
    }

    public record PersonalBlockRequest(String startTime, String endTime, String task, String notes, Long consultantId) {}
    public record PersonalBlockResponse(Long id, Long ownerId, LocalDateTime startTime, LocalDateTime endTime, String task, String notes) {}

    @PostMapping
    @Transactional
    public PersonalBlockResponse create(@RequestBody PersonalBlockRequest req, @AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var start = parseToLocalDateTime(req.startTime());
        var end = parseToLocalDateTime(req.endTime());
        if (req.task() == null || req.task().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "task is required");
        }
        User owner = me;
        if (SecurityUtils.isAdmin(me) && req.consultantId() != null) {
            owner = users.findByIdAndCompanyId(req.consultantId(), companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid consultant"));
            if (!owner.isConsultant()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected user is not marked as consultant");
            }
        }
        var block = new PersonalCalendarBlock();
        block.setCompany(me.getCompany());
        block.setOwner(owner);
        block.setStartTime(start);
        block.setEndTime(end);
        block.setTask(req.task().trim());
        block.setNotes(req.notes() != null ? req.notes().trim() : null);
        block = repo.save(block);
        return toResponse(block);
    }

    @PutMapping("/{id}")
    @Transactional
    public PersonalBlockResponse update(@PathVariable Long id, @RequestBody PersonalBlockRequest req, @AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var block = repo.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!block.getOwner().getId().equals(me.getId()) || !block.getCompany().getId().equals(companyId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        var start = parseToLocalDateTime(req.startTime());
        var end = parseToLocalDateTime(req.endTime());
        if (req.task() == null || req.task().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "task is required");
        }
        block.setStartTime(start);
        block.setEndTime(end);
        block.setTask(req.task().trim());
        block.setNotes(req.notes() != null ? req.notes().trim() : null);
        block = repo.save(block);
        return toResponse(block);
    }

    @DeleteMapping("/{id}")
    @Transactional
    public void delete(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var block = repo.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!block.getOwner().getId().equals(me.getId()) || !block.getCompany().getId().equals(me.getCompany().getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        repo.delete(block);
    }

    private static PersonalBlockResponse toResponse(PersonalCalendarBlock b) {
        return new PersonalBlockResponse(b.getId(), b.getOwner().getId(), b.getStartTime(), b.getEndTime(), b.getTask(), b.getNotes());
    }

    private static LocalDateTime parseToLocalDateTime(String value) {
        if (value == null || value.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "startTime/endTime are required");
        }
        try {
            if (value.endsWith("Z") || value.matches(".*[+-]\\d\\d:\\d\\d$")) {
                return java.time.OffsetDateTime.parse(value).toLocalDateTime();
            }
            return LocalDateTime.parse(value, DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid date-time: " + value);
        }
    }
}
