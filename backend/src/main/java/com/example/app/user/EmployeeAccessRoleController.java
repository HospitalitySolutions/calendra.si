package com.example.app.user;

import com.example.app.security.SecurityUtils;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api/employee-roles")
@PreAuthorize("hasRole('ADMIN')")
public class EmployeeAccessRoleController {
    private static final String SYSTEM_PREFIX = "system:";
    private static final String CUSTOM_PREFIX = "custom:";

    private final EmployeeAccessRoleRepository roleRepository;
    private final UserRepository userRepository;
    private final TenantOwnerAccessService tenantOwnerAccessService;
    private final ObjectMapper objectMapper;

    public EmployeeAccessRoleController(
            EmployeeAccessRoleRepository roleRepository,
            UserRepository userRepository,
            TenantOwnerAccessService tenantOwnerAccessService,
            ObjectMapper objectMapper
    ) {
        this.roleRepository = roleRepository;
        this.userRepository = userRepository;
        this.tenantOwnerAccessService = tenantOwnerAccessService;
        this.objectMapper = objectMapper;
    }

    @GetMapping
    @Transactional
    public RolesOverviewResponse list(@AuthenticationPrincipal User me) {
        Long companyId = me.getCompany().getId();
        tenantOwnerAccessService.ensureTenantOwnerAdministrator(companyId);
        var roles = new ArrayList<EmployeeRoleResponse>();

        // Only real built-in application roles are returned here. Custom roles are loaded from the database below.
        roles.add(systemRole("ADMINISTRATOR", "Administrator", "Full system access with all permissions across the platform.", systemPermissions("ADMINISTRATOR"), userRepository.countByCompanyIdAndRole(companyId, Role.ADMIN)));

        for (EmployeeAccessRole role : roleRepository.findAllByCompanyIdAndArchivedFalseOrderByNameAsc(companyId)) {
            roles.add(customRole(role, userRepository.countByCompanyIdAndEmployeeAccessRoleId(companyId, role.getId())));
        }

        long assignedUsers = roles.stream().mapToLong(EmployeeRoleResponse::memberCount).sum();
        long customRoles = roles.stream().filter(role -> !role.system()).count();
        return new RolesOverviewResponse(roles, assignedUsers, customRoles, permissionGroups());
    }

    @PostMapping
    @Transactional
    public ResponseEntity<?> create(@RequestBody SaveRoleRequest request, @AuthenticationPrincipal User me) {
        String name = uniqueRoleName(me.getCompany().getId(), request.name());

        var role = new EmployeeAccessRole();
        role.setCompany(me.getCompany());
        role.setName(name);
        role.setDescription(cleanDescription(request.description()));
        role.setArchived(false);
        role.setPermissionsJson(writePermissionsJson(request.permissions()));
        EmployeeAccessRole saved = roleRepository.save(role);
        return ResponseEntity.status(HttpStatus.CREATED).body(customRole(saved, 0));
    }

    @PutMapping("/custom/{id}")
    @Transactional
    public ResponseEntity<?> update(@PathVariable Long id, @RequestBody SaveRoleRequest request, @AuthenticationPrincipal User me) {
        Long companyId = me.getCompany().getId();
        return roleRepository.findByIdAndCompanyIdAndArchivedFalse(id, companyId)
                .<ResponseEntity<?>>map(existing -> {
                    String name = cleanName(request.name());
                    boolean duplicate = roleRepository.findAllByCompanyIdAndArchivedFalseOrderByNameAsc(companyId).stream()
                            .anyMatch(role -> !role.getId().equals(id) && role.getName().equalsIgnoreCase(name));
                    if (duplicate) {
                        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", "A role with this name already exists."));
                    }
                    existing.setName(name);
                    existing.setDescription(cleanDescription(request.description()));
                    existing.setPermissionsJson(writePermissionsJson(request.permissions()));
                    EmployeeAccessRole saved = roleRepository.save(existing);

                    // Keep all users assigned to this custom role in sync with the role template.
                    List<User> assignedUsers = userRepository.findAllByCompanyIdAndEmployeeAccessRoleId(companyId, saved.getId());
                    for (User assigned : assignedUsers) {
                        assigned.setPermissionsJson(saved.getPermissionsJson());
                    }
                    if (!assignedUsers.isEmpty()) {
                        userRepository.saveAll(assignedUsers);
                    }

                    return ResponseEntity.ok(customRole(saved, assignedUsers.size()));
                })
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", "Role not found.")));
    }

