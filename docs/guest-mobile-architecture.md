# Guest mobile architecture

This repository now includes a native guest-mobile workspace under `guest-mobile/`.

## Chosen architecture

- **Shared backend:** existing Spring Boot backend remains the single backend
- **Native Android app:** Kotlin + Jetpack Compose
- **Native iOS app:** SwiftUI
- **Shared mobile domain layer:** Kotlin Multiplatform (`guest-mobile/shared`)

## Why this split

- Android and iOS keep native UX and platform-specific integrations
- booking/catalog/wallet/notification models can be shared in Kotlin
- guest-mobile development does not disturb the current web + Capacitor app
- backend can expose a dedicated `/api/guest/*` contract over time

## Preview support added

Temporary preview endpoints exist under `/api/guest/preview/*` so mobile UI development can start immediately without waiting for the full guest persistence layer.
