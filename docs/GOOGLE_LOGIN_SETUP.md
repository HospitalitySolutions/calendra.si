# Google Sign-In (Login) Setup

TherapyApp supports "Continue with Google" on the login page. This uses Spring Security OAuth2 Client.

## Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Edit your OAuth 2.0 Client ID (Web application)
3. Add **Authorized redirect URIs** (must match **exactly** — scheme, host, path, no extra slash):
   - `http://localhost:8080/login/oauth2/code/google` (development; use your backend port if different)
   - `https://staging.calendra.si/login/oauth2/code/google` (staging)
   - `https://app.calendra.si/login/oauth2/code/google` (production — adjust host to your real app URL)

> **Note:** This is different from the Google Meet callback (`/api/google/callback`). Add both URIs if you use both features.

If Google shows **`redirect_uri_mismatch`** and the failing URI starts with **`http://`** while users use HTTPS, the backend must trust proxy headers (`server.forward-headers-strategy=framework` is set for staging/production in this project). Caddy should send `X-Forwarded-Proto: https` to the app.

## Configuration

1. Set **`GOOGLE_CLIENT_ID`** and **`GOOGLE_CLIENT_SECRET`** (same names in process env or in AWS Secrets Manager JSON for staging).
2. The backend maps these flat keys to Spring’s OAuth2 client (it does not do that by itself).
3. Use `staging` or `production` profile when deploying.

For Docker, put `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_JWT_SECRET`, and (if needed) `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` in a root **`.env`** file (see `.env.example` in the repo). Compose passes them into the backend container.

In local/default profile, the app starts without Google login (JWT auth still works).

## Flow

1. User clicks "Continue with Google" on the login page
2. Redirects to Google for authentication
3. Google redirects back to `/login/oauth2/code/google`
4. App creates or finds user by email, generates JWT, redirects to frontend with token
5. Frontend stores token and user, redirects to calendar
