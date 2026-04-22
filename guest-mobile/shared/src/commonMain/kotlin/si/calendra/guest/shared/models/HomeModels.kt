package si.calendra.guest.shared.models

import kotlinx.serialization.Serializable

@Serializable
data class UpcomingBooking(
    val bookingId: String,
    val sessionTypeName: String,
    val startsAt: String,
    val bookingStatus: String
)

@Serializable
data class EntitlementSummary(
    val entitlementId: String,
    val productName: String,
    val entitlementType: String,
    val remainingUses: Int? = null,
    val totalUses: Int? = null,
    val validUntil: String? = null,
    val validityDays: Int? = null,
    val status: String = "ACTIVE",
    val sessionTypeId: String? = null,
    val sessionTypeName: String? = null,
    val autoRenews: Boolean = false,
    /** Short human-friendly ticket code like "CM8-425-001". */
    val displayCode: String? = null,
    val priceGross: Double? = null,
    val currency: String? = null
)

@Serializable
data class PendingOrderSummary(
    val orderId: String,
    val status: String,
    val paymentMethodType: String,
    val totalGross: Double,
    val referenceCode: String
)

@Serializable
data class HomePayload(
    val tenant: TenantSummary,
    val upcomingBookings: List<UpcomingBooking>,
    val activeEntitlements: List<EntitlementSummary>,
    val pendingOrders: List<PendingOrderSummary>
)
