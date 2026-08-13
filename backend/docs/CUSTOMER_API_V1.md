# Customer API v1

`/api/customer/v1` is the cross-provider customer read model used by the future Calendra Connect web client.
It reuses the existing `GuestUser` authentication token and the existing provider-specific `Client` records linked through `GuestTenantLink`.

## Authentication

Use the same Bearer token returned by `/api/guest/auth/*`.

## Endpoints

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

## Compatibility

The existing `/api/guest/*` endpoints remain unchanged for the current native Calendra Connect app.
The customer API is additive and aggregates data only through existing `GuestTenantLink` ownership relationships; it does not match bookings or wallet rights globally by e-mail address.
