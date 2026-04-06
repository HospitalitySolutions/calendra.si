package com.example.app.billing;

import com.example.app.common.BaseEntity;
import com.example.app.company.Company;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "payment_methods")
public class PaymentMethod extends BaseEntity {
    @ManyToOne(optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @Column(nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PaymentType paymentType;

    /** When true, creating a bill with this method sends the invoice to the fiscal service (FURS). */
    @Column(nullable = false)
    private boolean fiscalized = true;

    /** When true, bills use Stripe Checkout (payment link); initial status {@code open} until paid. */
    @Column(name = "stripe_enabled", nullable = false)
    private boolean stripeEnabled;
}

