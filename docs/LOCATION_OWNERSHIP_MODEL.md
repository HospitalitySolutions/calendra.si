# Calendra location ownership model

Status: Phase 5.5B implemented / architecture baseline

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
| `GuestOrder` | LOCATION for operational transaction | **Phase 5.5C hardened** | Direct non-null `location_id` is required for bookings and product-only purchases. |
| `BookableSlot` | LOCATION | Phase 5.5B hardened | Non-null Location; recurring availability is queried and edited in explicit branch context. |
| `User` / consultant | SHARED USER + LOCATION SCOPE | Phase 5.5B implemented | One shared user with explicit all/selected Location assignment through `available_all_locations` + `user_locations`. |
| consultant working hours | LOCATION-aware configuration | Phase 5.5B implemented | `workingHoursJson` remains the default; `workingHoursByLocationJson` holds optional branch overrides. |
| `PaymentMethod` | SHARED + LOCATION SCOPE | **Phase 5.5C implemented** | `availableAllLocations` + `payment_method_locations`; checkout/invoice methods are filtered and validated by branch. |
| `GuestProduct` | SHARED + LOCATION SCOPE | **Phase 5.5C implemented** | `availableAllLocations` + `guest_product_locations` for packages, memberships, vouchers, courses and standalone purchases. |
| `GuestEntitlement` | SHARED CUSTOMER ASSET + LOCATION SCOPE SNAPSHOT | **Phase 5.5C implemented** | Issuance snapshots all/selected Location rights in `guest_entitlement_locations`, so later product edits do not rewrite historical rights. |
| `GuestEntitlementUsage` | LOCATION | **Phase 5.5C hardened** | Every concrete redemption/scan now stores a mandatory Location. Booking-linked usage must match the booking Location; standalone scans require or safely auto-resolve one eligible branch. |
| gift/value voucher redemption | LOCATION SCOPE | **Phase 5.5C implemented** | Entitlement Location scope is enforced in booking redemption, voucher preflight and staff scanner flows in addition to service scope. |
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
- `GuestOrder.location` was normalized into a relation in 5.5A. Phase 5.5C completes the invariant by backfilling product-only orders and making the relation non-null for every order.

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
- Billing list/summary queries no longer treat null Bill/OpenBill locations as globally visible legacy rows; Bill is already non-null and OpenBill becomes non-null in V48.

### Database guardrails

Migration `V48__operational_location_ownership_foundation.sql` enforces cross-company/location consistency for booking holds, waitlist offers/holds and GuestOrders. The application cannot persist a branch belonging to another Company even if a service-layer check is bypassed. It also replaces the older Space, SessionBooking, OpenBill and WaitlistRequest trigger fallback: an omitted `location_id` is auto-resolved only when exactly one active Location exists; a multi-location Company must provide the branch explicitly.

## Phase 5.5B – availability and staff (implemented)

Phase 5.5B makes recurring availability and employee eligibility branch-aware without duplicating users.

### Schema/domain changes

- `BookableSlot.location` is mandatory in JPA and the database. Existing recurring slots are migrated to the company default/only Location.
- `User.availableAllLocations` defines whether an employee can work at every active branch.
- `user_locations(user_id, location_id)` stores selected branch assignments when `availableAllLocations=false`.
- `User.workingHoursJson` remains the global/default weekly schedule.
- `User.workingHoursByLocationJson` stores optional Location-specific overrides keyed by Location id.
- Database triggers reject cross-company user/location assignments and recurring slots whose consultant is not eligible for that Location.

### Runtime rules

- Creating recurring availability requires a Location when a company has more than one active Location; a one-location company auto-resolves safely.
- Administrators cannot assign recurring availability to a consultant outside that consultant's Location scope.
- Removing an employee from a Location is rejected while recurring `BookableSlot` rows still exist there; those windows must be removed or moved first.
- Disabling consultant status is rejected while recurring availability still exists.
- Website-widget and Guest App consultant lists, recurring windows and working-hour fallback are filtered by the selected Location.
- A selected consultant is validated against both the selected service(s) and selected Location before availability/booking continues. This is enforced centrally for staff-created bookings as well as public/guest flows.
- Booking management/rescheduling uses the booking's Location when evaluating recurring windows and working hours.
- Calendar recurring availability responses include Location directly, so Location filtering no longer has to infer a branch.
- Staff booking create/edit consultant selectors are filtered to the booking Location, while the backend still performs the authoritative consultant/service/Location validation.
- Calendar availability editing carries `locationId`; with multiple Locations and no active Location filter, the availability dialog asks for the Location first.
- Employee configuration supports **all locations / selected locations** and optional per-location working-hour overrides.
- Voice-created recurring availability and voice-created bookings are only auto-resolved when the operating unit has exactly one active Location; a multi-location voice command must not silently choose a branch. Voice availability edits are filtered to that resolved branch before recurring slots are opened/trimmed.

