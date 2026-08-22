# Production database V1 baseline

This repository is intentionally reset to one canonical Flyway migration:

`src/main/resources/db/migration/V1__baseline_schema.sql`

The migration is for a **new, empty PostgreSQL database**. It represents the production schema after the pre-production migration history was consolidated and compatibility-only migration objects were removed.

## Rules from production launch onward

1. Never edit `V1__baseline_schema.sql` after the first production database has applied it.
2. Every later schema change must be a new forward-only Flyway migration: `V2__...sql`, `V3__...sql`, and so on.
3. Do not use Flyway `baseline` or `baseline-on-migrate` for the new production database. An empty database must execute V1 normally.
4. Hibernate must validate the schema (`ddl-auto=validate`); it must not create or mutate PostgreSQL schema objects.
5. Flyway `clean` remains disabled in application configuration.

## One-time production initialization

Before the first production start:

1. Stop all application instances that could connect to the target database.
2. Confirm the target PostgreSQL database/schema is empty and does not contain an old `flyway_schema_history` table.
3. Take/retain a final backup or snapshot of any pre-production database whose data might still be useful for reference.
4. Configure the production datasource credentials.
5. Keep these effective settings:
   - `spring.flyway.enabled=true`
   - `spring.flyway.validate-on-migrate=true`
   - `spring.flyway.clean-disabled=true`
   - `spring.flyway.baseline-on-migrate=false`
   - `spring.jpa.hibernate.ddl-auto=validate`
6. Start one backend instance first. Flyway must apply V1 before Hibernate initializes.
7. Verify Flyway history:

```sql
SELECT installed_rank, version, description, type, success
FROM flyway_schema_history
ORDER BY installed_rank;
```

Expected result: exactly one successful versioned migration, version `1`, description `baseline schema`.

8. Verify that removed pre-production objects do not exist:

```sql
SELECT to_regclass('public.waitlist_request') AS retired_waitlist,
       to_regclass('public.workspace_subscription_legacy_sources') AS retired_subscription_sources;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'workspace_subscriptions'
  AND column_name IN ('legacy_primary_company_id', 'billing_owner_company_id');
```

Expected result: both retired tables are `NULL`; `workspace_subscriptions` has `billing_owner_company_id` and not `legacy_primary_company_id`.

9. Run the backend integration tests, including `FlywayBaselineMigrationTest` and `PostgresApplicationContextTest`, against Docker/Testcontainers before deployment.
10. Only after the single-instance verification succeeds, start the remaining backend instances.

## Important: old pre-production databases

Do **not** point an existing database whose Flyway history contains the old V1-V70 chain at this migration folder. The checksums/history intentionally no longer match.

Disposable local, test and staging databases should be dropped/recreated from empty. If any old environment contains data that must be retained, keep it on the pre-reset code/migration history and migrate the data explicitly into the new production model rather than trying to reuse its Flyway history.

## What was intentionally removed from the baseline

The production V1 does not replay one-time development database transforms/backfills. It also excludes the retired singular waitlist schema, workspace subscription source-history staging table, session-consumable snapshot repair trigger, runtime billing precision schema repair, and upgrade tests that intentionally booted PostgreSQL at historical Flyway versions.

The application still contains some compatibility behavior that is part of current product/API contracts rather than database-upgrade history. Those should be removed only when their active callers have been migrated and verified; they must not be mixed into a database reset merely because a symbol or route is named `legacy`.
