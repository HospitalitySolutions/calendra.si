package com.example.app.guest.model;

public enum GuestPaymentMethodType {
    CARD,
    BANK_TRANSFER,
    ENTITLEMENT,
    PAYPAL,
    /** Guest completes booking without online payment; settle at venue (not cash-received in reporting sense). */
    PAY_AT_VENUE
}
