package com.example.app.workspaceservice;

import com.example.app.session.SessionType;
import com.example.app.user.User;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class WorkspaceServiceAuditService {
    private final WorkspaceServiceAuditLogRepository auditLogs;
    private final ObjectMapper objectMapper;

    public WorkspaceServiceAuditService(WorkspaceServiceAuditLogRepository auditLogs, ObjectMapper objectMapper) {
        this.auditLogs = auditLogs;
        this.objectMapper = objectMapper;
    }

    public void record(User actor, String action, WorkspaceServiceTemplate template,
                       SessionType offering, Map<String, ?> details) {
        if (actor == null || actor.getCompany() == null || actor.getCompany().getWorkspace() == null) return;
        WorkspaceServiceAuditLog row = new WorkspaceServiceAuditLog();
        row.setWorkspace(actor.getCompany().getWorkspace());
        row.setActor(actor);
        row.setActorCompany(actor.getCompany());
        row.setWorkspaceServiceTemplate(template);
        row.setSessionType(offering);
        row.setAction(action);
        try {
            row.setDetailsJson(objectMapper.writeValueAsString(details == null ? Map.of() : details));
        } catch (JsonProcessingException ex) {
            row.setDetailsJson("{}");
        }
        auditLogs.save(row);
    }
}
