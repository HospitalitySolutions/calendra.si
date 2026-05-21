package com.example.app.inbox;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ClientMessageRepository extends JpaRepository<ClientMessage, Long> {
    List<ClientMessage> findAllByCompanyIdOrderByCreatedAtDesc(Long companyId);
    List<ClientMessage> findAllByCompanyIdAndClientIdOrderByCreatedAtAsc(Long companyId, Long clientId);
    java.util.Optional<ClientMessage> findFirstByCompanyIdAndExternalMessageId(Long companyId, String externalMessageId);
}
