# Android guest app release signing

The Android guest app release build is now signed from environment variables or Gradle properties. Do not commit keystores or passwords.

## Required values

Set these before creating a Play Store AAB/APK:

```bash
export ANDROID_RELEASE_STORE_FILE=C:\DEVELOPMENT\keys\calendra-book.jks
export ANDROID_RELEASE_STORE_PASSWORD='your-store-password'
export ANDROID_RELEASE_KEY_ALIAS=calendra-guest-upload
export ANDROID_RELEASE_KEY_PASSWORD='your-key-password'
```

Then build:

```bash
cd guest-mobile
./gradlew :androidApp:bundleRelease
```

The output App Bundle is normally:

```text
androidApp/build/outputs/bundle/release/androidApp-release.aab
```

## Generate an upload key if needed

```bash
keytool -genkeypair \
  -v \
  -keystore calendra-guest-upload.jks \
  -alias calendra-guest-upload \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Use Google Play App Signing and upload only the upload certificate/key requested by Play Console. Keep the `.jks` file and passwords outside Git.

## Release checks enforced by Gradle

Release packaging tasks now fail when:

- `API_BASE_URL` is not `https://app.calendra.si`, unless `ALLOW_NON_PRODUCTION_API_BASE_URL=true` is set intentionally.
- `guest-mobile/androidApp/google-services.json` is missing.
- Android release signing variables are missing.

If `ENABLE_ANDROID_RELEASE_R8=true` is used, upload `androidApp/build/outputs/mapping/release/mapping.txt` to Play Console with the release.
