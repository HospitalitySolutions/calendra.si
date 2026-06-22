package si.calendra.guest.shared.network

import io.ktor.client.HttpClient
import io.ktor.client.engine.darwin.Darwin
import io.ktor.client.plugins.DefaultRequest
import io.ktor.client.plugins.HttpSend
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.logging.LogLevel
import io.ktor.client.plugins.logging.Logging
import io.ktor.client.plugins.plugin
import io.ktor.client.request.header
import io.ktor.http.HttpHeaders
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json
import kotlin.coroutines.cancellation.CancellationException

actual object HttpClientFactory {
    actual fun create(enableHttpLogging: Boolean): HttpClient {
        val client = HttpClient(Darwin) {
            install(DefaultRequest) {
                header("X-App-Platform", "native")
            }
            install(ContentNegotiation) {
                json(Json {
                    ignoreUnknownKeys = true
                    explicitNulls = false
                })
            }
            install(HttpSend)
            install(Logging) {
                level = if (enableHttpLogging) LogLevel.INFO else LogLevel.NONE
            }
        }

        client.plugin(HttpSend).intercept { request ->
            GuestSessionStore.authToken
                ?.takeIf { it.isNotBlank() }
                ?.let { token ->
                    // The HttpClient is created before a persisted/login token is restored in
                    // the app root. Add Authorization at send time so all authenticated calls,
                    // including /api/guest/device-tokens, always use the latest guest token.
                    request.headers.remove(HttpHeaders.Authorization)
                    request.header(HttpHeaders.Authorization, "Bearer $token")
                }
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
