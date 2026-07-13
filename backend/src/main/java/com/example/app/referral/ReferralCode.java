package com.example.app.referral;

import com.example.app.common.BaseEntity;
import com.example.app.company.Company;
import com.example.app.user.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Getter;
import lombok.Setter;

/**
 * A personal, shareable referral code owned by a single staff user. Sharing this code lets us attribute a new
 * tenant signup back to both the referring user and their company.
 */
@Getter
@Setter
@Entity
@Table(name = "referral_codes", uniqueConstraints = @UniqueConstraint(columnNames = "code"))
public class ReferralCode extends BaseEntity {

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, length = 64)
    private String code;

    @Column(nullable = false)
    private boolean active = true;
}
