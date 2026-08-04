# Phase 1: multi-unit authentication foundation

## Implemented model

Phase 1 keeps the existing `Company` entity as the isolated operating unit. All tenant-owned records continue to reference one `Company`, so existing repository and controller filters remain intact.

Two entities were added above that boundary:

- `Workspace`: groups operating units that may share workspace-level data in later phases.
- `LoginAccount`: owns the global login identity, password and security sessions.

The existing `User` entity now acts as the employee/unit membership. A login account may have multiple user memberships, with a different role and permission set in each unit. A unique database constraint prevents the same login from receiving two memberships in the same unit.

```text
LoginAccount
  ├── User membership ── Company / operating unit A ── Workspace
  └── User membership ── Company / operating unit B ── Workspace
```

## Request authentication flow

1. The JWT subject is the `LoginAccount.id`.
2. The client sends the selected operating unit in `X-Calendra-Unit-Id`.
3. `JwtAuthenticationFilter` validates the global login and security session.
4. `UnitContextValidationFilter` verifies that the login has an active membership in the requested unit.
5. The filter replaces the Spring Security principal with that unit's `User` membership.
6. Existing controllers continue using `me.getCompany().getId()`, preserving strict unit isolation.

A missing unit header uses the login account's last selected unit, or its first available membership.

## API additions

### Select active unit

```http
POST /api/auth/active-unit
X-Calendra-Unit-Id: 17
Content-Type: application/json

{"companyId":17}
```

The target must be supplied in both the validated request header and body. The response contains the selected membership and all units available to the login.

### Current user response

`GET /api/auth/me` and successful login responses now include:

- `loginAccountId`
- `activeUnitId`
- `activeUnitName`
- `workspaceId`
- `workspaceName`
- `units[]`, including unit-specific membership ID, role and permissions

## Database migration

`V24__workspace_login_accounts_and_unit_context.sql` performs a compatibility-first migration:

- Creates one workspace for each existing company.
- Preserves company IDs as initial workspace IDs.
- Creates one login account for every existing user.
- Preserves user IDs as initial login-account IDs.
- Links all users and security sessions to their login account.
- Keeps old JWT subjects and existing security sessions resolvable after deployment.
- Adds a unique `(login_account_id, company_id)` membership constraint.

No existing users are automatically merged by email. That is intentional: two tenant records with the same email may represent different people or credentials. Linking existing accounts must be an explicit, trusted operation.

## Linking units for one login

To make two existing unit memberships appear under one login, both conditions must be true:

1. Their `users.login_account_id` values point to the same `login_accounts.id`.
2. Units intended to share future workspace-level data have the same `company.workspace_id`.

Perform this only through a reviewed administrative migration. Before reassigning a membership, verify identity and revoke security sessions belonging to the source login account. Do not delete a source login account until it has no memberships or sessions.

Global email and password changes are synchronized across linked memberships. An administrator cannot change another employee's global login credentials when that employee is linked to multiple units; the employee must make that change personally or through the account-recovery flow.

New application flows can link a new membership before saving it:

```java
membership.setLoginAccount(existingLoginAccount);
membership.setCompany(targetCompany);
userRepository.save(membership);
```

If no login account is assigned, the compatibility callback creates a separate one automatically.

## Frontend behavior

- The active unit is stored in `localStorage` as `calendra.activeUnitId`.
- Axios sends `X-Calendra-Unit-Id` on authenticated requests.
- The booking SSE stream sends the validated unit as a query parameter because browser `EventSource` cannot add custom headers.
- The application header displays a switcher when the current login has more than one unit.
- Unit state is changed only after the backend validates the target.
- A successful switch reloads the application to clear unit-scoped page state and caches.
- Logout and OAuth account changes clear the remembered unit.

## Phase 1 boundaries

This phase does not share clients, invoices, settings, bookings or other tenant data. Those records remain fully isolated by `company_id`.

Workspace client sharing, consolidated views, legal entities and invoice series belong to later phases.

## Verification coverage

- `WorkspaceLoginAccountMigrationTest` migrates a PostgreSQL database from V23 to V24 and verifies preserved IDs and security-session links.
- The load-test SQL seeder was updated so its raw inserts create workspaces and login accounts instead of bypassing the new non-null relationships.
