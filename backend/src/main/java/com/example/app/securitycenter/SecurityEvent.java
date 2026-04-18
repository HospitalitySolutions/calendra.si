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
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "security_events", indexes = {
        @Index(name = "idx_security_events_user_id", columnList = "user_id"),
        @Index(name = "idx_security_events_type", columnList = "eventType")
})
public class SecurityEvent extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 64)
    private SecurityEventType eventType;

    @Column(nullable = false, length = 255)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(length = 128)
    private String ipAddress;

    @Column(length = 1024)
    private String userAgent;

    @Column(length = 16)
    private String severity;
}
