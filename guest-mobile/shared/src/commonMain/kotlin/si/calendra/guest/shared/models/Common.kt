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
    val tenantType: String? = null,
    val cardImageUrl: String? = null,
    val logoImageUrl: String? = null,
    val iconImageUrl: String? = null,
    val status: String = "ACTIVE",
    val employeeSelectionStep: Boolean = false,
    val useEmployeeContact: Boolean = false,
    val billingEnabled: Boolean = true,
    val inboxEnabled: Boolean = true,
    val requireOnlinePayment: Boolean = true,
    /** Booking requirement mode: none / deposit / full. */
    val paymentRequirement: String? = null,
    /** Deposit percentage used when paymentRequirement is deposit. */
    val depositPercent: Int? = null,
    /** Runtime payment ids enabled for this tenant: CARD, BANK_TRANSFER, PAYPAL, GIFT_CARD. */
    val acceptedPaymentMethods: List<String> = emptyList()
)

@Serializable
data class GuestUser(
    val id: String,
    val email: String,
    val firstName: String,
    val lastName: String,
    val phone: String? = null,
    val language: String = "sl",
    /** Relative path e.g. `/api/guest/profile/picture` when a picture exists; append to API base URL with auth. */
    val profilePicturePath: String? = null
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
