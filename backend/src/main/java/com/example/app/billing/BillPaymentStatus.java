package com.example.app.billing;

public final class BillPaymentStatus {
    public static final String OPEN = "open";
    public static final String PAYMENT_PENDING = "payment_pending";
    public static final String PAID = "paid";
    public static final String CANCELLED = "cancelled";

    private BillPaymentStatus() {
    }

    public static boolean isKnown(String value) {
        if (value == null) return false;
        return OPEN.equals(value)
                || PAYMENT_PENDING.equals(value)
                || PAID.equals(value)
                || CANCELLED.equals(value);
    }
}
