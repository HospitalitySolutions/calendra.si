package com.example.app.workspacesubscription;

import com.example.app.company.Company;
import com.example.app.company.CompanyProvisioningService;
import com.example.app.company.CompanyRepository;
import com.example.app.configcopy.ConfigurationCopyCategory;
import com.example.app.configcopy.ConfigurationCopyService;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.util.EnumSet;
import java.util.List;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/workspace-units")
@PreAuthorize("hasRole('ADMIN')")
public class WorkspaceUnitController {
    private final CompanyRepository companies;
    private final CompanyProvisioningService provisioning;
    private final UserRepository users;
    private final WorkspaceSubscriptionService subscriptions;
    private final WorkspaceEntitlementService entitlements;
    private ConfigurationCopyService configurationCopy;

    public WorkspaceUnitController(
            CompanyRepository companies,
            CompanyProvisioningService provisioning,
            UserRepository users,
            WorkspaceSubscriptionService subscriptions,
            WorkspaceEntitlementService entitlements
    ) {
        this.companies = companies;
        this.provisioning = provisioning;
        this.users = users;
        this.subscriptions = subscriptions;
        this.entitlements = entitlements;
    }

    public record UnitView(Long id, String name, String tenantCode, boolean current) {}
    public record CreateUnitRequest(String name, Long copyConfigurationFromCompanyId) {}
    public record CreateUnitResponse(UnitView unit, Long copiedFromCompanyId, int copiedItems) {}

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    void configureConfigurationCopy(ConfigurationCopyService configurationCopy) {
        this.configurationCopy = configurationCopy;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public List<UnitView> list(@AuthenticationPrincipal User me) {
        Long workspaceId = workspaceId(me);
        subscriptions.requireWorkspaceAdministrator(me, workspaceId);
        return companies.findAllByWorkspaceIdOrderByNameAscIdAsc(workspaceId).stream()
                .map(row -> new UnitView(row.getId(), row.getName(), row.getTenantCode(), row.getId().equals(me.getCompany().getId())))
                .toList();
    }

    @PostMapping
    @Transactional
    public CreateUnitResponse create(@RequestBody CreateUnitRequest request, @AuthenticationPrincipal User me) {
        entitlements.requireFeature(me, WorkspaceFeature.MULTI_UNIT);
        Long workspaceId = workspaceId(me);
        subscriptions.requireWorkspaceAdministrator(me, workspaceId);
        String name = request == null || request.name() == null ? "" : request.name().trim();
        if (name.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Operating-unit name is required.");
        if (companies.findAllByWorkspaceIdOrderByNameAscIdAsc(workspaceId).stream().anyMatch(row -> row.getName().equalsIgnoreCase(name))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "An operating unit with this name already exists.");
        }
        Long copySourceId = request == null ? null : request.copyConfigurationFromCompanyId();
        if (copySourceId != null) entitlements.requireFeature(me, WorkspaceFeature.CONFIGURATION_COPY);
        if (copySourceId != null && configurationCopy == null) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Configuration copy is temporarily unavailable.");
        }
        if (copySourceId != null) {
            companies.findById(copySourceId)
                    .filter(row -> row.getWorkspace() != null && workspaceId.equals(row.getWorkspace().getId()))
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "Configuration copy source must belong to this workspace."));
        }
        try {
            Company company = provisioning.createInWorkspace(name, me.getCompany().getWorkspace());
            User membership = new User();
            membership.setLoginAccount(me.getLoginAccount());
            membership.setCompany(company);
            membership.setFirstName(me.getFirstName());
            membership.setLastName(me.getLastName());
            membership.setEmail(me.getEmail());
            membership.setPasswordHash(me.getPasswordHash());
            membership.setRole(Role.ADMIN);
            membership.setActive(true);
            membership.setConsultant(false);
            membership.setPermissionsJson(me.getPermissionsJson());
            users.saveAndFlush(membership);

            int copiedItems = 0;
            if (copySourceId != null && configurationCopy != null) {
                ConfigurationCopyService.CopyRequest copyRequest = new ConfigurationCopyService.CopyRequest(
                        copySourceId,
                        company.getId(),
                        EnumSet.of(
                                ConfigurationCopyCategory.SERVICES,
                                ConfigurationCopyCategory.WORKING_HOURS,
                                ConfigurationCopyCategory.BOOKING_RULES,
                                ConfigurationCopyCategory.NOTIFICATION_TEMPLATES,
                                ConfigurationCopyCategory.CUSTOM_FIELDS,
                                ConfigurationCopyCategory.LOCATIONS_AND_SPACES,
                                ConfigurationCopyCategory.PAYMENT_METHODS
                        ),
                        false
                );
                copiedItems = configurationCopy.execute(copyRequest, membership).appliedCount();
            }
            return new CreateUnitResponse(
                    new UnitView(company.getId(), company.getName(), company.getTenantCode(), false),
                    copySourceId,
                    copiedItems);
        } catch (DataIntegrityViolationException ex) {
            throw new ResponseStatusException(HttpStatus.PAYMENT_REQUIRED,
                    "Workspace operating-unit or user limit reached. Upgrade the workspace subscription.");
        }
    }

    private static Long workspaceId(User me) {
        if (me == null || me.getCompany() == null || me.getCompany().getWorkspace() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No active workspace.");
        }
        return me.getCompany().getWorkspace().getId();
    }
}
