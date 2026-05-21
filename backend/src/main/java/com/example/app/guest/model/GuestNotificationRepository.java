package com.example.app.guest.model;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GuestNotificationRepository extends JpaRepository<GuestNotification, Long> {
    List<GuestNotification> findAllByGuestUserIdAndCompanyIdOrderByCreatedAtDesc(Long guestUserId, Long companyId);
    Optional<GuestNotification> findByIdAndGuestUserId(Long id, Long guestUserId);
}
