package si.calendra.guest.android.push

import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlin.math.min
import kotlin.random.Random
import si.calendra.guest.shared.network.GuestSessionStore

object GuestBookingRealtimeStream {
    private const val INITIAL_RECONNECT_DELAY_MS = 2_000L
    private const val MAX_RECONNECT_DELAY_MS = 60_000L
    private const val STABLE_CONNECTION_RESET_MS = 30_000L
    private const val RECONNECT_JITTER = 0.25

    fun start(
        scope: CoroutineScope,
        baseUrl: String,
        companyId: String,
        onBookingChanged: (String) -> Unit
    ): Job = scope.launch(Dispatchers.IO) {
        var reconnectAttempt = 0

        while (isActive) {
            var connection: HttpURLConnection? = null
            var connectedAtMs: Long? = null
            var retryMoreSlowly = false
            try {
                val token = GuestSessionStore.authToken.orEmpty()
                if (token.isBlank()) {
                    reconnectAttempt += 1
                    delay(nextReconnectDelayMillis(reconnectAttempt))
                    continue
                }
                val streamUrl = URL("${baseUrl.trimEnd('/')}/api/guest/bookings/stream?companyId=$companyId")
                connection = (streamUrl.openConnection() as HttpURLConnection).apply {
                    requestMethod = "GET"
                    setRequestProperty("Accept", "text/event-stream")
                    setRequestProperty("X-App-Platform", "native")
                    setRequestProperty("Authorization", "Bearer $token")
                    connectTimeout = 15_000
                    readTimeout = 65_000
                }

                val statusCode = connection.responseCode
                when {
                    statusCode in 200..299 -> {
                        connectedAtMs = System.currentTimeMillis()
                        connection.inputStream.bufferedReader().use { reader ->
                            var eventName: String? = null
                            while (isActive) {
                                val line = reader.readLine() ?: break
                                when {
                                    line.startsWith("event:") -> eventName = line.substringAfter("event:").trim()
                                    line.isBlank() -> eventName = null
                                    line.startsWith("data:") && eventName == "booking-updated" -> onBookingChanged(companyId)
                                }
                            }
                        }
                    }
                    statusCode == HttpURLConnection.HTTP_UNAUTHORIZED || statusCode == HttpURLConnection.HTTP_FORBIDDEN -> return@launch
                    statusCode == 429 -> retryMoreSlowly = true
                    else -> Unit
                }
            } catch (_: Exception) {
                // Stream drops are expected; loop reconnects with exponential backoff and jitter.
            } finally {
                connection?.disconnect()
            }

            val stableForMs = connectedAtMs?.let { System.currentTimeMillis() - it } ?: 0L
            reconnectAttempt = if (stableForMs >= STABLE_CONNECTION_RESET_MS) 0 else reconnectAttempt + if (retryMoreSlowly) 2 else 1
            delay(nextReconnectDelayMillis(reconnectAttempt))
        }
    }

    private fun nextReconnectDelayMillis(attempt: Int): Long {
        val boundedAttempt = attempt.coerceAtMost(8)
        var delayMs = INITIAL_RECONNECT_DELAY_MS
        repeat((boundedAttempt - 1).coerceAtLeast(0)) {
            delayMs = min(delayMs * 2, MAX_RECONNECT_DELAY_MS)
        }
        val jitterFactor = 1.0 + Random.nextDouble(-RECONNECT_JITTER, RECONNECT_JITTER)
        return (delayMs * jitterFactor).toLong().coerceIn(INITIAL_RECONNECT_DELAY_MS, MAX_RECONNECT_DELAY_MS)
    }
}

