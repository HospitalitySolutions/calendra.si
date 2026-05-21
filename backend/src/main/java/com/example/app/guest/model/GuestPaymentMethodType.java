package com.example.app.guest.model;

public enum GuestPaymentMethodType {
    CARD,
    BANK_TRANSFER,
    ENTITLEMENT,
    PAYPAL,
    GIFT_CARD,
    /** Guest completes booking without online payment; settle at venue (not cash-received in reporting sense). */
    PAY_AT_VENUE
}
