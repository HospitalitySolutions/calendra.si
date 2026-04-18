package si.calendra.guest.shared.models

import kotlinx.serialization.Serializable

@Serializable
data class ProductSummary(
    val productId: String,
    val name: String,
    val productType: String,
    val priceGross: Double,
    val currency: String,
    val sessionTypeId: String? = null,
    val sessionTypeName: String? = null,
    val bookable: Boolean = true,
    val description: String? = null,
    val durationMinutes: Int? = null
)

@Serializable
data class AvailabilitySlot(
    val slotId: String,
    val startsAt: String,
    val endsAt: String,
    val available: Boolean = true
)

@Serializable
data class AvailabilityResponse(
    val sessionTypeId: String,
    val date: String,
    val slots: List<AvailabilitySlot>
)
