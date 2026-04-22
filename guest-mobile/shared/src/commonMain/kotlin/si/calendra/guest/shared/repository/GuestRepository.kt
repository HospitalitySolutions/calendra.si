package si.calendra.guest.shared.repository

import si.calendra.guest.shared.models.*

interface GuestRepository {
    suspend fun login(request: LoginRequest): GuestSession
    suspend fun signup(request: SignupRequest): GuestSession
    suspend fun loginWithGoogle(idToken: String): GuestSession
    suspend fun loginWithApple(idToken: String): GuestSession
    suspend fun me(): GuestProfile
    suspend fun profileSettings(companyId: String? = null): GuestProfileSettings
    suspend fun updateProfileSettings(request: UpdateGuestProfileSettingsRequest): GuestProfileSettings
    suspend fun resolveTenant(code: String): TenantLookupResponse
    suspend fun searchTenants(query: String): List<TenantSummary>
    suspend fun joinTenant(request: JoinTenantRequest): JoinTenantResponse
    suspend fun home(companyId: String): HomePayload
    suspend fun products(companyId: String): List<ProductSummary>
    suspend fun availability(companyId: String, sessionTypeId: String, date: String, consultantId: String? = null): AvailabilityResponse
    suspend fun consultants(companyId: String, sessionTypeId: String): List<ConsultantSummary>
    suspend fun createOrder(request: CreateOrderRequest): CreateOrderResponse
    suspend fun checkout(orderId: String, request: CheckoutRequest): CheckoutResponse
    suspend fun wallet(companyId: String): WalletPayload
    suspend fun toggleAutoRenew(companyId: String, entitlementId: String, autoRenews: Boolean): ToggleAutoRenewResponse
    suspend fun bookingHistory(companyId: String): List<BookingHistoryItem>
    suspend fun notifications(companyId: String): NotificationsPayload
    suspend fun markNotificationRead(companyId: String, notificationId: String)
    suspend fun markAllNotificationsRead(companyId: String): MarkAllReadResponse
    suspend fun inboxThreads(companyId: String): List<GuestInboxThread>
    suspend fun inboxMessages(companyId: String): List<GuestInboxMessage>
    suspend fun sendInboxMessage(companyId: String, body: String): GuestInboxMessage
    suspend fun registerDeviceToken(platform: String, pushToken: String, locale: String? = null): Boolean
}
