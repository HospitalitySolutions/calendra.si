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
    override suspend fun resolveTenant(code: String): TenantLookupResponse = api.resolveTenant(code)
    override suspend fun searchTenants(query: String): List<TenantSummary> = api.searchTenants(query)
    override suspend fun joinTenant(request: JoinTenantRequest): JoinTenantResponse = api.joinTenant(request)
    override suspend fun home(companyId: String): HomePayload = api.home(companyId)
    override suspend fun products(companyId: String): List<ProductSummary> = api.products(companyId)
    override suspend fun availability(companyId: String, sessionTypeId: String, date: String): AvailabilityResponse = api.availability(companyId, sessionTypeId, date)
    override suspend fun createOrder(request: CreateOrderRequest): CreateOrderResponse = api.createOrder(request)
    override suspend fun checkout(orderId: String, request: CheckoutRequest): CheckoutResponse = api.checkout(orderId, request)
    override suspend fun wallet(companyId: String): WalletPayload = api.wallet(companyId)
    override suspend fun bookingHistory(companyId: String): List<BookingHistoryItem> = api.bookingHistory(companyId)
    override suspend fun notifications(companyId: String): NotificationsPayload = api.notifications(companyId)
}
