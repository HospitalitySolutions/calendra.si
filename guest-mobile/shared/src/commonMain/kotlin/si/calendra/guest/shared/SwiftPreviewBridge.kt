package si.calendra.guest.shared

import si.calendra.guest.shared.models.*
import si.calendra.guest.shared.sample.PreviewDataFactory

class SwiftPreviewBridge {
    private val preview = PreviewDataFactory()
    private val defaultCompanyId = preview.session().linkedTenants.firstOrNull()?.companyId ?: "tenant-northside"

    fun session(): GuestSession = preview.session()
    fun profile(): GuestProfile = preview.profile()
    fun tenantLookup(code: String): TenantLookupResponse = preview.tenantLookup(code)
    fun products(companyId: String = defaultCompanyId): List<ProductSummary> = preview.products(companyId)
    fun home(companyId: String = defaultCompanyId): HomePayload = preview.home(companyId)
    fun wallet(companyId: String = defaultCompanyId): WalletPayload = preview.wallet(companyId)
    fun history(): List<BookingHistoryItem> = preview.history()
    fun notifications(companyId: String = defaultCompanyId): NotificationsPayload = preview.notifications(companyId)
}
