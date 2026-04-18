package si.calendra.guest.shared.repository

import si.calendra.guest.shared.models.*

interface GuestRepository {
    suspend fun login(request: LoginRequest): GuestSession
    suspend fun signup(request: SignupRequest): GuestSession
    suspend fun loginWithGoogle(idToken: String): GuestSession
    suspend fun loginWithApple(idToken: String): GuestSession
    suspend fun me(): GuestProfile
    suspend fun resolveTenant(code: String): TenantLookupResponse
    suspend fun searchTenants(query: String): List<TenantSummary>
    suspend fun joinTenant(request: JoinTenantRequest): JoinTenantResponse
    suspend fun home(companyId: String): HomePayload
    suspend fun products(companyId: String): List<ProductSummary>
    suspend fun availability(companyId: String, sessionTypeId: String, date: String): AvailabilityResponse
    suspend fun createOrder(request: CreateOrderRequest): CreateOrderResponse
    suspend fun checkout(orderId: String, request: CheckoutRequest): CheckoutResponse
    suspend fun wallet(companyId: String): WalletPayload
    suspend fun bookingHistory(companyId: String): List<BookingHistoryItem>
    suspend fun notifications(companyId: String): NotificationsPayload
}
