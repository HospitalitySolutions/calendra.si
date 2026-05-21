package com.example.app.billing;

public enum BillFiscalStatus {
    // Backward compatibility for legacy rows persisted before enum rename.
    PENDING,
    NOT_SENT,
    SENT,
    FAILED
}
