package com.example.app.configcopy;

import com.example.app.user.User;
import com.example.app.user.UserRepository;
import com.example.app.workspacesubscription.WorkspaceEntitlementService;
import com.example.app.workspacesubscription.WorkspaceFeature;
import java.time.Instant;
import java.util.List;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/configuration-copy")
@PreAuthorize("hasRole('ADMIN')")
public class ConfigurationCopyController {
    private final ConfigurationCopyService service;
    private final UserRepository users;
    private final ConfigurationCopyAuditLogRepository auditLogs;
    private WorkspaceEntitlementService entitlements;

    public ConfigurationCopyController(
            ConfigurationCopyService service,
            UserRepository users,
            ConfigurationCopyAuditLogRepository auditLogs
    ) {
        this.service = service;
        this.users = users;
        this.auditLogs = auditLogs;
    }

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    void configureEntitlements(WorkspaceEntitlementService entitlements) {
        this.entitlements = entitlements;
    }

    private void requireEntitlement(User me) {
        if (entitlements != null) entitlements.requireFeature(me, WorkspaceFeature.CONFIGURATION_COPY);
    }

    public record UnitOption(Long id, String name, boolean current) {}
    public record CopyHistoryItem(Long id, Long sourceCompanyId, String sourceCompanyName,
                                  Long targetCompanyId, String targetCompanyName,
                                  String actorName, String categoriesJson, String resultJson,
                                  Instant createdAt) {}

    @GetMapping("/units")
    @Transactional(readOnly = true)
    public List<UnitOption> units(@AuthenticationPrincipal User me) {
        requireEntitlement(me);
        Long workspaceId = me.getCompany().getWorkspace().getId();
        return users.findActiveWorkspaceMemberships(me.getLoginAccount().getId(), workspaceId).stream()
                .filter(member -> member.getRole().name().equals("ADMIN") || member.getRole().name().equals("SUPER_ADMIN"))
                .map(member -> new UnitOption(member.getCompany().getId(), member.getCompany().getName(),
                        member.getCompany().getId().equals(me.getCompany().getId())))
                .distinct()
                .toList();
    }

    @GetMapping("/history")
    @Transactional(readOnly = true)
    public List<CopyHistoryItem> history(@AuthenticationPrincipal User me) {
        requireEntitlement(me);
        Long workspaceId = me.getCompany().getWorkspace().getId();
        List<Long> administeredCompanyIds = users.findActiveWorkspaceMemberships(
                        me.getLoginAccount().getId(), workspaceId).stream()
                .filter(member -> member.getRole().name().equals("ADMIN")
                        || member.getRole().name().equals("SUPER_ADMIN"))
                .map(member -> member.getCompany().getId()).distinct().toList();
        return auditLogs.findTop50ByWorkspaceIdOrderByCreatedAtDesc(workspaceId).stream()
                .filter(row -> administeredCompanyIds.contains(row.getSourceCompany().getId())
                        && administeredCompanyIds.contains(row.getTargetCompany().getId()))
                .map(row -> new CopyHistoryItem(
                        row.getId(), row.getSourceCompany().getId(), row.getSourceCompany().getName(),
                        row.getTargetCompany().getId(), row.getTargetCompany().getName(),
                        row.getActor() == null ? null : (row.getActor().getFirstName() + " " + row.getActor().getLastName()).trim(),
                        row.getCategoriesJson(), row.getResultJson(), row.getCreatedAt()))
                .toList();
    }

    @PostMapping("/preview")
    public ConfigurationCopyService.CopyPreview preview(
            @RequestBody ConfigurationCopyService.CopyRequest request,
            @AuthenticationPrincipal User me
    ) {
        requireEntitlement(me);
        return service.preview(request, me);
    }

    @PostMapping("/execute")
    public ConfigurationCopyService.CopyResult execute(
            @RequestBody ConfigurationCopyService.CopyRequest request,
            @AuthenticationPrincipal User me
    ) {
        requireEntitlement(me);
        return service.execute(request, me);
    }
}
