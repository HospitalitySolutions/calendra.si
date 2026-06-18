package com.example.app.delivery;

import com.example.app.client.Client;
import com.example.app.common.BaseEntity;
import com.example.app.company.Company;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(
        name = "message_delivery_logs",
        indexes = {
                @Index(name = "idx_message_delivery_company_created", columnList = "company_id, created_at"),
                @Index(name = "idx_message_delivery_company_status", columnList = "company_id, status"),
                @Index(name = "idx_message_delivery_company_channel", columnList = "company_id, channel"),
                @Index(name = "idx_message_delivery_reference", columnList = "company_id, reference_type, reference_id")
        }
)
public class MessageDeliveryLog extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "client_id")
    private Client client;

    @Column(name = "guest_user_id")
    private Long guestUserId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private MessageDeliveryChannel channel;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private MessageDeliveryStatus status;

    @Column(name = "message_type", nullable = false, length = 80)
    private String messageType;

    @Column(length = 320)
    private String recipient;

    @Column(length = 500)
    private String subject;

    @Column(name = "message_preview", length = 1200)
    private String messagePreview;

    @Column(name = "reference_type", length = 80)
    private String referenceType;

    @Column(name = "reference_id", length = 80)
    private String referenceId;

    @Column(name = "provider_message_id", length = 255)
    private String providerMessageId;

    @Column(name = "provider_status_code", length = 80)
    private String providerStatusCode;

    @Column(name = "error_message", length = 1200)
    private String errorMessage;

    @Column(name = "retry_count", nullable = false)
    private int retryCount = 0;

    @Column(name = "sent_at")
    private Instant sentAt;

    @Column(name = "delivered_at")
    private Instant deliveredAt;

    @Column(name = "failed_at")
    private Instant failedAt;

    @Column(name = "metadata_json", columnDefinition = "text")
    private String metadataJson;
}
