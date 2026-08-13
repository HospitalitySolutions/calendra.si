# Customer account on `calendra.si/racun`

## Goal

The customer experience now behaves as one Calendra website:

- public marketplace and customer pages remain on `https://calendra.si`
- signed-in account pages are served under `https://calendra.si/racun/*`
- `app.calendra.si` remains the business application
- `connect.calendra.si` is a backwards-compatible redirect only

The customer account is still built and deployed from `customer-web`; only the public URL and routing changed.

## Public/account routes

Public examples:

- `/za-stranke`
- `/ponudniki`
- `/ponudniki/{slug}`

Account examples:

- `/racun/`
- `/racun/profil`
- `/racun/termini`
- `/racun/denarnica`
- `/racun/sporocila`
- `/racun/obvestila`
- `/racun/prijava`
- `/racun/registracija`

The customer SPA uses `BrowserRouter` with basename `/racun` and Vite base `/racun/`.

## Authentication

The customer JWT continues to use localStorage key:

`calendra.customer.token`

Because public pages and account pages now share the same origin, the public CustomerNavbar can read the same token and call `/api/guest/me`. After login the customer returns to the original public page instead of always being sent to a dashboard.

Example:

1. customer opens `/ponudniki/studio-harmony`
2. customer chooses login
3. login opens `/racun/prijava?next=/ponudniki/studio-harmony`
4. successful login stores the existing customer token
5. browser returns to `/ponudniki/studio-harmony`
6. the public header now renders the customer initials/profile menu

Existing sessions created on `connect.calendra.si` cannot be copied from that hostname's localStorage to `calendra.si`; those users need to sign in once again after the migration.

## Reverse proxy

`Caddyfile.production.alb` now:

- serves `/racun/*` from the `customer-web` container after stripping `/racun`
- sends all `calendra.si/api/*` requests to the backend
- redirects `connect.calendra.si/*` to `calendra.si/racun/*`
- redirects old `connect.calendra.si/api/*` requests to `calendra.si/api/*`

The public marketing-site upstream continues to own all other `calendra.si` paths.

## Payment return URLs

Set:

`APP_CUSTOMER_WEB_BASE_URL=https://calendra.si/racun`

Stripe and PayPal customer-web returns now use:

`/placilo/vrnitev`

instead of the old `/checkout/return` path. Legacy routes remain accepted by the SPA.

## Deployment checklist

1. Build/deploy the updated backend image.
2. Build/deploy the updated customer-web image.
3. Deploy the updated `Caddyfile.production.alb` on every EC2 node and recreate/reload the proxy container.
4. Set `APP_CUSTOMER_WEB_BASE_URL=https://calendra.si/racun` in the production environment/secret.
5. Deploy the updated public website so the authenticated CustomerNavbar is active.
6. Verify `/api/guest/me` through `https://calendra.si`.
7. Verify `/racun/prijava`, `/racun/profil`, `/racun/termini` and `/racun/denarnica`.
8. Verify `https://connect.calendra.si/profile` redirects to `https://calendra.si/racun/profile` and then resolves through the legacy SPA alias.
9. Complete one Stripe/PayPal test checkout and verify the return lands on `calendra.si/racun/placilo/vrnitev`.
