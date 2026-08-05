package com.example.app.workspaceservice;

import com.example.app.session.SessionType;
import com.example.app.session.SessionTypeRepository;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.time.Instant;
import java.util.stream.Collectors;
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
@RequestMapping("/api/workspace-service-templates")
@PreAuthorize("hasRole('ADMIN')")
public class WorkspaceServiceTemplateController {
    private static final java.util.regex.Pattern HEX = java.util.regex.Pattern.compile("^#[0-9A-Fa-f]{6}$");
    private final WorkspaceServiceTemplateRepository templates;
    private final SessionTypeRepository sessionTypes;
    private final UserRepository users;
    private final WorkspaceServiceAuditService audit;
    private final WorkspaceServiceAuditLogRepository auditLogs;

    public WorkspaceServiceTemplateController(
            WorkspaceServiceTemplateRepository templates,
            SessionTypeRepository sessionTypes,
            UserRepository users,
            WorkspaceServiceAuditService audit,
            WorkspaceServiceAuditLogRepository auditLogs
    ) {
        this.templates = templates;
        this.sessionTypes = sessionTypes;
        this.users = users;
        this.audit = audit;
        this.auditLogs = auditLogs;
    }

    public record TemplateRequest(
            String name,
            String description,
            Integer defaultDurationMinutes,
            String color,
            String icon,
            String bookingInstructions,
            Boolean active
    ) {}

    public record LinkRequest(Long sessionTypeId, Boolean applySharedDefaults) {}

    public record OfferingResponse(
            Long sessionTypeId,
            Long companyId,
            String companyName,
            String code,
            String description,
            Integer durationMinutes,
            String color,
            boolean active,
            boolean availableAllLocations,
            List<String> locationNames
    ) {}

    public record TemplateResponse(
            Long id,
            String name,
            String description,
            Integer defaultDurationMinutes,
            String color,
            String icon,
            String bookingInstructions,
            boolean active,
            Long ownerCompanyId,
            String ownerCompanyName,
            List<OfferingResponse> offerings
    ) {}

    public record AuditResponse(Long id, String action, Long templateId, String templateName,
                                Long sessionTypeId, Long actorCompanyId, String actorCompanyName,
                                String actorName, String detailsJson, Instant createdAt) {}

    @GetMapping
    @Transactional(readOnly = true)
    public List<TemplateResponse> list(@AuthenticationPrincipal User me) {
        Long workspaceId = workspaceId(me);
        List<Long> accessibleCompanyIds = accessibleMemberships(me).stream()
                .map(m -> m.getCompany().getId()).distinct().toList();
        return templates.findAllByWorkspaceIdOrderByActiveDescNameAscIdAsc(workspaceId).stream()
                .filter(template -> canView(template, accessibleCompanyIds))
                .map(template -> toResponse(template, accessibleCompanyIds))
                .toList();
    }

    @GetMapping("/audit")
    @Transactional(readOnly = true)
    public List<AuditResponse> auditHistory(@AuthenticationPrincipal User me) {
        List<Long> accessibleCompanyIds = accessibleCompanyIds(me);
        return auditLogs.findTop100ByWorkspaceIdOrderByCreatedAtDesc(workspaceId(me)).stream()
                .filter(row -> row.getWorkspaceServiceTemplate() != null
                        && canView(row.getWorkspaceServiceTemplate(), accessibleCompanyIds))
                .map(row -> new AuditResponse(
                        row.getId(), row.getAction(), row.getWorkspaceServiceTemplate().getId(),
                        row.getWorkspaceServiceTemplate().getName(),
                        row.getSessionType() == null ? null : row.getSessionType().getId(),
                        row.getActorCompany() == null ? null : row.getActorCompany().getId(),
                        row.getActorCompany() == null ? null : row.getActorCompany().getName(),
                        row.getActor() == null ? null : (row.getActor().getFirstName() + " " + row.getActor().getLastName()).trim(),
                        row.getDetailsJson(), row.getCreatedAt()))
                .toList();
    }

    @PostMapping
    @Transactional
    public TemplateResponse create(@RequestBody TemplateRequest request, @AuthenticationPrincipal User me) {
        String name = requiredName(request == null ? null : request.name());
        Long workspaceId = workspaceId(me);
        if (templates.existsByWorkspaceIdAndNameIgnoreCase(workspaceId, name)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A workspace service with this name already exists.");
        }
        WorkspaceServiceTemplate template = new WorkspaceServiceTemplate();
        template.setWorkspace(me.getCompany().getWorkspace());
        template.setOwnerCompany(me.getCompany());
        apply(template, request, name);
        template = templates.save(template);
        audit.record(me, "TEMPLATE_CREATED", template, null, Map.of("name", template.getName()));
        return toResponse(template, accessibleCompanyIds(me));
    }

