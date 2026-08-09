# Calendra location ownership model

Status: Phase 5.5 audit / architecture baseline

## Architectural rule

Calendra uses three different ownership boundaries. They must not be conflated:

- **Workspace** – account/group boundary and shared identity. Shared login accounts, workspace clients, cross-unit analytics/templates and other intentionally shared resources belong here.
- **Company** – legal/accounting operating entity. Legal name, VAT/tax identity, registered address, IBAN, fiscal certificate, legal entities, company billing/provider settings and subscription-related configuration belong here.
- **Location** – operational branch. Anything that represents where a service is offered, scheduled, delivered, queued, held, sold or physically stocked must either belong to one Location or declare an explicit multi-location scope.

A one-location tenant should not have extra UX complexity: signup/provisioning creates its default Location automatically and single-location flows auto-resolve it. The data model remains strict even when the UI can hide the choice.

## Non-negotiable invariants

1. Every concrete appointment/session has a non-null `location_id`.
2. Every concrete room/space belongs to exactly one Location.
3. Every concrete waitlist request, offer and temporary booking hold belongs to one Location.
4. Every invoice/draft invoice represents one issuing/service Location, while its legal issuer remains Company/legal-entity based.
5. Public booking must never silently cross from the selected Location to another Location.
6. Shared definitions such as services/products may be usable at all or selected Locations, but that scope must be explicit.
7. Shared customer identity must not be duplicated just because the customer visits another Location.
8. Company remains a useful legal/security boundary; `company_id` is not removed from operational rows merely because `location_id` is added. The database validates that the Location belongs to that Company.

## Ownership audit

