package com.example.app.configcopy;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ConfigurationCopyAuditLogRepository extends JpaRepository<ConfigurationCopyAuditLog, Long> {
    List<ConfigurationCopyAuditLog> findTop50ByWorkspaceIdOrderByCreatedAtDesc(Long workspaceId);
}
