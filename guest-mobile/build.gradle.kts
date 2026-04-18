buildscript {
    dependencies {
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.3.20")
    }
}

plugins {
    id("com.android.application") version "9.1.0" apply false
    id("com.android.kotlin.multiplatform.library") version "9.1.0" apply false
    kotlin("multiplatform") version "2.3.20" apply false
    kotlin("plugin.serialization") version "2.3.20" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.3.20" apply false
}

tasks.register("clean", Delete::class) {
    delete(rootProject.layout.buildDirectory)
}
