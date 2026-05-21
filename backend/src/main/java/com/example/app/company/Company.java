package com.example.app.company;

import com.example.app.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
public class Company extends BaseEntity {
    @Column(nullable = false)
    private String name;

    @Column(name = "tenant_code", unique = true, length = 64)
    private String tenantCode;

    @Column(name = "paypal_merchant_id", length = 255)
    private String paypalMerchantId;

    @Column(name = "paypal_tracking_id", length = 255)
    private String paypalTrackingId;

    @Column(name = "paypal_onboarding_status", length = 64)
    private String paypalOnboardingStatus;

    @Column(name = "paypal_payments_receivable")
    private Boolean paypalPaymentsReceivable;

    @Column(name = "paypal_primary_email_confirmed")
    private Boolean paypalPrimaryEmailConfirmed;

}