package si.calendra.guest.shared.repository

import si.calendra.guest.shared.models.*
import si.calendra.guest.shared.sample.PreviewDataFactory

class PreviewGuestRepository : GuestRepository {
    private val preview = PreviewDataFactory()

    override suspend fun login(request: LoginRequest): GuestSession = preview.session()
    override suspend fun signup(request: SignupRequest): GuestSession = preview.session()
    override suspend fun loginWithGoogle(idToken: String): GuestSession = preview.session()
    override suspend fun loginWithApple(idToken: String): GuestSession = preview.session()
    override suspend fun me(): GuestProfile = preview.profile()
    override suspend fun profileSettings(companyId: String?): GuestProfileSettings = preview.profileSettings(companyId)
    override suspend fun updateProfileSettings(request: UpdateGuestProfileSettingsRequest): GuestProfileSettings = preview.updateProfileSettings(request)
    override suspend fun resolveTenant(code: String): TenantLookupResponse = preview.tenantLookup(code)
    override suspend fun searchTenants(query: String): List<TenantSummary> = preview.searchTenants(query)
    override suspend fun joinTenant(request: JoinTenantRequest): JoinTenantResponse = preview.joinTenant(request)
    override suspend fun home(companyId: String): HomePayload = preview.home(companyId)
    override suspend fun products(companyId: String): List<ProductSummary> = preview.products(companyId)
    override suspend fun availability(companyId: String, sessionTypeId: String, date: String, consultantId: String?): AvailabilityResponse = preview.availability(sessionTypeId, date)
    override suspend fun consultants(companyId: String, sessionTypeId: String): List<ConsultantSummary> = emptyList()
    override suspend fun createOrder(request: CreateOrderRequest): CreateOrderResponse = preview.createOrder(request)
    override suspend fun checkout(orderId: String, request: CheckoutRequest): CheckoutResponse = preview.checkout(orderId, request)
    override suspend fun wallet(companyId: String): WalletPayload = preview.wallet(companyId)
    override suspend fun toggleAutoRenew(companyId: String, entitlementId: String, autoRenews: Boolean): ToggleAutoRenewResponse = ToggleAutoRenewResponse(entitlementId, autoRenews)
    override suspend fun bookingHistory(companyId: String): List<BookingHistoryItem> = preview.history()
    override suspend fun notifications(companyId: String): NotificationsPayload = preview.notifications(companyId)
}
