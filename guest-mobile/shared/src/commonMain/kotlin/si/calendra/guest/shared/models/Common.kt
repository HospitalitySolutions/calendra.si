package si.calendra.guest.shared.models

import kotlinx.serialization.Serializable

@Serializable
data class TenantSummary(
    val companyId: String,
    val companyName: String,
    val publicDescription: String? = null,
    val publicCity: String? = null,
    val publicPhone: String? = null,
    val companyAddress: String? = null,
    val status: String = "ACTIVE",
    val employeeSelectionStep: Boolean = false,
    val requireOnlinePayment: Boolean = true
)

@Serializable
data class GuestUser(
    val id: String,
    val email: String,
    val firstName: String,
    val lastName: String,
    val phone: String? = null,
    val language: String = "sl"
)

@Serializable
data class GuestSession(
    val token: String,
    val guestUser: GuestUser,
    val linkedTenants: List<TenantSummary>
)


@Serializable
data class ApiErrorResponse(
    val message: String? = null,
    val path: String? = null
)
