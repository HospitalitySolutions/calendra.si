package com.example.app.notification;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlatformAnnouncementReadRepository extends JpaRepository<PlatformAnnouncementRead, Long> {
    List<PlatformAnnouncementRead> findAllByUserIdAndAnnouncementIdIn(Long userId, Collection<Long> announcementIds);
    Optional<PlatformAnnouncementRead> findByUserIdAndAnnouncementId(Long userId, Long announcementId);
}
