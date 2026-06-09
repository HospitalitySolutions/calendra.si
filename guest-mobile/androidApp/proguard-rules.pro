# App-specific R8/ProGuard rules for the Android guest app.
#
# R8 is intentionally disabled by default in build.gradle.kts for safer releases.
# To generate a Play Console deobfuscation file, build with:
#   ENABLE_ANDROID_RELEASE_R8=true ./gradlew :androidApp:bundleRelease
# Then upload:
#   guest-mobile/androidApp/build/outputs/mapping/release/mapping.txt
# together with the matching App Bundle version in Google Play Console.
#
# Add any required keep rules here before enabling R8 permanently.
