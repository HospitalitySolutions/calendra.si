# Calendra Guest Mobile

Native guest-facing mobile workspace for **Android (Kotlin + Jetpack Compose)** and **iOS (SwiftUI)** with a **Kotlin Multiplatform shared module** for domain models, API contracts, repository interfaces, and shared networking/business logic.

## Architecture

- `shared/`
  - Kotlin Multiplatform shared domain + networking
  - models mirror the guest contract planned for `/api/guest/*`
  - `PreviewGuestRepository` for local demo and UI development
  - `RemoteGuestRepository` placeholder wired for Ktor and your future backend
- `androidApp/`
  - native Android app in Jetpack Compose
  - bottom-tab navigation: Home, Book, Wallet, Inbox, Profile
  - onboarding flow: Welcome, Login, Join Tenant
- `iosApp/`
  - native SwiftUI app scaffold
  - mirrors Android information architecture
  - includes a lightweight Xcode project plus a shell script for building the KMP framework

## Current state

This workspace is intentionally scaffolded to let you move quickly without breaking the existing web/Capacitor setup in the repo.

Implemented here:
- native mobile project structure
- shared guest models and repositories
- preview data for end-to-end UI iteration
- Android Compose app scaffold
- SwiftUI iOS app scaffold
- backend preview guest endpoints under `/api/guest/preview/*`

Implemented in this version:
- persistence-backed `/api/guest/*` endpoints for auth, tenant join, home, products, availability, orders, wallet, history, and notifications
- Android native Google Sign-In hook using Credential Manager and server-side ID token exchange
- iOS native Sign in with Apple hook and server-side ID token exchange
- Android native Stripe checkout integration points with browser fallback and PaymentSheet-ready response model

Still placeholder-dependent:
- configure your Google web client ID in Android and backend properties
- configure your Apple client ID / bundle identifier in backend properties
- configure your Stripe publishable key in Android and add Stripe PaymentSheet to the iOS app target if you want full native iOS card collection
- tenant settings CRUD in the existing admin app

## Suggested next implementation order

1. Replace preview repository with real `/api/guest/*` backend calls
2. Add guest auth tokens/cookies and session refresh
3. Add tenant join persistence and client matching
4. Add real products, orders, entitlements, and notifications
5. Hook Stripe native SDKs into Android and iOS apps
6. Add Apple Sign-In backend + iOS native integration

## Build notes

### Android
Open `guest-mobile/` in Android Studio and sync Gradle.

### iOS
Open `guest-mobile/iosApp/GuestMobile.xcodeproj` in Xcode.  
If you prefer regenerating the Xcode project, `iosApp/project.yml` is also included as a reference spec.

The included script `iosApp/build-kmp-framework.sh` is intended as the bridge point for generating the shared KMP framework during Xcode builds.

## Default configuration

- API base URL: `http://10.0.2.2:8080` on Android emulator
- Preview mode: enabled by default in both native apps so screens are usable immediately

Update the base URL in:
- `shared/src/commonMain/.../GuestApiConfig.kt`
- `iosApp/GuestMobile/AppEnvironment.swift`

## Important note

Because this environment cannot run Xcode, the iOS project is scaffolded carefully but not compiled here. Android Gradle sync was not executed in this environment either because external dependency resolution is unavailable. The delivered project is structured for local development in Android Studio and Xcode.
