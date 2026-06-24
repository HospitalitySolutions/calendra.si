package com.example.app.guest.model;

import com.example.app.client.Client;
import com.example.app.common.BaseEntity;
import com.example.app.company.Company;
import jakarta.persistence.*;
import java.math.BigDecimal;
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

    /** Remaining monetary balance for gift-card entitlements. */
    @Column(name = "remaining_value_gross", precision = 12, scale = 2)
    private BigDecimal remainingValueGross;

    @Column(nullable = false)
    private Instant validFrom;

    private Instant validUntil;

    /** Opaque exact-match code encoded in the QR and accepted by the staff scanner. */
    @Column(name = "entitlement_code", length = 32, unique = true)
    private String entitlementCode;

    /** Membership visit count; incremented on every successful membership scan. */
    @Column(name = "visit_count", nullable = false)
    private int visitCount = 0;

    /** Human-friendly code shown in wallets. For gift cards this is the public coupon code. */
    @Column(name = "display_code", length = 32)
    private String displayCode;

    /** Running sequence. For gift cards this is the per-tenant internal DB number sequence. */
    @Column(name = "display_seq")
    private Integer displaySeq;

    /** Protected token used by course QR codes and email links. */
    @Column(name = "course_access_token", length = 64, unique = true)
    private String courseAccessToken;

    @Column(columnDefinition = "TEXT")
    private String metadataJson;
}
