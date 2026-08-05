# Phase 5C — Workspace analytics

## Purpose

Phase 5C adds a permission-safe consolidated analytics view across operating units that belong to the same workspace. The existing current-unit analytics remains unchanged at `/analytics`; the consolidated view is available at `/analytics/workspace` when the login has `REPORTS_ANALYTICS_VIEW` in more than one operating unit.

No transactional ownership is changed. Bookings remain owned by their operating unit and location, and invoices remain owned by their original operating unit, legal entity, invoice series, and immutable issuer snapshot.

## Backend API

Base path: `/api/analytics/workspace`

- `GET /filters` — returns accessible reporting dimensions.
- `GET /overview` — returns KPIs, previous-period comparison, daily trend data, currency-specific invoice metrics, and unit/location/employee/service comparisons.
- `GET /export?format=csv|excel` — exports the same filtered report as CSV or tab-separated Excel-compatible `.xls` content.

Supported query parameters:

- `from`, `to`
- `unitIds`
- `locationIds`
- `legalEntityIds`
- `invoiceSeriesIds`
- `employeeLoginAccountIds`
- `workspaceServiceTemplateIds`
- `sessionTypeIds`
- `bookingStatuses`
- `paymentStatuses`

The maximum inclusive range is 731 days. The previous period has the same number of days immediately before the selected range.

## Permission model

The authenticated global login is resolved to active memberships in the current workspace. Only memberships with `REPORTS_ANALYTICS_VIEW` participate in the report.

Every requested operating-unit ID is checked against that authorized set. Every subordinate filter is then checked against the selected units. The SQL queries always retain `company_id in (:unitIds)` as the ownership boundary.

Inactive or no-longer-assigned dimensions remain available when they occur in historical records belonging to an accessible operating unit. This allows old branches, employees, issuers, and invoice series to remain reportable without restoring their operational access.

## Metric definitions

### Bookings

A grouped booking is counted once using `booking_group_key`; ungrouped bookings use their own ID. Lifecycle status is derived as follows:

1. `NO_SHOW`
2. `CANCELLED`
3. explicitly `CHECKED_OUT`, or ended before the report execution time
4. otherwise `RESERVED`

Booked minutes exclude cancelled and no-show bookings.

### New and returning clients

Clients are grouped through `WorkspaceClient` when linked. A client is new when their first non-cancelled booking in the selected, authorized operating units falls inside the selected range. Otherwise, activity in the range is returning-client activity.

### Revenue and invoices

- Only `INVOICE` documents are included; advance invoices are excluded to avoid double counting when later consumed by a normal invoice.
- Open bills are not issued invoices and are not queried from `open_bills`.
- Cancelled invoices do not contribute to revenue.
- Refund invoices use their stored negative amounts and therefore reduce gross and paid totals.
- `refundedGross` is shown separately as the absolute refunded amount.
- Average invoice value uses positive, non-refund, non-cancelled invoices.
- Invoice issuer and currency come from the normalized legal entity attached to the immutable issued invoice.

Currencies are never converted or summed together. Every currency has its own KPI card, trend series, comparison value, and export amount.

### Employee utilization

Bookings are grouped through `LoginAccount`, so one person’s memberships across multiple operating units are reported as one employee.

Availability is calculated from the selected memberships’ working-hours JSON. Overlapping schedules are merged per day before minutes are counted, preventing the same 08:00–16:00 interval from being counted twice when duplicated across units.

Employee utilization is:

`non-cancelled booked minutes / merged available minutes × 100`

Availability blocks, holidays, leave, and external-calendar busy events are not yet subtracted from the denominator.

### Location utilization

Location availability is based on location opening hours multiplied by `max(1, number of rooms/resources assigned to the location)`.

Location utilization is:

`non-cancelled booked minutes / location capacity minutes × 100`

This is a practical capacity approximation. Services that do not reserve a room and resources with materially different capacities may require a later dedicated capacity model.

### Service performance

Booking counts and booked minutes use `session_service`, so chained services are included and can be filtered by either workspace template or local service offering.

Revenue attribution uses invoice line source-booking links. Because the existing `bill_item` schema stores the source booking but not an exact session-service position, revenue for a chained booking is attributed through the booking’s primary service. A future line-level service snapshot can remove this limitation.

## Frontend

### Current-unit analytics

The current page remains `/analytics`. When the login has report permission in multiple units, a scope switch appears:

- Current unit
- Entire workspace

### Workspace analytics

The `/analytics/workspace` page contains:

- date presets and custom date range
- unit, location, legal entity, invoice series, employee, workspace service, local service, booking-status, and payment-status filters
- current-versus-previous KPI cards
- no-show rate
- employee utilization
- one revenue card per currency
- daily bookings/completion/revenue trend
- operating-unit chart
- detailed unit, location, service, and employee tables
- invoice/payment breakdown
- CSV and Excel-compatible exports

The frontend only displays the workspace scope when more than one unit grants report access. Backend authorization remains authoritative.

## Migration

Flyway migration:

`V30__workspace_analytics_indexes.sql`

The migration only adds reporting indexes. It does not insert, update, renumber, relink, or delete transactional records.

Added indexes support:

- workspace booking/date/filter scans
- client-first-booking calculations
- service-chain analytics
- invoice issuer/series/location/date filters
- shared-client grouping
- login-account employee grouping
- workspace service-template grouping

## Performance notes

Phase 5C uses optimized live aggregate queries rather than snapshots. This keeps figures immediately consistent with operational data and avoids a scheduled aggregation dependency.

If report volume grows substantially, the next optimization should be daily workspace metric snapshots or materialized reporting tables, while retaining live queries for the current day.

## Deployment checklist

1. Ensure the Phase 1–5B migrations are already present.
2. Apply Flyway migration V30.
3. Run the complete backend test suite against PostgreSQL.
4. Run the frontend production build with the project-required Node.js version.
5. Verify a login with report access in two units can open `/analytics/workspace`.
6. Verify a membership without report access is excluded from filter options and totals.
7. Compare one currency’s totals with Billing for the same dates and payment filters.
8. Verify refunds reduce net totals and advances do not appear as revenue.
9. Verify CSV and Excel-compatible exports include the active filters and generation timestamp.
