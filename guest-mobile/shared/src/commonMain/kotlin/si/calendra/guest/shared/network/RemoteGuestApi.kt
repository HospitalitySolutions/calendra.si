package si.calendra.guest.shared.network

import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.isSuccess
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import si.calendra.guest.shared.config.GuestApiConfig
import si.calendra.guest.shared.models.*

class RemoteGuestApi(
    private val config: GuestApiConfig,
    private val client: HttpClient
) {
    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        isLenient = true
    }

    private fun io.ktor.client.request.HttpRequestBuilder.jsonRequest() {
        header(HttpHeaders.Accept, ContentType.Application.Json.toString())
        header(HttpHeaders.ContentType, ContentType.Application.Json.toString())
    }

    private suspend inline fun <reified T> parse(response: HttpResponse): T {
        val payload = response.bodyAsText()
        if (!response.status.isSuccess()) {
            val apiMessage = runCatching { json.decodeFromString<ApiErrorResponse>(payload).message }.getOrNull()
            val message = apiMessage?.takeIf { it.isNotBlank() }
                ?: payload.takeIf { it.isNotBlank() }
                ?: "Request failed with status ${response.status.value}"
            throw IllegalStateException(message)
        }
        return json.decodeFromString(payload)
    }

    suspend fun login(request: LoginRequest): GuestSession =
        parse(client.post("${config.baseUrl}/api/guest/auth/login") {
            jsonRequest()
            setBody(request)
        })

    suspend fun signup(request: SignupRequest): GuestSession =
        parse(client.post("${config.baseUrl}/api/guest/auth/signup") {
            jsonRequest()
            setBody(request)
        })

    suspend fun me(): GuestProfile =
        parse(client.get("${config.baseUrl}/api/guest/me") {
            header(HttpHeaders.Accept, ContentType.Application.Json.toString())
        })

    suspend fun profileSettings(companyId: String? = null): GuestProfileSettings =
        parse(client.get("${config.baseUrl}/api/guest/profile/settings") {
            header(HttpHeaders.Accept, ContentType.Application.Json.toString())
            companyId?.takeIf { it.isNotBlank() }?.let { parameter("companyId", it) }
        })

    suspend fun updateProfileSettings(request: UpdateGuestProfileSettingsRequest): GuestProfileSettings =
        parse(client.put("${config.baseUrl}/api/guest/profile/settings") {
            jsonRequest()
            setBody(request)
        })

    suspend fun loginWithGoogle(idToken: String): GuestSession =
        parse(client.post("${config.baseUrl}/api/guest/auth/google/token") {
            jsonRequest()
            setBody(SocialTokenRequest(idToken))
        })

    suspend fun loginWithApple(idToken: String): GuestSession =
        parse(client.post("${config.baseUrl}/api/guest/auth/apple/token") {
            jsonRequest()
            setBody(SocialTokenRequest(idToken))
        })

    suspend fun resolveTenant(tenantCode: String): TenantLookupResponse =
        parse(client.post("${config.baseUrl}/api/guest/tenants/resolve-code") {
            jsonRequest()
            setBody(TenantLookupRequest(tenantCode))
        })

    suspend fun searchTenants(query: String): List<TenantSummary> =
        parse(client.get("${config.baseUrl}/api/guest/tenants/search") {
            header(HttpHeaders.Accept, ContentType.Application.Json.toString())
            parameter("q", query)
        })

    suspend fun joinTenant(request: JoinTenantRequest): JoinTenantResponse =
        parse(client.post("${config.baseUrl}/api/guest/tenants/join") {
            jsonRequest()
            setBody(request)
        })

    suspend fun home(companyId: String): HomePayload =
        parse(client.get("${config.baseUrl}/api/guest/home") {
            header(HttpHeaders.Accept, ContentType.Application.Json.toString())
            parameter("companyId", companyId)
        })

    suspend fun products(companyId: String): List<ProductSummary> =
        parse(client.get("${config.baseUrl}/api/guest/products") {
            header(HttpHeaders.Accept, ContentType.Application.Json.toString())
            parameter("companyId", companyId)
        })

    suspend fun availability(companyId: String, sessionTypeId: String, date: String, consultantId: String? = null): AvailabilityResponse =
        parse(client.get("${config.baseUrl}/api/guest/availability") {
            header(HttpHeaders.Accept, ContentType.Application.Json.toString())
            parameter("companyId", companyId)
            parameter("sessionTypeId", sessionTypeId)
            parameter("date", date)
            consultantId?.takeIf { it.isNotBlank() }?.let { parameter("consultantId", it) }
        })

    suspend fun consultants(companyId: String, sessionTypeId: String): List<ConsultantSummary> =
        parse(client.get("${config.baseUrl}/api/guest/consultants") {
            header(HttpHeaders.Accept, ContentType.Application.Json.toString())
            parameter("companyId", companyId)
            parameter("sessionTypeId", sessionTypeId)
        })

    suspend fun createOrder(request: CreateOrderRequest): CreateOrderResponse =
        parse(client.post("${config.baseUrl}/api/guest/orders") {
            jsonRequest()
            setBody(request)
        })

    suspend fun checkout(orderId: String, request: CheckoutRequest): CheckoutResponse =
        parse(client.post("${config.baseUrl}/api/guest/orders/$orderId/checkout") {
            jsonRequest()
            setBody(request)
        })

    suspend fun wallet(companyId: String): WalletPayload =
        parse(client.get("${config.baseUrl}/api/guest/wallet") {
            header(HttpHeaders.Accept, ContentType.Application.Json.toString())
            parameter("companyId", companyId)
        })

    suspend fun toggleAutoRenew(companyId: String, entitlementId: String, autoRenews: Boolean): ToggleAutoRenewResponse =
        parse(client.post("${config.baseUrl}/api/guest/wallet/entitlements/$entitlementId/auto-renew") {
            jsonRequest()
            parameter("companyId", companyId)
            setBody(ToggleAutoRenewRequest(autoRenews))
        })

    suspend fun bookingHistory(companyId: String): List<BookingHistoryItem> =
        parse(client.get("${config.baseUrl}/api/guest/bookings/history") {
            header(HttpHeaders.Accept, ContentType.Application.Json.toString())
            parameter("companyId", companyId)
        })

    suspend fun notifications(companyId: String): NotificationsPayload =
        parse(client.get("${config.baseUrl}/api/guest/notifications") {
            header(HttpHeaders.Accept, ContentType.Application.Json.toString())
            parameter("companyId", companyId)
        })

    suspend fun inboxThreads(companyId: String): List<GuestInboxThread> =
        parse(client.get("${config.baseUrl}/api/guest/inbox/threads") {
            header(HttpHeaders.Accept, ContentType.Application.Json.toString())
            parameter("companyId", companyId)
        })

    suspend fun inboxMessages(companyId: String): List<GuestInboxMessage> =
        parse(client.get("${config.baseUrl}/api/guest/inbox/messages") {
            header(HttpHeaders.Accept, ContentType.Application.Json.toString())
            parameter("companyId", companyId)
        })

    suspend fun sendInboxMessage(companyId: String, body: String): GuestInboxMessage =
        parse(client.post("${config.baseUrl}/api/guest/inbox/messages") {
            jsonRequest()
            setBody(SendGuestInboxMessageRequest(companyId = companyId, body = body))
        })


    suspend fun registerDeviceToken(platform: String, pushToken: String, locale: String? = null): RegisterDeviceTokenResponse =
        parse(client.post("${config.baseUrl}/api/guest/device-tokens") {
            jsonRequest()
            setBody(RegisterDeviceTokenRequest(platform = platform, pushToken = pushToken, locale = locale))
        })
}
