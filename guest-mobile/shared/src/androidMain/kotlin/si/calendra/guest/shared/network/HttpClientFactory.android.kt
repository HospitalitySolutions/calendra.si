package si.calendra.guest.shared.network

import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.DefaultRequest
import io.ktor.client.plugins.HttpSend
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.logging.LogLevel
import io.ktor.client.plugins.logging.Logging
import io.ktor.client.plugins.plugin
import io.ktor.client.request.header
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json
import kotlin.coroutines.cancellation.CancellationException

actual object HttpClientFactory {
    actual fun create(): HttpClient {
        val client = HttpClient(OkHttp) {
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
            install(HttpSend)
            install(Logging) {
                level = LogLevel.INFO
            }
        }

        client.plugin(HttpSend).intercept { request ->
            try {
                execute(request)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Throwable) {
                throw IllegalStateException(GuestApiErrorMessages.backendUnavailable(), e)
            }
        }

        return client
    }
}
