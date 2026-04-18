package com.example.app.guest.model;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GuestOrderRepository extends JpaRepository<GuestOrder, Long> {
    List<GuestOrder> findAllByGuestUserIdAndCompanyIdOrderByCreatedAtDesc(Long guestUserId, Long companyId);
    List<GuestOrder> findAllByGuestUserIdAndCompanyIdAndStatusOrderByCreatedAtDesc(Long guestUserId, Long companyId, OrderStatus status);
    Optional<GuestOrder> findByIdAndGuestUserId(Long id, Long guestUserId);
}
