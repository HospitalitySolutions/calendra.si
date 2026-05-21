# Google Meet Integration Setup

TherapyApp supports Google Meet as an alternative to Zoom for online sessions. Each consultant connects their own Google account; meeting links are created via the Google Calendar API.

## Prerequisites

1. A Google Cloud project
2. Google Calendar API enabled
3. OAuth 2.0 credentials (Web application type)

## Setup Steps

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable **Google Calendar API**: APIs & Services → Library → search "Google Calendar API" → Enable
4. Create OAuth credentials: APIs & Services → Credentials → Create Credentials → OAuth client ID
5. Choose **Web application** as application type
6. Add **Authorized redirect URIs**:
   - Local: `http://localhost:4000/api/google/callback`
   - Staging: `https://staging.calendra.si/api/google/callback`
   - Production: `https://app.calendra.si/api/google/callback`
7. Copy the **Client ID** and **Client Secret**

## Configuration

In `application.yml` (or environment variables):

```yaml
app:
  google-meet:
    client-id: YOUR_CLIENT_ID.apps.googleusercontent.com
    client-secret: ${GOOGLE_MEET_CLIENT_SECRET}  # Use env var for security
    redirect-uri: http://localhost:4000/api/google/callback
    frontend-url: http://localhost:3000
```

Set `GOOGLE_MEET_CLIENT_SECRET` in your environment (never commit the secret).

## OAuth Scope

The app requests `https://www.googleapis.com/auth/calendar.events` to create calendar events with Google Meet links.

## Usage

1. Click **Connect Google** in the calendar header
2. Authorize with your Google account
3. When creating an online session, choose **Google Meet** instead of Zoom
4. The meeting link is created automatically via the Calendar API
