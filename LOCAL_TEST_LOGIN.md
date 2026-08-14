# Local test login

When the backend runs with the Spring `local` profile, it creates (or repairs) one local-only admin account automatically.

Default credentials:

- Email: `local@calendra.si`
- Password: `Admin123!`
- Company: `Calendra Local`

The local profile now uses Flyway for the complete database schema, just like staging/production. On an empty PostgreSQL database, every migration in `db/migration` runs before Hibernate starts validating the schema and before the local test-user bootstrap runs.

The bootstrap then creates/repairs a valid active workspace, Premium workspace subscription, company, login account and ADMIN membership, enables all App nastavitve modules, and seeds the local defaults/payment methods needed for testing. It is idempotent, so restarting the backend does not create duplicate users.


## First run after switching an old local DB to Flyway

If your existing local database was previously created by Hibernate and has no `flyway_schema_history`, reset it **once** so Flyway can build it from V1 onward. This intentionally deletes only your local Docker database volume/data:

```powershell
docker compose -f docker-compose.local.yml down -v --remove-orphans
docker compose -f docker-compose.local.yml up -d db
```

Then start the backend with the `local` profile. Do not set `SPRING_FLYWAY_BASELINE_ON_MIGRATE=true` just to make an old Hibernate schema start: local defaults to `false` specifically so missing migration history is detected instead of silently skipped.

For normal later restarts, **do not use `-v`**. Flyway will only apply migrations that are newer than the versions already recorded in `flyway_schema_history`.

## Docker local

```bash
docker compose -f docker-compose.local.yml up --build
```

Then open `http://localhost:3000` and sign in with the credentials above.

## Backend on the host

Make sure the backend uses the local profile:

```powershell
$env:SPRING_PROFILES_ACTIVE='local'
$env:SPRING_DATASOURCE_URL='jdbc:postgresql://localhost:5432/calendradb'
$env:SPRING_DATASOURCE_USERNAME='calendra'
$env:SPRING_DATASOURCE_PASSWORD='calendra'
$env:SPRING_FLYWAY_ENABLED='true'
$env:SPRING_FLYWAY_BASELINE_ON_MIGRATE='false'
$env:SPRING_JPA_HIBERNATE_DDL_AUTO='validate'
mvn spring-boot:run
```

## Override the local account

All values can be overridden without changing source code:

- `APP_LOCAL_TEST_USER_ENABLED=false` disables the bootstrap.
- `APP_LOCAL_TEST_USER_EMAIL`
- `APP_LOCAL_TEST_USER_PASSWORD`
- `APP_LOCAL_TEST_USER_FIRST_NAME`
- `APP_LOCAL_TEST_USER_LAST_NAME`
- `APP_LOCAL_TEST_USER_COMPANY_NAME`

The old nine-tenant demo seeder is disabled by default in the local profile. Set `APP_SEED_DEMO_TENANTS_ENABLED=true` if you specifically want those fixtures too.
