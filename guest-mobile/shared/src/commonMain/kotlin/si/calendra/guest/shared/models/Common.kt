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
    val cancellationAllowed: Boolean = true,
    val modificationAllowed: Boolean = true,
    val billingEnabled: Boolean = true,
    val inboxEnabled: Boolean = true,
    val requireOnlinePayment: Boolean = true,
    /** Booking requirement mode: none / deposit / full. */
    val paymentRequirement: String? = null,
    /** Deposit percentage used when paymentRequirement is deposit. */
    val depositPercent: Int? = null,
    /** Runtime payment ids enabled for this tenant: CARD, BANK_TRANSFER, PAYPAL, GIFT_CARD. */
    val acceptedPaymentMethods: List<String> = emptyList(),
    /** Enables ordered multi-service selection for this tenant. */
    val multipleServicesEnabled: Boolean = false,
    /** Concrete public provider branch. Provider subscriptions are location-level. */
    val locationId: String? = null,
    /** Stable identity for a company/location provider card. */
    val providerId: String? = null,
    val locationName: String? = null,
    val publicEmail: String? = null,
    val publicBookingEnabled: Boolean = false
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
    val error: String? = null,
    val path: String? = null
)
