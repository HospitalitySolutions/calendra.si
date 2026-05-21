package si.calendra.guest.android.push

import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import si.calendra.guest.shared.network.GuestSessionStore

object GuestBookingRealtimeStream {
    fun start(
        scope: CoroutineScope,
        baseUrl: String,
        companyId: String,
        onBookingChanged: (String) -> Unit
    ): Job = scope.launch(Dispatchers.IO) {
        while (isActive) {
            var connection: HttpURLConnection? = null
            try {
                val token = GuestSessionStore.authToken.orEmpty()
                if (token.isBlank()) {
                    delay(2000)
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
                if (connection.responseCode !in 200..299) {
                    delay(2500)
                    continue
                }
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
            } catch (_: Exception) {
                // Stream drops are expected; loop reconnects with backoff.
            } finally {
                connection?.disconnect()
            }
            delay(2000)
        }
    }
}

