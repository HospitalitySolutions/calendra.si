plugins {
    id("com.android.application")
    id("com.google.gms.google-services")
    id("org.jetbrains.kotlin.plugin.compose")
}

fun esc(value: String): String = value.replace("\\", "\\\\").replace("\"", "\\\"")
fun envOrProp(name: String, defaultValue: String = ""): String = (project.findProperty(name) as String?) ?: System.getenv(name) ?: defaultValue
fun quoted(value: String): String = "\"${esc(value)}\""
fun quotedEnv(name: String, defaultValue: String = ""): String = quoted(envOrProp(name, defaultValue))

fun normalizeApiBaseUrl(value: String): String = value.trim().trimEnd('/')

fun apiBaseUrl(): String {
    val explicit = envOrProp("API_BASE_URL").trim()
    if (explicit.isNotBlank()) return normalizeApiBaseUrl(explicit)

    val rawHost = envOrProp("API_BASE_HOST", "app.calendra.si").trim()
    if (rawHost.startsWith("http://") || rawHost.startsWith("https://")) {
        // Accept a fully-qualified host for backwards compatibility, but do not prepend another protocol.
        return normalizeApiBaseUrl(rawHost)
    }

    val protocol = envOrProp("API_BASE_PROTOCOL", "https").trim().removeSuffix("://")
    val port = envOrProp("API_BASE_PORT", "").trim().trimStart(':')
    val host = rawHost.trim('/').substringBefore('/')
    return normalizeApiBaseUrl(if (port.isBlank()) "$protocol://$host" else "$protocol://$host:$port")
}

fun validateReleaseGoogleServicesConfig() {
    val googleServicesFile = layout.projectDirectory.file("google-services.json").asFile
    require(googleServicesFile.exists()) {
        "Release Android guest app builds require guest-mobile/androidApp/google-services.json. " +
            "Download it from Firebase Console for applicationId si.calendra.guest.mobile and place it in the androidApp module root."
    }
}

fun validateReleaseApiBaseUrl(value: String) {
    val url = normalizeApiBaseUrl(value)
    val allowNonProduction = envOrProp("ALLOW_NON_PRODUCTION_API_BASE_URL", "false").equals("true", ignoreCase = true)
    require(url.startsWith("https://")) {
        "Release Android guest app builds must use an HTTPS API_BASE_URL. Current value: $url"
    }
    if (!allowNonProduction) {
        require(url == "https://app.calendra.si") {
            "Release Android guest app builds must point to https://app.calendra.si. Current value: $url. " +
                "Set ALLOW_NON_PRODUCTION_API_BASE_URL=true only for an intentional staging/internal release."
        }
    }
    require(!url.contains(":4000")) {
        "Release Android guest app API_BASE_URL must not include the backend development port 4000. Current value: $url"
    }
    require(!Regex("localhost|127\\.0\\.0\\.1|10\\.0\\.2\\.2|192\\.168\\.").containsMatchIn(url)) {
        "Release Android guest app API_BASE_URL must not point to a local/private development host. Current value: $url"
    }
}

val resolvedApiBaseUrl = apiBaseUrl()
val enableReleaseR8 = envOrProp("ENABLE_ANDROID_RELEASE_R8", "false").equals("true", ignoreCase = true)

android {
    namespace = "si.calendra.guest.android"
    compileSdk = 36

    defaultConfig {
        applicationId = "si.calendra.guest.mobile"
        minSdk = 28
        targetSdk = 36
        versionCode = 5
        versionName = "0.2.1"
        // Production default: https://app.calendra.si.
        // For local debug builds use, for example:
        //   API_BASE_HOST=10.0.2.2 API_BASE_PROTOCOL=http API_BASE_PORT=4000 ./gradlew :androidApp:assembleDebug
        // Or provide a full override with API_BASE_URL.
        buildConfigField("String", "API_BASE_URL", quoted(resolvedApiBaseUrl))
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    buildTypes {
        release {
            // Keep R8/ProGuard disabled by default so Play Console does not require a
            // deobfuscation mapping file for the current release flow. If you intentionally
            // enable obfuscation with ENABLE_ANDROID_RELEASE_R8=true, upload the generated
            // androidApp/build/outputs/mapping/release/mapping.txt file with the App Bundle.
            isMinifyEnabled = enableReleaseR8
            isShrinkResources = enableReleaseR8
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )

            // Include native symbol metadata in release App Bundles so Google Play can
            // de-symbolicate native crashes/ANRs from Android/Kotlin/Compose dependencies
            // and bundled native libraries.
            ndk {
                debugSymbolLevel = "SYMBOL_TABLE"
            }
        }
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

tasks.configureEach {
    val releasePackagingTask = (name.startsWith("assemble") || name.startsWith("bundle") || name.startsWith("package")) &&
        name.contains("Release", ignoreCase = true)
    if (releasePackagingTask) {
        doFirst {
            validateReleaseApiBaseUrl(resolvedApiBaseUrl)
            validateReleaseGoogleServicesConfig()
        }
    }
}

dependencies {
    implementation(project(":shared"))

    val composeBom = platform("androidx.compose:compose-bom:2025.01.01")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("io.coil-kt:coil-compose:2.7.0")
    implementation("androidx.navigation:navigation-compose:2.9.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.1")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("androidx.browser:browser:1.8.0")
    implementation("androidx.credentials:credentials:1.6.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.6.0")
    implementation("androidx.security:security-crypto:1.1.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.2.0")
    implementation("com.stripe:stripe-android:23.3.0")
    implementation("com.journeyapps:zxing-android-embedded:4.3.0")
    implementation(platform("com.google.firebase:firebase-bom:34.4.0"))
    implementation("com.google.firebase:firebase-messaging")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.10.2")

    debugImplementation("androidx.compose.ui:ui-tooling")
}
