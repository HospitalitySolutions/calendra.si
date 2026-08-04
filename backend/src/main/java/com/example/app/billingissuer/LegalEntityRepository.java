package com.example.app.billingissuer;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LegalEntityRepository extends JpaRepository<LegalEntity, Long> {
    List<LegalEntity> findAllByWorkspaceIdOrderByActiveDescNameAscIdAsc(Long workspaceId);
    Optional<LegalEntity> findByIdAndWorkspaceId(Long id, Long workspaceId);
    boolean existsByWorkspaceIdAndNameIgnoreCase(Long workspaceId, String name);
}
