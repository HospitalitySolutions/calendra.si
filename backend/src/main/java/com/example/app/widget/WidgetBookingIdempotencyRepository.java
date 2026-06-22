package com.example.app.widget;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

public interface WidgetBookingIdempotencyRepository extends JpaRepository<WidgetBookingIdempotencyRecord, Long> {
    Optional<WidgetBookingIdempotencyRecord> findByCompanyIdAndIdempotencyKeyAndEndpoint(Long companyId, String idempotencyKey, String endpoint);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select r
            from WidgetBookingIdempotencyRecord r
            where r.company.id = :companyId
              and r.idempotencyKey = :idempotencyKey
              and r.endpoint = :endpoint
            """)
    Optional<WidgetBookingIdempotencyRecord> findForUpdate(
            @Param("companyId") Long companyId,
            @Param("idempotencyKey") String idempotencyKey,
            @Param("endpoint") String endpoint
    );

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = """
            INSERT INTO widget_booking_idempotency (
                created_at,
                updated_at,
                company_id,
                idempotency_key,
                endpoint,
                payload_hash,
                status
            ) VALUES (
                now(),
                now(),
                :companyId,
                :idempotencyKey,
                :endpoint,
                :payloadHash,
                'IN_PROGRESS'
            )
            ON CONFLICT (company_id, idempotency_key, endpoint) DO NOTHING
            """, nativeQuery = true)
    int claim(
            @Param("companyId") Long companyId,
            @Param("idempotencyKey") String idempotencyKey,
            @Param("endpoint") String endpoint,
            @Param("payloadHash") String payloadHash
    );
}