### Availability/absence distinction

`PersonalCalendarBlock` remains user-wide by design: a personal absence (including the hidden recurring-availability exclusion marker used to close otherwise-open working hours) means that employee is unavailable across branches. Branch-specific recurring **availability** is represented by `BookableSlot.location`. If branch-specific personal absences are later needed as a separate feature, they should gain an explicit Location scope rather than changing the meaning of existing personal blocks.

### Database verification

Migration `V49__consultant_location_availability.sql` enforces the new schema and trigger invariants. `OperationalLocationOwnershipMigrationTest` verifies non-null `BookableSlot.location_id`, the consultant Location-scope table and rejection of cross-company/unassigned branch writes. `ConsultantLocationServiceTest` verifies all-location scope, selected-location scope and working-hours override fallback.

## Phase 5.5C – commerce, wallet and payment scope (implemented)

Phase 5.5C applies the same explicit all/selected-location pattern used by `SessionType` to commerce definitions and snapshots it into issued wallet rights.

### Schema/domain changes

- `GuestProduct.availableAllLocations` + `guest_product_locations(product_id, location_id)`.
- `PaymentMethod.availableAllLocations` + `payment_method_locations(payment_method_id, location_id)`.
- `GuestEntitlement.availableAllLocations` + `guest_entitlement_locations(entitlement_id, location_id)`. Entitlements copy the product scope at issuance, including membership-created course access rights.
- `GuestEntitlementUsage.location` is mandatory. Booking/service-linked usage must match the booked branch; standalone scans resolve an explicit or uniquely eligible active Location and persist it for audit/history.
- `GuestOrder.location` is mandatory in JPA and the database. Historical product-only orders are backfilled from linked invoices/open bills or the company's historical default/first Location before the NOT NULL constraint is applied.
- Database triggers reject product, payment-method or entitlement allowlist rows that point to another Company's Location.

### Runtime rules

- Product purchase flows validate the selected Location against the product scope. If exactly one active eligible Location exists it is auto-selected; with several eligible branches the caller must choose.
- Guest App/public catalog product lists are filtered by the selected Location; service-linked products also retain the existing service-location validation.
- Every new GuestOrder stores the resolved Location, including wallet/product-only staff purchases and public/mobile orders.
- Issued entitlements keep their own Location snapshot, so changing a product's future availability never expands or removes already-purchased rights.
- Pass/package/membership redemption, service/value-voucher redemption, voucher preflight and scanner flows reject entitlements outside the booking/scanner Location.
- Payment methods exposed by the website widget and Guest App are filtered by Location. Staff invoice/open-bill creation, split payments, previews and close-to-invoice flows also validate payment-method Location scope.
- The billing UI filters payment methods by the currently selected operational Location; payment-method configuration supports all branches or an explicit branch allowlist.
- Configuration copy never broadens a restricted payment method. Selected branches are mapped by matching Location names; unmatched target branches remain unavailable until configured.
- Client wallet APIs expose the entitlement Location snapshot, and the staff wallet UI shows selected branch names when a right is not valid everywhere.
- Android and iOS Guest App booking flows also carry that snapshot and filter passes/packages/vouchers against the currently selected provider Location before presenting them as usable payment/redemption options; backend validation remains authoritative.
- Gift-card administration responses and gift-card emails expose the entitlement's snapshotted valid Locations so staff and recipients can see branch restrictions without inferring them from the current product definition.

### Database verification

Migration `V50__commerce_location_scope.sql` adds the scope tables/columns, completes the non-null GuestOrder and GuestEntitlementUsage Location invariants and installs cross-company/location guardrail triggers. `OperationalLocationOwnershipMigrationTest` verifies the new non-null/schema invariants and rejects cross-company product/payment-method/entitlement-usage Location writes. `CommerceLocationScopeServiceTest` verifies all-location scope, selected-location scope, single-location auto-resolution and mandatory selection for multi-location purchases. `WalletEntitlementScannerLocationScopeTest` verifies standalone scanner branch selection, rejection outside entitlement scope and persistence of the resolved usage Location.

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
