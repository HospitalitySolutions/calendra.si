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
@Table(name = "guest_entitlements")
public class GuestEntitlement extends BaseEntity {
    @ManyToOne(optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @ManyToOne(optional = false)
    @JoinColumn(name = "client_id", nullable = false)
    private Client client;

    @ManyToOne(optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private GuestProduct product;

    @ManyToOne(optional = false)
    @JoinColumn(name = "source_order_id", nullable = false)
    private GuestOrder sourceOrder;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private EntitlementType entitlementType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private EntitlementStatus status = EntitlementStatus.ACTIVE;

    private Integer remainingUses;

    @Column(nullable = false)
    private Instant validFrom;

    private Instant validUntil;

    @Column(columnDefinition = "TEXT")
    private String metadataJson;
}
