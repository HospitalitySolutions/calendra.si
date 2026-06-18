package com.example.app.delivery;

import java.time.Instant;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MessageDeliveryLogRepository extends JpaRepository<MessageDeliveryLog, Long> {
    @Query("""
            select log
            from MessageDeliveryLog log
            where log.company.id = :companyId
              and (:channel is null or log.channel = :channel)
              and (:status is null or log.status = :status)
              and (:messageTypeFilterEnabled = false or lower(log.messageType) = :messageTypeLower)
              and (:from is null or log.createdAt >= :from)
              and (:to is null or log.createdAt < :to)
              and (
                    :searchFilterEnabled = false
                    or lower(coalesce(log.recipient, '')) like :searchPattern
                    or lower(coalesce(log.subject, '')) like :searchPattern
                    or lower(coalesce(log.messagePreview, '')) like :searchPattern
                    or lower(coalesce(log.referenceId, '')) like :searchPattern
                    or lower(coalesce(log.errorMessage, '')) like :searchPattern
              )
            order by log.createdAt desc
            """)
    Page<MessageDeliveryLog> searchTenantLogs(
            @Param("companyId") Long companyId,
            @Param("channel") MessageDeliveryChannel channel,
            @Param("status") MessageDeliveryStatus status,
            @Param("messageTypeFilterEnabled") boolean messageTypeFilterEnabled,
            @Param("messageTypeLower") String messageTypeLower,
            @Param("searchFilterEnabled") boolean searchFilterEnabled,
            @Param("searchPattern") String searchPattern,
            @Param("from") Instant from,
            @Param("to") Instant to,
            Pageable pageable
    );

    long countByCompanyIdAndCreatedAtAfter(Long companyId, Instant after);

    long countByCompanyIdAndStatusAndCreatedAtAfter(Long companyId, MessageDeliveryStatus status, Instant after);

    long countByCompanyIdAndChannelAndCreatedAtAfter(Long companyId, MessageDeliveryChannel channel, Instant after);
}
