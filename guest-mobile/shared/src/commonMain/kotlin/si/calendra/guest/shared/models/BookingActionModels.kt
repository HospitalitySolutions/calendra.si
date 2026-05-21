package si.calendra.guest.shared.models

import kotlinx.serialization.Serializable

@Serializable
data class RescheduleBookingRequest(
    val newSlotId: String
)

@Serializable
data class CancelBookingRequest(
    val reason: String? = null
)

@Serializable
data class BookingActionResult(
    val bookingId: String,
    val bookingStatus: String,
    val creditConsumed: Boolean? = null,
    val startsAt: String? = null,
    val endsAt: String? = null
)
