# Multi-service sessions — Phase 1 backend contract

## Scope

Phase 1 adds an ordered service chain to the existing `SessionBooking` model while keeping the legacy single-service API and database columns operational.

A logical booking is still represented by the existing `SessionBooking` row or booking group. Each physical booking row now owns zero or more ordered `SessionService` rows. For normal typed bookings, there is at least one child row.

## Database model

`session_service` stores:

- parent booking and selected session type;
- zero-based order (`position`);
- optional space for that service segment;
- calculated start and end time;
- duration and break snapshots;
- name, colour, price-calculation-mode and service-group snapshots.

`session_booking.type_id` and `session_booking.space_id` remain compatibility aliases for the first service. `session_booking.availability_end_time` stores the end of the employee/resource blocking window, including the final service break.

Flyway migration `V14__session_services.sql`:

1. adds `availability_end_time`;
2. creates `session_service` and indexes;
3. backfills one child service for every existing booking with a `type_id`;
4. calculates availability windows for all existing bookings;
5. makes `availability_end_time` non-null.

Untyped legacy bookings remain valid and use the parent booking time window.

## Create and update API

The existing booking endpoint accepts an optional ordered `services` array:

```json
{
  "clientId": 123,
  "consultantId": 18,
  "startTime": "2026-08-03T10:00:00",
  "services": [
    { "typeId": 41, "position": 0, "spaceId": 7 },
    { "typeId": 52, "position": 1, "spaceId": 9 }
  ]
}
```

When `services` is present:

- `endTime` is optional and ignored for duration calculation;
- the backend canonicalises positions to `0..n-1` after sorting;
- service durations and breaks are calculated from the selected session types;
- the next service starts after the previous service and its break;
- the parent end time is the end of the final service;
- the availability end is the final service end plus its break;
- all selected services must belong to the tenant and be active;
- all selected services must use the same `PER_CLIENT` or `TOTAL` price mode.

When `services` is absent or empty, the existing `typeId`, `spaceId`, `startTime` and `endTime` contract remains unchanged.

A legacy client updating an existing multi-service booking without sending `services` can move or edit it without collapsing the chain, as long as it does not replace the primary service type.

## Response additions

Booking responses retain the existing top-level `type` and `space` fields and add:

- `services` — ordered service segments;
- `availabilityEndTime`;
- `totalServiceMinutes`;
- `totalBreakMinutes`;
- `totalGross`.

The top-level `type` and `space` continue to represent the first service for older clients.

## Availability rules

The backend validates the complete chain atomically:

- the client is blocked from the booking start through the final service end;
- the consultant is blocked through `availabilityEndTime`;
- when a consultant has an explicit service assignment, they must support every service in the chain;
- each space is checked only for the interval of the service segment using it, including that segment's break;
- waitlist holds use the same full-chain employee and per-space intervals;
- group capacity is checked against every selected service;
- all selected services must support group booking when the booking is a group session.

Google Calendar rescheduling now preserves and validates the complete service chain. Public-link and guest-app rescheduling preserve the chain and validate its full resource window, even though multi-service selection UI is deferred to later phases.

## Billing, invoicing and prepayments

Billing projects transaction-service lines from every selected service:

- identical transaction-service and unit-price combinations are combined using quantity;
- the same transaction service with different prices remains on separate invoice lines;
- `PER_CLIENT` bookings create charges per participant row;
- `TOTAL` group bookings are still charged only once on the primary billable row;
- open-bill synchronisation removes stale generated lines and updates quantities/prices;
- guest advance invoices and bank-transfer folios include all selected services;
- advance-deduction transaction services remain excluded from normal session charges.

Billing-service links and prices continue to follow the existing live `SessionType` billing configuration. Service labels, timing, breaks, price mode and group identity are snapshotted on the booking.

## Deferred work

The following are intentionally outside Phase 1:

- staff UI for selecting/reordering multiple services;
- Guest App, website widget and public Calendra selection screens;
- different employees per service;
- parallel services;
- partial cancellation or partial rescheduling;
- multi-service waitlist requests/offers;
- service-combination configuration and public maximum-count settings.
