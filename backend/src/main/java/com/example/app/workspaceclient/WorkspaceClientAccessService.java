package com.example.app.workspaceclient;

import com.example.app.client.Client;
import com.example.app.client.ClientRepository;
import com.example.app.security.SecurityUtils;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class WorkspaceClientAccessService {
    private final UserRepository users;
    private final ClientRepository clients;

    public WorkspaceClientAccessService(UserRepository users, ClientRepository clients) {
        this.users = users;
        this.clients = clients;
    }

    public AccessSnapshot snapshot(User me) {
        if (me == null || me.getLoginAccount() == null || me.getCompany() == null || me.getCompany().getWorkspace() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        Long workspaceId = me.getCompany().getWorkspace().getId();
        List<User> memberships = users.findActiveWorkspaceMemberships(me.getLoginAccount().getId(), workspaceId);
        Map<Long, User> byCompany = new LinkedHashMap<>();
        memberships.forEach(membership -> byCompany.put(membership.getCompany().getId(), membership));
        return new AccessSnapshot(workspaceId, memberships, byCompany);
    }

    public List<Client> visibleRelationships(User me, Collection<Long> workspaceClientIds) {
        if (workspaceClientIds == null || workspaceClientIds.isEmpty()) return List.of();
        AccessSnapshot access = snapshot(me);
        Set<Long> companyIds = access.companyIds();
        Set<Long> adminCompanyIds = access.adminCompanyIds();
        Set<Long> membershipIds = access.membershipIds();
        return clients.findVisibleWorkspaceRelationships(
                workspaceClientIds,
                companyIds.isEmpty() ? Set.of(-1L) : companyIds,
                adminCompanyIds.isEmpty() ? Set.of(-1L) : adminCompanyIds,
                membershipIds.isEmpty() ? Set.of(-1L) : membershipIds);
    }

    public void requireVisibleRelationship(User me, Client client) {
        if (client == null || client.getCompany() == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        User membership = snapshot(me).membershipsByCompany().get(client.getCompany().getId());
        if (membership == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        if (SecurityUtils.isAdmin(membership)) return;
        boolean assigned = client.getAssignedTo() != null && client.getAssignedTo().getId().equals(membership.getId());
        if (!assigned && client.getAssignedUsers() != null) {
            assigned = client.getAssignedUsers().stream().anyMatch(user -> user.getId().equals(membership.getId()));
        }
        if (!assigned) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
    }

    public void requireAdminForCompanies(User me, Collection<Long> companyIds) {
        AccessSnapshot access = snapshot(me);
        for (Long companyId : companyIds == null ? List.<Long>of() : companyIds) {
            User membership = access.membershipsByCompany().get(companyId);
            if (membership == null || !SecurityUtils.isAdmin(membership)) {
                throw new ResponseStatusException(
                        HttpStatus.FORBIDDEN,
                        "Administrator access is required in every affected unit.");
            }
        }
    }

    public record AccessSnapshot(Long workspaceId, List<User> memberships, Map<Long, User> membershipsByCompany) {
        public Set<Long> companyIds() {
            return new LinkedHashSet<>(membershipsByCompany.keySet());
        }

        public Set<Long> adminCompanyIds() {
            Set<Long> ids = new LinkedHashSet<>();
            membershipsByCompany.forEach((companyId, membership) -> {
                if (SecurityUtils.isAdmin(membership)) ids.add(companyId);
            });
            return ids;
        }

        public Set<Long> membershipIds() {
            Set<Long> ids = new LinkedHashSet<>();
            memberships.forEach(membership -> ids.add(membership.getId()));
            return ids;
        }
    }
}
