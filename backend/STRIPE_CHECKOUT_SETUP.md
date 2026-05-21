# Stripe Billing Setup

## Environment Variables

Set these variables in local `.env.local`, staging AWS secret, and production secret:

- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY` (optional for frontend card flows)
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_BASE_URL` (default `https://api.stripe.com`)
- `STRIPE_CURRENCY` (default `eur`)
- `STRIPE_SUCCESS_URL`
- `STRIPE_CANCEL_URL`
- `STRIPE_WEBHOOK_URL` (informational/config traceability)
- `STRIPE_EU_BANK_TRANSFER_COUNTRY` (default `NL`, accepted by Stripe for EU bank transfer instructions)

## Local

1. Configure env vars above in `backend/.env.local`.
2. Start backend.
3. Expose local webhook endpoint using Stripe CLI:
   - `stripe listen --forward-to http://localhost:4000/api/stripe/webhook`
4. Copy generated webhook signing secret (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`.
5. Trigger local tests:
   - Create an open bill with a CARD payment method that has Stripe enabled.
   - Click **Create bill** and verify checkout email flow still works.
   - Create an open bill with a BANK TRANSFER/TRR payment method that has Stripe enabled.
   - Click **Create bill** and verify the hosted invoice link email is sent and bill moves to `payment_pending`.
   - Complete payment in Stripe and verify webhook updates the bill to `paid`.

## Webhook events

Subscribe at minimum to:

- `checkout.session.completed`
- `checkout.session.expired`
- `checkout.session.async_payment_failed`
- `invoice.paid`

## Notes

- CARD flows still use Stripe Checkout.
- Stripe-enabled BANK TRANSFER/TRR flows create a Stripe customer and Stripe-hosted invoice with EUR bank transfer instructions.
- When `invoice.paid` arrives, the bill is marked `paid`, the folio history reflects the change, and the paid PDF email flow runs.
- Stripe-enabled BANK TRANSFER/TRR flows now email the client a folio PDF attachment with an embedded payment QR instead of emailing the hosted Stripe invoice link directly.
- The folio layout editor includes a `Payment QR` element so you can choose its position and size on the template.
