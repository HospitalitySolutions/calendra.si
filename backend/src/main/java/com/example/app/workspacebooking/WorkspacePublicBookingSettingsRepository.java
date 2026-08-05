package com.example.app.workspacebooking;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WorkspacePublicBookingSettingsRepository extends JpaRepository<WorkspacePublicBookingSettings, Long> {
    Optional<WorkspacePublicBookingSettings> findByWorkspaceId(Long workspaceId);
    Optional<WorkspacePublicBookingSettings> findBySlugIgnoreCase(String slug);
    boolean existsBySlugIgnoreCaseAndWorkspaceIdNot(String slug, Long workspaceId);
}
