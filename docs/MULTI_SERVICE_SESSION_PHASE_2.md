# Multi-service sessions — Phase 2 staff web app

Phase 2 connects the staff calendar UI to the ordered `SessionService` contract introduced in Phase 1.

## Dodaj termin / Uredi termin

- The former single-service selector is replaced by an ordered **Storitve** editor.
- Staff can add, remove and reorder services.
- Every service has its own session type and optional space.
- Each row shows its calculated duration, price and service interval.
- The first selected service remains mirrored into the legacy top-level `typeId` and `spaceId` fields for compatibility.
- The request also sends the complete ordered `services` array.
- Existing single-service bookings are normalized to one editable service row.

The booking end time is automatically recalculated from all selected service durations and internal breaks. The last service's break extends `availabilityEndTime`, but it does not extend the visible appointment end time.

A typed all-day booking keeps the legacy single-service API contract. A booking containing more than one service cannot be saved as all day; the UI shows an explanation and blocks saving.

## Validation and conflicts

The editor recalculates warnings whenever the employee, clients, service order, spaces or time changes. It checks:

- employee conflicts across the complete chain and final break;
- personal-block conflicts;
- room conflicts for each individual service segment;
- the lowest participant limit in the chain;
- group-booking compatibility;
- incompatible pricing modes;
- invalid all-day multi-service combinations.

The existing confirmation flow remains available for staff-overlap and outside-bookable-hours actions. The backend remains the final authority for concurrency-safe employee, room and waitlist-hold validation.

## Calendar cards and details

- Calendar cards and tooltips show the first service followed by `+N` for additional services.
- Booking details in Dodaj/Uredi show the complete ordered service chain.
- Invoice and prepayment session summaries display all service names and all distinct spaces.
- Group capacity labels use the lowest participant limit across the selected services.

## Billing and prepayments

Phase 1 already synchronizes separate open-bill, invoice and advance lines for every `SessionService`. Phase 2 updates the embedded staff billing flow so that opening a new prepayment from a booking pre-populates all linked transaction-service lines in service order.

Editing a service chain and saving the booking triggers the existing backend bill synchronization, so generated lines follow added, removed and reordered services while preserving normal billing rules.

## Compatibility

- Legacy top-level `type` and `space` values still represent the first service.
- Older single-service bookings open as a one-row chain.
- Untyped bookings remain possible where the tenant configuration previously allowed them.
- Online meeting, repeat, group, status, payment and waitlist request payloads now preserve the ordered service list.
