package com.example.app.securitycenter;

import com.example.app.common.BaseEntity;
import com.example.app.user.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
@Table(name = "user_security_sessions", indexes = {
        @Index(name = "idx_user_security_sessions_user_last_seen", columnList = "user_id,lastSeenAt"),
        @Index(name = "idx_user_security_sessions_session_key", columnList = "sessionKey", unique = true)
})
public class UserSecuritySession extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, unique = true, length = 64)
    private String sessionKey;

    @Column(length = 160)
    private String label;

    @Column(length = 500)
    private String userAgent;

    @Column(length = 128)
    private String ipAddress;

    @Column(nullable = false)
    private Instant issuedAt;

    @Column(nullable = false)
    private Instant lastSeenAt;

    @Column
    private Instant revokedAt;

    @Column(length = 128)
    private String revokeReason;
}
