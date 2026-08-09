# Public location directory backend

The public Calendra Stranke website loads live location data from:

```http
GET /api/public/location-directory
```

The endpoint is unauthenticated and returns one result per active location that has
`public_directory_enabled = true`. A company with two public branches therefore
returns two independent directory entries. Locations belonging to suspended or
cancelled tenants are excluded.

Public name, description, address, phone and logo are resolved through
`LocationPublicPresentationService`. A location-specific logo wins; otherwise the
company logo is used as the fallback.

`publicBookingEnabled` is independent of directory visibility. When booking is
enabled the response includes a location-specific booking URL such as:

```text
/narocanje/STUDIO-LUX?locationId=31
```

## Google Places configuration

Enable **Places API (New)** in the Google Cloud project and provide the server-side
key through the environment or AWS Secrets Manager:

```env
GOOGLE_PLACES_API_KEY=...
GOOGLE_PLACES_ENABLED=true
GOOGLE_PLACES_AUTOMATIC_TEXT_SEARCH_ENABLED=true
```

Recommended key restrictions:

- restrict the key to **Places API (New)**,
- restrict requests to the production server IP addresses,
- do not expose this key in the website or tenant frontend.

When `locations.google_place_id` is set, the backend uses Place Details directly for
that branch. Otherwise it performs Text Search using the location public name and
effective public address. This means separate branches may have separate Google
Business Profiles and ratings.

If Google is unavailable or not configured, the location still appears with a direct
address-search Google Maps URL and no rating.

The endpoint sends `Cache-Control: no-store`; Google rating data is not persisted or
cached. The website must retain the required Google attribution when rendering
Google-sourced data.

## Response example

```json
[
  {
    "locationId": 31,
    "slug": "studio-lux-31",
    "tenantSlug": "STUDIO-LUX",
    "publiclyDiscoverable": true,
    "publicName": "Studio LUX Ljubljana",
    "publicDescription": "Frizerski studio v Ljubljani.",
    "logoUrl": "/api/public/widget/location-assets?key=...",
    "physicalAddress": {
      "address": "Slovenska cesta 10",
      "postalCode": "1000",
      "city": "Ljubljana",
      "country": "SI"
    },
    "publicAddress": "Slovenska cesta 10, 1000 Ljubljana",
    "publicPhone": "+386 1 555 01 01",
    "category": "salon",
    "publicBookingEnabled": true,
    "bookingUrl": "/narocanje/STUDIO-LUX?locationId=31",
    "googleRating": 4.9,
    "googleReviewCount": 128,
    "googleMapsUri": "https://maps.google.com/..."
  }
]
```