    @PutMapping("/{id}")
    @Transactional
    public TemplateResponse update(
            @PathVariable Long id,
            @RequestBody TemplateRequest request,
            @AuthenticationPrincipal User me
    ) {
        WorkspaceServiceTemplate template = requireTemplate(id, me);
        requireAdminForAllLinkedUnits(template, me);
        String name = requiredName(request == null ? null : request.name());
        if (!template.getName().equalsIgnoreCase(name)
                && templates.existsByWorkspaceIdAndNameIgnoreCaseAndIdNot(workspaceId(me), name, id)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A workspace service with this name already exists.");
        }
        apply(template, request, name);
        template = templates.save(template);
        audit.record(me, "TEMPLATE_UPDATED", template, null, Map.of("name", template.getName()));
        return toResponse(template, accessibleCompanyIds(me));
    }

    @PostMapping("/{id}/link")
    @Transactional
    public TemplateResponse link(
            @PathVariable Long id,
            @RequestBody LinkRequest request,
            @AuthenticationPrincipal User me
    ) {
        if (request == null || request.sessionTypeId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Session type is required.");
        }
        WorkspaceServiceTemplate template = requireTemplate(id, me);
        SessionType offering = sessionTypes.findByIdAndCompanyId(request.sessionTypeId(), me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (sessionTypes.existsByCompanyIdAndWorkspaceServiceTemplateIdAndIdNot(
                me.getCompany().getId(), template.getId(), offering.getId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This workspace service already has an offering in the current unit.");
        }
        offering.setWorkspaceServiceTemplate(template);
        if (Boolean.TRUE.equals(request.applySharedDefaults())) applySharedDefaults(offering, template);
        sessionTypes.save(offering);
        audit.record(me, "OFFERING_LINKED", template, offering,
                Map.of("companyId", offering.getCompany().getId(), "applySharedDefaults", Boolean.TRUE.equals(request.applySharedDefaults())));
        return toResponse(template, accessibleCompanyIds(me));
    }

    @PostMapping("/{id}/sync/{sessionTypeId}")
    @Transactional
    public TemplateResponse sync(
            @PathVariable Long id,
            @PathVariable Long sessionTypeId,
            @AuthenticationPrincipal User me
    ) {
        WorkspaceServiceTemplate template = requireTemplate(id, me);
        SessionType offering = sessionTypes.findByIdAndCompanyId(sessionTypeId, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (offering.getWorkspaceServiceTemplate() == null
                || !id.equals(offering.getWorkspaceServiceTemplate().getId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This unit service is not linked to the selected workspace service.");
        }
        applySharedDefaults(offering, template);
        sessionTypes.save(offering);
        audit.record(me, "OFFERING_SYNCED", template, offering, Map.of("companyId", offering.getCompany().getId()));
        return toResponse(template, accessibleCompanyIds(me));
    }

    @DeleteMapping("/{id}/link/{sessionTypeId}")
    @Transactional
    public TemplateResponse unlink(
            @PathVariable Long id,
            @PathVariable Long sessionTypeId,
            @AuthenticationPrincipal User me
    ) {
        WorkspaceServiceTemplate oldTemplate = requireTemplate(id, me);
        SessionType offering = sessionTypes.findByIdAndCompanyId(sessionTypeId, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (offering.getWorkspaceServiceTemplate() == null
                || !id.equals(offering.getWorkspaceServiceTemplate().getId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This unit service is not linked to the selected workspace service.");
        }
        WorkspaceServiceTemplate replacement = new WorkspaceServiceTemplate();
        replacement.setWorkspace(me.getCompany().getWorkspace());
        replacement.setOwnerCompany(me.getCompany());
        replacement.setName(uniqueDetachedName(workspaceId(me), offering.getDescription(), offering.getId()));
        replacement.setDescription(offering.getDescription());
        replacement.setDefaultDurationMinutes(offering.getDurationMinutes());
        replacement.setColor(offering.getColor());
        replacement.setActive(offering.isActive());
        replacement = templates.save(replacement);
        offering.setWorkspaceServiceTemplate(replacement);
        sessionTypes.save(offering);
        audit.record(me, "OFFERING_UNLINKED", oldTemplate, offering,
                Map.of("companyId", offering.getCompany().getId(), "replacementTemplateId", replacement.getId()));
        return toResponse(oldTemplate, accessibleCompanyIds(me));
    }

    private void apply(WorkspaceServiceTemplate template, TemplateRequest request, String name) {
        template.setName(name);
        template.setDescription(trimToNull(request == null ? null : request.description()));
        template.setDefaultDurationMinutes(normalizeDuration(request == null ? null : request.defaultDurationMinutes()));
        template.setColor(normalizeColor(request == null ? null : request.color()));
        template.setIcon(trimToNull(request == null ? null : request.icon()));
        template.setBookingInstructions(trimToNull(request == null ? null : request.bookingInstructions()));
        template.setActive(request == null || request.active() == null || Boolean.TRUE.equals(request.active()));
    }

    private void applySharedDefaults(SessionType offering, WorkspaceServiceTemplate template) {
        offering.setDescription(template.getName());
        if (template.getDefaultDurationMinutes() != null) offering.setDurationMinutes(template.getDefaultDurationMinutes());
        if (template.getColor() != null) offering.setColor(template.getColor());
    }

    private TemplateResponse toResponse(WorkspaceServiceTemplate template, List<Long> accessibleCompanyIds) {
        List<OfferingResponse> offerings = sessionTypes.findAllByWorkspaceServiceTemplateIdWithCompany(template.getId()).stream()
                .filter(type -> accessibleCompanyIds.contains(type.getCompany().getId()))
                .map(type -> new OfferingResponse(
                        type.getId(), type.getCompany().getId(), type.getCompany().getName(), type.getName(),
                        type.getDescription(), type.getDurationMinutes(), type.getColor(), type.isActive(),
                        type.isAvailableAllLocations(),
                        type.getLocations().stream().map(location -> location.getName()).sorted().toList()))
                .toList();
        return new TemplateResponse(
                template.getId(), template.getName(), template.getDescription(), template.getDefaultDurationMinutes(),
                template.getColor(), template.getIcon(), template.getBookingInstructions(), template.isActive(),
                template.getOwnerCompany().getId(), template.getOwnerCompany().getName(), offerings);
    }

    private WorkspaceServiceTemplate requireTemplate(Long id, User me) {
        WorkspaceServiceTemplate template = templates.findByIdAndWorkspaceId(id, workspaceId(me))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!canView(template, accessibleCompanyIds(me))) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        return template;
    }

    private boolean canView(WorkspaceServiceTemplate template, List<Long> accessibleCompanyIds) {
        if (template.getOwnerCompany() != null && accessibleCompanyIds.contains(template.getOwnerCompany().getId())) {
            return true;
        }
        return sessionTypes.findAllByWorkspaceServiceTemplateIdWithCompany(template.getId()).stream()
                .anyMatch(type -> accessibleCompanyIds.contains(type.getCompany().getId()));
    }

    private void requireAdminForAllLinkedUnits(WorkspaceServiceTemplate template, User me) {
        Map<Long, User> memberships = accessibleMemberships(me).stream()
                .collect(Collectors.toMap(member -> member.getCompany().getId(), member -> member, (a, b) -> a));
        Set<Long> affectedCompanyIds = sessionTypes.findAllByWorkspaceServiceTemplateIdWithCompany(template.getId()).stream()
                .map(type -> type.getCompany().getId())
                .collect(Collectors.toSet());
        affectedCompanyIds.add(template.getOwnerCompany().getId());
        boolean permitted = affectedCompanyIds.stream().allMatch(companyId -> {
            User membership = memberships.get(companyId);
            return membership != null && (membership.getRole().name().equals("ADMIN")
                    || membership.getRole().name().equals("SUPER_ADMIN"));
        });
        if (!permitted) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Administrator access is required in every unit linked to this workspace service.");
        }
    }

    private List<User> accessibleMemberships(User me) {
        return users.findActiveWorkspaceMemberships(me.getLoginAccount().getId(), workspaceId(me));
    }

    private List<Long> accessibleCompanyIds(User me) {
        return accessibleMemberships(me).stream().map(m -> m.getCompany().getId()).distinct().toList();
    }

    private Long workspaceId(User me) {
        return me.getCompany().getWorkspace().getId();
    }

    private String uniqueDetachedName(Long workspaceId, String description, Long offeringId) {
        String base = requiredName(description == null ? "Service" : description);
        if (!templates.existsByWorkspaceIdAndNameIgnoreCase(workspaceId, base)) return base;
        String candidate = base + " (unit " + offeringId + ")";
        if (!templates.existsByWorkspaceIdAndNameIgnoreCase(workspaceId, candidate)) return candidate;
        for (int i = 2; i < 1000; i++) {
            candidate = base + " (unit " + offeringId + "-" + i + ")";
            if (!templates.existsByWorkspaceIdAndNameIgnoreCase(workspaceId, candidate)) return candidate;
        }
        throw new ResponseStatusException(HttpStatus.CONFLICT, "Unable to create a unique detached service name.");
    }

    private String requiredName(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name is required.");
        if (normalized.length() > 255) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name is too long.");
        return normalized;
    }

    private Integer normalizeDuration(Integer value) {
        if (value == null) return null;
        if (value < 1 || value > 1440) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Duration must be between 1 and 1440 minutes.");
        return value;
    }

    private String normalizeColor(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) return null;
        if (!HEX.matcher(normalized).matches()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Color must be a HEX value.");
        return normalized.toUpperCase(Locale.ROOT);
    }

    private String trimToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