    @PostMapping("/duplicate")
    @Transactional
    public ResponseEntity<?> duplicate(@RequestBody DuplicateRoleRequest request, @AuthenticationPrincipal User me) {
        Long companyId = me.getCompany().getId();
        var source = findRoleSnapshot(request.sourceRoleId(), companyId);
        if (source == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", "Role not found."));
        }

        String preferredName = request.name() == null || request.name().isBlank()
                ? "Copy of " + source.name()
                : request.name().trim();
        String name = uniqueRoleName(companyId, preferredName);

        var role = new EmployeeAccessRole();
        role.setCompany(me.getCompany());
        role.setName(name);
        role.setDescription(source.description());
        role.setArchived(false);
        role.setPermissionsJson(writePermissionsJson(source.permissions()));
        EmployeeAccessRole saved = roleRepository.save(role);
        return ResponseEntity.status(HttpStatus.CREATED).body(customRole(saved, 0));
    }

    @DeleteMapping("/custom/{id}")
    @Transactional
    public ResponseEntity<?> archive(@PathVariable Long id, @AuthenticationPrincipal User me) {
        Long companyId = me.getCompany().getId();
        return roleRepository.findByIdAndCompanyIdAndArchivedFalse(id, companyId)
                .<ResponseEntity<?>>map(existing -> {
                    long assignedUsers = userRepository.countByCompanyIdAndEmployeeAccessRoleId(companyId, existing.getId());
                    if (assignedUsers > 0) {
                        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", "Remove this role from assigned users before archiving it."));
                    }
                    existing.setArchived(true);
                    roleRepository.save(existing);
                    return ResponseEntity.noContent().build();
                })
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", "Role not found.")));
    }

    @GetMapping("/{roleId:.+}/members")
    @Transactional
    public ResponseEntity<?> members(@PathVariable String roleId, @AuthenticationPrincipal User me) {
        Long companyId = me.getCompany().getId();
        Long tenantOwnerId = tenantOwnerAccessService.ensureTenantOwnerAdministrator(companyId);
        EmployeeRoleSnapshot snapshot = findRoleSnapshot(roleId, companyId);
        if (snapshot == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", "Role not found."));
        }

        List<User> members;
        if (roleId.startsWith(SYSTEM_PREFIX)) {
            String key = roleId.substring(SYSTEM_PREFIX.length()).toUpperCase(Locale.ROOT);
            if (!"ADMINISTRATOR".equals(key)) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", "Role not found."));
            }
            members = userRepository.findAllByCompanyIdAndRoleOrderByFirstNameAscLastNameAscIdAsc(companyId, Role.ADMIN);
        } else if (roleId.startsWith(CUSTOM_PREFIX) && snapshot.customRoleId() != null) {
            members = userRepository.findAllRoleMembersByCompanyIdAndEmployeeAccessRoleId(companyId, snapshot.customRoleId());
        } else {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", "Role not found."));
        }

