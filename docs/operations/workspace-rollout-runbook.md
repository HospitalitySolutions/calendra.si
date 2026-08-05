# Workspace rollout runbook

## Purpose

Use this runbook to deploy the multi-unit workspace functionality introduced in Phases 1–5E without exposing partially migrated or inconsistent data.

## Before deployment

1. Take a database snapshot and verify that point-in-time recovery is available.
2. Record the current application image tags and Flyway schema version.
3. Run the complete backend and frontend CI jobs.
4. Run `scripts/phase5f-preflight.sh` in an environment with Java 21+, Node.js 24+, Docker/Testcontainers, and access to the target database.
5. Run `scripts/workspace-integrity-audit.sql` against a restored production snapshot first.
6. Confirm that no workspace-integrity result rows are returned.

## Recommended rollout order

1. Deploy the database migration and backend with every workspace rollout flag disabled.
2. Verify `/actuator/health/readiness`; `workspaceIntegrity` must be `UP`.
3. Enable shared clients and shared services for internal administrator accounts.
4. Enable consolidated scheduling and billing after booking and invoice smoke tests.
5. Enable workspace analytics after validating totals against unit-level reports.
6. Enable workspace public booking last, after testing every included location and payment method.
7. Enable workspace unit management only after subscription limits and configuration copying are verified.

## Feature switches

| Environment variable | Feature |
|---|---|
| `APP_WORKSPACE_ROLLOUT_SHARED_CLIENTS` | Shared clients and duplicate review |
| `APP_WORKSPACE_ROLLOUT_CONSOLIDATED_SCHEDULING` | All-units calendar |
| `APP_WORKSPACE_ROLLOUT_CONSOLIDATED_BILLING` | All-units invoice history |
| `APP_WORKSPACE_ROLLOUT_SHARED_SERVICES` | Shared service catalogue and configuration copy |
| `APP_WORKSPACE_ROLLOUT_ANALYTICS` | Workspace analytics |
| `APP_WORKSPACE_ROLLOUT_PUBLIC_BOOKING` | Workspace public booking |
| `APP_WORKSPACE_ROLLOUT_UNIT_MANAGEMENT` | Creating additional operating units |
| `APP_WORKSPACE_INTEGRITY_HEALTH_ENABLED` | Readiness integrity checks |

Restart the backend after changing an environment flag. The authenticated user response contains the enabled rollout features, so the frontend hides disabled functionality while the backend independently blocks its endpoints.

## Smoke tests

- Switch between two operating units and confirm that local clients, bookings, settings, and invoices remain isolated.
- Search a linked workspace client and confirm that only authorized unit activity is shown.
- Attempt simultaneous bookings for the same employee from two units; only one should succeed.
- Attempt simultaneous bookings for the same room; only one should succeed.
- Issue concurrent invoices from one series and confirm unique sequential numbers.
- Verify each physical location selects the correct legal issuer and invoice series.
- Compare workspace analytics with the sum of the corresponding unit reports, separately for each currency.
- Complete free and paid workspace public bookings at every enabled location.
- Confirm subscription usage increments only after successful SMS, email, and payment operations.

## Rollback

Application rollback is preferred over database rollback after Flyway migrations have committed.

1. Disable the affected feature switch immediately.
2. Redeploy the previous application image if the problem is not isolated by the switch.
3. Do not manually delete or renumber workspace, invoice, client, or booking records.
4. Restore the database snapshot only when the migration itself corrupted data and no forward repair is safe.
5. After a restore, deploy the matching previous application image and confirm Flyway history before reopening traffic.

## Terminology

- **Operating unit**: the security and tenant context represented by `Company` and selected in the global header.
- **Physical location**: a branch/address inside an operating unit.
- **Space**: a room, chair, office, or other bookable resource inside a physical location.
- **Legal entity**: the invoice issuer and possible Calendra subscription payer.
