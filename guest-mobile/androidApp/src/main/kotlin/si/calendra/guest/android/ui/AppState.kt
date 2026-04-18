package si.calendra.guest.android.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import si.calendra.guest.shared.models.*

data class TenantDashboard(
    val tenant: TenantSummary,
    val home: HomePayload? = null,
    val products: List<ProductSummary> = emptyList(),
    val wallet: WalletPayload? = null,
    val history: List<BookingHistoryItem> = emptyList(),
    val notifications: List<GuestNotification> = emptyList()
)

data class GuestUiState(
    val session: GuestSession? = null,
    val linkedTenants: List<TenantSummary> = emptyList(),
    val selectedTenantId: String? = null,
    val tenantDashboards: Map<String, TenantDashboard> = emptyMap(),
    val loading: Boolean = false,
    val error: String? = null
)

class GuestMutableState {
    var uiState by mutableStateOf(GuestUiState())
}
