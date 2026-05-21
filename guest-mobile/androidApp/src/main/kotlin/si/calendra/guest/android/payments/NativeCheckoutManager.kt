package si.calendra.guest.android.payments

import android.net.Uri
import androidx.activity.ComponentActivity
import androidx.browser.customtabs.CustomTabsIntent
import com.stripe.android.PaymentConfiguration
import com.stripe.android.paymentsheet.PaymentSheet
import com.stripe.android.paymentsheet.PaymentSheetResult
import si.calendra.guest.shared.models.CheckoutResponse

class NativeCheckoutManager(
    private val activity: ComponentActivity,
    private val publishableKey: String
) {
    fun handle(
        checkout: CheckoutResponse,
        onComplete: () -> Unit,
        onError: (String) -> Unit
    ) {
        val clientSecret = checkout.paymentIntentClientSecret
        if (!clientSecret.isNullOrBlank()) {
            if (publishableKey.isBlank() || publishableKey.contains("YOUR_")) {
                onError("Set your Stripe publishable key before using native card checkout.")
                return
            }

            PaymentConfiguration.init(activity, publishableKey)

            val paymentSheet = PaymentSheet.Builder(
                resultCallback = { result: PaymentSheetResult ->
                    when (result) {
                        is PaymentSheetResult.Canceled -> onError("Payment canceled")
                        is PaymentSheetResult.Completed -> onComplete()
                        is PaymentSheetResult.Failed -> onError(result.error.localizedMessage ?: "Payment failed")
                        else -> onError("Payment status updated")
                    }
                }
            ).build(activity)

            val customerId = checkout.customerId
            val customerEphemeralKeySecret = checkout.customerEphemeralKeySecret

            val customerConfig =
                if (!customerId.isNullOrBlank() && !customerEphemeralKeySecret.isNullOrBlank()) {
                    PaymentSheet.CustomerConfiguration(
                        id = customerId,
                        ephemeralKeySecret = customerEphemeralKeySecret
                    )
                } else {
                    null
                }

            val configuration = PaymentSheet.Configuration(
                merchantDisplayName = checkout.merchantDisplayName
                    ?: activity.applicationInfo.loadLabel(activity.packageManager).toString(),
                customer = customerConfig,
                allowsDelayedPaymentMethods = true
            )

            paymentSheet.presentWithPaymentIntent(clientSecret, configuration)
            return
        }

        val checkoutUrl = checkout.checkoutUrl
        if (!checkoutUrl.isNullOrBlank()) {
            CustomTabsIntent.Builder().build().launchUrl(activity, Uri.parse(checkoutUrl))
            return
        }

        onComplete()
    }
}