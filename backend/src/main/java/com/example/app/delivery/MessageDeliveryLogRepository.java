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
              and (:messageType is null or lower(log.messageType) = lower(:messageType))
              and (:from is null or log.createdAt >= :from)
              and (:to is null or log.createdAt < :to)
              and (
                    :search is null
                    or lower(coalesce(log.recipient, '')) like lower(concat('%', :search, '%'))
                    or lower(coalesce(log.subject, '')) like lower(concat('%', :search, '%'))
                    or lower(coalesce(log.messagePreview, '')) like lower(concat('%', :search, '%'))
                    or lower(coalesce(log.referenceId, '')) like lower(concat('%', :search, '%'))
                    or lower(coalesce(log.errorMessage, '')) like lower(concat('%', :search, '%'))
              )
            order by log.createdAt desc
            """)
    Page<MessageDeliveryLog> searchTenantLogs(
            @Param("companyId") Long companyId,
            @Param("channel") MessageDeliveryChannel channel,
            @Param("status") MessageDeliveryStatus status,
            @Param("messageType") String messageType,
            @Param("search") String search,
            @Param("from") Instant from,
            @Param("to") Instant to,
            Pageable pageable
    );

    long countByCompanyIdAndCreatedAtAfter(Long companyId, Instant after);

    long countByCompanyIdAndStatusAndCreatedAtAfter(Long companyId, MessageDeliveryStatus status, Instant after);

    long countByCompanyIdAndChannelAndCreatedAtAfter(Long companyId, MessageDeliveryChannel channel, Instant after);
}
