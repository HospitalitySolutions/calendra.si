# iOS guest app production release notes

The iOS app is configured so the same entitlements file can be used for Debug and Release builds:

- Debug uses `APS_ENVIRONMENT = development`.
- Release uses `APS_ENVIRONMENT = production`.

`Info.plist` now reads the marketing/build versions from Xcode build settings:

- `CFBundleShortVersionString = $(MARKETING_VERSION)`
- `CFBundleVersion = $(CURRENT_PROJECT_VERSION)`

The plist also declares:

```xml
<key>ITSAppUsesNonExemptEncryption</key>
<false/>
```

Use this only if the app uses normal HTTPS/TLS and no custom/non-exempt encryption.

Before App Store/TestFlight upload, verify in Xcode that the Release archive uses an App Store or Ad Hoc provisioning profile with Push Notifications enabled for `si.calendra.guest.mobile`. Then test push notifications on a real device from a TestFlight/Release build with the app closed.
