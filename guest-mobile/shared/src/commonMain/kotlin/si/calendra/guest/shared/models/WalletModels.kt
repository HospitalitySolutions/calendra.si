package si.calendra.guest.shared.models

import kotlinx.serialization.Serializable

@Serializable
data class WalletOrder(
    val orderId: String,
    val status: String,
    val paymentMethodType: String,
    val totalGross: Double,
    val paidAt: String? = null
)

@Serializable
data class WalletPayload(
    val entitlements: List<EntitlementSummary>,
    val orders: List<WalletOrder>
)

@Serializable
data class BookingHistoryItem(
    val bookingId: String,
    val sessionTypeName: String,
    val startsAt: String,
    val bookingStatus: String
)

@Serializable
data class ToggleAutoRenewRequest(
    val autoRenews: Boolean
)

@Serializable
data class ToggleAutoRenewResponse(
    val entitlementId: String,
    val autoRenews: Boolean
)
