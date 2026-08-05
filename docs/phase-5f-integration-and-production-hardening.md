# Phase 5F — Integration and production hardening

Phase 5F does not introduce a new data migration. It adds rollout controls, integrity readiness checks, concurrency protection, repeatable preflight validation, and deployment guidance around the Phase 1–5E workspace model.

## Runtime safeguards

### Feature kill switches

Workspace functionality can be disabled independently at the backend. Disabled authenticated APIs return HTTP 403. Disabled public workspace-booking routes return HTTP 404 to avoid revealing unpublished workspaces.

The enabled feature list is included in the authenticated user payload. The frontend uses it to hide corresponding navigation and actions, but backend enforcement remains authoritative.

### Integrity readiness check

`WorkspaceIntegrityHealthIndicator` verifies the mandatory links introduced by earlier phases:

- Company to workspace
- User membership to login account
- Unit client to workspace client
- Space and booking to a valid same-unit location
- Invoice to issuer, series, and location
- Local service to workspace service template
- Active workspace to workspace subscription

Production readiness includes `workspaceIntegrity`. It can be disabled outside production with `APP_WORKSPACE_INTEGRITY_HEALTH_ENABLED=false`.

### Cross-unit booking serialization

`WorkspaceSchedulingLockService` uses PostgreSQL transaction-level advisory locks for the employee's global login identity and selected room IDs. Locks are sorted before acquisition to prevent deadlocks. Conflict checks still provide the business validation; the lock closes the check-then-insert race across separate operating units.

### Invoice-number concurrency test

A Testcontainers integration test creates several invoices concurrently against one series and verifies unique, uninterrupted allocation.

## Verification assets

- `scripts/phase5f-preflight.sh`
- `scripts/workspace-integrity-audit.sql`
- `docs/operations/workspace-rollout-runbook.md`
- Backend rollout, integrity, scheduling-lock, and invoice-series concurrency tests
- CI upload of backend test reports and frontend build artifacts

## Deployment requirement

Run the complete Maven verification and Node.js 24 production build before release. Local syntax checks are not substitutes for Maven, Testcontainers, ESLint, TypeScript project references, Vite production bundling, or browser smoke testing.

## Compose and staging support

The local, staging, production, and high-availability Compose definitions forward every rollout and integrity environment variable to the backend. This makes the kill switches operational when deployments are managed through Compose rather than only when launching the JVM directly.

The optional staging k6 workflow can also run `load-tests/k6/workspace-booking-smoke.js` when the repository variable `WORKSPACE_BOOKING_SLUG` is configured.

## Deliberately deferred

Phase 5F does not automatically merge or split existing workspaces. Moving an already active operating unit between workspaces affects shared clients, legal entities, service templates, public-booking settings, subscriptions, and audit ownership, so it requires a dedicated reviewed migration workflow rather than a generic database update.

End-to-end browser automation is also not introduced because the project currently has no browser-test dependency or stable test selectors for the new screens. The rollout runbook therefore requires manual browser smoke testing until a dedicated Playwright/Cypress phase is added.
