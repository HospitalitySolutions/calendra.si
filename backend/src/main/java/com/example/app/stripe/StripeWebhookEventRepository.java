package com.example.app.stripe;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StripeWebhookEventRepository extends JpaRepository<StripeWebhookEvent, Long> {
    boolean existsByEventId(String eventId);
    Optional<StripeWebhookEvent> findByEventId(String eventId);
}
