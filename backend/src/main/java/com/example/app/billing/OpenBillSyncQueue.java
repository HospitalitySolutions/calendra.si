package com.example.app.billing;

import com.example.app.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "open_bill_sync_queue")
public class OpenBillSyncQueue extends BaseEntity {
    @Column(name = "company_id", nullable = false)
    private Long companyId;

    @Column(name = "session_booking_id")
    private Long sessionBookingId;

    @Column(name = "booking_group_key", length = 64)
    private String bookingGroupKey;

    @Column(name = "due_at", nullable = false)
    private Instant dueAt = Instant.now();

    @Column(nullable = false)
    private int attempts = 0;

    @Column(name = "last_error", length = 1000)
    private String lastError;
}
