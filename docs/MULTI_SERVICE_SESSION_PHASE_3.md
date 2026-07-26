# Multi-service sessions — Phase 3 public booking engine

Phase 3 exposes the Phase 1 service-chain model through the shared public booking engine used by both:

- the embedded website widget; and
- the standalone Calendra public booking page (`presentation="standalone"`).

## Shared selector

The existing `calendra-booking-widget` custom element now maintains an ordered `selectedServiceIds` list. Guests can select up to five individual services, remove a service, or move it up and down before continuing. The selector shows the combined visible duration and gross total. Group services remain single-service bookings and replace any existing chain selection.

The first selected service remains mirrored in `selectedServiceId` and in the legacy `typeId`/`productId` fields so older integrations continue to work.

## Public API contract

The following endpoints accept an ordered repeated `typeIds` query parameter and retain the legacy `typeId` parameter:

- `GET /api/public/widget/{tenantCode}/consultants`
- `GET /api/public/widget/{tenantCode}/availability`
- `GET /api/public/widget/{tenantCode}/availability-month`

Example:

```text
...?typeId=41&typeIds=41&typeIds=52
```

Direct public booking requests can send:

```json
{
  "typeId": 41,
  "services": [
    { "typeId": 41, "position": 0 },
    { "typeId": 52, "position": 1 }
  ]
}
```

The backend keeps support for requests that only contain `typeId`.

## Availability

Availability is calculated for the complete ordered chain:

- the same employee must support every selected service;
- service durations and inter-service breaks are included;
- the complete chain must fit inside the public availability or working-hours window;
- employee, personal-block, room and booking conflicts are validated using the canonical Phase 1 `SessionServicePlanService` plan;
- month availability marks a date only when at least one complete chain fits.

## Payment and order flow

The public widget sends the ordered service IDs in `CreateOrderRequest.serviceIds`. The order service:

- resolves every session service using website visibility for website bookings (independent of Guest App visibility);
- rejects more than five services and mixed currencies;
- rejects group services inside a multi-service chain;
- adds the gross prices into one order total;
- stores the ordered `sessionTypeIds` in order metadata;
- compares the complete chain when reusing an idempotent/open order; and
- creates one booking with the full ordered service list after checkout.

The legacy `sessionTypeId` metadata value remains the first service. Existing single-service orders without `sessionTypeIds` are still readable and bookable.

Advance/prepayment billing continues through the Phase 1 session billing support, so the resulting booking contributes one billing line per selected service.
