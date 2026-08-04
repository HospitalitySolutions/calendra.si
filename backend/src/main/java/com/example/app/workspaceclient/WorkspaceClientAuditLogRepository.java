package com.example.app.workspaceclient;

import org.springframework.data.jpa.repository.JpaRepository;

public interface WorkspaceClientAuditLogRepository extends JpaRepository<WorkspaceClientAuditLog, Long> {
}
