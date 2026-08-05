package com.example.app.workspacesubscription;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WorkspaceSubscriptionRepository extends JpaRepository<WorkspaceSubscription, Long> {
    Optional<WorkspaceSubscription> findByWorkspaceId(Long workspaceId);
    Optional<WorkspaceSubscription> findByLegacyPrimaryCompanyId(Long companyId);
}
