package si.calendra.guest.shared.network

import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.DefaultRequest
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.logging.LogLevel
import io.ktor.client.plugins.logging.Logging
import io.ktor.client.request.header
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json

actual object HttpClientFactory {
    actual fun create(): HttpClient = HttpClient(OkHttp) {
        install(DefaultRequest) {
            header("X-App-Platform", "native")
            GuestSessionStore.authToken?.let { header("Authorization", "Bearer $it") }
        }
        install(ContentNegotiation) {
            json(Json {
                ignoreUnknownKeys = true
                explicitNulls = false
            })
        }
        install(Logging) {
            level = LogLevel.INFO
        }
    }
}
