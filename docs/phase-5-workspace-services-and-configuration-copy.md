# Phase 5A/5B — Workspace services and configuration copy

## Scope

This phase adds a workspace-level service catalogue while preserving the existing operating-unit service model. It also adds a preview-first configuration-copy workflow between operating units in the same workspace.

`Company` remains the tenant/security boundary. `SessionType` remains the unit-specific service offering used by bookings, employees, public booking and billing. `WorkspaceServiceTemplate` is the shared identity above equivalent unit offerings.

## Migration

Flyway migration:

`V29__workspace_service_templates_and_configuration_copy.sql`

The migration:

- creates `workspace_service_templates`;
- adds `session_type.workspace_service_template_id`;
- creates one template for every existing service without linking records automatically by name;
- adds explicit per-location service visibility while preserving existing services as available at all locations;
- assigns an owner operating unit to each template;
- prevents cross-workspace links;
- permits at most one offering of one workspace service per operating unit;
- creates workspace-service and configuration-copy audit tables;
- gives legacy/raw SQL service inserts a one-to-one template automatically.

Existing services, bookings, prices, employees and invoice history are not moved or rewritten.

## Workspace service catalogue

Backend endpoints:

- `GET /api/workspace-service-templates`
- `POST /api/workspace-service-templates`
- `PUT /api/workspace-service-templates/{id}`
- `POST /api/workspace-service-templates/{id}/link`
- `POST /api/workspace-service-templates/{id}/sync/{sessionTypeId}`
- `DELETE /api/workspace-service-templates/{id}/link/{sessionTypeId}`
- `GET /api/workspace-service-templates/audit`

Shared template fields:

- name;
- description;
- default duration;
- colour;
- optional icon;
- booking instructions;
- active status.

Local offering fields remain unit-owned, including:

- billing services, tax and prices;
- break duration and capacity;
- public-booking flags;
- employee assignments;
- service groups;
- guest/user allowlists;
- local active status;
- availability at all locations or an explicit allowlist of physical locations.

Synchronising shared defaults is explicit. Editing a shared template does not silently overwrite all unit offerings. New and edited bookings are rejected when a selected local service is not available at the booking location.

### Access rules

- A template is visible only when the current login can access its owner unit or at least one linked offering.
- Editing shared template fields requires administrator access in the owner unit and every unit currently linked to the template.
- Linking, syncing and unlinking a local offering require administrator access in the active unit.
- A template cannot be linked across workspaces.
- A unit cannot have two offerings linked to the same template.

## Configuration-copy wizard

Backend endpoints:

- `GET /api/configuration-copy/units`
- `POST /api/configuration-copy/preview`
- `POST /api/configuration-copy/execute`
- `GET /api/configuration-copy/history`

The actor must have an active administrator membership in both source and target units.

Supported categories:

- services and billing-service prices;
- tenant working hours;
- booking rules;
- notification templates;
- custom-field definitions;
- locations and rooms;
- payment methods;
- legally safe invoice display/delivery settings.

The preview classifies each item as `CREATE`, `UPDATE`, `SKIP` or `INCOMPATIBLE`. Existing target configuration is not updated unless `overwriteExisting=true` is explicitly selected.

Execution is rejected while incompatible items remain.

### Deliberately excluded data

The copy workflow does not copy or overwrite:

- clients, bookings, invoices or balances;
- employee assignments or employee-specific working hours;
- client/user allowlists;
- service groups;
- provider credentials or Stripe onboarding state;
- legal entities, invoice series or counters;
- fiscal certificates, fiscal premise identifiers or device identifiers;
- location invoice-issuer assignments;
- company identity, tax numbers, IBAN or subscription settings.

New copied locations inherit the target unit's issuer configuration; source fiscal identifiers are never copied.

## Frontend

The Services screen now shows a **Workspace services / Skupne storitve** action when the login has access to more than one operating unit.

The modal contains:

1. **Workspace catalogue**
   - create and edit templates;
   - inspect offerings by unit;
   - link a current-unit service;
   - explicitly sync shared name/duration/colour;
   - unlink without deleting the local service;
   - see each offering's physical-location visibility.

The existing service editor also includes **Location availability**, where an offering can be enabled for all physical locations or an explicit location allowlist. Calendar booking selectors filter services by the chosen location, and backend validation enforces the same rule.

2. **Copy configuration**
   - select source and target units;
   - select categories;
   - optionally allow updates;
   - preview all actions and incompatibilities;
   - execute only after a clean preview;
   - view recent copy history.

## Audit

`workspace_service_audit_log` records template creation/update and offering link/sync/unlink actions.

`configuration_copy_audit_log` records source, target, actor, categories, preview result and applied count. History is only returned when the current login has administrator access in both units involved.

## Verification

A PostgreSQL/Testcontainers migration test was added:

`WorkspaceServiceConfigurationMigrationTest`

It verifies:

- one-to-one migration of existing services;
- no automatic merging by matching names;
- explicit cross-unit linking in one workspace;
- one offering per template per unit;
- cross-unit service/location visibility rejection;
- cross-workspace rejection;
- automatic template creation for raw SQL writers.
