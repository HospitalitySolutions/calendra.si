plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

fun esc(value: String): String = value.replace("\\", "\\\\").replace("\"", "\\\"")
fun envOrProp(name: String, defaultValue: String = ""): String = (project.findProperty(name) as String?) ?: System.getenv(name) ?: defaultValue
fun quoted(value: String): String = "\"${esc(value)}\""
fun quotedEnv(name: String, defaultValue: String = ""): String = quoted(envOrProp(name, defaultValue))
fun apiBaseUrl(): String {
    val explicit = envOrProp("API_BASE_URL")
    if (explicit.isNotBlank()) return explicit

    val protocol = envOrProp("API_BASE_PROTOCOL", "http")
    val host = envOrProp("API_BASE_HOST", "https://app.calendra.si")
    val port = envOrProp("API_BASE_PORT", "4000")
    return if (port.isBlank()) "$protocol://$host" else "$protocol://$host:$port"
}

android {
    namespace = "si.calendra.guest.android"
    compileSdk = 36

    defaultConfig {
        applicationId = "si.calendra.guest.mobile"
        minSdk = 28
        targetSdk = 36
        versionCode = 2
        versionName = "0.1.1"
        // Switch API target by setting API_BASE_HOST (or full API_BASE_URL) before building.
        // Android emulator default: 10.0.2.2 → host machine.
        buildConfigField("String", "API_BASE_URL", quoted(apiBaseUrl()))
        buildConfigField("String", "FCM_PROJECT_ID", quotedEnv("APP_GUEST_MOBILE_ANDROID_FCM_PROJECT_ID"))
        buildConfigField("String", "FCM_APPLICATION_ID", quotedEnv("APP_GUEST_MOBILE_ANDROID_FCM_APPLICATION_ID"))
        buildConfigField("String", "FCM_API_KEY", quotedEnv("APP_GUEST_MOBILE_ANDROID_FCM_API_KEY"))
        buildConfigField("String", "FCM_GCM_SENDER_ID", quotedEnv("APP_GUEST_MOBILE_ANDROID_FCM_GCM_SENDER_ID"))
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
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
    implementation("com.google.android.libraries.identity.googleid:googleid:1.2.0")
    implementation("com.stripe:stripe-android:23.3.0")
    implementation("com.journeyapps:zxing-android-embedded:4.3.0")
    implementation(platform("com.google.firebase:firebase-bom:34.4.0"))
    implementation("com.google.firebase:firebase-messaging")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.10.2")

    debugImplementation("androidx.compose.ui:ui-tooling")
}
