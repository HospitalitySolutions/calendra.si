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
@Table(name = "guest_orders", uniqueConstraints = @UniqueConstraint(columnNames = "reference_code"))
public class GuestOrder extends BaseEntity {
    @ManyToOne(optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @ManyToOne(optional = false)
    @JoinColumn(name = "client_id", nullable = false)
    private Client client;

    @ManyToOne(optional = false)
    @JoinColumn(name = "guest_user_id", nullable = false)
    private GuestUser guestUser;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private OrderStatus status = OrderStatus.PENDING;

    @Enumerated(EnumType.STRING)
    @Column(name = "payment_method_type", nullable = false, length = 32)
    private GuestPaymentMethodType paymentMethodType;

    @Column(nullable = false, length = 3)
    private String currency = "EUR";

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal subtotalGross;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal taxAmount = BigDecimal.ZERO;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal totalGross;

    @Column(name = "reference_code", nullable = false, length = 120)
    private String referenceCode;

    @Column(name = "stripe_checkout_session_id", length = 255)
    private String stripeCheckoutSessionId;

    @Column(name = "stripe_payment_intent_id", length = 255)
    private String stripePaymentIntentId;

    @Column(name = "stripe_customer_id", length = 255)
    private String stripeCustomerId;

    @Column(columnDefinition = "TEXT")
    private String metadataJson;

    private Instant paidAt;
    private Instant cancelledAt;
}
