# Stripe Billing Setup

## Environment Variables

Set these variables in local `.env.local`, staging AWS secret, and production secret:

- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY` (optional for frontend card flows)
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_BASE_URL` (default `https://api.stripe.com`)
- `STRIPE_CURRENCY` (default `eur`)
- `STRIPE_SUCCESS_URL` (legacy fallback only; manual bill and guest checkout links now generate return URLs automatically)
- `STRIPE_CANCEL_URL` (legacy fallback only; manual bill and guest checkout links now generate return URLs automatically)
- `APP_PUBLIC_BASE_URL` (shared public app/base URL, for example `https://app.calendra.si`; used by Stripe guest checkout and manual bill return/cancel URLs)
- `APP_STRIPE_GUEST_PUBLIC_BASE_URL` / `APP_STRIPE_BILLING_PUBLIC_BASE_URL` (legacy optional overrides only when Stripe callbacks must use a different host than `APP_PUBLIC_BASE_URL`)
- `STRIPE_WEBHOOK_URL` (informational/config traceability)
- `STRIPE_EU_BANK_TRANSFER_COUNTRY` (default `NL`, accepted by Stripe for EU bank transfer instructions)

## Local

1. Configure env vars above in `backend/.env.local`. For local development, set `APP_PUBLIC_BASE_URL` to the public tunnel/backend host if Stripe must redirect back to your local API; otherwise use your local app URL.
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

## Return URLs

- Manually emailed bill payment links now use backend-hosted return pages under `/api/guest/stripe/billing/**`.
- On successful return from Stripe, the backend retrieves the Checkout Session directly from Stripe and marks the bill `paid` when `payment_status=paid`. This acts as a safety net if the Stripe webhook is delayed or the connected-account webhook is not delivered.
- Guest mobile order checkout still uses `/api/guest/stripe/**`, which then deep-links back into the native guest app.
- Do not configure `calendra-guest://...` as the generic Platform Admin Stripe success/cancel URL for manual bill links. Stripe only substitutes `{CHECKOUT_SESSION_ID}`; custom placeholders like `{STATUS}` and `{ORDER_ID}` are not replaced by Stripe.

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

## Stripe Connect charge mode

- Tenant CARD payments with a connected account are created as **direct charges** by sending the Checkout Session request with the `Stripe-Account` header.
- The previous destination-charge fields (`payment_intent_data[transfer_data][destination]` and `payment_intent_data[on_behalf_of]`) are intentionally not used for connected Checkout payments.
- `payment_intent_data[application_fee_amount]` is still sent when Platform Admin configures an application fee, so Calendra can collect the platform fee while the connected account remains the Stripe fee payer for the direct charge.
- Tenant Stripe BANK TRANSFER/TRR hosted invoices are also created on the connected account when Stripe Connect is ready for the tenant, using the same `Stripe-Account` header.
- Bills store the Stripe Connect mode/account used for the Stripe payment so later invoice hydration can query the correct Stripe account.
- Make sure the platform webhook endpoint is configured as a Stripe Connect webhook endpoint for connected-account checkout and invoice events.
