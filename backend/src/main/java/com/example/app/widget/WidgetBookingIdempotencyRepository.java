package com.example.app.widget;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WidgetBookingIdempotencyRepository extends JpaRepository<WidgetBookingIdempotencyRecord, Long> {
    Optional<WidgetBookingIdempotencyRecord> findByCompanyIdAndIdempotencyKeyAndEndpoint(Long companyId, String idempotencyKey, String endpoint);
}
