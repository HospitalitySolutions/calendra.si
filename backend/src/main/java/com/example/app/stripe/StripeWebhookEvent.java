package com.example.app.stripe;

import com.example.app.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "stripe_webhook_events", uniqueConstraints = @UniqueConstraint(columnNames = "event_id"))
public class StripeWebhookEvent extends BaseEntity {
    @Column(name = "event_id", nullable = false)
    private String eventId;
    @Column(name = "event_type", nullable = false)
    private String eventType;
    @Column(name = "processing_status", nullable = false)
    private String processingStatus;
    @Column(name = "payload", columnDefinition = "TEXT")
    private String payload;
    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;
}
