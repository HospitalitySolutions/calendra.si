package com.example.app.workspaceclient;

import com.example.app.client.Client;
import com.example.app.client.ClientRepository;
import com.example.app.security.SecurityUtils;
import com.example.app.user.User;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class WorkspaceClientDuplicateService {
    private static final int CANDIDATE_THRESHOLD = 70;

    private final WorkspaceClientRepository workspaceClients;
    private final WorkspaceClientDuplicateCandidateRepository candidates;
    private final ClientRepository clients;
    private final WorkspaceClientAccessService access;
    private final WorkspaceClientAuditService audit;
    private final ObjectMapper objectMapper;

    public WorkspaceClientDuplicateService(
            WorkspaceClientRepository workspaceClients,
            WorkspaceClientDuplicateCandidateRepository candidates,
            ClientRepository clients,
            WorkspaceClientAccessService access,
            WorkspaceClientAuditService audit,
            ObjectMapper objectMapper
    ) {
        this.workspaceClients = workspaceClients;
        this.candidates = candidates;
        this.clients = clients;
        this.access = access;
        this.audit = audit;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public int refresh(User me) {
        if (!SecurityUtils.isAdmin(me)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only administrators can refresh duplicate candidates.");
        }
        Long workspaceId = access.snapshot(me).workspaceId();
        List<WorkspaceClient> identities = workspaceClients.findAllByWorkspaceIdAndStatusOrderByIdAsc(
                workspaceId, WorkspaceClientStatus.ACTIVE);
        if (identities.size() < 2) return 0;

        Map<Long, Set<Long>> unitsByIdentity = unitsByIdentity(identities.stream().map(WorkspaceClient::getId).toList());
        Map<String, LinkedHashSet<WorkspaceClient>> buckets = new LinkedHashMap<>();
        for (WorkspaceClient identity : identities) {
            addBucket(buckets, "e:", identity.getNormalizedEmail(), identity);
            addBucket(buckets, "p:", identity.getNormalizedPhone(), identity);
        }

        Map<String, PairScore> pairs = new LinkedHashMap<>();
        for (LinkedHashSet<WorkspaceClient> bucket : buckets.values()) {
            List<WorkspaceClient> rows = new ArrayList<>(bucket);
            for (int i = 0; i < rows.size(); i++) {
                for (int j = i + 1; j < rows.size(); j++) {
                    WorkspaceClient left = rows.get(i);
                    WorkspaceClient right = rows.get(j);
                    if (!disjoint(unitsByIdentity.get(left.getId()), unitsByIdentity.get(right.getId()))) continue;
                    WorkspaceClient first = left.getId() < right.getId() ? left : right;
                    WorkspaceClient second = left.getId() < right.getId() ? right : left;
                    String key = first.getId() + ":" + second.getId();
                    pairs.computeIfAbsent(key, ignored -> score(first, second));
                }
            }
        }

        int created = 0;
        for (PairScore pair : pairs.values()) {
            if (pair.score() < CANDIDATE_THRESHOLD) continue;
            var existing = candidates.findByWorkspaceIdAndLeftIdAndRightId(
                    workspaceId, pair.left().getId(), pair.right().getId());
            if (existing.isPresent()) {
                WorkspaceClientDuplicateCandidate row = existing.get();
                if (row.getStatus() == DuplicateReviewStatus.PENDING || row.getStatus() == DuplicateReviewStatus.DEFERRED) {
                    row.setScore(pair.score());
                    row.setReasonsJson(toJson(pair.reasons()));
                    if (row.getStatus() == DuplicateReviewStatus.DEFERRED) {
                        row.setStatus(DuplicateReviewStatus.PENDING);
                        row.setReviewedAt(null);
                        row.setReviewedBy(null);
                    }
                    candidates.save(row);
                }
                continue;
            }
            WorkspaceClientDuplicateCandidate row = new WorkspaceClientDuplicateCandidate();
            row.setWorkspace(me.getCompany().getWorkspace());
            row.setLeft(pair.left());
            row.setRight(pair.right());
            row.setScore(pair.score());
            row.setReasonsJson(toJson(pair.reasons()));
            row.setStatus(DuplicateReviewStatus.PENDING);
            candidates.save(row);
            created++;
        }
        audit.record(me, "DUPLICATE_SCAN_REFRESHED", null, null, null,
                Map.of("workspaceId", workspaceId, "createdCandidates", created));
        return created;
    }

    @Transactional(readOnly = true)
    public List<WorkspaceClientDuplicateCandidate> reviewable(User me, DuplicateReviewStatus status) {
        Long workspaceId = access.snapshot(me).workspaceId();
        DuplicateReviewStatus requested = status == null ? DuplicateReviewStatus.PENDING : status;
        return candidates.findAllByWorkspaceAndStatus(workspaceId, requested).stream()
                .filter(candidate -> canAdministerCandidate(me, candidate))
                .toList();
    }

    @Transactional
    public WorkspaceClientDuplicateCandidate merge(User me, Long candidateId, Long targetWorkspaceClientId) {
        Long workspaceId = access.snapshot(me).workspaceId();
        WorkspaceClientDuplicateCandidate candidate = candidates.findByIdAndWorkspaceId(candidateId, workspaceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (candidate.getStatus() != DuplicateReviewStatus.PENDING
                && candidate.getStatus() != DuplicateReviewStatus.DEFERRED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This duplicate candidate has already been reviewed.");
        }
        WorkspaceClient target;
        WorkspaceClient source;
        if (candidate.getLeft().getId().equals(targetWorkspaceClientId)) {
            target = candidate.getLeft();
            source = candidate.getRight();
        } else if (candidate.getRight().getId().equals(targetWorkspaceClientId)) {
            target = candidate.getRight();
            source = candidate.getLeft();
        } else {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The selected canonical identity is not part of this candidate.");
        }
        if (target.getStatus() != WorkspaceClientStatus.ACTIVE || source.getStatus() != WorkspaceClientStatus.ACTIVE) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only active identities can be linked.");
        }

        List<Client> targetRelations = clients.findAllByWorkspaceClientIdOrderByCompanyIdAscIdAsc(target.getId());
        List<Client> sourceRelations = clients.findAllByWorkspaceClientIdOrderByCompanyIdAscIdAsc(source.getId());
        Set<Long> targetUnits = companyIds(targetRelations);
        Set<Long> sourceUnits = companyIds(sourceRelations);
        Set<Long> overlap = new LinkedHashSet<>(targetUnits);
        overlap.retainAll(sourceUnits);
        if (!overlap.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "These identities both have a client record in the same unit and cannot be linked non-destructively.");
        }
        Set<Long> affectedUnits = new LinkedHashSet<>(targetUnits);
        affectedUnits.addAll(sourceUnits);
        access.requireAdminForCompanies(me, affectedUnits);

        for (Client relation : sourceRelations) {
            String previousPhone = relation.getPhone();
            relation.setWorkspaceClient(target);
            relation.setFirstName(target.getFirstName());
            relation.setLastName(target.getLastName());
            relation.setEmail(target.getEmail());
            relation.setPhone(target.getPhone());
            if (relation.getWhatsappPhone() == null
                    || relation.getWhatsappPhone().isBlank()
                    || Objects.equals(relation.getWhatsappPhone(), previousPhone)) {
                relation.setWhatsappPhone(target.getPhone());
            }
        }
        clients.saveAll(sourceRelations);
        clients.flush();
        clients.synchronizeSharedIdentity(
                target.getId(), target.getFirstName(), target.getLastName(), target.getEmail(), target.getPhone());

        source.setStatus(WorkspaceClientStatus.MERGED);
        source.setMergedInto(target);
        workspaceClients.save(source);

        candidate.setStatus(DuplicateReviewStatus.MERGED);
        candidate.setReviewedAt(Instant.now());
        candidate.setReviewedBy(me);
        candidates.save(candidate);
        candidates.findPendingInvolving(workspaceId, source.getId()).stream()
                .filter(other -> !other.getId().equals(candidate.getId()))
                .forEach(other -> {
                    other.setStatus(DuplicateReviewStatus.DEFERRED);
                    candidates.save(other);
                });

        audit.record(me, "WORKSPACE_CLIENTS_LINKED", target.getId(), source.getId(), null,
                Map.of("candidateId", candidate.getId(), "affectedUnitIds", affectedUnits));
        return candidate;
    }

    @Transactional
    public WorkspaceClientDuplicateCandidate review(User me, Long candidateId, DuplicateReviewStatus decision) {
        if (decision != DuplicateReviewStatus.NOT_DUPLICATE && decision != DuplicateReviewStatus.DEFERRED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported duplicate review decision.");
        }
        Long workspaceId = access.snapshot(me).workspaceId();
        WorkspaceClientDuplicateCandidate candidate = candidates.findByIdAndWorkspaceId(candidateId, workspaceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        requireCandidateAdmin(me, candidate);
        if (candidate.getStatus() == DuplicateReviewStatus.MERGED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Merged candidates cannot be changed.");
        }
        candidate.setStatus(decision);
        candidate.setReviewedAt(Instant.now());
        candidate.setReviewedBy(me);
        candidates.save(candidate);
        audit.record(me, "DUPLICATE_REVIEWED", candidate.getLeft().getId(), candidate.getRight().getId(), null,
                Map.of("candidateId", candidate.getId(), "decision", decision.name()));
        return candidate;
    }

    @Transactional
    public WorkspaceClient unlink(User me, Long workspaceClientId, Long clientId) {
        Long workspaceId = access.snapshot(me).workspaceId();
        WorkspaceClient shared = workspaceClients.findByIdAndWorkspaceId(workspaceClientId, workspaceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        Client relation = clients.findAllByWorkspaceClientIdOrderByCompanyIdAscIdAsc(workspaceClientId).stream()
                .filter(client -> client.getId().equals(clientId))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        access.requireAdminForCompanies(me, List.of(relation.getCompany().getId()));
        if (clients.countByWorkspaceClientId(workspaceClientId) <= 1) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This client is not linked to another unit.");
        }

        WorkspaceClient isolated = new WorkspaceClient();
        isolated.setWorkspace(shared.getWorkspace());
        isolated.setFirstName(shared.getFirstName());
        isolated.setLastName(shared.getLastName());
        isolated.setEmail(shared.getEmail());
        isolated.setPhone(shared.getPhone());
        isolated.setStatus(WorkspaceClientStatus.ACTIVE);
        isolated = workspaceClients.save(isolated);
        relation.setWorkspaceClient(isolated);
        clients.save(relation);

        WorkspaceClient left = isolated.getId() < shared.getId() ? isolated : shared;
        WorkspaceClient right = isolated.getId() < shared.getId() ? shared : isolated;
        WorkspaceClientDuplicateCandidate suppression = candidates
                .findByWorkspaceIdAndLeftIdAndRightId(workspaceId, left.getId(), right.getId())
                .orElseGet(WorkspaceClientDuplicateCandidate::new);
        suppression.setWorkspace(shared.getWorkspace());
        suppression.setLeft(left);
        suppression.setRight(right);
        suppression.setScore(100);
        suppression.setReasonsJson(toJson(List.of("UNLINKED_BY_ADMIN")));
        suppression.setStatus(DuplicateReviewStatus.NOT_DUPLICATE);
        suppression.setReviewedAt(Instant.now());
        suppression.setReviewedBy(me);
        candidates.save(suppression);

        audit.record(me, "WORKSPACE_CLIENT_UNIT_UNLINKED", isolated.getId(), shared.getId(), relation.getId(),
                Map.of("unitId", relation.getCompany().getId(), "duplicateSuppressed", true));
        return isolated;
    }

    private boolean canAdministerCandidate(User me, WorkspaceClientDuplicateCandidate candidate) {
        try {
            requireCandidateAdmin(me, candidate);
            return true;
        } catch (ResponseStatusException ex) {
            return false;
        }
    }

    private void requireCandidateAdmin(User me, WorkspaceClientDuplicateCandidate candidate) {
        Set<Long> leftUnitIds = new LinkedHashSet<>(clients.findCompanyIdsByWorkspaceClientId(candidate.getLeft().getId()));
        Set<Long> rightUnitIds = new LinkedHashSet<>(clients.findCompanyIdsByWorkspaceClientId(candidate.getRight().getId()));
        if (leftUnitIds.isEmpty() || rightUnitIds.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        Set<Long> unitIds = new LinkedHashSet<>(leftUnitIds);
        unitIds.addAll(rightUnitIds);
        access.requireAdminForCompanies(me, unitIds);
    }

    private Map<Long, Set<Long>> unitsByIdentity(Collection<Long> identityIds) {
        Map<Long, Set<Long>> result = new HashMap<>();
        if (identityIds.isEmpty()) return result;
        for (Client client : clients.findAllByWorkspaceClientIdInOrderByWorkspaceClientIdAscCompanyIdAscIdAsc(identityIds)) {
            result.computeIfAbsent(client.getWorkspaceClient().getId(), ignored -> new LinkedHashSet<>())
                    .add(client.getCompany().getId());
        }
        return result;
    }

    private static PairScore score(WorkspaceClient left, WorkspaceClient right) {
        int score = 0;
        List<String> reasons = new ArrayList<>();
        if (sameNonBlank(left.getNormalizedEmail(), right.getNormalizedEmail())) {
            score += 60;
            reasons.add("SAME_EMAIL");
        }
        if (sameNonBlank(left.getNormalizedPhone(), right.getNormalizedPhone())) {
            score += 60;
            reasons.add("SAME_PHONE");
        }
        boolean sameFirst = equalsIgnoreCase(left.getFirstName(), right.getFirstName());
        boolean sameLast = equalsIgnoreCase(left.getLastName(), right.getLastName());
        if (sameFirst && sameLast) {
            score += 35;
            reasons.add("SAME_NAME");
        } else if (sameLast) {
            score += 10;
            reasons.add("SAME_LAST_NAME");
        }
        return new PairScore(left, right, Math.min(score, 100), reasons);
    }

    private static void addBucket(
            Map<String, LinkedHashSet<WorkspaceClient>> buckets,
            String prefix,
            String value,
            WorkspaceClient identity
    ) {
        if (value == null || value.isBlank()) return;
        buckets.computeIfAbsent(prefix + value, ignored -> new LinkedHashSet<>()).add(identity);
    }

    private static boolean disjoint(Set<Long> left, Set<Long> right) {
        if (left == null || right == null || left.isEmpty() || right.isEmpty()) return false;
        return left.stream().noneMatch(right::contains);
    }

    private static Set<Long> companyIds(Collection<Client> clients) {
        Set<Long> ids = new LinkedHashSet<>();
        clients.forEach(client -> ids.add(client.getCompany().getId()));
        return ids;
    }

    private static boolean sameNonBlank(String left, String right) {
        return left != null && !left.isBlank() && Objects.equals(left, right);
    }

    private static boolean equalsIgnoreCase(String left, String right) {
        return left != null && right != null && left.trim().equalsIgnoreCase(right.trim());
    }

    private String toJson(List<String> reasons) {
        try {
            return objectMapper.writeValueAsString(reasons);
        } catch (JsonProcessingException ex) {
            return "[]";
        }
    }

    private record PairScore(WorkspaceClient left, WorkspaceClient right, int score, List<String> reasons) {
    }
}