| Domain / entity | Target ownership | Current status | Required action |
|---|---|---|---|
| `Workspace` / `LoginAccount` | WORKSPACE | Correct | Keep shared. |
| `WorkspaceClient` | WORKSPACE | Correct | Keep canonical customer identity shared. |
| `Client` | SHARED COMPANY PROFILE + LOCATION VISIBILITY | Already linked to `WorkspaceClient`; has `assignedLocations` | Do not create a separate client per branch. Continue using location assignment only as access/visibility scope. |
| `Company` | COMPANY / LEGAL | Correct direction | Keep legal identity, tax/billing provider configuration, registered details. Remove operational/public assumptions over time. |
| `CompanyLegalEntity` / fiscal certificate | COMPANY / LEGAL | Correct | Keep company/legal-entity scoped. |
| `Location` | LOCATION | Correct | Primary operational branch. |
| `Space` | LOCATION | Correct | Non-null Location already enforced. |
| `SessionBooking` | LOCATION | Correct | Non-null Location already enforced. This is the authoritative location for historical bookings. |
| `SessionType` | SHARED + LOCATION SCOPE | Correct model exists | `availableAllLocations` + `session_type_locations` is the model to reuse elsewhere. |
| `ServiceGroup` | COMPANY/SHARED DEFINITION | Acceptable | Group is taxonomy; availability is inherited through concrete services. |
| `OpenBill` | LOCATION + COMPANY LEGAL CONTEXT | Phase 5.5A hardened | `location_id` is now non-null in JPA/schema. |
| `Bill` | LOCATION + COMPANY LEGAL CONTEXT | Correct | Already non-null Location. Keep legal issuer snapshots/company references. |
| `InvoiceSeries` | COMPANY or LOCATION scope | Good | Existing optional Location supports branch-specific series while retaining legal-entity/company series. |
| `WaitlistRequest` | LOCATION | Phase 5.5A hardened | Non-null Location; selected/target-session location validated. |
| `WaitlistOffer` | LOCATION | Phase 5.5A normalized | Direct non-null Location added; must match request, room and session. |
| `WaitlistBookingHold` | LOCATION | Phase 5.5A normalized | Direct non-null Location added; must match offer, room and session. |
| `BookingSlotHold` | LOCATION | Phase 5.5A normalized | Direct non-null Location added and public flows carry selected location. |
| `GuestOrder` | LOCATION for operational transaction | Phase 5.5A partially normalized | Direct `location_id` added and booking orders populate it. Keep nullable only until product/payment scope is migrated in 5.5C. |
| `BookableSlot` | LOCATION | **Gap / high priority** | Add non-null Location. Current consultant weekly slots are company-wide and do not encode branch. |
| `User` / consultant | SHARED USER + LOCATION SCOPE | **Gap / high priority** | Add explicit all/selected Location assignment. Do not duplicate login/user per branch. |
| consultant working hours | LOCATION-aware configuration | **Gap / high priority** | Current `workingHoursJson` is user-wide. Support defaults plus per-location schedule/overrides. |
| `PaymentMethod` | SHARED + LOCATION SCOPE | **Gap** | Add all/selected Locations so cash/register/payment options can differ by branch. |
| `GuestProduct` | SHARED + LOCATION SCOPE | **Gap** | Add all/selected Locations for packages, memberships, vouchers, courses and standalone purchases. |
| `GuestEntitlement` | SHARED CUSTOMER ASSET + LOCATION SCOPE SNAPSHOT | **Gap** | Snapshot valid Location scope when entitlement is issued so later product edits do not rewrite historical rights. |
| gift/value voucher redemption | LOCATION SCOPE | **Gap** | Explicit all/selected Locations, in addition to existing service scope. |
| `GuestTenantLink` / guest relationship | COMPANY/WORKSPACE RELATIONSHIP | Correct to keep shared | Provider shown to guest can be a Location without duplicating the underlying customer relationship. |
| `Course` | COMPANY/WORKSPACE DIGITAL CONTENT | Correct | Course content itself is not physical. Sale/access eligibility is controlled through product Location scope when applicable. |
| `PersonalCalendarBlock` | USER / CROSS-LOCATION AVAILABILITY | Correct conceptually | A personal absence blocks the consultant across locations. Optional location-specific blocks can be a separate feature if needed. |
| `CalendarTodo` | USER/COMPANY | Acceptable | Not inherently location-owned; optional contextual Location can be added later only when needed. |
| `Consumable` | SHARED SKU/CATALOG | **Current model mixes catalog and stock** | Do not simply add one Location to the item. Split catalog identity from per-location stock. |
| consumable stock | LOCATION | **Gap / high priority for inventory** | Introduce per-location stock row (e.g. `ConsumableLocationStock`) and Location on movements. |
| `ConsumablePurchaseOrder` | LOCATION | **Gap** | Receiving/order destination must be one Location. |
| `ConsumableStockMovement` | LOCATION | **Gap** | Every movement must update one branch's stock ledger. |
| booking/reservation rules | DEFAULT + LOCATION OVERRIDE | **Gap** | Company can hold defaults; Location should optionally override customer-facing/operational rules. |
| pricing | SHARED DEFAULT + LOCATION OVERRIDE | Partial | Service definition can be shared; add Location price override only where branches need different prices. |
| public directory / widget / Guest App provider | LOCATION | Phases 1–5 migrated | Keep Location as provider identity. |
| Google Place / public identity | LOCATION | Phases 1–3 migrated | Correct. |
| inbox/messages | WORKSPACE/COMPANY CUSTOMER RELATIONSHIP | Keep shared | Attach booking/location context when a message originates from a booking; do not fragment conversation identity by branch by default. |
| notifications | EVENT LOCATION when event-based | Needs consistency pass | Booking/waitlist/order notifications should render the concrete event's Location identity. General account notifications remain company/workspace scoped. |
| analytics | LOCATION dimension + workspace/company aggregation | Needs consistency pass | Concrete events already carrying Location should be aggregatable by branch without guessing from Company. |

## Phase 5.5A – concrete operational ownership (implemented in this patch)

This phase establishes Location on records that represent a concrete transaction/event and should never need to infer a branch after the fact.

### Schema/domain changes

- `OpenBill.location` is non-null in both JPA and the database.
- `WaitlistRequest.location` is non-null in both JPA and the database.
- `WaitlistOffer.location` is now stored directly and is non-null.
- `WaitlistBookingHold.location` is now stored directly and is non-null.
- `BookingSlotHold.location` is now stored directly and is non-null.
- `GuestOrder.location` is normalized into a relation. Booking orders set it immediately; legacy Phase 5 metadata is backfilled. It intentionally remains nullable until non-booking product purchases gain Location scope in Phase 5.5C.

### Runtime rules

