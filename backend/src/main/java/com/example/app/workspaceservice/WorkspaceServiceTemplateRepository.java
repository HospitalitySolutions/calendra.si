package com.example.app.workspaceservice;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WorkspaceServiceTemplateRepository extends JpaRepository<WorkspaceServiceTemplate, Long> {
    List<WorkspaceServiceTemplate> findAllByWorkspaceIdOrderByActiveDescNameAscIdAsc(Long workspaceId);
    Optional<WorkspaceServiceTemplate> findByIdAndWorkspaceId(Long id, Long workspaceId);
    boolean existsByWorkspaceIdAndNameIgnoreCaseAndIdNot(Long workspaceId, String name, Long id);
    boolean existsByWorkspaceIdAndNameIgnoreCase(Long workspaceId, String name);
}
