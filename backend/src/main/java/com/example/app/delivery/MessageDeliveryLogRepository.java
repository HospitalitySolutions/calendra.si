package com.example.app.delivery;

import java.time.Instant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MessageDeliveryLogRepository extends JpaRepository<MessageDeliveryLog, Long>, JpaSpecificationExecutor<MessageDeliveryLog> {
    long countByCompanyIdAndCreatedAtAfter(Long companyId, Instant after);

    long countByCompanyIdAndStatusAndCreatedAtAfter(Long companyId, MessageDeliveryStatus status, Instant after);

    long countByCompanyIdAndChannelAndCreatedAtAfter(Long companyId, MessageDeliveryChannel channel, Instant after);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("delete from MessageDeliveryLog log where log.createdAt < :cutoff")
    int deleteOlderThan(@Param("cutoff") Instant cutoff);
}

