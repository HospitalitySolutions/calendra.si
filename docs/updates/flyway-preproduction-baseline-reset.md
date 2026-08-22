# Flyway pre-production baseline reset

This codebase now uses a single clean Flyway baseline migration:

```text
backend/src/main/resources/db/migration/V1__baseline_schema.sql
```

The complete pre-production migration chain (`V1` through `V70`) was squashed into this one canonical baseline. This is intended only before real production launch, while you can still reset the database.

## Required reset command

Because an old pre-production database contains Flyway checksum/history for the removed migration chain, recreate the disposable database before starting this version:

```bash
docker compose down -v
docker compose up -d --build db backend frontend proxy
```

Or, if using the AWS secrets helper:

```bash
./scripts/docker-compose-with-aws-secrets.sh production down -v
./scripts/docker-compose-with-aws-secrets.sh production up -d --build db backend frontend proxy
```

`down -v` deletes Docker volumes. Use it only for disposable pre-production/local environments. For the real production database, create a new empty database/schema and let Flyway execute V1 normally.

## After production launch

After the first real production database has successfully applied V1, do not edit `V1__baseline_schema.sql`. Add new migrations instead:

```text
V2__your_next_change.sql
V3__another_change.sql
```
