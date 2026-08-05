package com.example.app.workspacesubscription;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WorkspaceSubscriptionAuditLogRepository extends JpaRepository<WorkspaceSubscriptionAuditLog, Long> {
    List<WorkspaceSubscriptionAuditLog> findTop50BySubscriptionIdOrderByCreatedAtDescIdDesc(Long subscriptionId);
}
