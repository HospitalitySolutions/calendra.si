package com.example.app.referral;

/**
 * Lifecycle of a single referral (one referred tenant per row).
 *
 * <ul>
 *   <li>{@code PENDING} — the referred tenant registered but has not yet made a first successful payment.</li>
 *   <li>{@code QUALIFIED} — first payment received; the referred tenant reward was granted, but the referrer
 *       reward was skipped (e.g. because the referrer hit the free-month cap).</li>
 *   <li>{@code REWARDED} — first payment received and both tenants received their free month.</li>
 *   <li>{@code EXPIRED} — the referral is no longer eligible for a reward.</li>
 *   <li>{@code CANCELLED} — the referral was voided (e.g. tenant deleted / fraud).</li>
 * </ul>
 */
public enum ReferralStatus {
    PENDING,
    QUALIFIED,
    REWARDED,
    EXPIRED,
    CANCELLED
}
