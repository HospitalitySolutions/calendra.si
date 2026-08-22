# Phase 5E — Workspace subscription ownership and usage limits

## Summary

Phase 5E places commercial Calendra subscription ownership above individual operating units. A workspace has one subscription, one billing-owner operating unit, an optional payer legal entity, pooled allowances, centralized feature entitlements, and per-unit usage reporting.

## Database model

The canonical production schema contains:

- `workspace_subscriptions`
- `workspace_usage_monthly`
- `workspace_usage_events`
- `workspace_subscription_audit_log`

Each workspace receives one subscription automatically. The first company attached to the workspace becomes its billing owner unless an administrator explicitly selects another company. No migration-source/history table is part of the production model.

### Limit semantics

A limit of `0` means unlimited. Database triggers enforce configured hard limits for:

- Operating units
- Physical locations
- Distinct active login accounts
- Distinct active consultant login accounts
- Shared workspace clients
- Monthly bookings when booking overage is disabled
- File storage
- Unit and workspace public-booking pages

The triggers raise SQLSTATE `23514` or `23503`, allowing Spring to translate violations to `DataIntegrityViolationException`.

Migrated limits are never placed below current workspace usage.

## Subscription ownership

`WorkspaceSubscription.billingOwnerCompany` is the billing-owner operating unit. The platform billing implementation uses its immutable subscription reference:

```text
CALENDRA-SUBSCRIPTION:{companyId}
```

Only this operating unit generates Calendra subscription renewals and past-due transitions. Changing the billing owner is an explicit workspace-administrator action.

## Subscription payer

The payer is independent from the operating unit used as the billing owner. A workspace administrator can select any legal entity belonging to the workspace and provide billing overrides:

- Contact name
- Billing email
- Address
- Postal code and city
- Country
- Tax ID
- Purchase-order/reference value

Future Calendra subscription payee records use the selected legal entity and billing overrides. This does not change the legal entity used for invoices issued to the workspace's own clients.

## Entitlements

Central feature checks are exposed through:

```java
workspaceEntitlements.requireFeature(actor, WorkspaceFeature.WORKSPACE_ANALYTICS);
```

Features currently include:

- `CORE`
- `MULTI_UNIT`
- `WORKSPACE_ANALYTICS`
- `WORKSPACE_PUBLIC_BOOKING`
- `CONFIGURATION_COPY`
- `API_ACCESS`

Workspace analytics, workspace public-booking administration, configuration copy, and operating-unit creation now use centralized backend checks. The authenticated-user response contains the subscription status, features, and limits so the frontend uses the same entitlement source.

Suspended and cancelled subscriptions lose advanced workspace entitlements. Core tenant data is not deleted or mixed, and subscription management remains available.

## Usage

Live usage is calculated for:

- Operating units
- Physical locations
- Distinct active users
- Distinct consultants
- Shared clients
- Monthly bookings
- Storage
- Public booking pages

Monthly metered usage is stored per workspace and operating unit for:

- SMS parts
- Email messages
- API calls
- Payment transactions

SMS pooling is integrated with the existing quota service. Main tenant email paths are also metered and quota-checked: direct client email, reminders, waitlist email, and non-platform invoice delivery. Platform-to-tenant subscription emails are excluded from tenant email usage.

Stripe bill payments are recorded as workspace payment transactions after a payment is finalized; Calendra subscription payments are excluded from tenant usage. A unique bill-backed usage event makes this counter idempotent across Stripe webhook and checkout-return reconciliation paths. The API metric is provisioned in the schema and reporting response but is intentionally not incremented by normal frontend API traffic. A future external/API gateway can populate it without changing the subscription model.

## Creating an operating unit

Endpoint:

```text
POST /api/workspace-units
```

The operation:

1. Requires the `MULTI_UNIT` entitlement.
2. Requires administrator access in every existing workspace unit.
3. Creates the company inside the existing workspace.
4. Provisions the default physical location, legal issuer, invoice series, and payment methods through existing database/application provisioning.
5. Adds the current global login account as an administrator membership.
6. Optionally copies safe configuration from an existing unit when the workspace also has the `CONFIGURATION_COPY` entitlement.
7. Does not create another Calendra subscription.

Safe automatic copy categories are services, working hours, booking rules, notification templates, custom fields, locations/rooms, and payment methods. Client data, legal identities, fiscal certificates, invoice counters, provider credentials, and employee assignments are not copied.

## Frontend

The existing Configuration → Subscription area now includes:

- Workspace plan and status
- Pooled usage and limits
- Feature list
- Retained billing-owner selection
- Payer legal-entity selection
- Billing-contact details
- Overage rules
- Operating-unit creation with optional safe configuration copy
- Per-unit usage table

Existing package, add-on, and received-invoice controls remain below the workspace panel.

## Current synchronization boundary

The workspace subscription is the canonical entitlement model. Company-level commercial settings are still synchronized for billing/configuration flows that actively use those settings today; they are not part of Flyway upgrade compatibility. Package changes and subscription lifecycle jobs synchronize the workspace subscription from the selected billing owner.

## Deployment checks

Run before release:

```bash
cd backend
./mvnw test

cd ../frontend
npm ci
npm run build
```

Pay particular attention to:

- `FlywayBaselineMigrationTest`
- `PostgresApplicationContextTest` JPA validation against the canonical V1
- Subscription renewal and package-change regression tests
- SMS and email delivery tests
- Account-management received-invoice tests
- Frontend subscription and configuration production build
