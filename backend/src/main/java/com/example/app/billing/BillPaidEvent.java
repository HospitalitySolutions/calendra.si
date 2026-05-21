package com.example.app.billing;

/**
 * Fired when a {@link Bill} transitions to {@code PAID}, regardless of the path
 * (manual mark-paid, bank statement reconciliation, etc.). Listeners can use this
 * to run downstream side effects (e.g. flipping a linked guest wallet order to
 * PAID).
 */
public record BillPaidEvent(Long billId, Long companyId) {}
