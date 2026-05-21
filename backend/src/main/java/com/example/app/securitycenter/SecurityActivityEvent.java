package com.example.app.securitycenter;

import com.example.app.common.BaseEntity;
import com.example.app.user.User;
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
@Table(name = "security_activity_events", indexes = {
        @Index(name = "idx_security_activity_events_user_time", columnList = "user_id,occurredAt")
})
public class SecurityActivityEvent extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 64)
    private SecurityEventType eventType;

    @Column(nullable = false, length = 160)
    private String title;

    @Column(length = 500)
    private String detail;

    @Column(nullable = false)
    private Instant occurredAt;

    @Column(length = 64)
    private String riskLevel;

    @Column(length = 128)
    private String ipAddress;

    @Column(length = 500)
    private String userAgent;
}
