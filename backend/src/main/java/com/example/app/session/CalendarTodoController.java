package com.example.app.session;

import com.example.app.google.calendar.GoogleCalendarEntityType;
import com.example.app.google.calendar.GoogleCalendarSyncQueueService;
import com.example.app.security.SecurityUtils;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/bookings/todos")
public class CalendarTodoController {
    private final CalendarTodoRepository repo;
    private final UserRepository users;
    private final GoogleCalendarSyncQueueService googleCalendarSyncQueueService;

    public CalendarTodoController(CalendarTodoRepository repo,
                                  UserRepository users,
                                  GoogleCalendarSyncQueueService googleCalendarSyncQueueService) {
        this.repo = repo;
        this.users = users;
        this.googleCalendarSyncQueueService = googleCalendarSyncQueueService;
    }

    public record TodoRequest(String startTime, String task, String notes, String visibilityScope, List<Long> visibleUserIds) {}
    public record TodoResponse(Long id, Long ownerId, LocalDateTime startTime, String task, String notes,
                               String visibilityScope, List<Long> visibleUserIds) {}

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
        applyVisibility(todo, req, me, companyId, SecurityUtils.isAdmin(me), true);
        todo = repo.save(todo);
        googleCalendarSyncQueueService.enqueueUpsert(todo.getCompany(), todo.getOwner().getId(), GoogleCalendarEntityType.TODO, todo.getId());
        return toResponse(todo);
    }

    @PutMapping("/{id}")
    @Transactional
    public TodoResponse update(@PathVariable Long id, @RequestBody TodoRequest req, @AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var todo = repo.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!canAccess(todo, me)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        var start = parseToLocalDateTime(req.startTime());
        if (req.task() == null || req.task().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "task is required");
        }
        todo.setStartTime(start);
        todo.setTask(req.task().trim());
        todo.setNotes(req.notes() != null ? req.notes().trim() : null);
        applyVisibility(todo, req, me, companyId, SecurityUtils.isAdmin(me), false);
        todo = repo.save(todo);
        googleCalendarSyncQueueService.enqueueUpsert(todo.getCompany(), todo.getOwner().getId(), GoogleCalendarEntityType.TODO, todo.getId());
        return toResponse(todo);
    }

    @DeleteMapping("/{id}")
    @Transactional
    public void delete(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var todo = repo.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!canAccess(todo, me)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        googleCalendarSyncQueueService.enqueueDelete(todo.getCompany(), GoogleCalendarEntityType.TODO, todo.getId());
        repo.delete(todo);
    }

    @GetMapping("/overdue-count")
    @Transactional(readOnly = true)
    public Map<String, Integer> overdueCount(@AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var now = LocalDateTime.now();
        var count = SecurityUtils.isAdmin(me)
                ? repo.findOverdueByOwner(me.getId(), companyId, now).size()
                : repo.findOverdueVisibleByUser(me.getId(), companyId, now, TodoVisibilityScope.ALL).size();
        return Map.of("count", count);
    }

    @GetMapping("/overdue")
    @Transactional(readOnly = true)
    public List<TodoResponse> overdue(@AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var now = LocalDateTime.now();
        var rows = SecurityUtils.isAdmin(me)
                ? repo.findOverdueByOwner(me.getId(), companyId, now)
                : repo.findOverdueVisibleByUser(me.getId(), companyId, now, TodoVisibilityScope.ALL);
        return rows.stream()
                .map(CalendarTodoController::toResponse)
                .toList();
    }

    private void applyVisibility(CalendarTodo todo, TodoRequest req, User me, Long companyId, boolean allowCustom, boolean isCreate) {
        if (!allowCustom) {
            if (isCreate) {
                todo.setVisibilityScope(TodoVisibilityScope.SELECTED);
                todo.getVisibleUsers().clear();
                todo.getVisibleUsers().add(me);
            }
            return;
        }
        var requestedScope = parseVisibilityScope(req.visibilityScope());
        if (!isCreate && req.visibilityScope() == null && req.visibleUserIds() == null) {
            if (todo.getVisibilityScope() == null) todo.setVisibilityScope(TodoVisibilityScope.SELECTED);
            return;
        }
        todo.setVisibilityScope(requestedScope);
        todo.getVisibleUsers().clear();
        if (requestedScope == TodoVisibilityScope.ALL) {
            return;
        }
        var ids = normalizeVisibleUserIds(req.visibleUserIds(), me.getId());
        for (Long userId : ids) {
            var visibleUser = users.findByIdAndCompanyId(userId, companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid visible user id: " + userId));
            todo.getVisibleUsers().add(visibleUser);
        }
    }

    private static TodoVisibilityScope parseVisibilityScope(String value) {
        if (value != null && "ALL".equalsIgnoreCase(value.trim())) {
            return TodoVisibilityScope.ALL;
        }
        return TodoVisibilityScope.SELECTED;
    }

    private static Set<Long> normalizeVisibleUserIds(List<Long> ids, Long currentUserId) {
        var normalized = new LinkedHashSet<Long>();
        if (ids != null) {
            ids.stream()
                    .filter(id -> id != null && id > 0)
                    .forEach(normalized::add);
        }
        if (normalized.isEmpty() && currentUserId != null) {
            normalized.add(currentUserId);
        }
        return normalized;
    }

    private static boolean canAccess(CalendarTodo todo, User me) {
        if (todo == null || me == null || todo.getCompany() == null || me.getCompany() == null) return false;
        if (!todo.getCompany().getId().equals(me.getCompany().getId())) return false;
        if (SecurityUtils.isAdmin(me)) return true;
        if (todo.getOwner() != null && todo.getOwner().getId().equals(me.getId())) return true;
        if (todo.getVisibilityScope() == TodoVisibilityScope.ALL) return true;
        return todo.getVisibleUsers() != null && todo.getVisibleUsers().stream().anyMatch(u -> u.getId().equals(me.getId()));
    }

    private static TodoResponse toResponse(CalendarTodo t) {
        var scope = t.getVisibilityScope() == null ? TodoVisibilityScope.SELECTED : t.getVisibilityScope();
        var visibleUserIds = scope == TodoVisibilityScope.ALL || t.getVisibleUsers() == null
                ? List.<Long>of()
                : t.getVisibleUsers().stream()
                        .map(User::getId)
                        .sorted()
                        .collect(Collectors.toList());
        if (scope == TodoVisibilityScope.SELECTED && visibleUserIds.isEmpty() && t.getOwner() != null) {
            visibleUserIds = List.of(t.getOwner().getId());
        }
        return new TodoResponse(t.getId(), t.getOwner().getId(), t.getStartTime(), t.getTask(), t.getNotes(), scope.name(), visibleUserIds);
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
