package com.example.app.guest.model;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface GuestNotificationRepository extends JpaRepository<GuestNotification, Long> {
    List<GuestNotification> findAllByGuestUserIdAndCompanyIdOrderByCreatedAtDesc(Long guestUserId, Long companyId);
    List<GuestNotification> findAllByGuestUserIdAndCompanyIdOrderByCreatedAtDesc(Long guestUserId, Long companyId, Pageable pageable);
    Optional<GuestNotification> findByIdAndGuestUserId(Long id, Long guestUserId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            UPDATE GuestNotification n
            SET n.readAt = :readAt
            WHERE n.guestUser.id = :guestUserId
              AND n.company.id = :companyId
              AND n.readAt IS NULL
            """)
    int markAllUnreadAsRead(
            @Param("guestUserId") Long guestUserId,
            @Param("companyId") Long companyId,
            @Param("readAt") Instant readAt
    );
}
