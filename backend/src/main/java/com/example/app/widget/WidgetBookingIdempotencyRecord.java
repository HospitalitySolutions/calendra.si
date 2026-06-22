package com.example.app.widget;

import com.example.app.common.BaseEntity;
import com.example.app.company.Company;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "widget_booking_idempotency", uniqueConstraints = @UniqueConstraint(name = "ux_widget_booking_idempotency_company_key_endpoint", columnNames = {"company_id", "idempotency_key", "endpoint"}))
public class WidgetBookingIdempotencyRecord extends BaseEntity {
    @ManyToOne(optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @Column(name = "idempotency_key", nullable = false, length = 128)
    private String idempotencyKey;

    @Column(nullable = false, length = 80)
    private String endpoint;

    @Column(name = "payload_hash", nullable = false, length = 128)
    private String payloadHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private WidgetBookingIdempotencyStatus status = WidgetBookingIdempotencyStatus.IN_PROGRESS;

    @Column(name = "response_json", columnDefinition = "TEXT")
    private String responseJson;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "failed_at")
    private Instant failedAt;

    @Column(name = "last_error", length = 1000)
    private String lastError;
}
