package com.example.app.guest.model;

import com.example.app.common.BaseEntity;
import com.example.app.company.Company;
import com.example.app.user.User;
import jakarta.persistence.*;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "tenant_invites", uniqueConstraints = @UniqueConstraint(columnNames = "code"))
public class TenantInvite extends BaseEntity {
    @ManyToOne(optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @Column(nullable = false, length = 120)
    private String code;

    @Column(length = 120)
    private String label;

    @Column(nullable = false)
    private boolean active = true;

    private Instant expiresAt;

    private Integer maxUses;

    @Column(nullable = false)
    private int usedCount = 0;

    @ManyToOne
    @JoinColumn(name = "created_by_user_id")
    private User createdByUser;
}
