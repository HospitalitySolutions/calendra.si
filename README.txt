Calendra CI failure hotfix

Files:
- .github/workflows/ci.yml
- backend/src/test/java/com/example/app/integration/PostgresApplicationContextTest.java
- backend/src/test/java/com/example/app/integration/FlywayLegacyWaitlistSafetyTest.java
- guest-mobile/gradle.properties

Fixes:
1. Starts the PostgreSQL application-context test as a servlet MOCK context so Spring Security can create HttpSecurity.
2. Creates a valid company row in the legacy waitlist safety test instead of attempting to disable foreign keys across separate JDBC connections.
3. Raises Gradle heap from the implicit 512 MiB default to 4 GiB, limits workers, disables file watching and runs Kotlin compilation in-process.
4. Runs Android CI with --no-daemon and --stacktrace.
