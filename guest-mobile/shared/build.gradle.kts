plugins {
    kotlin("multiplatform")
    kotlin("plugin.serialization")
    id("com.android.kotlin.multiplatform.library")
}

kotlin {
    androidLibrary {
        namespace = "si.calendra.guest.shared"
        compileSdk = 36
        minSdk = 28
    }

    iosX64()
    iosArm64()
    iosSimulatorArm64()

    targets.withType(org.jetbrains.kotlin.gradle.plugin.mpp.KotlinNativeTarget::class.java).configureEach {
        binaries.framework {
            baseName = "SharedGuest"
            isStatic = true
        }
    }

    sourceSets {
        commonMain.dependencies {
            implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.2")
            implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.9.0")
            implementation("io.ktor:ktor-client-core:3.4.2")
            implementation("io.ktor:ktor-client-content-negotiation:3.4.2")
            implementation("io.ktor:ktor-serialization-kotlinx-json:3.4.2")
            implementation("io.ktor:ktor-client-logging:3.4.2")
        }
        androidMain.dependencies {
            implementation("io.ktor:ktor-client-okhttp:3.4.2")
        }
        iosMain.dependencies {
            implementation("io.ktor:ktor-client-darwin:3.4.2")
        }
    }
}
