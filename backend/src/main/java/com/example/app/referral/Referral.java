package com.example.app.referral;

import com.example.app.common.BaseEntity;
import com.example.app.company.Company;
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

/**
 * One referral record per referred tenant. Created when a new tenant registers via a referral link and updated
 * when that tenant makes its first successful subscription payment (see {@link ReferralRewardService}).
 */
@Getter
@Setter
@Entity
@Table(
        name = "referrals",
        indexes = {
                @Index(name = "idx_referrals_referred_company", columnList = "referred_company_id"),
                @Index(name = "idx_referrals_referrer_company", columnList = "referrer_company_id")
        })
public class Referral extends BaseEntity {

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "referrer_company_id", nullable = false)
    private Company referrerCompany;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "referrer_user_id", nullable = false)
    private User referrerUser;

    /** The referral code that was used at signup (snapshot; the code row may change/deactivate later). */
    @Column(nullable = false, length = 64)
    private String code;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "referred_company_id")
    private Company referredCompany;

    @Column(length = 255)
    private String referredEmail;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private ReferralStatus status = ReferralStatus.PENDING;

    private Instant registeredAt;

    private Instant qualifiedAt;

    @Column(nullable = false)
    private boolean referrerRewardGranted = false;

    @Column(nullable = false)
    private boolean referredRewardGranted = false;
}
