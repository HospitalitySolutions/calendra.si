package com.example.app.workspaceclient;

import com.example.app.client.Client;
import com.example.app.client.ClientRepository;
import com.example.app.user.User;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class WorkspaceClientService {
    private final WorkspaceClientRepository workspaceClients;
    private final ClientRepository clients;
    private final WorkspaceClientAuditService audit;

    public WorkspaceClientService(
            WorkspaceClientRepository workspaceClients,
            ClientRepository clients,
            WorkspaceClientAuditService audit
    ) {
        this.workspaceClients = workspaceClients;
        this.clients = clients;
        this.audit = audit;
    }

    @Transactional
    public Client synchronizeFromUnitClient(Client client, User actor, boolean created) {
        if (client == null || client.getId() == null || client.getCompany() == null || client.getCompany().getWorkspace() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Client workspace identity is unavailable.");
        }
        WorkspaceClient identity = client.getWorkspaceClient();
        if (identity == null) {
            identity = newIdentity(client);
            client.setWorkspaceClient(identity);
        }
        if (identity.getWorkspace() == null
                || !identity.getWorkspace().getId().equals(client.getCompany().getWorkspace().getId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Client identity belongs to another workspace.");
        }
        if (identity.getStatus() != WorkspaceClientStatus.ACTIVE) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Merged or anonymized identities cannot be edited.");
        }
        identity.setFirstName(client.getFirstName());
        identity.setLastName(client.getLastName());
        identity.setEmail(client.getEmail());
        identity.setPhone(client.getPhone());
        identity = workspaceClients.save(identity);
        client.setWorkspaceClient(identity);
        clients.save(client);
        clients.synchronizeSharedIdentity(
                identity.getId(), identity.getFirstName(), identity.getLastName(), identity.getEmail(), identity.getPhone());
        audit.recordForUnit(
                client.getCompany(),
                actor,
                created ? "WORKSPACE_CLIENT_CREATED" : "SHARED_IDENTITY_UPDATED",
                identity.getId(),
                null,
                client.getId(),
                Map.of("unitId", client.getCompany().getId()));
        return client;
    }

    @Transactional
    public WorkspaceClient detachForUnitAnonymization(Client client, User actor) {
        WorkspaceClient previous = client.getWorkspaceClient();
        if (previous == null || clients.countByWorkspaceClientId(previous.getId()) <= 1) return previous;
        WorkspaceClient isolated = newIdentity(client);
        isolated.setStatus(WorkspaceClientStatus.ACTIVE);
        isolated = workspaceClients.save(isolated);
        client.setWorkspaceClient(isolated);
        clients.save(client);
        audit.recordForUnit(
                client.getCompany(),
                actor,
                "UNIT_CLIENT_UNLINKED_FOR_ANONYMIZATION",
                isolated.getId(),
                previous.getId(),
                client.getId(),
                Map.of("unitId", client.getCompany().getId()));
        return isolated;
    }

    @Transactional
    public void prepareForUnitClientDeletion(Client client, User actor) {
        if (client == null || client.getWorkspaceClient() == null) return;
        WorkspaceClient identity = client.getWorkspaceClient();
        boolean lastRelationship = clients.countByWorkspaceClientId(identity.getId()) <= 1;
        if (lastRelationship) {
            identity.setFirstName("Deleted");
            identity.setLastName("Client " + client.getId());
            identity.setEmail(null);
            identity.setPhone(null);
            identity.setStatus(WorkspaceClientStatus.ANONYMIZED);
            workspaceClients.save(identity);
        }
        audit.recordForUnit(
                client.getCompany(),
                actor,
                "UNIT_CLIENT_DELETED",
                identity.getId(),
                null,
                client.getId(),
                Map.of("unitId", client.getCompany().getId(), "lastRelationship", lastRelationship));
    }

    @Transactional
    public void markUnitIdentityAnonymized(Client client, User actor) {
        if (client == null || client.getWorkspaceClient() == null) return;
        WorkspaceClient identity = client.getWorkspaceClient();
        identity.setFirstName("Anonymized");
        identity.setLastName("Client " + client.getId());
        identity.setEmail(null);
        identity.setPhone(null);
        identity.setStatus(WorkspaceClientStatus.ANONYMIZED);
        workspaceClients.save(identity);
        audit.recordForUnit(
                client.getCompany(),
                actor,
                "UNIT_CLIENT_ANONYMIZED",
                identity.getId(),
                null,
                client.getId(),
                Map.of("unitId", client.getCompany().getId()));
    }

    private WorkspaceClient newIdentity(Client client) {
        WorkspaceClient identity = new WorkspaceClient();
        identity.setWorkspace(client.getCompany().getWorkspace());
        identity.setFirstName(client.getFirstName());
        identity.setLastName(client.getLastName());
        identity.setEmail(client.getEmail());
        identity.setPhone(client.getPhone());
        identity.setStatus(WorkspaceClientStatus.ACTIVE);
        return identity;
    }
}
