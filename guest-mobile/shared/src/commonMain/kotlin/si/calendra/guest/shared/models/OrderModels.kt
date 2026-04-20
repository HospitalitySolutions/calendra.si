package si.calendra.guest.shared.models

import kotlinx.serialization.Serializable

@Serializable
data class CreateOrderRequest(
    val companyId: String,
    val productId: String,
    val slotId: String? = null,
    val paymentMethodType: String,
    val consultantId: String? = null
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
    val useSavedPaymentMethodId: String? = null
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
