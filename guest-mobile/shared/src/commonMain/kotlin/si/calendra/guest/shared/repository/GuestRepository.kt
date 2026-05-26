package si.calendra.guest.shared.repository

import si.calendra.guest.shared.models.*

interface GuestRepository {
    suspend fun login(request: LoginRequest): GuestSession
    suspend fun signup(request: SignupRequest): GuestSession
    suspend fun signupStart(request: SignupStartRequest): SignupChallenge
    suspend fun verifySignupCode(challengeId: String, code: String): GuestSession
    suspend fun resendSignupCode(challengeId: String): SignupChallenge
    suspend fun loginWithGoogle(idToken: String): GuestSession
    suspend fun loginWithApple(idToken: String): GuestSession
    suspend fun me(): GuestProfile
    suspend fun profileSettings(companyId: String? = null): GuestProfileSettings
    suspend fun updateProfileSettings(request: UpdateGuestProfileSettingsRequest): GuestProfileSettings
    suspend fun uploadProfilePicture(fileName: String, contentType: String?, bytes: ByteArray): GuestProfileSettings
    suspend fun downloadProfilePicture(): ByteArray
    suspend fun resolveTenant(code: String): TenantLookupResponse
    suspend fun searchTenants(query: String, tenantType: String? = null): List<TenantSummary>
    suspend fun joinTenant(request: JoinTenantRequest): JoinTenantResponse
    suspend fun unsubscribeTenant(companyId: String): TenantLink
    suspend fun anonymizeTenant(companyId: String): TenantLink
    suspend fun home(companyId: String): HomePayload
    suspend fun products(companyId: String): List<ProductSummary>
    suspend fun availability(companyId: String, sessionTypeId: String, date: String, consultantId: String? = null): AvailabilityResponse
    suspend fun consultants(companyId: String, sessionTypeId: String): List<ConsultantSummary>
    suspend fun createOrder(request: CreateOrderRequest): CreateOrderResponse
    suspend fun rescheduleBooking(companyId: String, bookingId: String, newSlotId: String): BookingActionResult
    suspend fun cancelBooking(companyId: String, bookingId: String): BookingActionResult
    suspend fun checkout(orderId: String, request: CheckoutRequest): CheckoutResponse
    suspend fun cancelCheckout(orderId: String, checkoutSessionId: String? = null): CheckoutResponse
    suspend fun downloadOrderReceiptPdf(orderId: String): ByteArray
    suspend fun wallet(companyId: String): WalletPayload
    suspend fun toggleAutoRenew(companyId: String, entitlementId: String, autoRenews: Boolean): ToggleAutoRenewResponse
    suspend fun bookingHistory(companyId: String): List<BookingHistoryItem>
    suspend fun notifications(companyId: String): NotificationsPayload
    suspend fun markNotificationRead(companyId: String, notificationId: String)
    suspend fun markAllNotificationsRead(companyId: String): MarkAllReadResponse
    suspend fun inboxThreads(companyId: String): List<GuestInboxThread>
    suspend fun inboxMessages(companyId: String): List<GuestInboxMessage>
    suspend fun sendInboxMessage(
        companyId: String,
        body: String,
        attachmentFileIds: List<Long> = emptyList()
    ): GuestInboxMessage
    suspend fun uploadInboxAttachment(
        companyId: String,
        fileName: String,
        contentType: String?,
        bytes: ByteArray
    ): GuestInboxUploadedAttachment
    suspend fun discardInboxAttachment(companyId: String, fileId: Long)
    suspend fun registerDeviceToken(platform: String, pushToken: String, locale: String? = null): Boolean
}
