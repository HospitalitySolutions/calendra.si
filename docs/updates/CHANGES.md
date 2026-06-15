Changes done:
- Fixed backend crash when pressing **Pošlji kodo** on guest mobile forgot-password screen.
- `GuestPasswordResetToken.failedAttempts` now safely handles existing database rows where `failed_attempts` is NULL.
- Added entity lifecycle normalization so newly saved/updated password reset tokens always persist `failedAttempts = 0` when missing.
- Kept the service logic unchanged: previous active reset tokens are still invalidated before sending a new verification code.

Cause:
- Existing `guest_password_reset_tokens` rows from the previous reset-link implementation had NULL `failed_attempts` values.
- Hibernate could not load those rows into primitive `int failedAttempts`, causing the request to fail before the new code could be sent.

Build check:
- Not run in this sandbox because Gradle/Maven dependencies are unavailable offline.
