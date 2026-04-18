package com.example.app.guest.model;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GuestOrderItemRepository extends JpaRepository<GuestOrderItem, Long> {
    List<GuestOrderItem> findAllByOrderIdOrderByIdAsc(Long orderId);
}
