package com.example.app.location;

import com.example.app.common.BaseEntity;
import com.example.app.billingissuer.InvoiceSeries;
import com.example.app.billingissuer.LegalEntity;
import com.example.app.company.Company;
import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "locations", uniqueConstraints = @UniqueConstraint(columnNames = {"company_id", "name"}))
public class Location extends BaseEntity {
    @JsonIgnore
    @ManyToOne(optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @Column(nullable = false)
    private String name;
    @Column(length = 512)
    private String address;
    @Column(name = "postal_code", length = 64)
    private String postalCode;
    private String city;
    @Column(nullable = false, length = 2)
    private String country = "SI";
    @Column(nullable = false, length = 64)
    private String timezone = "Europe/Ljubljana";
    @Column(length = 128)
    private String phone;
    @Column(length = 320)
    private String email;
    @Column(name = "opening_hours_json", columnDefinition = "text")
    private String openingHoursJson;
    @Column(name = "public_booking_enabled", nullable = false)
    private boolean publicBookingEnabled = true;

    @Column(name = "public_name", length = 255)
    private String publicName;
    @Column(name = "public_address", length = 512)
    private String publicAddress;
    @Column(name = "public_description", length = 500)
    private String publicDescription;
    @Column(name = "public_logo_s3_key", length = 1024)
    private String publicLogoS3Key;
    @Column(name = "public_directory_enabled", nullable = false)
    private boolean publicDirectoryEnabled;
    @Column(name = "guest_app_discoverable", nullable = false)
    private boolean guestAppDiscoverable;
    @Column(name = "website_presentation_enabled", nullable = false)
    private boolean websitePresentationEnabled = true;
    @Column(name = "google_place_id", length = 255)
    private String googlePlaceId;

    @Column(name = "latitude")
    private Double latitude;
    @Column(name = "longitude")
    private Double longitude;
    @Column(name = "geocode_source_address", length = 1024)
    private String geocodeSourceAddress;
    @Column(name = "geocoded_at")
    private java.time.Instant geocodedAt;
    @Column(name = "geocode_last_attempt_at")
    private java.time.Instant geocodeLastAttemptAt;
    @Column(name = "geocode_status", length = 32)
    private String geocodeStatus;

    @Column(name = "default_location", nullable = false)
    private boolean defaultLocation;
    @Column(nullable = false)
    private boolean active = true;
    @Column(name = "fiscal_business_premise_code", length = 64)
    private String fiscalBusinessPremiseCode;

    @ManyToOne
    @JoinColumn(name = "default_legal_entity_id")
    private LegalEntity defaultLegalEntity;

    @ManyToOne
    @JoinColumn(name = "default_invoice_series_id")
    private InvoiceSeries defaultInvoiceSeries;
}
