package com.example.app.inbox;

import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ClientMessageRepository extends JpaRepository<ClientMessage, Long> {
    List<ClientMessage> findAllByCompanyIdOrderByCreatedAtDesc(Long companyId);
    List<ClientMessage> findAllByCompanyIdAndClientIdOrderByCreatedAtAsc(Long companyId, Long clientId);
    java.util.Optional<ClientMessage> findFirstByCompanyIdAndExternalMessageId(Long companyId, String externalMessageId);

    @Modifying
    @Query("delete from ClientMessage m where m.createdAt < :cutoff")
    int deleteAllByCreatedAtBefore(@Param("cutoff") Instant cutoff);
}
