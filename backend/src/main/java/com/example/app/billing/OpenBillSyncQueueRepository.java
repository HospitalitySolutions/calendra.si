package com.example.app.billing;

import java.time.Instant;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface OpenBillSyncQueueRepository extends JpaRepository<OpenBillSyncQueue, Long> {

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Transactional
    @Query(value = """
            INSERT INTO open_bill_sync_queue (created_at, updated_at, company_id, session_booking_id, booking_group_key, due_at, attempts)
            VALUES (now(), now(), :companyId, :sessionBookingId, NULL, :dueAt, 0)
            ON CONFLICT (company_id, session_booking_id) WHERE session_booking_id IS NOT NULL
            DO UPDATE SET updated_at = now(), due_at = LEAST(open_bill_sync_queue.due_at, EXCLUDED.due_at), attempts = 0, last_error = NULL
            """, nativeQuery = true)
    int enqueueSession(@Param("companyId") Long companyId, @Param("sessionBookingId") Long sessionBookingId, @Param("dueAt") Instant dueAt);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Transactional
    @Query(value = """
            INSERT INTO open_bill_sync_queue (created_at, updated_at, company_id, session_booking_id, booking_group_key, due_at, attempts)
            VALUES (now(), now(), :companyId, NULL, :bookingGroupKey, :dueAt, 0)
            ON CONFLICT (company_id, booking_group_key) WHERE booking_group_key IS NOT NULL
            DO UPDATE SET updated_at = now(), due_at = LEAST(open_bill_sync_queue.due_at, EXCLUDED.due_at), attempts = 0, last_error = NULL
            """, nativeQuery = true)
    int enqueueGroup(@Param("companyId") Long companyId, @Param("bookingGroupKey") String bookingGroupKey, @Param("dueAt") Instant dueAt);

    @Query("""
            SELECT q.id FROM OpenBillSyncQueue q
            WHERE q.dueAt <= :now
            ORDER BY q.dueAt ASC, q.id ASC
            """)
    List<Long> findDueIds(@Param("now") Instant now, Pageable pageable);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Transactional
    @Query("""
            UPDATE OpenBillSyncQueue q
            SET q.attempts = q.attempts + 1,
                q.dueAt = :retryAt,
                q.lastError = :lastError
            WHERE q.id = :id
            """)
    int markFailed(@Param("id") Long id, @Param("retryAt") Instant retryAt, @Param("lastError") String lastError);
}
