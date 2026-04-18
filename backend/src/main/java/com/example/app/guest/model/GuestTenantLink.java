package com.example.app.guest.model;

import com.example.app.client.Client;
import com.example.app.common.BaseEntity;
import com.example.app.company.Company;
import jakarta.persistence.*;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "guest_tenant_links", uniqueConstraints = @UniqueConstraint(columnNames = {"guest_user_id", "company_id"}))
public class GuestTenantLink extends BaseEntity {
    @ManyToOne(optional = false)
    @JoinColumn(name = "guest_user_id", nullable = false)
    private GuestUser guestUser;

    @ManyToOne(optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @ManyToOne(optional = false)
    @JoinColumn(name = "client_id", nullable = false)
    private Client client;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private GuestTenantLinkStatus status = GuestTenantLinkStatus.ACTIVE;

    @Enumerated(EnumType.STRING)
    @Column(name = "joined_via", nullable = false, length = 32)
    private GuestJoinMethod joinedVia = GuestJoinMethod.TENANT_CODE;

    @Column(nullable = false)
    private Instant joinedAt = Instant.now();

    private Instant lastUsedAt;
}
