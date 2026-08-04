# Phase 4 — Legal entities, invoice issuers and invoice series

## Purpose

Phase 4 separates the operating/security unit (`Company`) from the legal invoice issuer and from the invoice-number sequence. It builds on the Phase 3 normalized `Location` model and keeps all existing invoices, numbers and tenant ownership intact.

## Data model

### `legal_entities`

Workspace-owned legal invoice issuers. A legal entity contains the invoice identity and fiscal configuration that must not be inferred from the currently selected operating unit:

- Legal name and registered address
- Country, currency, tax number and VAT ID
- IBAN, BIC, email and telephone
- FURS environment and software-supplier tax number
- Encrypted fiscal-certificate password
- Active state

### `company_legal_entities`

Explicit assignment between an operating unit and a legal entity:

- Active/inactive assignment
- Default issuer for that operating unit
- Default unit-wide invoice series for that issuer

An issuer can be assigned to more than one operating unit in the same workspace. Roles and access remain company/unit-scoped.

### `invoice_series`

A normalized, lockable invoice counter:

- Issuer and workspace
- Optional operating-unit scope
- Optional physical-location scope
- Name
- Next and initial number
- Reset policy (`NONE` or `YEARLY`)
- Last reset year
- FURS business-premise and electronic-device identifiers
- Active state

A series with no `company_id` is shared by the assigned operating units. A location-specific series must also be unit-specific. Unit-wide defaults must stay active and may not be location-specific.

### Immutable invoice identity

Every `Bill` now stores:

- `legal_entity_id`
- `invoice_series_id`
- `location_id`
- Immutable issuer identity snapshots
- Immutable series name and fiscal premise/device snapshots

Editing an issuer, branch or series later does not rewrite an issued invoice. Refunds reserve the next number from the original invoice's series.

## Migration

Flyway migration:

```text
V28__legal_entities_invoice_series_and_issuer_snapshots.sql
```

For each existing company, the migration:

1. Creates one legal entity using the company name and existing billing/fiscal settings.
2. Assigns it as the operating unit's default issuer.
3. Creates one unit-specific `Default` invoice series from `INVOICE_COUNTER`.
4. Assigns that series as the default.
5. Links the default physical location to the issuer.
6. Links all historical invoices to that issuer, series and their session/default location.
7. Copies immutable issuer and fiscal snapshots onto historical invoices.
8. Moves fiscal-certificate ownership from company uniqueness to legal-entity uniqueness.
9. Replaces invoice-number uniqueness from `(company_id, bill_number)` to `(invoice_series_id, bill_number)`.

No historical invoice is renumbered.

New companies inserted after V28—including raw SQL/load-test provisioning—receive a default legal entity, location link and invoice series automatically.

## Counter and integrity rules

- Counter reservation uses a pessimistic database lock.
- Visible invoice numbers may repeat in different explicitly selected series.
- A number remains unique inside one series.
- Shared-series reservations are serialized across all operating units using that series.
- A default series cannot be deactivated, location-restricted or reassigned to an incompatible unit.
- A default issuer assignment must remain active.
- A legal entity cannot be deactivated while it still has active unit assignments.
- An issuer assignment cannot be deactivated or removed while a physical location uses it as its default issuer.
- Database triggers reject cross-workspace, cross-unit and cross-location references using SQLSTATE integrity errors.
- The legacy `INVOICE_COUNTER` setting is synchronized when the migrated/default series is used, preserving compatibility with older reports and settings screens during the transition.

## Backend API

Base path: `/api/billing`

- `GET /issuers`
- `POST /issuers`
- `PUT /issuers/{id}`
- `DELETE /issuers/{id}`
- `POST /issuers/{id}/assignments`
- `DELETE /issuers/{id}/assignments/{companyId}`
- `GET /invoice-series`
- `POST /invoice-series`
- `PUT /invoice-series/{id}`
- `DELETE /invoice-series/{id}`
- `POST /issuers/{legalEntityId}/default-series`
- `GET /workspace-bills`

