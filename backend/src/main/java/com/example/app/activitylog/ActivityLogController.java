package com.example.app.activitylog;

import com.example.app.security.SecurityUtils;
import com.example.app.user.User;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/activity-logs")
public class ActivityLogController {
    private static final int MAX_PAGE_SIZE = 200;

    private final ActivityLogRepository repository;
    private final ObjectMapper objectMapper;

    public ActivityLogController(ActivityLogRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    public record ActivityLogResponse(
            Long id,
            Instant occurredAt,
            ActivityActorType actorType,
            Long actorUserId,
            String actorName,
            ActivityModule module,
            ActivityAction action,
            String entityType,
            Long entityId,
            String entityLabel,
            String secondaryEntityType,
            Long secondaryEntityId,
            String secondaryEntityLabel,
            String summary,
            Long locationId,
            Long spaceId,
            String source,
            Map<String, Object> details
    ) {}

    public record ActivityLogPage(
            List<ActivityLogResponse> content,
            int page,
            int size,
            long totalElements,
            int totalPages
    ) {}

    @GetMapping
    public ActivityLogPage list(
            @AuthenticationPrincipal User me,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) ActivityModule module,
            @RequestParam(required = false) ActivityAction action,
            @RequestParam(required = false) ActivityActorType actorType,
            @RequestParam(required = false) Long actorUserId,
            @RequestParam(required = false) Long locationId,
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size
    ) {
        requireAdmin(me);
        int safePage = Math.max(0, page);
        int safeSize = Math.max(1, Math.min(MAX_PAGE_SIZE, size));
        Long companyId = me.getCompany().getId();

        Specification<ActivityLog> spec = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("companyId"), companyId));
            if (module != null) predicates.add(cb.equal(root.get("module"), module));
            if (action != null) predicates.add(cb.equal(root.get("actionCode"), action));
            if (actorType != null) predicates.add(cb.equal(root.get("actorType"), actorType));
            if (actorUserId != null) predicates.add(cb.equal(root.get("actorUserId"), actorUserId));
            if (locationId != null) predicates.add(cb.equal(root.get("locationId"), locationId));
            if (from != null) predicates.add(cb.greaterThanOrEqualTo(root.get("occurredAt"), from));
            if (to != null) predicates.add(cb.lessThanOrEqualTo(root.get("occurredAt"), to));
            if (search != null && !search.isBlank()) {
                String pattern = "%" + search.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("summary")), pattern),
                        cb.like(cb.lower(root.get("actorNameSnapshot")), pattern),
                        cb.like(cb.lower(root.get("entityLabel")), pattern),
                        cb.like(cb.lower(root.get("secondaryEntityLabel")), pattern)
                ));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };

        Page<ActivityLog> result = repository.findAll(
                spec,
                PageRequest.of(safePage, safeSize, Sort.by(Sort.Direction.DESC, "occurredAt", "id"))
        );
        return new ActivityLogPage(
                result.getContent().stream().map(this::toResponse).toList(),
                result.getNumber(),
                result.getSize(),
                result.getTotalElements(),
                result.getTotalPages()
        );
    }

    private ActivityLogResponse toResponse(ActivityLog row) {
        return new ActivityLogResponse(
                row.getId(), row.getOccurredAt(), row.getActorType(), row.getActorUserId(), row.getActorNameSnapshot(),
                row.getModule(), row.getActionCode(), row.getEntityType(), row.getEntityId(), row.getEntityLabel(),
                row.getSecondaryEntityType(), row.getSecondaryEntityId(), row.getSecondaryEntityLabel(), row.getSummary(),
                row.getLocationId(), row.getSpaceId(), row.getSource(), parseDetails(row.getDetailsJson())
        );
    }

    private Map<String, Object> parseDetails(String json) {
        if (json == null || json.isBlank()) return Map.of();
        try {
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (Exception ignored) {
            return Map.of();
        }
    }

    private static void requireAdmin(User me) {
        if (me == null || me.getCompany() == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        if (!SecurityUtils.isAdmin(me)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Activity log is available to administrators only.");
    }
}
