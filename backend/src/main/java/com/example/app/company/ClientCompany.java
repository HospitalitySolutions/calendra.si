package com.example.app.company;

import com.example.app.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.util.Locale;
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
