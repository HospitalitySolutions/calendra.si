Calendra Android CI memory hotfix

Replace:
- .github/workflows/ci.yml
- guest-mobile/gradle.properties

The Android job now:
- grants Gradle 5 GiB heap and 768 MiB metaspace;
- limits Gradle to one worker;
- disables file-system watching;
- forces Kotlin compilation in-process;
- disables Kotlin incremental compilation in CI;
- runs metadata, debug APK, and release AAB in separate Gradle invocations.
