# Flyway pre-production baseline reset

This codebase now uses a single clean Flyway baseline migration:

```text
backend/src/main/resources/db/migration/V1__baseline_schema.sql
```

The previous pre-production migration chain (`V1` through `V7`) was squashed into this one baseline. This is intended only before real production launch, while you can still reset the database.

## Required reset command

Because the old database contains Flyway checksum history for the previous migrations, reset the Docker database volume before starting this version:

```bash
docker compose down -v
docker compose up -d --build db backend frontend proxy
```

Or, if using the AWS secrets helper:

```bash
./scripts/docker-compose-with-aws-secrets.sh production down -v
./scripts/docker-compose-with-aws-secrets.sh production up -d --build db backend frontend proxy
```

`down -v` deletes the Postgres Docker volume. Do not use it after real tenants, clients, invoices, bookings, or guests exist.

## After production launch

After the real production database exists, do not edit `V1__baseline_schema.sql`. Add new migrations instead:

```text
V2__your_next_change.sql
V3__another_change.sql
```
