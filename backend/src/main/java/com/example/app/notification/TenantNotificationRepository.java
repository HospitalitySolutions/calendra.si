package com.example.app.notification;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TenantNotificationRepository extends JpaRepository<TenantNotification, Long> {
    @Query("""
            select n from TenantNotification n
            where n.recipient.id = :userId
              and (n.expiresAt is null or n.expiresAt > :now)
              and (:category = 'ALL' or n.category = :category)
            order by n.createdAt desc, n.id desc
            """)
    List<TenantNotification> findVisible(@Param("userId") Long userId,
                                         @Param("category") String category,
                                         @Param("now") Instant now,
                                         Pageable pageable);

    @Query("""
            select count(n) from TenantNotification n
            where n.recipient.id = :userId
              and n.readAt is null
              and (n.expiresAt is null or n.expiresAt > :now)
            """)
    long countUnread(@Param("userId") Long userId, @Param("now") Instant now);

    Optional<TenantNotification> findByIdAndRecipientId(Long id, Long recipientId);

    boolean existsByRecipientIdAndDedupeKey(Long recipientId, String dedupeKey);

    @Modifying
    @Query("update TenantNotification n set n.readAt = :now where n.recipient.id = :userId and n.readAt is null")
    int markAllRead(@Param("userId") Long userId, @Param("now") Instant now);
}
