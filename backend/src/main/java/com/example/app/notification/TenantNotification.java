package com.example.app.notification;

import com.example.app.common.BaseEntity;
import com.example.app.company.Company;
import com.example.app.user.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
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
@Table(
        name = "tenant_notifications",
        indexes = {
                @Index(name = "idx_tenant_notifications_recipient_created", columnList = "recipient_user_id,created_at"),
                @Index(name = "idx_tenant_notifications_company_created", columnList = "company_id,created_at")
        },
        uniqueConstraints = @UniqueConstraint(name = "uq_tenant_notification_dedupe", columnNames = {"recipient_user_id", "dedupe_key"})
)
public class TenantNotification extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "recipient_user_id", nullable = false)
    private User recipient;

    @Column(nullable = false, length = 40)
    private String category;

    @Column(nullable = false, length = 60)
    private String type;

    @Column(nullable = false, length = 20)
    private String severity = "NORMAL";

    @Column(nullable = false, length = 180)
    private String title;

    @Column(nullable = false, length = 1200)
    private String message;

    @Column(name = "source", length = 50)
    private String source;

    @Column(name = "entity_type", length = 50)
    private String entityType;

    @Column(name = "entity_id")
    private Long entityId;

    @Column(name = "action_url", length = 600)
    private String actionUrl;

    @Column(name = "dedupe_key", nullable = false, length = 180)
    private String dedupeKey;

    @Column(name = "metadata_json", columnDefinition = "TEXT")
    private String metadataJson;

    @Column(name = "read_at")
    private Instant readAt;

    @Column(name = "expires_at")
    private Instant expiresAt;
}
