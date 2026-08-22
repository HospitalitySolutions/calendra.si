package com.example.app.workspacesubscription;

import com.example.app.billingissuer.LegalEntity;
import com.example.app.common.BaseEntity;
import com.example.app.company.Company;
import com.example.app.workspace.Workspace;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import java.time.LocalDate;

@Getter
@Setter
@Entity
@Table(name = "workspace_subscriptions")
public class WorkspaceSubscription extends BaseEntity {
    @OneToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "workspace_id", nullable = false, unique = true)
    private Workspace workspace;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "billing_owner_company_id")
    private Company billingOwnerCompany;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "payer_legal_entity_id")
    private LegalEntity payerLegalEntity;

    @Column(name = "plan_key", nullable = false, length = 32)
    private String planKey = "PROFESSIONAL";

    @Column(name = "billing_interval", nullable = false, length = 16)
    private String billingInterval = "MONTHLY";

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private WorkspaceSubscriptionStatus status = WorkspaceSubscriptionStatus.ACTIVE;

    @Column(name = "current_period_start")
    private LocalDate currentPeriodStart;

    @Column(name = "current_period_end")
    private LocalDate currentPeriodEnd;

    @Column(name = "trial_ends_at")
    private LocalDate trialEndsAt;

    @Column(name = "grace_until")
    private LocalDate graceUntil;

    @Column(name = "external_customer_id")
    private String externalCustomerId;

    @Column(name = "external_subscription_id")
    private String externalSubscriptionId;

    @Column(name = "billing_contact_name")
    private String billingContactName;

    @Column(name = "billing_email", length = 320)
    private String billingEmail;

    @Column(name = "billing_address", length = 512)
    private String billingAddress;

    @Column(name = "billing_postal_code", length = 64)
    private String billingPostalCode;

    @Column(name = "billing_city")
    private String billingCity;

    @Column(name = "billing_country", nullable = false, length = 2)
    private String billingCountry = "SI";

    @Column(name = "billing_tax_id", length = 64)
    private String billingTaxId;

    @Column(name = "purchase_order_reference")
    private String purchaseOrderReference;

    @Column(name = "features_json", nullable = false, columnDefinition = "text")
    private String featuresJson = "[]";

    @Column(name = "addons_json", nullable = false, columnDefinition = "text")
    private String addonsJson = "[]";

    @Column(name = "max_operating_units", nullable = false)
    private int maxOperatingUnits = 1;

    @Column(name = "max_locations", nullable = false)
    private int maxLocations = 1;

    @Column(name = "max_active_users", nullable = false)
    private int maxActiveUsers = 1;

    @Column(name = "max_consultants", nullable = false)
    private int maxConsultants = 1;

    @Column(name = "max_clients", nullable = false)
    private int maxClients;

    @Column(name = "max_monthly_bookings", nullable = false)
    private int maxMonthlyBookings;

    @Column(name = "included_sms_parts", nullable = false)
    private int includedSmsParts;

    @Column(name = "included_email_messages", nullable = false)
    private int includedEmailMessages;

    @Column(name = "storage_limit_mb", nullable = false)
    private long storageLimitMb;

    @Column(name = "max_public_booking_pages", nullable = false)
    private int maxPublicBookingPages = 1;

    @Column(name = "analytics_retention_days", nullable = false)
    private int analyticsRetentionDays = 365;

    @Column(name = "allow_sms_overage", nullable = false)
    private boolean allowSmsOverage;

    @Column(name = "allow_email_overage", nullable = false)
    private boolean allowEmailOverage = true;

    @Column(name = "allow_booking_overage", nullable = false)
    private boolean allowBookingOverage = true;

    @Column(name = "api_access", nullable = false)
    private boolean apiAccess;
}