- Creating/updating a waitlist request requires a Location when more than one active Location exists. A target session supplies its own Location.
- Waitlist services must be offered at the selected Location.
- Waitlist offer room/session must match the request Location.
- Public slot holds carry and validate the selected Location.
- Group-session holds inherit the group's Location and reject a different requested Location.
- Booking-order hold validation checks the same Location used by the order.
- Refund GuestOrders copy the original order Location.
- Guest product bills use the order Location when available.
- Staff-created wallet/product open bills carry the explicitly selected Location; single-location units auto-resolve, while multi-location units must select one.
- Platform subscription open bills always carry the Platform Admin company's active/default Location.
- Manual open-bill creation no longer falls back to an arbitrary/default branch when a multi-location unit has not selected a Location.
- Invoice issuance itself only auto-resolves a Location when exactly one active Location exists; multi-location invoices must carry an explicit operational Location.
- Billing list/summary queries no longer treat null Bill/OpenBill locations as globally visible legacy rows; Bill is already non-null and OpenBill becomes non-null in V47.

### Database guardrails

Migration `V48__operational_location_ownership_foundation.sql` enforces cross-company/location consistency for booking holds, waitlist offers/holds and GuestOrders. The application cannot persist a branch belonging to another Company even if a service-layer check is bypassed. It also replaces the older Space, SessionBooking, OpenBill and WaitlistRequest trigger fallback: an omitted `location_id` is auto-resolved only when exactly one active Location exists; a multi-location Company must provide the branch explicitly.

## Phase 5.5B – availability and staff (next)

This is the next priority because availability cannot be truly branch-correct while `BookableSlot` and consultant working hours are company-wide.

1. Add non-null `BookableSlot.location_id` and migrate existing slots to the default Location.
2. Add explicit consultant Location scope (`availableAllLocations` + `user_locations`, or equivalent).
3. Validate that a bookable slot's consultant is assigned to its Location.
4. Make availability queries select slots for the requested Location only.
5. Make working-hours logic Location-aware: a user-wide default plus optional Location overrides is preferable to copying users.
6. Update Configuration/UI to choose the Location when editing recurring availability when multiple Locations exist.
7. Ensure calendar location filtering shows recurring bookable slots correctly instead of dropping them because they currently have no direct Location/Space.

## Phase 5.5C – commerce, wallet and payment scope

Use the same explicit scope pattern already used by `SessionType`:

- `GuestProduct.availableAllLocations`
- `guest_product_locations(product_id, location_id)`
- `PaymentMethod.availableAllLocations`
- `payment_method_locations(payment_method_id, location_id)`

Then:

1. All GuestOrders receive a non-null Location, including wallet/product-only purchases.
2. Product purchase UI resolves one eligible Location automatically or asks when several are valid.
3. `GuestEntitlement` snapshots the Location scope at issuance (`all` or selected Location IDs / normalized entitlement-location rows).
4. Redemption and booking validate both service scope and Location scope.
5. Staff-created gift cards/packages also require or derive a valid Location context.
6. Payment methods shown at checkout are filtered by selected Location.

## Phase 5.5D – inventory

Inventory needs a normalized ledger rather than a single Location column on `Consumable`:

- `Consumable` = shared SKU/catalog definition.
- `ConsumableLocationStock` = `(consumable_id, location_id, current_stock, minimum_stock, cost...)`.
- `ConsumableStockMovement.location_id` = mandatory.
- `ConsumablePurchaseOrder.location_id` = mandatory receiving branch.
- Session consumption derives Location from `SessionBooking.location`.

The current free-text `Consumable.location` and company-wide `currentStock` should then be removed.

## Phase 5.5E – rules, pricing and configuration

Prefer **global default + Location override** rather than cloning every setting:

- reservation/cancellation windows
- waitlist rules
- break/default scheduling rules where operationally relevant
- pricing overrides
- notification/contact defaults where branches differ

A Location without an override inherits the Company default, keeping one-location UX simple.

## Phase 6 and later

After 5.5B–E, continue the previously planned secondary public-consumer pass:

- public booking manage/cancel/reschedule pages use the booking Location identity,
- waitlist public pages use request/offer Location identity,
- workspace public booking uses the same Location presentation resolver,
- analytics expose reliable Location dimensions,
- remove remaining code paths that use `companyId` as a proxy for operational location.

## Implementation rule for new code

Before adding a new table/API, answer these questions explicitly:

1. Is this a shared identity/definition, a legal-company object, or a concrete operational event?
2. If it is operational, what is its mandatory `location_id`?
3. If it is shared, does it need `all locations / selected locations` scope?
4. If it references a room/session/order, is Location consistency enforced in both service code and the database?
5. Can a multi-location tenant ever reach a branch by implicit "first/default location" selection? Auto-resolution is allowed only when there is exactly one eligible Location.
