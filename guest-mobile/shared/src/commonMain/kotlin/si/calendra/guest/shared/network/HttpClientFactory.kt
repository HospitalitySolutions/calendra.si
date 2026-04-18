package si.calendra.guest.shared.network

import io.ktor.client.HttpClient

expect object HttpClientFactory {
    fun create(): HttpClient
}
