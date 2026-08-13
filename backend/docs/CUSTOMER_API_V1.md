# Customer API v1

`/api/customer/v1` is the authenticated cross-provider API used by Calendra Connect web.
It reuses the existing `GuestUser` authentication token and provider-specific `Client` records linked through `GuestTenantLink`.

## Authentication

Use the same Bearer token returned by `/api/guest/auth/*`.

## Cross-provider endpoints

- `GET /api/customer/v1/home`
  - next/upcoming bookings across active provider links
  - active wallet entitlements across providers
  - recently subscribed locations
  - unread notification/inbox counts
- `GET /api/customer/v1/bookings?status=upcoming|past|cancelled&page=0&size=50`
- `GET /api/customer/v1/bookings/{bookingId}`
- `GET /api/customer/v1/wallet?page=0&size=100`
- `GET /api/customer/v1/notifications?page=0&size=100`
- `POST /api/customer/v1/notifications/{notificationId}/read`
- `POST /api/customer/v1/notifications/read-all`
- `GET /api/customer/v1/inbox/threads?page=0&size=100`

## Booking handoff

- `POST /api/customer/v1/booking-handoffs`
  - creates a short-lived provider/location-scoped handoff for the public booking widget
  - activates/matches the selected provider relationship before handoff

## Customer web commerce

- `GET /api/customer/v1/commerce/locations/{locationId}`
  - returns buyable `PACK`, `MEMBERSHIP`, and `GIFT_CARD` products plus enabled web payment methods
- `POST /api/customer/v1/commerce/orders`
  - creates a wallet-product order for the selected location
  - requires `Idempotency-Key`
- `POST /api/customer/v1/commerce/orders/{orderId}/checkout`
  - starts card, PayPal, or bank-transfer checkout
  - requires `Idempotency-Key`
- `GET /api/customer/v1/commerce/orders/{orderId}`
  - customer-owned commerce-order status used by the payment return page
- `POST /api/customer/v1/commerce/orders/{orderId}/paypal/complete?token=...`
  - captures an approved PayPal order
- `POST /api/customer/v1/commerce/orders/{orderId}/cancel?session_id=...&token=...`
  - cancels an unfinished external checkout

The commerce facade is intentionally restricted to wallet-commerce orders. Normal booking orders continue to use the existing booking/guest APIs.

## Compatibility

The existing `/api/guest/*` endpoints remain available for the native Calendra Connect app and existing booking actions.
The customer API is additive and aggregates data only through existing `GuestTenantLink` ownership relationships; it does not match bookings or wallet rights globally by e-mail address.
