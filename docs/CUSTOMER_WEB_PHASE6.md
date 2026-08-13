# Phase 6 — Calendra Connect customer web

The new customer-facing SPA lives in `customer-web/` and is intended for:

- production: `https://connect.calendra.si`
- local development: `http://localhost:5174`

## Routes

Public auth routes:

- `/login`
- `/register`
- `/forgot-password`

Authenticated routes:

- `/` — customer home
- `/discover` — provider/location discovery
- `/bookings`
- `/bookings/:id`
- `/wallet`
- `/inbox`
- `/notifications`
- `/profile`

## Backend contracts

Authentication/profile reuse the existing guest/customer identity API under `/api/guest/*`.
Global customer views use `/api/customer/v1/*` from Phase 4.
Provider discovery uses `/api/public/location-directory`.

Phase 6 intentionally does not replace the booking widget or web checkout. Provider discovery can hand off to the existing public booking flow. Logged-in booking identity handoff and web commerce are separate follow-up phases.

## Local development

With `docker-compose.local.yml`:

```text
http://localhost:5174
```

The `customer-web` Vite container proxies `/api` to `http://backend:4000`.

For direct host development, run the backend on port 4000 and:

```bash
cd customer-web
npm ci
npm run dev
```

## Production deployment

CI publishes a third image:

```text
ghcr.io/<owner>/calendra-customer-web:<git-sha>
```

`docker-compose.prod-alb.yml` starts this image as `customer-web` and `Caddyfile.production.alb` routes:

- `connect.calendra.si/api/*` -> backend
- `connect.calendra.si/*` -> customer-web

Before production activation, ensure:

1. `connect.calendra.si` DNS points to the existing ALB.
2. The ALB HTTPS certificate covers `connect.calendra.si`.
3. The ALB listener forwards the `connect.calendra.si` Host to the Calendra target group (the same target group can be reused if Host is preserved).
4. The deployed backend includes the Phase 4 CORS/customer-JWT changes.

Customer pages are intentionally `noindex, nofollow` because they contain private account data.
