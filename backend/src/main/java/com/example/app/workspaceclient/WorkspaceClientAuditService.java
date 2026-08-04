package com.example.app.workspaceclient;

import com.example.app.company.Company;
import com.example.app.user.User;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class WorkspaceClientAuditService {
    private final WorkspaceClientAuditLogRepository auditLogs;
    private final ObjectMapper objectMapper;

    public WorkspaceClientAuditService(WorkspaceClientAuditLogRepository auditLogs, ObjectMapper objectMapper) {
        this.auditLogs = auditLogs;
        this.objectMapper = objectMapper;
    }

    public void record(
            User actor,
            String action,
            Long workspaceClientId,
            Long relatedWorkspaceClientId,
            Long clientId,
            Map<String, ?> details
    ) {
        if (actor == null) return;
        recordForUnit(
                actor.getCompany(), actor, action, workspaceClientId, relatedWorkspaceClientId, clientId, details);
    }

    public void recordForUnit(
            Company unit,
            User actor,
            String action,
            Long workspaceClientId,
            Long relatedWorkspaceClientId,
            Long clientId,
            Map<String, ?> details
    ) {
        if (unit == null || unit.getWorkspace() == null) return;
        WorkspaceClientAuditLog row = new WorkspaceClientAuditLog();
        row.setWorkspace(unit.getWorkspace());
        row.setActor(actor);
        row.setActorCompany(unit);
        row.setAction(action);
        row.setWorkspaceClientId(workspaceClientId);
        row.setRelatedWorkspaceClientId(relatedWorkspaceClientId);
        row.setClientId(clientId);
        row.setDetailsJson(toJson(details == null ? Map.of() : details));
        auditLogs.save(row);
    }

    private String toJson(Map<String, ?> details) {
        try {
            return objectMapper.writeValueAsString(details);
        } catch (JsonProcessingException ex) {
            return "{}";
        }
    }
}
