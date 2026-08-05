# Phase 5D — Workspace public booking

## Overview

Phase 5D adds one public booking entry point for a workspace while preserving every existing operating-unit URL and booking rule.

```text
/book/{workspace-slug}
```

The workspace page is a discovery and routing layer. A visitor chooses a shared service and a concrete physical location, then continues through the existing unit booking, checkout, payment, notification, rescheduling, and cancellation flow.

## Data model

Migration `V31__workspace_public_booking.sql` adds:

- `workspace_public_booking_settings`
- `company.workspace_public_booking_enabled`
- Public-booking indexes for workspaces, units, locations, and local service offerings

A migrated workspace receives a unique `workspace-{id}` slug and remains disabled until an administrator enables it. Existing tenant booking pages are unchanged.

## Administration

The workspace booking settings are available in **Configuration → Website**.

Administrators can configure:

- Public slug and enabled state
- Location-first or service-first selection
- “Any location” discovery
- Price visibility
- Employee-selection visibility
- Default language
- Page title, introduction, logo, and brand colour
- Additional confirmation text
- Privacy and terms links
- Included operating units and physical locations

Changing workspace-wide settings requires administrator access to all operating units available to the current workspace login.

## Public discovery

Public endpoints are under:

```text
/api/public/widget/workspaces/{slug}
```

They return only:

- Enabled operating units with an existing tenant booking code
- Active, public physical locations
- Active local service offerings enabled for website booking
- Offerings valid at the concrete physical location

Shared `WorkspaceServiceTemplate` offerings are grouped into one public service card. Local price, duration, unit, location, staff, tax, payment, and booking rules remain authoritative.

Location and offering identifiers are exposed as one-hour HMAC-signed opaque tokens. The launch endpoint validates that both tokens belong to the same workspace and operating unit before returning the existing unit booking URL.

## Booking ownership and safety

Every workspace booking resolves to one concrete:

- Workspace
- Operating unit (`Company`)
- Physical `Location`
- Local `SessionType`

The selected location is carried through:

- Service and employee discovery
- Daily and monthly availability
- Group-session discovery and joining
- Flexible and exact-time waitlist creation
- Booking-slot checkout metadata
- Reusable-order matching
- Direct and paid booking creation

A checkout created for one physical branch cannot be reused for the same time at another branch.

## Shared clients

Public booking continues to create a unit-owned `Client` relationship. When another unit already has an active workspace identity with an exact match on:

- First name
- Last name
- Normalized email
- Normalized phone

…the new unit relationship reuses that `WorkspaceClient` identity. Email-only or phone-only matches are never linked automatically, avoiding accidental household merges.

Notes, files, messages, consent, and all booking history remain owned by the originating unit.

## Workspace policy propagation

After a concrete offering is selected, the existing unit widget remains authoritative. Workspace restrictions are applied as additional constraints:

- Employee selection can be hidden even when the unit normally permits it.
- Public service prices can be hidden during service selection.
- Workspace confirmation text appears after successful booking.

Unit sender identity, timezone, address, notifications, payment configuration, privacy rules, and cancellation/rescheduling behavior remain unchanged.

## Security

- Workspace discovery and launch use the existing public widget rate limiter.
- Inactive or disabled workspaces, units, locations, and services return no public data.
- Token signatures are verified in constant time and expire after one hour.
- Launch validates workspace, unit, location, and local offering ownership again.
- Existing order and booking idempotency protections remain in force.
- Public booking creation continues to use Turnstile where configured.

## Migration and rollout

1. Deploy backend and frontend together.
2. Run Flyway through V31.
3. Confirm existing `/widget/{tenantCode}` pages continue working.
4. Open **Configuration → Website**.
5. Review the generated slug, enabled units, and public locations.
6. Configure branding and legal links.
7. Enable workspace public booking.
8. Test a free booking, paid booking, group session, and waitlist request for every included location.

The migration does not modify clients, bookings, invoices, services, rooms, or historical records.
