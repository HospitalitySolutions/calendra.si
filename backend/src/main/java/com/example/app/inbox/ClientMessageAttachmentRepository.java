package com.example.app.inbox;

import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ClientMessageAttachmentRepository extends JpaRepository<ClientMessageAttachment, Long> {
    Optional<ClientMessageAttachment> findByIdAndMessageCompanyIdAndMessageClientIdAndMessageChannel(
            Long id,
            Long companyId,
            Long clientId,
            MessageChannel channel
    );

    boolean existsByClientFileId(Long clientFileId);

    @Modifying
    @Query("delete from ClientMessageAttachment a where a.message.id in (select m.id from ClientMessage m where m.createdAt < :cutoff)")
    int deleteAllByMessageCreatedAtBefore(@Param("cutoff") Instant cutoff);
}
