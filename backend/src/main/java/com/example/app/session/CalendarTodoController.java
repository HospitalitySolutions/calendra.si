package com.example.app.session;

import com.example.app.security.SecurityUtils;
import com.example.app.user.User;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/bookings/todos")
public class CalendarTodoController {
    private final CalendarTodoRepository repo;

    public CalendarTodoController(CalendarTodoRepository repo) {
        this.repo = repo;
    }

    public record TodoRequest(String startTime, String task, String notes) {}
    public record TodoResponse(Long id, Long ownerId, LocalDateTime startTime, String task, String notes) {}

    @PostMapping
    @Transactional
    public TodoResponse create(@RequestBody TodoRequest req, @AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var start = parseToLocalDateTime(req.startTime());
        if (req.task() == null || req.task().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "task is required");
        }
        var todo = new CalendarTodo();
        todo.setCompany(me.getCompany());
        todo.setOwner(me);
        todo.setStartTime(start);
        todo.setTask(req.task().trim());
        todo.setNotes(req.notes() != null ? req.notes().trim() : null);
        todo = repo.save(todo);
        return toResponse(todo);
    }

    @PutMapping("/{id}")
    @Transactional
    public TodoResponse update(@PathVariable Long id, @RequestBody TodoRequest req, @AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var todo = repo.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!todo.getOwner().getId().equals(me.getId()) || !todo.getCompany().getId().equals(companyId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        var start = parseToLocalDateTime(req.startTime());
        if (req.task() == null || req.task().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "task is required");
        }
        todo.setStartTime(start);
        todo.setTask(req.task().trim());
        todo.setNotes(req.notes() != null ? req.notes().trim() : null);
        todo = repo.save(todo);
        return toResponse(todo);
    }

    @DeleteMapping("/{id}")
    @Transactional
    public void delete(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var todo = repo.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!todo.getOwner().getId().equals(me.getId()) || !todo.getCompany().getId().equals(me.getCompany().getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        repo.delete(todo);
    }

    @GetMapping("/overdue-count")
    @Transactional(readOnly = true)
    public Map<String, Integer> overdueCount(@AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var now = LocalDateTime.now();
        var count = repo.findOverdueByOwner(me.getId(), companyId, now).size();
        return Map.of("count", count);
    }

    @GetMapping("/overdue")
    @Transactional(readOnly = true)
    public List<TodoResponse> overdue(@AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var now = LocalDateTime.now();
        return repo.findOverdueByOwner(me.getId(), companyId, now).stream()
                .map(CalendarTodoController::toResponse)
                .toList();
    }

    private static TodoResponse toResponse(CalendarTodo t) {
        return new TodoResponse(t.getId(), t.getOwner().getId(), t.getStartTime(), t.getTask(), t.getNotes());
    }

    private static LocalDateTime parseToLocalDateTime(String value) {
        if (value == null || value.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "startTime is required");
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
