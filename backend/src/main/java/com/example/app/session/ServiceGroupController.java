package com.example.app.session;

import com.example.app.user.User;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/service-groups")
public class ServiceGroupController {
    private final ServiceGroupRepository groups;
    private final SessionTypeRepository sessionTypes;

    public ServiceGroupController(ServiceGroupRepository groups, SessionTypeRepository sessionTypes) {
        this.groups = groups;
        this.sessionTypes = sessionTypes;
    }

    public record ServiceGroupRequest(
            String name,
            String description,
            Boolean active,
            Integer sortOrder
    ) {}

    public record ServiceGroupResponse(
            Long id,
            String name,
            String description,
            boolean active,
            int sortOrder,
            long serviceCount
    ) {}

    public record ReorderRequest(List<Long> ids) {}

    @GetMapping
    @Transactional(readOnly = true)
    public List<ServiceGroupResponse> list(@AuthenticationPrincipal User me) {
        Long companyId = me.getCompany().getId();
        return groups.findAllByCompanyIdOrderBySortOrderAscNameAsc(companyId).stream()
                .map(group -> toResponse(group, companyId))
                .toList();
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping
    @Transactional
    public ServiceGroupResponse create(@RequestBody ServiceGroupRequest request, @AuthenticationPrincipal User me) {
        Long companyId = me.getCompany().getId();
        String name = normalizeName(request.name());
        ensureUnique(companyId, name, null);

        ServiceGroup group = new ServiceGroup();
        group.setCompany(me.getCompany());
        group.setName(name);
        group.setDescription(normalizeDescription(request.description()));
        group.setActive(request.active() == null || Boolean.TRUE.equals(request.active()));
        group.setSortOrder(request.sortOrder() == null
                ? groups.findMaxSortOrderByCompanyId(companyId) + 1
                : Math.max(0, request.sortOrder()));
        group = groups.save(group);
        return toResponse(group, companyId);
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/{id}")
    @Transactional
    public ServiceGroupResponse update(
            @PathVariable Long id,
            @RequestBody ServiceGroupRequest request,
            @AuthenticationPrincipal User me
    ) {
        Long companyId = me.getCompany().getId();
        ServiceGroup group = requireOwned(id, companyId);
        String name = normalizeName(request.name());
        ensureUnique(companyId, name, id);
        group.setName(name);
        group.setDescription(normalizeDescription(request.description()));
        if (request.active() != null) group.setActive(Boolean.TRUE.equals(request.active()));
        if (request.sortOrder() != null) group.setSortOrder(Math.max(0, request.sortOrder()));
        group = groups.save(group);
        return toResponse(group, companyId);
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/reorder")
    @Transactional
    public List<ServiceGroupResponse> reorder(@RequestBody ReorderRequest request, @AuthenticationPrincipal User me) {
        Long companyId = me.getCompany().getId();
        List<Long> ids = request == null || request.ids() == null ? List.of() : request.ids();
        List<ServiceGroup> existing = groups.findAllByCompanyIdOrderBySortOrderAscNameAsc(companyId);
        Set<Long> ownedIds = existing.stream().map(ServiceGroup::getId).collect(java.util.stream.Collectors.toSet());
        Set<Long> seen = new HashSet<>();
        List<Long> ordered = new ArrayList<>();
        for (Long id : ids) {
            if (id != null && ownedIds.contains(id) && seen.add(id)) ordered.add(id);
        }
        for (ServiceGroup group : existing) {
            if (seen.add(group.getId())) ordered.add(group.getId());
        }
        for (int i = 0; i < ordered.size(); i++) {
            Long orderedId = ordered.get(i);
            ServiceGroup group = existing.stream()
                    .filter(candidate -> candidate.getId().equals(orderedId))
                    .findFirst()
                    .orElseThrow();
            group.setSortOrder(i);
        }
        groups.saveAll(existing);
        return groups.findAllByCompanyIdOrderBySortOrderAscNameAsc(companyId).stream()
                .map(group -> toResponse(group, companyId))
                .toList();
    }

    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/{id}")
    @Transactional
    public void delete(@PathVariable Long id, @AuthenticationPrincipal User me) {
        Long companyId = me.getCompany().getId();
        ServiceGroup group = requireOwned(id, companyId);
        List<SessionType> assigned = sessionTypes.findAllByCompanyIdAndServiceGroupId(companyId, id);
        for (SessionType type : assigned) {
            type.setServiceGroup(null);
        }
        sessionTypes.saveAll(assigned);
        groups.delete(group);
    }

    private ServiceGroupResponse toResponse(ServiceGroup group, Long companyId) {
        return new ServiceGroupResponse(
                group.getId(),
                group.getName(),
                group.getDescription(),
                group.isActive(),
                group.getSortOrder(),
                sessionTypes.countByCompanyIdAndServiceGroupId(companyId, group.getId())
        );
    }

    private ServiceGroup requireOwned(Long id, Long companyId) {
        return groups.findById(id)
                .filter(group -> group.getCompany().getId().equals(companyId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private void ensureUnique(Long companyId, String name, Long currentId) {
        groups.findByCompanyIdAndNameIgnoreCase(companyId, name).ifPresent(existing -> {
            if (currentId == null || !existing.getId().equals(currentId)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "A service group with this name already exists.");
            }
        });
    }

    private String normalizeName(String raw) {
        String value = raw == null ? "" : raw.trim().replaceAll("\\s+", " ");
        if (value.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Service group name is required.");
        }
        if (value.length() > 120) value = value.substring(0, 120).trim();
        return value;
    }

    private String normalizeDescription(String raw) {
        if (raw == null) return null;
        String value = raw.trim();
        return value.isEmpty() ? null : value;
    }
}
