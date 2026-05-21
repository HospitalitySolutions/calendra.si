# Mobile API target switching

The mobile frontend now builds its API URL from one device variable:

```env
VITE_API_HOST=192.168.1.83
```

Use this when you switch between a laptop, PC, Android emulator, or another machine running the backend.

## Physical Android device

Create a local override file:

```bash
cp frontend/.env.android.local.example frontend/.env.android.local
```

Then edit only this value:

```env
VITE_API_HOST=192.168.1.83
```

Examples:

```env
# laptop
VITE_API_HOST=192.168.1.83

# PC
VITE_API_HOST=192.168.1.50
```

Build with:

```bash
cd frontend
npm run build:android
```

## Android emulator

The emulator uses this by default:

```env
VITE_API_HOST=10.0.2.2
```

Build with:

```bash
cd frontend
npm run build:android:emu
```

## Optional variables

The final URL is built as:

```text
VITE_API_PROTOCOL://VITE_API_HOST:VITE_API_PORT/VITE_API_PATH
```

Defaults in the env files are:

```env
VITE_API_PROTOCOL=http
VITE_API_PORT=4000
VITE_API_PATH=/api
```

You can still use the old full URL override if needed:

```env
VITE_API_URL=http://192.168.1.83:4000/api
```

If `VITE_API_URL` is set, it wins over `VITE_API_HOST`.

## Reachability check

From the device browser, open:

```text
http://YOUR_HOST:4000/api/auth/ping
```

If that does not load, check that the backend is running, the phone is on the same Wi‑Fi, and the computer firewall allows port `4000`.

## Guest mobile Android app

The native `guest-mobile/androidApp` also supports the same kind of switch. Before building it, set either:

```bash
API_BASE_HOST=192.168.1.83
```

or the complete URL:

```bash
API_BASE_URL=http://192.168.1.83:4000
```

If nothing is set, the guest Android app defaults to the emulator host alias:

```bash
API_BASE_HOST=10.0.2.2
```

## Guest mobile iOS app

The iOS guest app reads `API_BASE_URL` from `Info.plist` / Xcode build settings.

For the simulator, the default is:

```text
http://localhost:4000
```

For a physical iPhone, set the Xcode build setting to your laptop/PC LAN URL, for example:

```text
API_BASE_URL=http://192.168.1.83:4000
```
