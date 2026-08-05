package com.example.app.company;

import com.example.app.common.BaseEntity;
import com.example.app.location.Location;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.Table;
import java.util.Locale;
import java.util.LinkedHashSet;
import java.util.Set;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "client_companies")
public class ClientCompany extends BaseEntity {
    @ManyToOne(optional = false)
    @JoinColumn(name = "owner_company_id", nullable = false)
    private Company ownerCompany;

    /**
     * When this row belongs to the Platform Admin tenant and represents a tenant payee, this points back
     * to the tenant account from Platform Admin -> Tenant management.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "platform_tenant_company_id")
    private Company platformTenantCompany;

    @Column(nullable = false)
    private String name;

    private String address;
    private String postalCode;
    private String city;
    private String vatId;
    private String iban;
    private String email;
    private String telephone;

    @Column(nullable = false)
    private boolean active = true;

    @Column(nullable = false)
    private boolean batchPaymentEnabled = false;

    /** When true, invoice emails are never sent to this company, overriding the tenant-wide delivery setting. */
    @Column(nullable = false)
    private boolean suppressInvoiceEmails = false;

    /** Empty means the company is available in every physical location. */
    @ManyToMany
    @JoinTable(
            name = "client_company_assigned_locations",
            joinColumns = @JoinColumn(name = "client_company_id"),
            inverseJoinColumns = @JoinColumn(name = "location_id")
    )
    private Set<Location> assignedLocations = new LinkedHashSet<>();

    /** Trim, remove whitespace, uppercase, empty → null — consistent uniqueness checks per tenant. */
    public static String normalizeVatIdStorage(String vatId) {
        if (vatId == null) {
            return null;
        }
        String trimmed = vatId.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        String collapsed = trimmed.replaceAll("\\s+", "");
        return collapsed.toUpperCase(Locale.ROOT);
    }
}
