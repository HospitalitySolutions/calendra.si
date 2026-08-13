# Customer Web Phase 8 — Commerce

Phase 8 connects Calendra Connect web to the existing entitlement/order/payment stack.

## Customer routes

- `/providers/:slug` — provider storefront inside Connect
- `/providers/:slug/buy/:productId` — package/membership/gift-card checkout
- `/checkout/return` — Stripe/PayPal return and order-status confirmation

Public provider pages on `calendra.si` now link package/membership/gift-card cards directly to the matching Connect purchase route. Unauthenticated visitors are returned to that product after login.

## Customer API

- `GET /api/customer/v1/commerce/locations/{locationId}`
- `POST /api/customer/v1/commerce/orders`
- `POST /api/customer/v1/commerce/orders/{orderId}/checkout`
- `GET /api/customer/v1/commerce/orders/{orderId}`
- `POST /api/customer/v1/commerce/orders/{orderId}/paypal/complete`
- `POST /api/customer/v1/commerce/orders/{orderId}/cancel`

The create-order path activates/matches the customer/provider/location relationship through
`GuestProviderLinkService` and then delegates to the existing `GuestOrderService`.

## Payment channels

`GuestOrderService.PaymentChannel.CUSTOMER_WEB` uses the same tenant customer-payment settings as
the native Guest/Connect app, but external checkout providers return to the web customer app.

### Stripe

Success/cancel URL:

`{APP_CUSTOMER_WEB_BASE_URL}/checkout/return?...`

The return page polls the owned customer order until the Stripe webhook has updated it to `PAID`.
The existing Stripe webhook and entitlement issuance remain authoritative.

### PayPal

PayPal returns to the same Connect route. The authenticated return page then calls the customer API
to capture the PayPal order and refresh the wallet.

### Bank transfer

Bank transfer remains `PENDING` until payment is received/reconciled. Connect displays the issued
amount/reference/instructions and does not falsely present the entitlement as paid.

## Configuration

Backend environment:

- Production default: `APP_CUSTOMER_WEB_BASE_URL=https://connect.calendra.si`
- Local default: `APP_CUSTOMER_WEB_BASE_URL=http://localhost:5174`

## Security

- Normal customer JWT remains in Connect local storage and is never sent to Stripe/PayPal URLs.
- Order status, PayPal completion and cancellation endpoints require the customer JWT and verify
  `GuestOrder.guestUser` ownership.
- The customer commerce facade only accepts wallet-commerce orders (`PACK`, `MEMBERSHIP`, `GIFT_CARD`); normal booking orders cannot be checked out through it.
- A customer cannot purchase a hidden/non-discoverable location through the customer commerce API.
- Only public, location-eligible `PACK`, `MEMBERSHIP`, and `GIFT_CARD` products are exposed.
- Payment method allowlists and provider readiness are still enforced by the existing order service.
