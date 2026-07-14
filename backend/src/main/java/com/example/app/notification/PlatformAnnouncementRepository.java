package com.example.app.notification;

import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PlatformAnnouncementRepository extends JpaRepository<PlatformAnnouncement, Long> {
    @Query("""
            select a from PlatformAnnouncement a
            where a.active = true
              and a.startsAt <= :now
              and (a.expiresAt is null or a.expiresAt > :now)
            order by a.createdAt desc, a.id desc
            """)
    List<PlatformAnnouncement> findActive(@Param("now") Instant now);

    List<PlatformAnnouncement> findAllByOrderByCreatedAtDesc();
}
