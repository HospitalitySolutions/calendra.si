# Phase 3 — Locations and consolidated scheduling

## Architecture

Phase 3 keeps the Phase 1 tenancy boundary intact:

```text
Workspace
└── Company / operating unit (security and data-isolation boundary)
    └── Location (physical branch)
        └── Space (room, chair, office or other bookable resource)
```

A booking still belongs to exactly one `Company`, and now also belongs to exactly one physical `Location`. A `Space` belongs to exactly one location. Existing company-scoped repositories and the validated unit request context remain authoritative, so the new consolidated calendar does not create a cross-tenant write path.

## Database migration

Flyway migration:

```text
V26__locations_and_workspace_scheduling.sql
```

The migration:

1. Creates `locations`.
2. Creates one default location for every existing company.
3. Uses the existing company ID as the initial location ID to make the backfill deterministic.
4. Backfills every existing space to the company default location.
5. Backfills every existing booking from its space location or, when no space exists, from the company default location.
6. Converts `waitlist_requests.location_id` from its previous misleading Space reference to a real Location reference.
7. Adds foreign keys, indexes and a one-default-location-per-company constraint.
8. Adds database triggers for raw SQL writers so new companies receive a default location and omitted location IDs are resolved safely.
9. Rejects cross-company spaces, bookings and waitlist locations.
10. Rejects service chains whose rooms do not belong to the booking location.

Existing booking, client, invoice, waitlist and message ownership is not changed.

## Backend functionality

### Location management

New endpoints:

```text
GET    /api/locations
POST   /api/locations
PUT    /api/locations/{id}
DELETE /api/locations/{id}
```

Location fields include:

- Name
- Address, postal code and city
- Timezone
- Telephone and email
- Public-booking visibility
- Active status
- Default-location status
- Fiscal business-premise code reserved for Phase 4 billing normalization

Only administrators may create, update or delete locations. The default location cannot be deleted or disabled. A location referenced by a space, booking or waitlist cannot be deleted.

### Location-aware spaces and bookings

- `Space` now has a mandatory location.
- Space names are unique within a location rather than across the whole company.
- Booking requests accept `locationId`.
- When `locationId` is omitted, it is derived from the selected space/service rooms or the company default location.
- Every service room in a multi-service booking must belong to the same location.
- Demo bookings, Google Calendar imports, public/widget bookings and grouped-session joins receive a default or inherited location.

### Consolidated calendar

New endpoint:

```text
GET /api/bookings/calendar/workspace?from=YYYY-MM-DD&to=YYYY-MM-DD
```

Rules:

- The endpoint only includes operating units for which the authenticated `LoginAccount` has an active membership.
- Administrators see bookings from accessible units.
- Non-administrators see only bookings assigned to their shared login identity.
- Every row carries both `unit` and `location` metadata.
- The result is explicitly read-only.
- Creating, moving, resizing or editing a booking requires switching into the originating unit first.

### Employee overlap protection

For users linked to the same global `LoginAccount`, booking validation now checks the entire workspace for:

- Overlapping bookings
- Overlapping personal calendar blocks
- Recurring and one-off availability blocks

This prevents the same person from being booked simultaneously through two different unit memberships.

### Waitlist behavior

- A waitlist request can target one normalized location or remain open to any location in the current unit.
- Offer rooms are filtered to the selected location.
- Matching uses the booking location even when the booking has no explicit room.
- Cross-company location references are rejected in both application code and the database.

## Frontend functionality

### Configuration

The booking configuration page now includes:

- Location cards
- Create/edit/delete actions
- Default-location selection
- Active and public-booking switches
- Address, timezone and fiscal premise metadata
- Location selection for every room/space

### Calendar

Users with access to more than one operating unit receive:

```text
Current unit | All units
```

Within the selected unit, users with more than one active physical branch also receive a location filter. It can show all branches or one specific branch. Creating a booking while a branch is selected preselects that location and restricts the available rooms accordingly.

The All units view:

- Shows authorized bookings across the workspace
- Labels each event with its operating unit and physical location
- Is read-only
- Disables drag/drop, resize, selection and creation
- Instructs the user to switch units before editing

Booking create/edit dialogs now include a location selector when the unit has multiple active locations. Room choices are filtered to that location.

### Waitlist

The waitlist screen now loads normalized locations separately from rooms. Creating a request selects a physical location, while making an offer only presents rooms within that location.

## Deployment sequence

1. Back up the production database.
2. Deploy the backend and run Flyway V26.
3. Run the validation queries below.
4. Deploy the frontend.
5. Verify location management, booking creation and All locations calendar access with both administrator and employee memberships.
6. Validate constraints and monitor application logs for rejected legacy raw SQL writes.

## Validation queries

Every company should have exactly one default location:

```sql
select c.id, c.name, count(l.id) filter (where l.default_location) as default_count
from company c
left join locations l on l.company_id = c.id
group by c.id, c.name
having count(l.id) filter (where l.default_location) <> 1;
```

Spaces must belong to a location in the same company:

```sql
select s.id, s.company_id, s.location_id, l.company_id as location_company_id
from space s
left join locations l on l.id = s.location_id
where l.id is null or l.company_id <> s.company_id;
```

Bookings must belong to a location in the same company, and the primary room must match that location:

```sql
select sb.id, sb.company_id, sb.location_id, l.company_id as location_company_id,
       sb.space_id, s.location_id as space_location_id
from session_booking sb
left join locations l on l.id = sb.location_id
left join space s on s.id = sb.space_id
where l.id is null
   or l.company_id <> sb.company_id
   or (s.id is not null and s.location_id <> sb.location_id);
```

Service rooms must match the booking location:

```sql
select ss.id, ss.session_booking_id, ss.space_id,
       sb.location_id as booking_location_id, s.location_id as space_location_id
from session_service ss
join session_booking sb on sb.id = ss.session_booking_id
join space s on s.id = ss.space_id
where ss.space_id is not null and s.location_id <> sb.location_id;
```

Waitlist locations must belong to the request company:

```sql
select wr.id, wr.company_id, wr.location_id, l.company_id as location_company_id
from waitlist_requests wr
join locations l on l.id = wr.location_id
where wr.location_id is not null and l.company_id <> wr.company_id;
```

All queries should return zero rows.

## Phase boundary

Phase 3 normalizes physical branches and scheduling. It does not yet normalize legal invoice issuers or invoice numbering series. `fiscal_business_premise_code` is stored on Location so Phase 4 can attach legal entities, FURS premises, devices and invoice series without another location migration.

The public widget continues to use the operating unit's default location unless a booking originates from a location-specific room or a future workspace booking landing page. The normalized public visibility field and location-safe booking pipeline are now in place for that later multi-location public selector.
