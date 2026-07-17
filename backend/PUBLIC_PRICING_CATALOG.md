# Public pricing catalog

Calendra uses Platform Admin's register catalog as the single source of truth for package pricing.

## Public endpoint

```http
GET /api/register/public-pricing
```

The endpoint is unauthenticated, CORS-enabled for `calendra.si`, and cached publicly for 60 seconds. It returns only display-safe data:

- localized package names,
- VAT-inclusive monthly and annual prices,
- one included user,
- active “What's included in this plan” rows and their package availability,
- graduated additional-user prices,
- SMS unit price.

Internal transaction-service IDs and add-on billing mappings are deliberately excluded.

## Current defaults

- Basic / Osnovno: **17.90 EUR / month**
- Professional / Profesionalno: **34.90 EUR / month**
- Premium: **54.90 EUR / month**
- Annual billing: monthly price × 10 (**two months free**)
- User 1: included
- Users 2–5: **9.90 EUR / user / month**
- User 6 onward: **6.90 EUR / user / month**

## Legacy catalog migration

Catalog version 2 updates old untouched defaults (`18.90 / 34.90 / 59.90` and the old package names) to the current defaults. Custom prices are preserved. The migration is applied while reading and is persisted the next time Platform Admin saves the catalog.
