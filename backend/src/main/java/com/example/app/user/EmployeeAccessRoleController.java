package com.example.app.user;

import com.example.app.security.SecurityUtils;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
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
    private final AppSettingRepository settingRepository;
    private final TenantOwnerAccessService tenantOwnerAccessService;
    private final ObjectMapper objectMapper;

    public EmployeeAccessRoleController(
            EmployeeAccessRoleRepository roleRepository,
            UserRepository userRepository,
            AppSettingRepository settingRepository,
            TenantOwnerAccessService tenantOwnerAccessService,
            ObjectMapper objectMapper
    ) {
        this.roleRepository = roleRepository;
        this.userRepository = userRepository;
        this.settingRepository = settingRepository;
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
        return new RolesOverviewResponse(roles, assignedUsers, customRoles, permissionGroups(companyId));
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

    private List<PermissionGroupResponse> permissionGroups(Long companyId) {
        Map<String, String> settings = settingsMap(companyId);
        return allPermissionGroups().stream()
                .filter(group -> permissionGroupEnabled(group.key(), settings))
                .toList();
    }

    private List<PermissionGroupResponse> allPermissionGroups() {
        return List.of(
                group("CALENDAR_BOOKINGS", "Calendar & Bookings", "View and manage calendar bookings, appointments and booking details"),
                group("CLIENTS", "Clients", "View and manage client profiles, contact details and client history"),
                group("EMPLOYEES", "Employees", "View and manage team members, employee profiles and assigned roles"),
                group("ROLES_PERMISSIONS", "Roles & Permissions", "Create and manage custom roles and permission access"),
                group("SERVICES", "Services", "View and manage services, durations, prices and public visibility"),
                group("SPACES", "Spaces", "View and manage spaces, rooms, resources and their availability"),
                group("COURSES", "Courses", "View and manage courses, participants, schedules and capacity"),
                group("BILLING_INVOICES", "Billing & Invoices", "View and manage bills, invoices, advances and invoice statuses"),
                group("ORDERS", "Orders", "View and manage guest app, widget and wallet product orders"),
                group("WALLET_BENEFITS", "Wallet / Benefits", "View and manage benefits, entitlements, validity and QR access"),
                group("INBOX_MESSAGES", "Inbox / Messages", "Read and manage guest and client message conversations"),
                group("NOTIFICATIONS", "Notifications", "View and manage notification templates, rules and reminders"),
                group("DELIVERY_LOGS", "Delivery Logs", "View and manage email, SMS and app message delivery logs"),
                group("REPORTS_ANALYTICS", "Reports & Analytics", "View and manage reports, statistics and saved analytics views"),
                group("SETTINGS", "Settings", "View and manage business, system and application settings"),
                group("INTEGRATIONS", "Integrations", "View and manage third-party integrations and provider connections"),
                group("WEBSITE_WIDGET", "Website Widget", "View and manage public booking widget settings and visibility"),
                group("GUEST_MOBILE_APP", "Guest Mobile App", "View and manage guest mobile app settings, modules and content"),
                group("PAYMENTS", "Payments", "View and manage payment records, payment status and refunds"),
                group("SCANNER", "Scanner", "View and use QR scanning and guest check-in validation")
        );
    }

    private PermissionGroupResponse group(String key, String label, String description) {
        return new PermissionGroupResponse(key, label, description);
    }

    private Map<String, String> settingsMap(Long companyId) {
        if (companyId == null) return Map.of();
        return settingRepository.findAllByCompanyId(companyId).stream()
                .collect(java.util.stream.Collectors.toMap(
                        AppSetting::getKey,
                        AppSetting::getValue,
                        (a, b) -> b,
                        java.util.LinkedHashMap::new
                ));
    }

    private boolean permissionGroupEnabled(String groupKey, Map<String, String> settings) {
        return switch (groupKey) {
            case "SERVICES" -> settingEnabled(settings, SettingKey.TYPES_ENABLED, true);
            case "SPACES" -> settingEnabled(settings, SettingKey.SPACES_ENABLED, false);
            case "COURSES" -> settingEnabled(settings, SettingKey.TYPES_ENABLED, true)
                    && settingEnabled(settings, SettingKey.COURSES_ENABLED, true);
            case "BILLING_INVOICES" -> settingEnabled(settings, SettingKey.BILLING_ENABLED, true)
                    && settingEnabled(settings, SettingKey.BILLING_INVOICES_ENABLED, true);
            case "ORDERS" -> websiteWidgetEnabled(settings) || guestOrdersEnabled(settings);
            case "WALLET_BENEFITS" -> guestWalletEnabled(settings);
            case "INBOX_MESSAGES" -> settingEnabled(settings, SettingKey.INBOX_ENABLED, true) || guestInboxEnabled(settings);
            case "NOTIFICATIONS", "DELIVERY_LOGS" -> settingEnabled(settings, SettingKey.NOTIFICATIONS_ENABLED, true);
            case "INTEGRATIONS" -> settingEnabled(settings, SettingKey.GOOGLE_CALENDAR_MODULE_ENABLED, true)
                    || settingEnabled(settings, SettingKey.SCANNER_MODULE_ENABLED, true)
                    || settingEnabled(settings, SettingKey.WHATSAPP_MODULE_ENABLED, true)
                    || settingEnabled(settings, SettingKey.VIBER_MODULE_ENABLED, false);
            case "WEBSITE_WIDGET" -> websiteWidgetEnabled(settings);
            case "GUEST_MOBILE_APP" -> guestAppEnabled(settings);
            case "PAYMENTS" -> settingEnabled(settings, SettingKey.BILLING_ENABLED, true);
            case "SCANNER" -> settingEnabled(settings, SettingKey.SCANNER_MODULE_ENABLED, true);
            default -> true;
        };
    }

    private boolean websiteWidgetEnabled(Map<String, String> settings) {
        return settingEnabled(settings, SettingKey.WEBSITE_WIDGET_ENABLED, true);
    }

    private boolean guestAppEnabled(Map<String, String> settings) {
        return guestAppBoolean(settings, "guestAppEnabled", true);
    }

    private boolean guestWalletEnabled(Map<String, String> settings) {
        return guestAppEnabled(settings) && guestAppBoolean(settings, "walletEnabled", true);
    }

    private boolean guestOrdersEnabled(Map<String, String> settings) {
        return guestWalletEnabled(settings) && guestAppBoolean(settings, "ordersEnabled", true);
    }

    private boolean guestInboxEnabled(Map<String, String> settings) {
        return guestAppEnabled(settings) && guestAppBoolean(settings, "inboxEnabled", true);
    }

    private boolean settingEnabled(Map<String, String> settings, SettingKey key, boolean defaultValue) {
        String raw = settings.get(key.name());
        if (raw == null || raw.isBlank()) return defaultValue;
        return !"false".equalsIgnoreCase(raw.trim());
    }

    private boolean guestAppBoolean(Map<String, String> settings, String jsonKey, boolean defaultValue) {
        String raw = settings.get(SettingKey.GUEST_APP_SETTINGS_JSON.name());
        if (raw == null || raw.isBlank()) return defaultValue;
        try {
            var node = objectMapper.readTree(raw);
            if (node == null || !node.has(jsonKey) || node.get(jsonKey).isNull()) return defaultValue;
            return node.get(jsonKey).asBoolean(defaultValue);
        } catch (Exception ignored) {
            return defaultValue;
        }
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
