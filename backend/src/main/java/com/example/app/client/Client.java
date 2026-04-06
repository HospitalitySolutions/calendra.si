package com.example.app.client;

import com.example.app.company.Company;
import com.example.app.company.ClientCompany;
import com.example.app.common.BaseEntity;
import com.example.app.user.User;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import lombok.Getter;
import lombok.Setter;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@Getter
@Setter
@Entity
@Table(name = "clients")
public class Client extends BaseEntity {
    private static final Locale SLOVENIAN_LOCALE = Locale.forLanguageTag("sl-SI");

    @ManyToOne(optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @Column(nullable = false)
    private String firstName;
    @Column(nullable = false)
    private String lastName;
    private String email;
    private String phone;
    private String whatsappPhone;
    @Column(nullable = false)
    private boolean whatsappOptIn = false;
    private String viberUserId;
    @Column(nullable = false)
    private boolean viberConnected = false;
    @Column(nullable = false)
    private boolean anonymized = false;
    private Instant anonymizedAt;
    private Long anonymizedByUserId;
    @Column(nullable = false)
    private boolean active = true;

    @Column(nullable = false)
    private boolean batchPaymentEnabled = false;

    @ManyToOne(optional = false)
    private User assignedTo;

    @ManyToOne
    @JoinColumn(name = "billing_company_id")
    private ClientCompany billingCompany;

    @OneToMany(mappedBy = "client", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<PreferredSlot> preferredSlots = new ArrayList<>();

    @PrePersist
    @PreUpdate
    public void normalizeNameCase() {
        if (!anonymized) {
            firstName = toNameCase(firstName);
            lastName = toNameCase(lastName);
        }
    }

    public void anonymize(Long userId) {
        this.firstName = "Anonymized";
        this.lastName = "Client " + getId();
        this.email = null;
        this.phone = null;
        this.whatsappPhone = null;
        this.viberUserId = null;
        this.whatsappOptIn = false;
        this.viberConnected = false;
        this.anonymized = true;
        this.anonymizedAt = Instant.now();
        this.anonymizedByUserId = userId;
    }

    public static String toNameCase(String value) {
        if (value == null) {
            return "";
        }
        String trimmed = value.trim();
        if (trimmed.isEmpty()) {
            return "";
        }
        String lower = trimmed.toLowerCase(SLOVENIAN_LOCALE);
        return Character.toUpperCase(lower.charAt(0)) + lower.substring(1);
    }
}
