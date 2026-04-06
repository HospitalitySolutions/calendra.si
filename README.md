# Therapy Scheduling App

Monorepo MVP for a therapy/consulting scheduling platform.

## Stack
- Backend: Java 21, Spring Boot 3, Maven
- Frontend: React + Vite + TypeScript
- DB: PostgreSQL
- Auth: JWT + Google OAuth2 starter wiring
- Infra: Docker Compose

## What is included
- JWT login and `/me`
- Google OAuth2 wiring placeholder
- Role-based access control for `ADMIN` and `CONSULTANT`
- CRUD APIs for clients, consultants, spaces, session types, bookable slots, booked sessions, billing services and bills
- Settings API for toggling Spaces/Types and session length
- Weekly/daily calendar UI with session booking modal
- GDPR-oriented basics: soft operational hooks for delete/export, minimal logging of sensitive data, created/updated timestamps

## Important note on GDPR
No codebase alone makes a system "GDPR compliant". This starter includes technical support for privacy-by-design, but real compliance also needs:
- lawful basis and privacy notices
- retention policy
- DPA/subprocessor review
- access procedures
- backup/encryption/key management
- audit and incident handling

## Run

**Option A – Docker (all services):**
```bash
docker compose up --build
```

**Option B – Local (if Docker port forwarding causes "stuck on loading"):**
```powershell
.\run-local.ps1
```
Or manually: start DB with `docker compose up db -d`, then run backend and frontend from their folders.

Frontend: http://localhost:3000 
Backend: http://localhost:8080  
Postgres: localhost:5432

> **Tip:** If the app hangs or shows a connection error, open http://localhost:3000 in a regular browser window (Chrome/Edge), not in Cursor's embedded preview.

Default admin seeds (separate tenants):
- tenancy1@terminko.eu / Admin123!
- tenancy2@terminko.eu / Admin123!
- tenancy3@terminko.eu / Admin123!

## Project structure
- `backend/` Spring Boot app
- `frontend/` React app
- `docker-compose.yml`


## Status
This is a strong MVP scaffold, not a fully polished production release. The main architecture, auth, Docker setup, API surface, and core UI flows are included. The biggest items to finish next are:
- replace JSON CRUD placeholders with dedicated forms/tables
- complete Google OAuth success handling and account linking
- add stronger DTO mapping and validation
- add tests, migrations, and richer PDF invoice layout
- add audit trail, retention jobs, export/delete tooling for GDPR operations
