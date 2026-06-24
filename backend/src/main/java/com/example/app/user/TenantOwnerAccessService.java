package com.example.app.user;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
public class TenantOwnerAccessService {
    private final UserRepository users;

    public TenantOwnerAccessService(UserRepository users) {
        this.users = users;
    }

    @Transactional(readOnly = true)
    public Long tenantOwnerId(Long companyId) {
        if (companyId == null) return null;
        return users.findFirstByCompanyIdOrderByIdAsc(companyId)
                .map(User::getId)
                .orElse(null);
    }

    @Transactional
    public Long ensureTenantOwnerAdministrator(Long companyId) {
        if (companyId == null) return null;
        return users.findFirstByCompanyIdOrderByIdAsc(companyId)
                .map(owner -> {
                    boolean changed = false;
                    if (owner.getRole() != Role.ADMIN) {
                        owner.setRole(Role.ADMIN);
                        changed = true;
                    }
                    if (owner.getEmployeeAccessRole() != null) {
                        owner.setEmployeeAccessRole(null);
                        changed = true;
                    }
                    if (!owner.isActive()) {
                        owner.setActive(true);
                        changed = true;
                    }
                    if (changed) {
                        owner.setUpdatedAt(Instant.now());
                        users.save(owner);
                    }
                    return owner.getId();
                })
                .orElse(null);
    }

    public boolean isTenantOwner(User user, Long tenantOwnerId) {
        return user != null && tenantOwnerId != null && tenantOwnerId.equals(user.getId());
    }
}