Invoice creation accepts:

```json
{
  "legalEntityId": 10,
  "invoiceSeriesId": 14,
  "locationId": 3
}
```

The backend validates all three against the authenticated operating unit before reserving a number.

Fiscal endpoints accept issuer/location/series context. Fiscal certificates are looked up by legal entity, while access is still checked through the active operating-unit assignment. Uploading or removing a certificate for an issuer shared across units requires administrator access in every active assigned unit.

## Frontend

### Settings

Path:

```text
Settings → Billing → Issuers & series
Nastavitve → Obračunavanje → Izdajatelji in serije
```

Administrators can:

- Create and edit legal entities
- Assign an issuer to accessible operating units
- Choose the current unit's default issuer
- Choose a default invoice issuer for each physical location
- Upload, inspect and remove the fiscal certificate for each assigned issuer
- Create shared, unit-specific or location-specific series
- Configure counters, reset policy and FURS premise/device identifiers
- Choose the current unit's default series

### Invoice creation

The invoice form now requires:

- Invoice issuer
- Physical location
- Compatible invoice series

The default branch, that branch's default issuer and the default/first compatible series are preselected. Changing the branch applies its configured issuer and clears an incompatible series. Location management exposes the default issuer field and the database rejects cross-unit issuer assignments.

### Consolidated history

The Billing history toolbar includes **All units / Vse enote** when the login can access multiple operating units. This is a read-only workspace view showing the original unit, location, issuer and series for each invoice.

## Automated billing paths

Issuer/series/location assignment also covers:

- Closing an open bill
- Direct invoice and advance creation
- Refund invoices
- Guest product invoices
- Guest bank-transfer/advance invoices
- Platform subscription invoices

PDF generation uses immutable issuer snapshots, with legacy company settings only as a fallback for pre-migration compatibility. Logos and signatures remain operating-unit scoped in this phase.

## Legacy settings compatibility

The existing company and fiscal settings screens remain usable during the transition, with guarded synchronization into Phase 4 records:

- Company identity and fiscal issuer fields synchronize only when the default legal entity is assigned to exactly one active operating unit. A unit administrator therefore cannot change an issuer shared with another unit through the legacy settings endpoint.
- `INVOICE_COUNTER`, business-premise code and device identifier synchronize only when the default series is unit-specific to the current operating unit. Shared series must be managed through **Issuers & series**, where cross-unit administrator checks are enforced.
- Masked certificate passwords remain unchanged. New passwords are encrypted before storage on the legal entity.

## Deployment

1. Back up PostgreSQL.
2. Deploy backend containing V28 and the Phase 4 entities/services.
3. Run Flyway once before serving application traffic.
4. Verify one default issuer and series per existing operating unit.
5. Verify historical invoice PDF rendering and fiscal-certificate metadata.
6. Deploy the frontend.
7. Review issuer data under Billing settings before issuing production fiscal invoices.

Useful verification queries:

```sql
select company_id, count(*)
from company_legal_entities
where active and default_issuer
group by company_id
having count(*) <> 1;

select b.id
from bills b
left join legal_entities le on le.id = b.legal_entity_id
left join invoice_series s on s.id = b.invoice_series_id
left join locations l on l.id = b.location_id
where le.id is null or s.id is null or l.id is null;

select invoice_series_id, bill_number, count(*)
from bills
group by invoice_series_id, bill_number
having count(*) > 1;
```

## Rollback considerations

V28 is a forward structural migration. Do not roll it back by deleting rows after invoices have been issued under multiple series. A code rollback should retain the Phase 4 columns and tables. Before enabling multiple series in production, a temporary application rollback can continue using each migrated unit's default series and synchronized legacy counter.

## Intentionally deferred

- Shared workspace branding/logo rules
- Workspace-wide billing exports and mutations from the consolidated view
- Cross-legal-entity wallets, advances and package liabilities
- A separate commercial subscription payer model
- Retiring legacy company billing settings after a later compatibility window
