package com.example.app.workspaceclient;

import com.example.app.client.Client;
import com.example.app.client.ClientRepository;
import com.example.app.user.User;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/workspace-clients")
public class WorkspaceClientController {
    private final WorkspaceClientRepository workspaceClients;
    private final ClientRepository clients;
    private final WorkspaceClientAccessService access;
    private final WorkspaceClientActivityService activity;
    private final WorkspaceClientDuplicateService duplicates;
    private final ObjectMapper objectMapper;

    public WorkspaceClientController(
            WorkspaceClientRepository workspaceClients,
            ClientRepository clients,
            WorkspaceClientAccessService access,
            WorkspaceClientActivityService activity,
            WorkspaceClientDuplicateService duplicates,
            ObjectMapper objectMapper
    ) {
        this.workspaceClients = workspaceClients;
        this.clients = clients;
        this.access = access;
        this.activity = activity;
        this.duplicates = duplicates;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/search")
    @Transactional(readOnly = true)
    public List<WorkspaceClientView> search(
            @AuthenticationPrincipal User me,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "100") int size
    ) {
        Long workspaceId = access.snapshot(me).workspaceId();
        int safeSize = Math.max(1, Math.min(size, 250));
        List<WorkspaceClient> identities = workspaceClients.searchActive(
                workspaceId, blankToNull(search), PageRequest.of(0, safeSize * 2));
        List<Long> identityIds = identities.stream().map(WorkspaceClient::getId).toList();
        List<Client> visible = access.visibleRelationships(me, identityIds);
        Map<Long, List<Client>> relationships = groupByIdentity(visible);
        Map<Long, WorkspaceClientActivityService.ClientActivityStats> stats = activity.statsFor(visible);
        return identities.stream()
                .filter(identity -> relationships.containsKey(identity.getId()))
                .limit(safeSize)
                .map(identity -> toView(identity, relationships.get(identity.getId()), stats))
                .toList();
    }

    @GetMapping("/{id}/activity")
    @Transactional(readOnly = true)
    public WorkspaceClientActivityView activity(
            @AuthenticationPrincipal User me,
            @PathVariable Long id,
            @RequestParam(defaultValue = "200") int limit
    ) {
        Long workspaceId = access.snapshot(me).workspaceId();
        WorkspaceClient identity = workspaceClients.findByIdAndWorkspaceId(id, workspaceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        List<Client> visible = access.visibleRelationships(me, List.of(id));
        if (visible.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        Map<Long, WorkspaceClientActivityService.ClientActivityStats> stats = activity.statsFor(visible);
        List<ActivityEventView> events = activity.recentEvents(visible, limit).stream()
                .map(this::toEventView)
                .toList();
        return new WorkspaceClientActivityView(toView(identity, visible, stats), events);
    }

    @GetMapping("/duplicates")
    @Transactional(readOnly = true)
    public List<DuplicateCandidateView> duplicateCandidates(
            @AuthenticationPrincipal User me,
            @RequestParam(defaultValue = "PENDING") DuplicateReviewStatus status
    ) {
        return duplicates.reviewable(me, status).stream().map(candidate -> toCandidateView(me, candidate)).toList();
    }

    @PostMapping("/duplicates/refresh")
    public DuplicateRefreshResponse refreshDuplicates(@AuthenticationPrincipal User me) {
        return new DuplicateRefreshResponse(duplicates.refresh(me));
    }

    @PostMapping("/duplicates/{candidateId}/merge")
    public DuplicateCandidateView merge(
            @AuthenticationPrincipal User me,
            @PathVariable Long candidateId,
            @RequestBody MergeRequest request
    ) {
        if (request == null || request.targetWorkspaceClientId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "targetWorkspaceClientId is required.");
        }
        return toCandidateView(me, duplicates.merge(me, candidateId, request.targetWorkspaceClientId()));
    }

    @PostMapping("/duplicates/{candidateId}/review")
    public DuplicateCandidateView review(
            @AuthenticationPrincipal User me,
            @PathVariable Long candidateId,
            @RequestBody ReviewRequest request
    ) {
        if (request == null || request.status() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "status is required.");
        }
        return toCandidateView(me, duplicates.review(me, candidateId, request.status()));
    }

    @PostMapping("/{workspaceClientId}/unit-clients/{clientId}/unlink")
    public WorkspaceClientView unlink(
            @AuthenticationPrincipal User me,
            @PathVariable Long workspaceClientId,
            @PathVariable Long clientId
    ) {
        WorkspaceClient isolated = duplicates.unlink(me, workspaceClientId, clientId);
        List<Client> visible = access.visibleRelationships(me, List.of(isolated.getId()));
        return toView(isolated, visible, activity.statsFor(visible));
    }

