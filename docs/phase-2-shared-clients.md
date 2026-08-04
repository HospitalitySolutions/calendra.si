# Phase 2 — Shared clients

## Implemented model

Phase 2 keeps `clients` as the unit-owned relationship and adds `workspace_clients` as the shared identity.

```text
WorkspaceClient
├── Client in Unit A
├── Client in Unit B
└── Client in Unit C
```

Bookings, invoices, assigned employees, custom fields, notes, files and messages continue to reference the original unit `Client` row. Linking two people never moves or rewrites those records.

## Database migration

Flyway migration: `V25__workspace_clients_and_duplicate_review.sql`

The migration:

- creates one `workspace_clients` row for every existing client without automatically merging anyone;
- links `clients.workspace_client_id` and makes it mandatory;
- creates duplicate-review and audit tables;
- seeds only strong cross-unit duplicate suggestions;
- installs database triggers for raw/non-JPA client writers;
- synchronizes shared name, email and phone fields across linked unit records;
- prevents a client identity from being linked across different workspaces;
- marks notes, files and messages as `UNIT_ONLY`;
- adds composite unit/client foreign keys for new files, messages, scheduled messages, bookings and bills;
- preserves deployment when old mismatched rows exist by installing the new composite foreign keys as `NOT VALID`.

No existing client rows, bookings, invoices, files or messages are deleted or renumbered.

## Shared fields

The following values are canonical at workspace level and synchronized to all linked, non-anonymized unit client rows:

- first name;
- last name;
- email;
- phone.

These remain unit-specific:

- assigned employee(s);
- active/inactive state;
- booking restrictions;
- invoice preferences and recipient details;
- local custom fields and tags;
- WhatsApp/Viber configuration except a default phone update where it still matched the previous phone;
- bookings, waitlists, invoices and wallets;
- internal notes, files, inbox messages and scheduled messages.

## Access rules

All `/api/workspace-clients/**` routes require the existing `CLIENTS` permission.

Search and activity results include only unit relationships that the active login can access:

- administrators can see clients in their accessible units;
- non-administrators can see only clients assigned to their membership in each unit;
- inaccessible unit names, activity and relationship counts are not returned.

Duplicate review, merge and unlink operations require administrator access in every affected unit.

## Duplicate workflow

Duplicates are proposed only across different units and are based on exact normalized email/phone matches with name scoring.

Available decisions:

- **Use left/right profile:** keep the selected shared contact values and relink the other unit relationships;
- **Not the same person:** permanently suppress that pair;
- **Review later:** hide it until the next explicit duplicate scan;
- **Unlink location:** create a new identity for one unit relationship and suppress the same pair from being suggested again.

A merge is a reversible link operation. The original unit client rows remain intact.

## Shared search and activity

Frontend entry point: **Clients → All locations / Vse lokacije / Sve lokacije**.

The panel provides:

- workspace-wide search by name, email or phone;
- visible unit relationships and assigned employee;
- per-unit counts for bookings, invoices, messages, notes and files;
- recent authorized activity timeline;
- duplicate scan and review UI;
- unlink action for administrators.

## Anonymization and deletion

Anonymizing one unit relationship does not erase a linked person from another unit. The unit relationship is first separated, then only its isolated identity is anonymized.

Deleting the last unit relationship clears the orphaned shared identity's personal data and marks it anonymized. Audit references use `ON DELETE SET NULL`, so client or employee deletion does not destroy the audit trail or block deletion.

Issued invoices keep their existing client snapshots and are not modified.

## Audit events

The implementation records creation, shared contact changes, duplicate scans and decisions, links, unlinks, anonymization and deletion. Database triggers also audit raw writers and direct identity-link changes where no authenticated application actor is available.

## API endpoints

- `GET /api/workspace-clients/search`
- `GET /api/workspace-clients/{id}/activity`
- `GET /api/workspace-clients/duplicates`
- `POST /api/workspace-clients/duplicates/refresh`
- `POST /api/workspace-clients/duplicates/{candidateId}/merge`
- `POST /api/workspace-clients/duplicates/{candidateId}/review`
- `POST /api/workspace-clients/{workspaceClientId}/unit-clients/{clientId}/unlink`

Every request still carries and validates the active Phase 1 unit context. Workspace endpoints explicitly aggregate only authorized memberships rather than disabling tenant filters.

## Deployment checks

Before deployment, take a database backup and deploy the Phase 1 code/migration first.

After migration, review historical unit mismatches before validating the new constraints:

```sql
select cf.id, cf.client_id, cf.owner_company_id, c.company_id
from client_files cf
join clients c on c.id = cf.client_id
where cf.owner_company_id <> c.company_id;

select cm.id, cm.client_id, cm.company_id, c.company_id as client_company_id
from client_messages cm
join clients c on c.id = cm.client_id
where cm.company_id <> c.company_id;

select sm.id, sm.client_id, sm.company_id, c.company_id as client_company_id
from scheduled_messages sm
join clients c on c.id = sm.client_id
where sm.company_id <> c.company_id;

select sb.id, sb.client_id, sb.company_id, c.company_id as client_company_id
from session_booking sb
join clients c on c.id = sb.client_id
where sb.client_id is not null and sb.company_id <> c.company_id;

select b.id, b.client_id, b.company_id, c.company_id as client_company_id
from bills b
join clients c on c.id = b.client_id
where b.client_id is not null and b.company_id <> c.company_id;
```

When all results are resolved, validate:

```sql
alter table client_files validate constraint fk_client_files_unit_client;
alter table client_messages validate constraint fk_client_messages_unit_client;
alter table scheduled_messages validate constraint fk_scheduled_messages_unit_client;
alter table session_booking validate constraint fk_session_booking_unit_client;
alter table bills validate constraint fk_bills_unit_client;
```

## Verification performed here

- Java parser: 663 source/test files, zero syntax errors.
- TypeScript/TSX parser: 116 files, zero syntax errors.
- Migration static checks passed, including trigger delimiters, explicit unit visibility rules and deferred legacy constraint validation.
- Added a PostgreSQL/Testcontainers migration integration test covering one-to-one migration, candidate seeding, non-destructive linking, shared-field synchronization, raw writers, audit retention, cross-workspace rejection and cross-unit message rejection.

A full Maven test run and frontend production build could not be executed in this environment because dependencies are not locally installed and network dependency downloads are unavailable. The frontend also declares Node.js 24 or newer, while the available runtime is Node.js 22.
