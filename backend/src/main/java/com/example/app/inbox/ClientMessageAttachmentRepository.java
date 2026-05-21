package com.example.app.inbox;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ClientMessageAttachmentRepository extends JpaRepository<ClientMessageAttachment, Long> {
    Optional<ClientMessageAttachment> findByIdAndMessageCompanyIdAndMessageClientIdAndMessageChannel(
            Long id,
            Long companyId,
            Long clientId,
            MessageChannel channel
    );

    boolean existsByClientFileId(Long clientFileId);
}
