package com.example.app.files;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ClientFileRepository extends JpaRepository<ClientFile, Long> {
    List<ClientFile> findAllByClientIdAndOwnerCompanyIdOrderByCreatedAtDescIdDesc(Long clientId, Long ownerCompanyId);

    Optional<ClientFile> findByIdAndClientIdAndOwnerCompanyId(Long id, Long clientId, Long ownerCompanyId);

    List<ClientFile> findAllByClientId(Long clientId);
}
