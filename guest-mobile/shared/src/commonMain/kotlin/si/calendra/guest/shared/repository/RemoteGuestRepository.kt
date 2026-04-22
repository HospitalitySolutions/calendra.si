package si.calendra.guest.shared.repository

import si.calendra.guest.shared.models.*
import si.calendra.guest.shared.network.GuestSessionStore
import si.calendra.guest.shared.network.RemoteGuestApi

class RemoteGuestRepository(
    private val api: RemoteGuestApi
) : GuestRepository {
    override suspend fun login(request: LoginRequest): GuestSession = api.login(request).also { GuestSessionStore.authToken = it.token }
    override suspend fun signup(request: SignupRequest): GuestSession = api.signup(request).also { GuestSessionStore.authToken = it.token }
    override suspend fun loginWithGoogle(idToken: String): GuestSession = api.loginWithGoogle(idToken).also { GuestSessionStore.authToken = it.token }
    override suspend fun loginWithApple(idToken: String): GuestSession = api.loginWithApple(idToken).also { GuestSessionStore.authToken = it.token }
    override suspend fun me(): GuestProfile = api.me()
    override suspend fun profileSettings(companyId: String?): GuestProfileSettings = api.profileSettings(companyId)
    override suspend fun updateProfileSettings(request: UpdateGuestProfileSettingsRequest): GuestProfileSettings = api.updateProfileSettings(request)
    override suspend fun resolveTenant(code: String): TenantLookupResponse = api.resolveTenant(code)
    override suspend fun searchTenants(query: String): List<TenantSummary> = api.searchTenants(query)
    override suspend fun joinTenant(request: JoinTenantRequest): JoinTenantResponse = api.joinTenant(request)
    override suspend fun home(companyId: String): HomePayload = api.home(companyId)
    override suspend fun products(companyId: String): List<ProductSummary> = api.products(companyId)
    override suspend fun availability(companyId: String, sessionTypeId: String, date: String, consultantId: String?): AvailabilityResponse = api.availability(companyId, sessionTypeId, date, consultantId)
    override suspend fun consultants(companyId: String, sessionTypeId: String): List<ConsultantSummary> = api.consultants(companyId, sessionTypeId)
    override suspend fun createOrder(request: CreateOrderRequest): CreateOrderResponse = api.createOrder(request)
    override suspend fun checkout(orderId: String, request: CheckoutRequest): CheckoutResponse = api.checkout(orderId, request)
    override suspend fun wallet(companyId: String): WalletPayload = api.wallet(companyId)
    override suspend fun toggleAutoRenew(companyId: String, entitlementId: String, autoRenews: Boolean): ToggleAutoRenewResponse = api.toggleAutoRenew(companyId, entitlementId, autoRenews)
    override suspend fun bookingHistory(companyId: String): List<BookingHistoryItem> = api.bookingHistory(companyId)
    override suspend fun notifications(companyId: String): NotificationsPayload = api.notifications(companyId)
    override suspend fun markNotificationRead(companyId: String, notificationId: String) = api.markNotificationRead(companyId, notificationId)
    override suspend fun markAllNotificationsRead(companyId: String): MarkAllReadResponse = api.markAllNotificationsRead(companyId)
    override suspend fun inboxThreads(companyId: String): List<GuestInboxThread> = api.inboxThreads(companyId)
    override suspend fun inboxMessages(companyId: String): List<GuestInboxMessage> = api.inboxMessages(companyId)
    override suspend fun sendInboxMessage(companyId: String, body: String): GuestInboxMessage = api.sendInboxMessage(companyId, body)
    override suspend fun registerDeviceToken(platform: String, pushToken: String, locale: String?): Boolean = api.registerDeviceToken(platform, pushToken, locale).registered
}
