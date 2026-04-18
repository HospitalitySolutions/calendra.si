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
@Table(name = "recovery_codes", indexes = {
        @Index(name = "idx_recovery_codes_user_id", columnList = "user_id")
})
public class RecoveryCode extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, length = 255)
    private String codeHash;

    @Column(nullable = false, length = 64)
    private String codeHint;

    @Column
    private Instant usedAt;
}