        return ResponseEntity.ok(new RoleMembersResponse(
                snapshot.id(),
                snapshot.name(),
                members.stream().map(member -> roleMember(member, tenantOwnerId)).toList()
        ));
    }

    private EmployeeRoleSnapshot findRoleSnapshot(String roleId, Long companyId) {
        if (roleId == null || roleId.isBlank()) return null;
        if (roleId.startsWith(SYSTEM_PREFIX)) {
            String key = roleId.substring(SYSTEM_PREFIX.length()).toUpperCase(Locale.ROOT);
            if (!"ADMINISTRATOR".equals(key)) {
                return null;
            }
            return new EmployeeRoleSnapshot(roleId, null, systemName(key), systemDescription(key), systemPermissions(key));
        }
        if (roleId.startsWith(CUSTOM_PREFIX)) {
            String rawId = roleId.substring(CUSTOM_PREFIX.length());
            try {
                Long id = Long.valueOf(rawId);
                return roleRepository.findByIdAndCompanyIdAndArchivedFalse(id, companyId)
                        .map(role -> new EmployeeRoleSnapshot(roleId, role.getId(), role.getName(), role.getDescription(), parsePermissionsJson(role.getPermissionsJson())))
                        .orElse(null);
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    private EmployeeRoleResponse systemRole(String key, String name, String description, List<String> permissions, long memberCount) {
        return new EmployeeRoleResponse(SYSTEM_PREFIX + key, null, key, true, name, description, permissions, memberCount);
    }

    private EmployeeRoleResponse customRole(EmployeeAccessRole role, long memberCount) {
        return new EmployeeRoleResponse(CUSTOM_PREFIX + role.getId(), role.getId(), null, false, role.getName(), role.getDescription(), parsePermissionsJson(role.getPermissionsJson()), memberCount);
    }

    private List<String> systemPermissions(String key) {
        var permissions = new LinkedHashSet<String>();
        if ("ADMINISTRATOR".equals(key)) {
            addGroups(permissions, SecurityUtils.PERMISSION_GROUP_KEYS, SecurityUtils.PERMISSION_ACTION_KEYS);
        }
        return new ArrayList<>(SecurityUtils.normalizePermissionsForStorage(new ArrayList<>(permissions)));
    }

    private String systemName(String key) {
        return "ADMINISTRATOR".equals(key) ? "Administrator" : "System role";
    }

    private String systemDescription(String key) {
        return "ADMINISTRATOR".equals(key)
                ? "Full system access with all permissions across the platform."
                : "System role.";
    }

    private static void addGroups(Set<String> out, List<String> groups, List<String> actions) {
        for (String group : groups) {
            for (String action : actions) {
                addPermission(out, group + "_" + action);
            }
        }
    }

    private static void addPermission(Set<String> out, String permission) {
        if (SecurityUtils.ALLOWED_EMPLOYEE_PERMISSIONS.contains(permission)) {
            out.add(permission);
        }
    }

    private List<PermissionGroupResponse> permissionGroups() {
        return List.of(
                group("CALENDAR_BOOKINGS", "Calendar & Bookings", "Manage appointments, availability and resources"),
                group("CLIENTS", "Clients", "View and manage client profiles and data"),
                group("EMPLOYEES", "Employees", "Manage team members and their access"),
                group("BILLING", "Billing", "Invoices, payments, subscriptions and refunds"),
                group("WALLET", "Wallet", "Manage wallet transactions and balances"),
                group("REPORTS", "Reports", "View reports and analytics"),
                group("SETTINGS", "Settings", "Configure system, business and preferences"),
                group("INTEGRATIONS", "Integrations", "Manage third-party integrations and APIs"),
                group("PLATFORM_FEATURES", "Platform features", "Access platform tools and advanced features")
        );
    }

    private PermissionGroupResponse group(String key, String label, String description) {
        return new PermissionGroupResponse(key, label, description);
    }

    private String cleanName(String value) {
        if (value == null || value.isBlank()) {
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST, "Role name is required.");
        }
        String name = value.trim();
        if (name.length() > 120) {
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST, "Role name is too long.");
        }
        return name;
    }

    private String cleanDescription(String value) {
        if (value == null || value.isBlank()) return null;
        String description = value.trim();
        return description.length() <= 500 ? description : description.substring(0, 500);
    }

    private String uniqueRoleName(Long companyId, String preferredName) {
        String base = cleanName(preferredName);
        String name = base;
        int i = 2;
        while (roleRepository.existsByCompanyIdAndArchivedFalseAndNameIgnoreCase(companyId, name)) {
            String suffix = " " + i;
            int maxBaseLength = Math.max(1, 120 - suffix.length());
            name = base.substring(0, Math.min(base.length(), maxBaseLength)) + suffix;
            i++;
        }
        return name;
    }

    private String writePermissionsJson(List<String> permissions) {
        try {
            return objectMapper.writeValueAsString(SecurityUtils.normalizePermissionsForStorage(permissions));
        } catch (JsonProcessingException e) {
            return "[]";
        }
    }

    private List<String> parsePermissionsJson(String permissionsJson) {
        if (permissionsJson == null || permissionsJson.isBlank()) return List.of();
        try {
            List<?> parsed = objectMapper.readValue(permissionsJson, List.class);
            return parsed.stream()
                    .filter(String.class::isInstance)
                    .map(String.class::cast)
                    .filter(SecurityUtils.ALLOWED_EMPLOYEE_PERMISSIONS::contains)
                    .distinct()
                    .toList();
        } catch (Exception ignored) {
            return List.of();
        }
    }

    private RoleMemberResponse roleMember(User user, Long tenantOwnerId) {
        return new RoleMemberResponse(
                user.getId(),
                user.getFirstName(),
                user.getLastName(),
                user.getEmail(),
                user.getRole(),
                user.isActive(),
                user.getEmployeeAccessRole() == null ? null : user.getEmployeeAccessRole().getId(),
                user.getEmployeeAccessRole() == null ? null : user.getEmployeeAccessRole().getName(),
                tenantOwnerAccessService.isTenantOwner(user, tenantOwnerId)
        );
    }

    public record RolesOverviewResponse(
            List<EmployeeRoleResponse> roles,
            long assignedUsers,
            long customRoles,
            List<PermissionGroupResponse> permissionGroups
    ) {}

    public record EmployeeRoleResponse(
            String id,
            Long customRoleId,
            String systemKey,
            boolean system,
            String name,
            String description,
            List<String> permissions,
            long memberCount
    ) {}

    public record PermissionGroupResponse(String key, String label, String description) {}

    public record RoleMembersResponse(String roleId, String roleName, List<RoleMemberResponse> members) {}

    public record RoleMemberResponse(
            Long id,
            String firstName,
            String lastName,
            String email,
            Role role,
            boolean active,
            Long accessRoleId,
            String accessRoleName,
            boolean tenantOwner
    ) {}

    public record SaveRoleRequest(@NotBlank String name, String description, List<String> permissions) {}

    public record DuplicateRoleRequest(@NotBlank String sourceRoleId, String name) {}

    private record EmployeeRoleSnapshot(String id, Long customRoleId, String name, String description, List<String> permissions) {}
}
