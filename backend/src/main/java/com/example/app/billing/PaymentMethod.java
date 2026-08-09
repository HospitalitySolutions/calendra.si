package com.example.app.billing;

import com.example.app.common.BaseEntity;
import com.example.app.company.Company;
import com.example.app.location.Location;
import jakarta.persistence.*;
import java.util.LinkedHashSet;
import java.util.Set;
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

    /** Shared method is available at every branch unless an explicit allowlist is configured. */
    @Column(name = "available_all_locations", nullable = false)
    private boolean availableAllLocations = true;

    @ManyToMany
    @JoinTable(
            name = "payment_method_locations",
            joinColumns = @JoinColumn(name = "payment_method_id"),
            inverseJoinColumns = @JoinColumn(name = "location_id")
    )
    @OrderBy("name ASC, id ASC")
    private Set<Location> locations = new LinkedHashSet<>();

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

    /** When true, this method is shown in the guest mobile app. */
    @Column(name = "guest_enabled", nullable = false)
    private boolean guestEnabled = false;

    /** When true, this method is shown in the website booking widget. */
    @Column(name = "widget_enabled", nullable = false)
    private boolean widgetEnabled = false;

    @Column(name = "guest_display_order", nullable = false)
    private int guestDisplayOrder = 0;

    /** JSON array of guest product types this method is allowed for (e.g. ["SESSION_SINGLE","PACK"]). */
    @Column(name = "allowed_guest_product_types_json")
    private String allowedGuestProductTypesJson;
}

