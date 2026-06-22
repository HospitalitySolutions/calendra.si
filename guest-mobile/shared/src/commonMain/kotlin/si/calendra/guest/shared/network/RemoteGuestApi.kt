package si.calendra.guest.shared.network

import io.ktor.client.HttpClient
import io.ktor.client.request.forms.MultiPartFormDataContent
import io.ktor.client.request.forms.formData
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsBytes
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import io.ktor.http.isSuccess
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import kotlin.random.Random
import si.calendra.guest.shared.config.GuestApiConfig
import si.calendra.guest.shared.models.*

class RemoteGuestApi(
    private val config: GuestApiConfig,
    private val client: HttpClient
) {
    private val orderIdempotencyKeys = mutableMapOf<String, String>()
    private val checkoutIdempotencyKeys = mutableMapOf<String, String>()

    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        isLenient = true
    }

    private fun io.ktor.client.request.HttpRequestBuilder.jsonRequest() {
        header(HttpHeaders.Accept, ContentType.Application.Json.toString())
        header(HttpHeaders.ContentType, ContentType.Application.Json.toString())
    }

    private fun io.ktor.client.request.HttpRequestBuilder.idempotencyHeader(value: String) {
        header("Idempotency-Key", value.take(128))
    }

    private fun newIdempotencyKey(prefix: String): String {
        val first = Random.nextLong().toString(16).replace("-", "n")
        val second = Random.nextLong().toString(16).replace("-", "n")
        return "$prefix-$first-$second"
    }

    private fun createOrderScope(request: CreateOrderRequest): String = listOf(
        request.companyId,
        request.productId,
        request.slotId.orEmpty(),
        request.paymentMethodType,
        request.consultantId.orEmpty(),
        request.entitlementId.orEmpty(),
        request.locale.orEmpty()
    ).joinToString("|")

    private fun checkoutScope(orderId: String, request: CheckoutRequest): String = listOf(
        orderId,
        request.paymentMethodType,
        request.saveCard.toString(),
        request.useSavedPaymentMethodId.orEmpty(),
        request.locale.orEmpty()
    ).joinToString("|")

    private suspend inline fun <reified T> parse(response: HttpResponse): T {
        val payload = response.bodyAsText()
        if (!response.status.isSuccess()) {
            throw IllegalStateException(errorMessageFor(response.status.value, payload))
        }
        return json.decodeFromString(payload)
    }

    private fun errorMessageFor(statusCode: Int, payload: String): String {
        if (GuestApiErrorMessages.isBackendUnavailableStatus(statusCode)) {
            return GuestApiErrorMessages.backendUnavailable(statusCode)
        }

        val apiMessage = runCatching { json.decodeFromString<ApiErrorResponse>(payload).message }.getOrNull()
        return apiMessage?.takeIf { it.isNotBlank() }
            ?: payload.takeIf { it.isNotBlank() }
            ?: "Request failed with status $statusCode"
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

    suspend fun signupStart(request: SignupStartRequest): SignupChallenge =
        parse(client.post("${config.baseUrl}/api/guest/auth/signup/start") {
            jsonRequest()
            setBody(request)
        })

    suspend fun verifySignupCode(request: VerifySignupCodeRequest): GuestSession =
        parse(client.post("${config.baseUrl}/api/guest/auth/signup/verify-code") {
            jsonRequest()
            setBody(request)
        })

    suspend fun resendSignupCode(challengeId: String): SignupChallenge =
        parse(client.post("${config.baseUrl}/api/guest/auth/signup/resend-code") {
            jsonRequest()
            setBody(ResendSignupCodeRequest(challengeId))
        })

    suspend fun requestPasswordReset(email: String, locale: String? = null) {
        val response = client.post("${config.baseUrl}/api/guest/auth/forgot-password") {
            jsonRequest()
            setBody(ForgotPasswordRequest(email = email, locale = locale, language = locale))
        }
        if (!response.status.isSuccess()) {
            val payload = runCatching { response.bodyAsText() }.getOrNull().orEmpty()
            throw IllegalStateException(errorMessageFor(response.status.value, payload))
        }
    }

    suspend fun verifyPasswordResetCode(email: String, code: String): ResetPasswordCodeResponse =
        parse(client.post("${config.baseUrl}/api/guest/auth/forgot-password/verify-code") {
            jsonRequest()
            setBody(VerifyPasswordResetCodeRequest(email = email, code = code))
        })

    suspend fun validatePasswordResetToken(token: String): ResetPasswordValidateResponse =
        parse(client.get("${config.baseUrl}/api/guest/auth/reset-password/validate") {
            header(HttpHeaders.Accept, ContentType.Application.Json.toString())
            parameter("token", token)
        })

    suspend fun resetPassword(token: String, password: String) {
        val response = client.post("${config.baseUrl}/api/guest/auth/reset-password") {
            jsonRequest()
            setBody(ResetPasswordRequest(token = token, password = password))
        }
        if (!response.status.isSuccess()) {
            val payload = runCatching { response.bodyAsText() }.getOrNull().orEmpty()
            throw IllegalStateException(errorMessageFor(response.status.value, payload))
        }
    }

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

    suspend fun uploadProfilePicture(fileName: String, contentType: String?, bytes: ByteArray): GuestProfileSettings =
        parse(client.post("${config.baseUrl}/api/guest/profile/picture") {
            setBody(
                MultiPartFormDataContent(
                    formData {
                        append(
                            key = "file",
                            value = bytes,
                            headers = Headers.build {
                                append(
                                    HttpHeaders.ContentType,
                                    contentType?.takeIf { it.isNotBlank() } ?: "application/octet-stream"
                                )
                                append(
                                    HttpHeaders.ContentDisposition,
                                    "filename=\"${fileName.replace("\"", "")}\""
                                )
                            }
                        )
                    }
                )
            )
        })

    suspend fun downloadProfilePicture(): ByteArray {
        val response = client.get("${config.baseUrl}/api/guest/profile/picture") {
            header(HttpHeaders.Accept, "*/*")
        }
        if (!response.status.isSuccess()) {
            val payload = runCatching { response.bodyAsText() }.getOrNull().orEmpty()
            throw IllegalStateException(errorMessageFor(response.status.value, payload))
        }
        return response.bodyAsBytes()
    }

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

    suspend fun searchTenants(query: String, tenantType: String? = null): List<TenantSummary> =
        parse(client.get("${config.baseUrl}/api/guest/tenants/search") {
            header(HttpHeaders.Accept, ContentType.Application.Json.toString())
            parameter("q", query)
            if (!tenantType.isNullOrBlank()) parameter("type", tenantType)
        })

    suspend fun joinTenant(request: JoinTenantRequest): JoinTenantResponse =
        parse(client.post("${config.baseUrl}/api/guest/tenants/join") {
            jsonRequest()
            setBody(request)
        })

    suspend fun unsubscribeTenant(companyId: String): TenantLink =
        parse(client.post("${config.baseUrl}/api/guest/tenants/$companyId/unsubscribe") {
            header(HttpHeaders.Accept, ContentType.Application.Json.toString())
        })

    suspend fun anonymizeTenant(companyId: String): TenantLink =
        parse(client.post("${config.baseUrl}/api/guest/tenants/$companyId/anonymize") {
            header(HttpHeaders.Accept, ContentType.Application.Json.toString())
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

    suspend fun createOrder(request: CreateOrderRequest): CreateOrderResponse {
        val scope = createOrderScope(request)
        val key = orderIdempotencyKeys.getOrPut(scope) { newIdempotencyKey("guest-order") }
        return parse(client.post("${config.baseUrl}/api/guest/orders") {
            jsonRequest()
            idempotencyHeader(key)
            setBody(request)
        })
    }

    suspend fun rescheduleBooking(bookingId: String, newSlotId: String): BookingActionResult =
        parse(client.post("${config.baseUrl}/api/guest/bookings/$bookingId/reschedule") {
            jsonRequest()
            idempotencyHeader(newIdempotencyKey("guest-booking-reschedule"))
            setBody(RescheduleBookingRequest(newSlotId = newSlotId))
        })

    suspend fun cancelBooking(bookingId: String): BookingActionResult =
        parse(client.post("${config.baseUrl}/api/guest/bookings/$bookingId/cancel") {
            jsonRequest()
            idempotencyHeader(newIdempotencyKey("guest-booking-cancel"))
            setBody(CancelBookingRequest())
        })

    suspend fun checkout(orderId: String, request: CheckoutRequest): CheckoutResponse {
        val scope = checkoutScope(orderId, request)
        val key = checkoutIdempotencyKeys.getOrPut(scope) { newIdempotencyKey("guest-checkout") }
        return parse(client.post("${config.baseUrl}/api/guest/orders/$orderId/checkout") {
            jsonRequest()
            idempotencyHeader(key)
            setBody(request)
        })
    }

    suspend fun cancelCheckout(orderId: String, checkoutSessionId: String? = null): CheckoutResponse =
        parse(client.post("${config.baseUrl}/api/guest/orders/$orderId/checkout/cancel") {
            header(HttpHeaders.Accept, ContentType.Application.Json.toString())
            idempotencyHeader(newIdempotencyKey("guest-checkout-cancel"))
            checkoutSessionId?.takeIf { it.isNotBlank() }?.let { parameter("session_id", it) }
        })

    suspend fun downloadOrderReceiptPdf(orderId: String): ByteArray {
        val response = client.get("${config.baseUrl}/api/guest/orders/$orderId/receipt.pdf") {
            header(HttpHeaders.Accept, "*/*")
        }
        if (!response.status.isSuccess()) {
            val payload = runCatching { response.bodyAsText() }.getOrNull().orEmpty()
            throw IllegalStateException(errorMessageFor(response.status.value, payload))
        }
        return response.bodyAsBytes()
    }

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

    suspend fun markNotificationRead(companyId: String, notificationId: String) {
        client.post("${config.baseUrl}/api/guest/notifications/$notificationId/read") {
            header(HttpHeaders.Accept, ContentType.Application.Json.toString())
            parameter("companyId", companyId)
        }
    }

    suspend fun markAllNotificationsRead(companyId: String): MarkAllReadResponse =
        parse(client.post("${config.baseUrl}/api/guest/notifications/read-all") {
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

    suspend fun sendInboxMessage(
        companyId: String,
        body: String,
        attachmentFileIds: List<Long> = emptyList()
    ): GuestInboxMessage =
        parse(client.post("${config.baseUrl}/api/guest/inbox/messages") {
            jsonRequest()
            setBody(
                SendGuestInboxMessageRequest(
                    companyId = companyId,
                    body = body,
                    attachmentFileIds = attachmentFileIds
                )
            )
        })

    suspend fun uploadInboxAttachment(
        companyId: String,
        fileName: String,
        contentType: String?,
        bytes: ByteArray
    ): GuestInboxUploadedAttachment =
        parse(client.post("${config.baseUrl}/api/guest/inbox/attachments") {
            parameter("companyId", companyId)
            setBody(
                MultiPartFormDataContent(
                    formData {
                        append(
                            key = "file",
                            value = bytes,
                            headers = Headers.build {
                                append(
                                    HttpHeaders.ContentType,
                                    contentType?.takeIf { it.isNotBlank() } ?: "application/octet-stream"
                                )
                                append(
                                    HttpHeaders.ContentDisposition,
                                    "filename=\"${fileName.replace("\"", "")}\""
                                )
                            }
                        )
                    }
                )
            )
        })

    suspend fun discardInboxAttachment(companyId: String, fileId: Long) {
        client.post("${config.baseUrl}/api/guest/inbox/attachments/$fileId/discard") {
            parameter("companyId", companyId)
        }
    }


    suspend fun registerDeviceToken(platform: String, pushToken: String, locale: String? = null): RegisterDeviceTokenResponse =
        parse(client.post("${config.baseUrl}/api/guest/device-tokens") {
            jsonRequest()
            setBody(RegisterDeviceTokenRequest(platform = platform, pushToken = pushToken, locale = locale))
        })
}
