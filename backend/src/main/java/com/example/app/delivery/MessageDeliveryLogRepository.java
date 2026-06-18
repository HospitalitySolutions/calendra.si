package com.example.app.delivery;

import java.time.Instant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface MessageDeliveryLogRepository extends JpaRepository<MessageDeliveryLog, Long>, JpaSpecificationExecutor<MessageDeliveryLog> {
    long countByCompanyIdAndCreatedAtAfter(Long companyId, Instant after);

    long countByCompanyIdAndStatusAndCreatedAtAfter(Long companyId, MessageDeliveryStatus status, Instant after);

    long countByCompanyIdAndChannelAndCreatedAtAfter(Long companyId, MessageDeliveryChannel channel, Instant after);
}
