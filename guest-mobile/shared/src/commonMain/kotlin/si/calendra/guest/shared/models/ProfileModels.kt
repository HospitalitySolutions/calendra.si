package si.calendra.guest.shared.models

import kotlinx.serialization.Serializable

@Serializable
data class GuestProfile(
    val guestUser: GuestUser,
    val linkedTenants: List<TenantSummary>
)

@Serializable
data class LinkedCompanyOption(
    val id: String,
    val name: String
)

@Serializable
data class GuestProfileSettings(
    val guestUser: GuestUser,
    val companyId: String? = null,
    val companyName: String? = null,
    val linkedCompanyId: String? = null,
    val linkedCompanyName: String? = null,
    val batchPaymentEnabled: Boolean = false,
    val linkedCompanyOptions: List<LinkedCompanyOption> = emptyList()
)

@Serializable
data class UpdateGuestProfileSettingsRequest(
    val firstName: String,
    val lastName: String,
    val email: String,
    val phone: String? = null,
    val language: String = "sl",
    val companyId: String? = null,
    val linkedCompanyId: String? = null,
    val batchPaymentEnabled: Boolean? = null
)
