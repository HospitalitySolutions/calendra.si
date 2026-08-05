package com.example.app.workspaceservice;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface WorkspaceServiceAuditLogRepository extends JpaRepository<WorkspaceServiceAuditLog, Long> {
    List<WorkspaceServiceAuditLog> findTop100ByWorkspaceIdOrderByCreatedAtDesc(Long workspaceId);
}
