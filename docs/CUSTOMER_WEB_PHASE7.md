# Customer web Phase 7 – logged-in booking integration

Phase 7 connects the authenticated Calendra Connect customer experience to the existing public booking engine without placing the customer's normal login JWT in a URL.

## Booking handoff

1. `connect.calendra.si` calls `POST /api/customer/v1/booking-handoffs` with the selected `locationId` and optional `sessionTypeId`.
2. The backend activates/reuses the customer's provider-specific Client, GuestTenantLink and selected GuestLocationSubscription.
3. The backend issues a 90-second `GUEST_BOOKING_HANDOFF` token scoped to customer, company, location and tenant code.
4. Connect redirects to the existing `/narocanje/{tenantCode}` page and places the handoff token in the URL fragment (`#customerHandoff=...`). Fragments are not sent in the HTTP request or Referer header.
5. The booking page reads the fragment and immediately removes it with `history.replaceState`.
6. The page exchanges the handoff at `POST /api/public/widget/{tenantCode}/customer-handoff` for the normal Guest session token used by the existing widget API.
7. The widget prefills customer account data and sends the Guest token in the `Authorization` header for the existing guest-session/order/checkout and waitlist flows.

The handoff token cannot be parsed as a normal Guest auth token, and a normal Guest auth token cannot be parsed as a booking handoff.

## Connected-customer booking UX

- First name, last name, email and phone are prefilled from Calendra Connect.
- Email is locked to the signed-in account.
- Existing first/last name and phone values are read-only; a missing value can still be entered.
- Turnstile remains enabled for anonymous customers but is not required for a valid authenticated Connect handoff.
- Provider-specific Client data is not overwritten. The linker only fills missing basic identity fields on an existing provider Client.
- Final order creation still activates the exact selected location, preserving the Phase 5 location-level model.

## Rescheduling in Connect

Booking detail now supports `Prestavi termin` for future, non-terminal bookings.

- Connect first prepares the provider/location relationship through the handoff service. This also supports bookings created before location subscriptions existed.
- Availability is loaded through the existing authenticated `/api/guest/availability` endpoint.
- The selected slot is submitted to the existing `/api/guest/bookings/{id}/reschedule` endpoint with an idempotency key.
- The booking detail, bookings list and home dashboard are invalidated/refreshed after success.

`Rezerviraj ponovno` also uses the authenticated handoff and preselects the previous service.

## New / changed endpoints

- `POST /api/customer/v1/booking-handoffs`
- `POST /api/public/widget/{tenantCode}/customer-handoff`

Existing endpoints reused:

- `POST /api/public/widget/{tenantCode}/guest-session`
- `POST /api/public/widget/{tenantCode}/orders`
- `POST /api/public/widget/{tenantCode}/orders/{orderId}/checkout`
- `POST /api/public/widget/{tenantCode}/waitlist`
- `GET /api/guest/availability`
- `POST /api/guest/bookings/{bookingId}/reschedule`

## Deployment

Deploy backend and `customer-web` together. The existing `calendra.si` booking page and widget assets are served by the backend, so the backend deployment contains the handoff exchange and connected-widget changes.

No new database migration is required for Phase 7.
