# Local test login

When the backend runs with the Spring `local` profile, it creates (or repairs) one local-only admin account automatically.

Default credentials:

- Email: `local@calendra.si`
- Password: `Admin123!`
- Company: `Calendra Local`

The bootstrap creates a valid active workspace, company, login account and ADMIN membership, then seeds the basic tenant settings/payment methods needed for normal app testing. It is idempotent, so restarting the backend does not create duplicate users.

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
