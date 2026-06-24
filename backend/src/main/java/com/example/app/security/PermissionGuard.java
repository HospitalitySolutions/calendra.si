package com.example.app.security;

import com.example.app.user.Role;
import com.example.app.user.TenantOwnerAccessService;
import com.example.app.user.User;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

@Component("permissionGuard")
public class PermissionGuard {
    private final TenantOwnerAccessService tenantOwnerAccessService;

    public PermissionGuard(TenantOwnerAccessService tenantOwnerAccessService) {
        this.tenantOwnerAccessService = tenantOwnerAccessService;
    }

    public boolean can(Authentication authentication, String permission) {
        if (authentication == null || !(authentication.getPrincipal() instanceof User user)) {
            return false;
        }
        return can(user, permission);
    }

    public boolean can(User user, String permission) {
        if (user == null) return false;
        if (user.getRole() == Role.SUPER_ADMIN) return true;
        if (user.getRole() == Role.ADMIN) return true;
        if (user.getCompany() != null && tenantOwnerAccessService.isTenantOwner(user, tenantOwnerAccessService.tenantOwnerId(user.getCompany().getId()))) {
            return true;
        }
        return SecurityUtils.hasPermission(user, permission);
    }

    public boolean isCustomRoleUser(User user) {
        return user != null
                && user.getRole() == Role.CONSULTANT
                && user.getEmployeeAccessRole() != null;
    }
}
