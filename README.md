# Calendra app-side updated files

This package contains the app-side files to add to your existing project so the widget can work on `app.calendra.si`.

## Included changes

- `backend/src/main/java/com/example/app/widget/PublicBookingWidgetController.java`
- `backend/src/main/java/com/example/app/widget/PublicBookingWidgetService.java`
- `backend/src/main/java/com/example/app/security/SecurityConfig.java`
- `backend/src/main/resources/static/widget/calendra-booking-widget.js`

## What to do

1. Copy these files into your app repository, replacing `SecurityConfig.java` with the included version.
2. Build and deploy the backend.
3. Confirm the script is reachable at:
   - `https://app.calendra.si/widget/calendra-booking-widget.js`
4. Confirm these endpoints respond:
   - `GET /api/public/widget/{tenantCode}/config`
   - `GET /api/public/widget/{tenantCode}/services`
   - `GET /api/public/widget/{tenantCode}/availability?typeId=...&date=YYYY-MM-DD`
   - `POST /api/public/widget/{tenantCode}/bookings`

## Embed snippet

By default, the widget inherits the client website colors.

```html
<script src="https://app.calendra.si/widget/calendra-booking-widget.js" defer></script>
<calendra-booking-widget
  tenant="YOUR_TENANT_CODE"
  base-url="https://app.calendra.si"
></calendra-booking-widget>
```

Optional explicit colors:

```html
<calendra-booking-widget
  tenant="YOUR_TENANT_CODE"
  base-url="https://app.calendra.si"
  primary-color="#0f62fe"
  accent-color="#ff8a00"
></calendra-booking-widget>
```

Optional CSS-variable theming from the host site:

```html
<style>
  calendra-booking-widget {
    --calendra-primary: #0f62fe;
    --calendra-accent: #ff8a00;
  }
</style>
```

## Notes

- The widget uses `tenantCode` as the public key.
- The widget reuses your existing booking/services/clients model and booking creation logic.
- Add rate limiting and domain allowlisting before wide rollout.
