package com.example.app.mfa;

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
@Table(name = "webauthn_credentials", indexes = {
        @Index(name = "idx_webauthn_credentials_user_id", columnList = "user_id"),
        @Index(name = "idx_webauthn_credentials_credential_id", columnList = "credentialId", unique = true)
})
public class WebAuthnCredential extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, unique = true, length = 512)
    private String credentialId;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String publicKeyCose;

    @Column(nullable = false)
    private long signatureCount;

    @Column(length = 255)
    private String label;

    @Column(length = 255)
    private String transportsJson;

    @Column(nullable = false)
    private boolean discoverable;

    @Column
    private Boolean backupEligible;

    @Column
    private Boolean backupState;

    @Column
    private Instant lastUsedAt;
}
