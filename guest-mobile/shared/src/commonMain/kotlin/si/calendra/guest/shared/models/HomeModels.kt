package si.calendra.guest.shared.models

import kotlinx.serialization.Serializable

@Serializable
data class BookingServiceLine(
    val sessionTypeId: String,
    val name: String,
    val position: Int,
    val durationMinutes: Int,
    val startsAt: String? = null,
    val endsAt: String? = null,
    val priceGross: Double = 0.0,
    val currency: String = "EUR"
)

@Serializable
data class UpcomingBooking(
    val bookingId: String,
    val sessionTypeName: String,
    val startsAt: String,
    val bookingStatus: String,
    val employeePhone: String? = null,
    val endsAt: String? = null,
    val consultantName: String? = null,
    val sessionTypeId: String? = null,
    val services: List<BookingServiceLine> = emptyList(),
    val totalDurationMinutes: Int = 0,
    val totalPriceGross: Double = 0.0,
    val currency: String = "EUR",
    val paymentStatus: String? = null,
    val locationId: String? = null
)

@Serializable
data class EntitlementSummary(
    val entitlementId: String,
    val productName: String,
    val entitlementType: String,
    val entitlementCode: String? = null,
    val remainingUses: Int? = null,
    val visitCount: Int? = null,
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
    val remainingValueGross: Double? = null,
    val voucherFaceValueGross: Double? = null,
    val voucherRedemptionMode: String? = null,
    val voucherServiceScope: String? = null,
    val voucherSessionTypeIds: List<String> = emptyList(),
    val voucherSessionTypeNames: List<String> = emptyList(),
    val currency: String? = null,
    val accessUrl: String? = null
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
