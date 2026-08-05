# Phase 5E — Workspace subscription ownership and usage limits

## Summary

Phase 5E moves commercial Calendra subscription ownership above individual operating units. A workspace now has one subscription, one retained billing-owner unit for compatibility with the existing platform billing engine, an optional payer legal entity, pooled allowances, centralized feature entitlements, and per-unit usage reporting.

Existing tenant data, client invoices, historical Calendra subscription invoices, and company-scoped settings are preserved. The migration does not create a second charge for companies that are already linked into the same workspace.

## Database migration

Flyway migration:

```text
V32__workspace_subscription_ownership_and_entitlements.sql
```

It creates:

- `workspace_subscriptions`
- `workspace_subscription_legacy_sources`
- `workspace_usage_monthly`
- `workspace_usage_events`
- `workspace_subscription_audit_log`

Every existing workspace receives one subscription. The company with the lowest ID is selected as the initial retained billing owner. All companies in the workspace are retained as legacy sources so historical platform subscription invoices remain discoverable. For workspaces created after V32, the first company automatically becomes the retained billing owner and later companies are attached as additional legacy sources.

Malformed historical subscription dates and user limits do not block migration. The migration safely converts valid values and falls back when legacy free-form settings are invalid.

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

`WorkspaceSubscription.legacyPrimaryCompany` is the retained billing-owner operating unit. The existing platform billing implementation continues to use its immutable subscription reference:

```text
CALENDRA-SUBSCRIPTION:{companyId}
```

Only this operating unit generates future Calendra subscription renewals and past-due transitions. Changing the billing owner is an explicit workspace-administrator action.

Historical platform invoices for every company later linked into the workspace remain visible under Account management → Received invoices.

## Subscription payer

The payer is independent from the operating unit used as the compatibility billing owner. A workspace administrator can select any legal entity belonging to the workspace and provide billing overrides:

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

## Compatibility

Company subscription settings remain a compatibility projection for the retained billing owner. When another operating unit is active, subscription-setting reads are overlaid from the retained owner and capacity writes are mirrored to it before synchronization. Package changes and subscription lifecycle jobs synchronize the workspace subscription. Existing focused controller/service constructors remain available for older unit tests.

The migration preserves feature access for existing workspaces so deploying Phase 5E does not unexpectedly hide functionality already introduced in Phases 1–5D. Future package changes recalculate workspace features and limits from the retained billing owner and selected add-ons, while retaining multi-unit/configuration-copy/analytics access required by existing multi-unit usage and retaining workspace public booking while an enabled public workspace page exists.

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

- `WorkspaceSubscriptionMigrationTest`
- Application-context JPA validation after V32
- Subscription renewal and package-change regression tests
- SMS and email delivery tests
- Account-management received-invoice tests
- Frontend subscription and configuration production build
