package com.example.app.inbox;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ScheduledMessageRepository extends JpaRepository<ScheduledMessage, Long> {
    List<ScheduledMessage> findByCompanyIdAndStatusOrderByNextRunAtAsc(Long companyId, ScheduledMessageStatus status);
    List<ScheduledMessage> findByStatus(ScheduledMessageStatus status);
    Optional<ScheduledMessage> findByIdAndCompanyId(Long id, Long companyId);
}
