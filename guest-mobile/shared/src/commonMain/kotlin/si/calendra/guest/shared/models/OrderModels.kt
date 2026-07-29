package si.calendra.guest.shared.models

import kotlinx.serialization.Serializable

@Serializable
data class SelectedServiceRequest(
    val productId: String? = null,
    val sessionTypeId: String? = null,
    val position: Int,
    val entitlementId: String? = null,
    val spaceId: String? = null
)

@Serializable
data class CreateOrderRequest(
    val companyId: String,
    /** Legacy primary product id retained for backwards compatibility. */
    val productId: String,
    val slotId: String? = null,
    val paymentMethodType: String,
    val consultantId: String? = null,
    val entitlementId: String? = null,
    /** UI language/locale selected in the app when the order is created. */
    val locale: String? = null,
    /** Ordered service lines; omitted for tenants using the legacy single-service flow. */
    val services: List<SelectedServiceRequest>? = null,
    /** Temporary 15-minute hold created when the guest enters payment and review. */
    val holdToken: String? = null
)

@Serializable
data class BookingSlotHoldRequest(
    val companyId: String,
    val slotId: String,
    val serviceTypeIds: List<Long>,
    val previousHoldToken: String? = null
)

@Serializable
data class BookingSlotHoldResponse(
    val holdToken: String,
    val expiresAt: String,
    val slotId: String
)

@Serializable
data class ConsultantSummary(
    val id: String,
    val firstName: String,
    val lastName: String,
    val email: String? = null
)

@Serializable
data class OrderSummary(
    val orderId: String,
    val status: String,
    val paymentMethodType: String,
    val subtotalGross: Double,
    val taxAmount: Double,
    val totalGross: Double,
    val currency: String
)

@Serializable
data class BookingSummary(
    val bookingId: String,
    val bookingStatus: String
)

@Serializable
data class CreateOrderResponse(
    val order: OrderSummary,
    val booking: BookingSummary? = null,
    val nextAction: String
)

@Serializable
data class CheckoutRequest(
    val paymentMethodType: String,
    val saveCard: Boolean = false,
    val useSavedPaymentMethodId: String? = null,
    /** UI language/locale selected in the app when checkout is confirmed. */
    val locale: String? = null
)

@Serializable
data class BankTransferInstructions(
    val amount: Double,
    val currency: String,
    val referenceCode: String,
    val instructions: String
)

@Serializable
data class CheckoutResponse(
    val orderId: String,
    val paymentMethodType: String,
    val status: String,
    val checkoutUrl: String? = null,
    val bankTransfer: BankTransferInstructions? = null,
    val nextAction: String,
    val paymentIntentClientSecret: String? = null,
    val customerId: String? = null,
    val customerEphemeralKeySecret: String? = null,
    val merchantDisplayName: String? = null
)
