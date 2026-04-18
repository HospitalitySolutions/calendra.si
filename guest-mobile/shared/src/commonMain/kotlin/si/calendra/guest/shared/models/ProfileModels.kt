package si.calendra.guest.shared.models

import kotlinx.serialization.Serializable

@Serializable
data class GuestProfile(
    val guestUser: GuestUser,
    val linkedTenants: List<TenantSummary>
)
