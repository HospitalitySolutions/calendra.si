# Phase 0 changes implemented

This patch contains only the files changed for the selected Phase 0 items:

- tenant-isolation guardrail tests
- in-memory auth/guest auth rate limiting
- public widget origin hardening
- actuator health endpoint exposure and security allow-listing
- basic GitHub Actions CI workflow

Notes:

- This intentionally does not include secret cleanup, database migration replacement, or backup/deployment changes.
- The rate limiter is in-memory and suitable for development/single-instance staging. Replace with Redis/gateway rate limiting before running multiple backend replicas.
- Production profile now defaults `app.widget.security.require-allowed-origin=true`, so each production tenant must configure widget allowed origins or set a global `APP_WIDGET_ALLOWED_ORIGINS`.
- I could not run Maven tests in this environment because the Maven wrapper could not fetch Maven from Maven Central.
