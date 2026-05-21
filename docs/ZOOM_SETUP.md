# Zoom Integration Setup

For every user with a Zoom account to authorize and create meetings as host via the "Connect Zoom" button, you need to configure your Zoom app correctly in the Zoom Marketplace.

## Users in Different Zoom Accounts (Your Case)

**TherapyApp already supports per-user Zoom authorization.** Each consultant connects their own Zoom account; tokens are stored per user. When creating an online session, the meeting is created using that consultant's Zoom account.

**The blocker:** In **development mode**, Zoom only allows users from the **same Zoom account** (same org) as the app creator to authorize. Users from other Zoom accounts (e.g. quenko@gmail.com) cannot connect.

**The solution:** Submit your app for **production** in the Zoom Marketplace. Once approved, any Zoom user can authorize and connect their own account.

### Steps to allow users from different Zoom accounts

1. Go to [Zoom App Marketplace](https://marketplace.zoom.us/) → **Develop** → your app
2. Ensure your app is an **OAuth** app (not Server-to-Server)
3. In **Scopes**, add: `meeting:write` and `user:read`
4. Add your **Redirect URL**: `https://your-domain.com/api/zoom/callback` (production URL)
5. Go to **Distribute** → **Submit for production**
6. Complete the submission form (app description, privacy policy, support URL, etc.)
7. Wait for Zoom's review (typically a few days)
8. Once approved, any Zoom user can click "Connect Zoom" and authorize with their own account

**Note:** Production apps require a public redirect URL (HTTPS). For local development, use a tunnel (e.g. [ngrok](https://ngrok.com/)) to get an HTTPS URL, or keep a separate development app for testing.

*Reference: [Zoom apps are limited to the same Zoom org in development mode](https://www.recall.ai/blog/how-can-i-allow-multiple-users-to-test-my-zoom-oauth-app-in-development-mode)*

## App Type: User-Managed vs Account-Level

- **User-managed (user-level)**: Each user authorizes separately and gets their own token. Best for your use case (each consultant uses their own Zoom account).
- **Account-level**: One admin authorizes for the whole account. Only works for users in the same Zoom account.

For consultants in different Zoom accounts, use **User-managed** and **publish for production**.

## Required OAuth Scopes (in Zoom Marketplace)

In your Zoom app → **Scopes** tab, add:

- `meeting:write` – Create meetings as host
- `user:read` – Read user info (needed for meeting creation)

TherapyApp does not pass a scope parameter; Zoom uses the scopes configured in your app.

## Redirect URL

Add your callback URL to **Redirect URL for OAuth** in the Zoom app:

- Development: `http://localhost:8080/api/zoom/callback`
- Production: `https://your-domain.com/api/zoom/callback` (required for published apps)

## Configuration in TherapyApp

Set these in Configuration → Online Meetings (or environment variables):

- `ZOOM_CLIENT_ID` – From your Zoom app
- `ZOOM_CLIENT_SECRET` – From your Zoom app
- `ZOOM_REDIRECT_URI` – Must match exactly what's in Zoom
- `ZOOM_FRONTEND_URL` – Where users land after OAuth (e.g. `http://localhost:5173`)

## Summary: Users from Different Zoom Accounts

| Step | Action |
|------|--------|
| 1 | Use **User-managed** OAuth app |
| 2 | Add scopes: `meeting:write`, `user:read` |
| 3 | Add production redirect URL (HTTPS) |
| 4 | **Submit app for production** in Zoom Marketplace |
| 5 | After approval, any Zoom user can connect |
