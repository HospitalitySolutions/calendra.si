package com.example.app.widget.manage;

import com.example.app.common.BaseEntity;
import com.example.app.company.Company;
import com.example.app.session.SessionBooking;
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
@Table(
        name = "public_booking_manage_tokens",
        indexes = {
                @Index(name = "idx_public_booking_manage_token_hash", columnList = "token_hash"),
                @Index(name = "idx_public_booking_manage_booking", columnList = "booking_id"),
                @Index(name = "idx_public_booking_manage_tenant", columnList = "company_id")
        }
)
public class PublicBookingManageToken extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "booking_id", nullable = false)
    private SessionBooking booking;

    @Column(name = "token_hash", nullable = false, length = 128, unique = true)
    private String tokenHash;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "last_used_at")
    private Instant lastUsedAt;

    @Column(name = "revoked_at")
    private Instant revokedAt;
}
