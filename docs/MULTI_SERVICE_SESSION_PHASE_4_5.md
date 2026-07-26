# Multi-service sessions — Phases 4 and 5

This implementation extends the existing `SessionService` foundation to Calendra Connect and the secondary systems while preserving the legacy single-service flow.

## Feature switch and compatibility

- Public/mobile multi-service selection is active only when the tenant setting `multipleServicesEnabled` is enabled.
- When it is disabled, Calendra Connect continues to use the existing single-service flow and legacy request fields.
- Existing sessions and older clients remain compatible through the primary `sessionTypeId`/`productId` fields.
- A V1 multi-service booking uses one employee for the complete ordered chain. Group services cannot be mixed into a public multi-service chain.

## Phase 4 — Calendra Connect

Android Compose, iOS SwiftUI and the shared Kotlin API/models now support an ordered list of selected services.

The service step includes:

- service categories;
- `Dodaj`/selected state for each service;
- selected-service summary;
- remove and move up/down actions;
- total duration and estimated gross price;
- one `Izberi termin` continuation action.

Employee and availability requests use the complete ordered service list. Only start times for which the full chain fits are returned. Checkout sends one order request and creates one logical booking. Home, Calendar, reservation details and Wallet expose the service lines individually while keeping one booking/order entry.

Example order selection:

```json
{
  "companyId": "12",
  "productId": "101",
  "slotId": "44|2026-08-03T13:30:00|2026-08-03T15:00:00",
  "paymentMethodType": "CARD",
  "services": [
    {
      "productId": "101",
      "sessionTypeId": "21",
      "position": 0,
      "entitlementId": "9001",
      "spaceId": null
    },
    {
      "productId": "102",
      "sessionTypeId": "22",
      "position": 1,
      "entitlementId": null,
      "spaceId": null
    }
  ],
  "consultantId": "44"
}
```

Availability and consultant endpoints accept repeated `sessionTypeIds` query parameters (comma-separated values are accepted as well). The availability response returns the selected IDs, total chain duration, estimated gross price and currency even when no valid slot exists.

## Financial lines, benefits and cancellation

Every selected service stays a separate order/invoice service line. The payable total is calculated after validating each line-specific entitlement.

- An entitlement can only cover the service for which it is valid.
- Limited-use entitlements are checked against the number of requested covered service lines.
- Consumption is linked to `SessionService`, not only the parent booking.
- Removing or replacing one service restores only that service's entitlement usage.
- Cancelling the complete booking restores all associated service-line usages.
- Stripe, TRR, gift-card, membership, ticket/package, prepayment, discount, VAT and fiscal-invoice paths continue to use the one order while preserving the individual service lines.

## Booking projections and communication

Guest Home/history/Calendar and Wallet return one logical booking with:

- all ordered services;
- total duration;
- total price and currency;
- payment status;
- employee, date and time.

Guest confirmations, push notifications and reminders render the complete service list and chain summary.

## Phase 5 — Secondary systems

### Waitlist

A waitlist request can store `serviceIds` as an ordered chain. It remains a separate waitlist entity; no `WAITLISTED` booking status was added. Matching and offers are valid only when the complete chain fits for the selected employee/resource. Acceptance creates one booking with the same ordered service rows.

### Google Calendar

One Google Calendar event is created for the complete booking. The event title joins the service names and the description enumerates all services and total duration.

### Recurring sessions

Recurring creation reuses the same ordered `BookingRequest.services` selection for every occurrence. Editing/rescheduling preserves the ordered service plan and recalculates conflicts and service-line entitlements.

### Analytics

`GET /api/analytics/multi-service` reports:

- logical bookings/sessions;
- selected service count;
- multi-service booking count;
- average services per booking;
- multi-service conversion rate;
- source: `STAFF`, `GUEST_APP`, `WIDGET` or `CALENDRA_WEBSITE`;
- per-service usage and gross revenue.

Existing service usage analytics now count every `SessionService` line rather than only the primary service.

### Exports, scanner and attendance

The parent `SessionBooking` remains the attendance/scanner unit, so one scan or attendance state applies to the complete appointment. Downstream views can use its ordered `SessionService` children for service-level display and reporting without creating duplicate visits.

## Database migration

`V15__multi_service_public_booking.sql`:

- links guest entitlement usage to a specific `session_service` row;
- adds the waitlist `service_chain` marker and supporting index/foreign key changes.