    private DuplicateCandidateView toCandidateView(User me, WorkspaceClientDuplicateCandidate candidate) {
        List<Long> ids = List.of(candidate.getLeft().getId(), candidate.getRight().getId());
        List<Client> visible = access.visibleRelationships(me, ids);
        Map<Long, List<Client>> relationships = groupByIdentity(visible);
        Map<Long, WorkspaceClientActivityService.ClientActivityStats> stats = activity.statsFor(visible);
        return new DuplicateCandidateView(
                candidate.getId(),
                candidate.getScore(),
                parseReasons(candidate.getReasonsJson()),
                candidate.getStatus(),
                candidate.getCreatedAt(),
                candidate.getReviewedAt(),
                toView(candidate.getLeft(), relationships.getOrDefault(candidate.getLeft().getId(), List.of()), stats),
                toView(candidate.getRight(), relationships.getOrDefault(candidate.getRight().getId(), List.of()), stats)
        );
    }

    private WorkspaceClientView toView(
            WorkspaceClient identity,
            Collection<Client> relationships,
            Map<Long, WorkspaceClientActivityService.ClientActivityStats> stats
    ) {
        List<UnitClientView> units = relationships.stream()
                .sorted(Comparator.comparing(client -> client.getCompany().getName(), String.CASE_INSENSITIVE_ORDER))
                .map(client -> {
                    var rowStats = stats.getOrDefault(client.getId(), WorkspaceClientActivityService.ClientActivityStats.empty());
                    return new UnitClientView(
                            client.getId(),
                            client.getCompany().getId(),
                            client.getCompany().getName(),
                            client.isActive(),
                            client.isAnonymized(),
                            client.getAssignedTo() == null ? null : client.getAssignedTo().getId(),
                            client.getAssignedTo() == null ? null : displayName(client.getAssignedTo()),
                            rowStats.bookingCount(),
                            rowStats.invoiceCount(),
                            rowStats.messageCount(),
                            rowStats.noteCount(),
                            rowStats.fileCount(),
                            rowStats.lastActivityAt(),
                            rowStats.lastBookingAt()
                    );
                })
                .toList();
        return new WorkspaceClientView(
                identity.getId(),
                identity.getPublicId(),
                identity.getFirstName(),
                identity.getLastName(),
                identity.getEmail(),
                identity.getPhone(),
                identity.getStatus(),
                units
        );
    }

    private ActivityEventView toEventView(WorkspaceClientActivityService.ActivityEvent event) {
        return new ActivityEventView(
                event.id(),
                event.clientId(),
                event.unitId(),
                event.occurredAt(),
                event.type(),
                event.title(),
                event.detail(),
                event.amount()
        );
    }

    private static Map<Long, List<Client>> groupByIdentity(Collection<Client> relationships) {
        Map<Long, List<Client>> grouped = new LinkedHashMap<>();
        for (Client client : relationships) {
            grouped.computeIfAbsent(client.getWorkspaceClient().getId(), ignored -> new java.util.ArrayList<>()).add(client);
        }
        return grouped;
    }

    private List<String> parseReasons(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return objectMapper.readValue(json, new TypeReference<List<String>>() {});
        } catch (Exception ex) {
            return List.of();
        }
    }

    private static String displayName(User user) {
        return (safe(user.getFirstName()) + " " + safe(user.getLastName())).trim();
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }

    private static String blankToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    public record WorkspaceClientView(
            Long id,
            String publicId,
            String firstName,
            String lastName,
            String email,
            String phone,
            WorkspaceClientStatus status,
            List<UnitClientView> units
    ) {}

    public record UnitClientView(
            Long clientId,
            Long unitId,
            String unitName,
            boolean active,
            boolean anonymized,
            Long assignedToId,
            String assignedToName,
            long bookingCount,
            long invoiceCount,
            long messageCount,
            long noteCount,
            long fileCount,
            Instant lastActivityAt,
            Instant lastBookingAt
    ) {}

    public record ActivityEventView(
            Long id,
            Long clientId,
            Long unitId,
            Instant occurredAt,
            String type,
            String title,
            String detail,
            BigDecimal amount
    ) {}

    public record WorkspaceClientActivityView(WorkspaceClientView client, List<ActivityEventView> events) {}

    public record DuplicateCandidateView(
            Long id,
            int score,
            List<String> reasons,
            DuplicateReviewStatus status,
            Instant createdAt,
            Instant reviewedAt,
            WorkspaceClientView left,
            WorkspaceClientView right
    ) {}

    public record DuplicateRefreshResponse(int createdCandidates) {}
    public record MergeRequest(Long targetWorkspaceClientId) {}
    public record ReviewRequest(DuplicateReviewStatus status) {}
}
