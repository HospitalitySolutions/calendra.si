-- The online card payment option is Stripe-backed. Keep one user-facing name
-- across Billing, Guest app and Website widget settings.
UPDATE payment_methods
SET name = 'Spletno plačilo s kartico'
WHERE payment_type = 'CARD'
  AND stripe_enabled = TRUE;

-- Cash is available only directly at the location and must not be exposed in
-- the guest mobile app or website booking widget.
UPDATE payment_methods
SET guest_enabled = FALSE,
    widget_enabled = FALSE
WHERE payment_type = 'CASH';
