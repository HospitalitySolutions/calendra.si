# Public company directory backend

The public website loads live tenant data from:

```http
GET /api/public/company-directory
```

The endpoint is unauthenticated and returns only tenants that:

- enabled `PUBLIC_DIRECTORY_ENABLED`,
- have a non-empty `publicName` in `GUEST_APP_SETTINGS_JSON`,
- are not suspended or cancelled.

The response contains the canonical company logo, public name and description, physical address, category, Google rating, Google review count, and a Google Maps URL. Service counts are intentionally not exposed.

## Google Places configuration

Enable **Places API (New)** in the Google Cloud project and provide the server-side key through the environment or AWS Secrets Manager:

```env
GOOGLE_PLACES_API_KEY=...
GOOGLE_PLACES_ENABLED=true
GOOGLE_PLACES_AUTOMATIC_TEXT_SEARCH_ENABLED=true
```

Recommended key restrictions:

- restrict the key to **Places API (New)**,
- restrict requests to the production server IP addresses,
- do not expose this key in the website or tenant frontend.

When `GOOGLE_PLACE_ID` exists for a tenant, the backend uses Place Details directly. Otherwise it performs a Text Search using the public name and physical address. If Google is unavailable or not configured, the company still appears with a direct address-search Google Maps URL and no rating.

The endpoint sends `Cache-Control: no-store`; Google rating data is not persisted or cached. The website must retain the required Google attribution when rendering Google-sourced data.

## Response example

```json
[
  {
    "slug": "studio-lux",
    "tenantSlug": "studio-lux",
    "publiclyDiscoverable": true,
    "publicName": "Studio LUX",
    "publicDescription": "Frizerski studio z vrhunskimi storitvami.",
    "logoUrl": "https://app.calendra.si/api/public/widget/guest-assets?key=...",
    "physicalAddress": {
      "address": "Slovenska cesta 10",
      "postalCode": "1000",
      "city": "Ljubljana"
    },
    "category": "salon",
    "googleRating": 4.9,
    "googleReviewCount": 128,
    "googleMapsUri": "https://maps.google.com/..."
  }
]
```
