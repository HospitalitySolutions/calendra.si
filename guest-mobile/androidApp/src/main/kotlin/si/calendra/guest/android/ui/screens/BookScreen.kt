package si.calendra.guest.android.ui.screens

import android.util.Log
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.heightIn
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.Security
import androidx.compose.material.icons.rounded.ReceiptLong
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.FitnessCenter
import androidx.compose.material.icons.rounded.EventAvailable
import androidx.compose.material.icons.rounded.CreditCard
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.Assignment
import androidx.compose.material.icons.rounded.AccountBalance
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.NotificationsNone
import androidx.compose.material.icons.rounded.RadioButtonUnchecked
import androidx.compose.material.icons.rounded.TaskAlt
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import si.calendra.guest.android.BuildConfig
import si.calendra.guest.android.R
import si.calendra.guest.shared.models.AvailabilitySlot
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.YearMonth
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale
import java.util.UUID


private fun bookIsSl(languageCode: String): Boolean = languageCode.lowercase(Locale.ROOT).startsWith("sl")

private fun bookTr(languageCode: String, en: String, sl: String): String =
    if (bookIsSl(languageCode)) sl else en

private fun bookLocale(languageCode: String): Locale =
    if (bookIsSl(languageCode)) Locale("sl", "SI") else Locale.ENGLISH

private fun BookingFlowStep.localizedTitle(languageCode: String, skipsOnlinePayment: Boolean = false): String {
    if (skipsOnlinePayment && this == BookingFlowStep.PAYMENT_REVIEW) {
        return bookTr(languageCode, "Review", "Pregled")
    }
    return when (this) {
        BookingFlowStep.PROVIDER -> bookTr(languageCode, "Provider", "Ponudnik")
        BookingFlowStep.SERVICE -> bookTr(languageCode, "Service", "Storitev")
        BookingFlowStep.EMPLOYEE -> bookTr(languageCode, "Employee", "Zaposleni")
        BookingFlowStep.DATE_TIME -> bookTr(languageCode, "Date & time", "Datum in ura")
        BookingFlowStep.PAYMENT_REVIEW -> bookTr(languageCode, "Payment & review", "Plačilo in pregled")
    }
}

private fun PaymentMethodUi.localizedTitle(languageCode: String): String = when (this) {
    PaymentMethodUi.CARD -> bookTr(languageCode, "Credit card", "Kreditna kartica")
    PaymentMethodUi.BANK_TRANSFER -> bookTr(languageCode, "Bank Transfer", "Bančno nakazilo")
    PaymentMethodUi.ENTITLEMENT -> bookTr(languageCode, "Use pass or visit", "Uporabi karto ali obisk")
    PaymentMethodUi.GIFT_CARD -> bookTr(languageCode, "Gift card", "Darilna kartica")
    PaymentMethodUi.PAYPAL -> "PayPal"
}

private fun PaymentMethodUi.localizedHelper(languageCode: String): String? = when (this) {
    PaymentMethodUi.GIFT_CARD -> bookTr(languageCode, "Use your gift card balance", "Uporabite dobroimetje darilne kartice")
    PaymentMethodUi.PAYPAL -> bookTr(languageCode, "Pay securely with PayPal", "Plačajte varno s PayPalom")
    else -> null
}


data class ProviderOption(
    val companyId: String,
    val tenantName: String,
    val tenantAddress: String?,
    val billingEnabled: Boolean = true,
    val requireOnlinePayment: Boolean = true,
    val paymentRequirement: String? = null,
    val depositPercent: Int? = null,
    /** Runtime payment ids enabled for this tenant: CARD, BANK_TRANSFER, PAYPAL, GIFT_CARD. Empty means "no allowlist" (all built-in methods allowed). */
    val acceptedPaymentMethods: List<String> = emptyList()
)


data class ServiceOption(
    val id: String,
    val companyId: String,
    val tenantName: String,
    val tenantCity: String?,
    val productId: String,
    val name: String,
    val description: String?,
    val priceGross: Double,
    val currency: String,
    val durationMinutes: Int?,
    val sessionTypeId: String
)

data class RedeemableEntitlementOption(
    val entitlementId: String,
    val companyId: String,
    val productName: String,
    val remainingUses: Int?,
    val validUntil: String?,
    val sessionTypeId: String? = null,
    val autoRenews: Boolean = false,
    val entitlementType: String = "",
    val remainingValueGross: Double? = null,
    val currency: String? = null
)

enum class BookingFlowStep(
    val index: Int,
    val stepTitle: String,
    val headerTitleBase: String,
    val headerSubtitle: String
) {
    PROVIDER(1, "Provider", "Select provider", "Choose a tenancy/organization you're subscribed to"),
    SERVICE(2, "Service", "Select service", "Choose a service from the options provided by the selected provider"),
    EMPLOYEE(3, "Employee", "Select employee", "Choose the employee to perform the service"),
    DATE_TIME(4, "Date & time", "Select date & time", "Pick a date and an available time slot"),
    PAYMENT_REVIEW(5, "Payment & review", "Payment & review", "Choose your preferred payment method");

    companion object {
        val ordered = listOf(PROVIDER, SERVICE, EMPLOYEE, DATE_TIME, PAYMENT_REVIEW)
    }
}

internal fun visibleBookingSteps(employeeStepEnabled: Boolean): List<BookingFlowStep> =
    BookingFlowStep.ordered.filter { it != BookingFlowStep.EMPLOYEE || employeeStepEnabled }

internal fun BookingFlowStep.headerTitleFor(employeeStepEnabled: Boolean): String {
    val visible = visibleBookingSteps(employeeStepEnabled)
    val ordinal = visible.indexOf(this).takeIf { it >= 0 }?.plus(1) ?: this.index
    return "$ordinal. $headerTitleBase"
}

data class ConsultantOption(
    val id: String,
    val firstName: String,
    val lastName: String,
    val email: String? = null
) {
    val fullName: String
        get() {
            val trimmed = "$firstName $lastName".trim()
            return trimmed.ifBlank { email ?: "Employee" }
        }
}

data class BookingRescheduleContext(
    val bookingId: String,
    val companyId: String,
    val sessionTypeId: String?,
    val sessionTypeName: String
)

data class BookLaunchRequest(
    val id: String = UUID.randomUUID().toString(),
    val companyId: String,
    val sessionTypeId: String?,
    val entitlementName: String,
    val entitlementId: String? = null,
    val preferredPaymentMethodType: String = "ENTITLEMENT"
)

private const val GUEST_AVAILABILITY_DEBUG_TAG = "GuestAvailability"

private enum class PaymentMethodUi(
    val title: String,
    val apiValue: String?,
    val enabled: Boolean,
    val helper: String? = null
) {
    CARD("Credit card", "CARD", true),
    BANK_TRANSFER("Bank Transfer", "BANK_TRANSFER", true),
    ENTITLEMENT("Use pass or visit", "ENTITLEMENT", true),
    GIFT_CARD("Gift card", "GIFT_CARD", true, "Use your gift card balance"),
    PAYPAL("PayPal", "PAYPAL", true, "Pay securely with PayPal")
}

@Composable
fun BookScreen(
    modifier: Modifier = Modifier,
    languageCode: String = "en",
    providers: List<ProviderOption>,
    services: List<ServiceOption>,
    redeemableEntitlements: List<RedeemableEntitlementOption> = emptyList(),
    onOpenNotifications: () -> Unit,
    onLoadAvailability: suspend (ServiceOption, LocalDate, String?) -> List<AvailabilitySlot>,
    onLoadConsultants: suspend (ServiceOption) -> List<ConsultantOption> = { _ -> emptyList() },
    employeeSelectionStepEnabled: (String) -> Boolean = { false },
    onCheckout: suspend (ServiceOption, String, String, String?, String?) -> Unit,
    rescheduleContext: BookingRescheduleContext? = null,
    launchRequest: BookLaunchRequest? = null,
    onLaunchRequestConsumed: () -> Unit = {},
    onReschedule: suspend (BookingRescheduleContext, String, String?) -> Unit = { _, _, _ -> },
    onExit: () -> Unit = {}
) {
    val scope = rememberCoroutineScope()

    var currentStep by remember { mutableStateOf(BookingFlowStep.PROVIDER) }
    var selectedProviderId by remember { mutableStateOf<String?>(providers.firstOrNull()?.companyId) }
    var selectedServiceId by remember { mutableStateOf<String?>(null) }
    var selectedConsultantId by remember { mutableStateOf<String?>(null) }
    var consultants by remember { mutableStateOf<List<ConsultantOption>>(emptyList()) }
    var loadingConsultants by remember { mutableStateOf(false) }
    var selectedMonth by remember { mutableStateOf(YearMonth.now()) }
    var selectedDate by remember { mutableStateOf(LocalDate.now().plusDays(1)) }
    var slots by remember { mutableStateOf<List<AvailabilitySlot>>(emptyList()) }
    var dateAvailability by remember { mutableStateOf<Map<LocalDate, Boolean>>(emptyMap()) }
    var selectedSlotId by remember { mutableStateOf<String?>(null) }
    var selectedPaymentMethod by remember { mutableStateOf(PaymentMethodUi.CARD) }
    var loadingSlots by remember { mutableStateOf(false) }
    var availabilityLoadError by remember { mutableStateOf<String?>(null) }
    var entitlementLaunchMode by remember { mutableStateOf(false) }
    var submitting by remember { mutableStateOf(false) }
    var showPaymentMethodChooserDialog by rememberSaveable { mutableStateOf(false) }
    var showEntitlementChooserSheet by rememberSaveable { mutableStateOf(false) }
    var selectedEntitlementId by rememberSaveable { mutableStateOf<String?>(null) }

    val employeeStepActive = selectedProviderId?.let(employeeSelectionStepEnabled) == true
    val visibleSteps = if (entitlementLaunchMode && rescheduleContext == null) {
        listOf(BookingFlowStep.DATE_TIME, BookingFlowStep.PAYMENT_REVIEW)
    } else if (rescheduleContext == null) {
        visibleBookingSteps(employeeStepActive)
    } else {
        if (employeeStepActive) {
            listOf(BookingFlowStep.EMPLOYEE, BookingFlowStep.DATE_TIME)
        } else {
            listOf(BookingFlowStep.DATE_TIME)
        }
    }
    var rescheduleInitialized by remember(rescheduleContext?.bookingId) { mutableStateOf(false) }
    var launchRequestInitialized by remember(launchRequest?.id) { mutableStateOf(false) }

    val providerScopedServices = remember(services, selectedProviderId) {
        services.filter { it.companyId == selectedProviderId }.sortedBy { it.name }
    }

    LaunchedEffect(providers) {
        if (providers.isNotEmpty() && providers.none { it.companyId == selectedProviderId }) {
            selectedProviderId = providers.first().companyId
        }
    }

    LaunchedEffect(providerScopedServices) {
        if (providerScopedServices.none { it.id == selectedServiceId }) {
            selectedServiceId = providerScopedServices.firstOrNull()?.id
            selectedSlotId = null
        }
    }

    LaunchedEffect(rescheduleContext, services, providers) {
        if (rescheduleInitialized) return@LaunchedEffect
        val context = rescheduleContext ?: return@LaunchedEffect
        selectedProviderId = providers.firstOrNull { it.companyId == context.companyId }?.companyId
            ?: selectedProviderId
        val candidate = services.firstOrNull {
            it.companyId == context.companyId &&
                ((context.sessionTypeId != null && context.sessionTypeId == it.sessionTypeId) ||
                    it.name.equals(context.sessionTypeName, ignoreCase = true))
        }
        if (candidate != null) {
            selectedServiceId = candidate.id
            selectedSlotId = null
        }
        if (selectedServiceId != null) {
            currentStep = if (employeeStepActive) BookingFlowStep.EMPLOYEE else BookingFlowStep.DATE_TIME
        }
        rescheduleInitialized = true
    }

    LaunchedEffect(launchRequest, services, providers) {
        if (launchRequestInitialized || rescheduleContext != null) return@LaunchedEffect
        val request = launchRequest ?: return@LaunchedEffect
        val providerExists = providers.any { it.companyId == request.companyId }
        if (!providerExists) {
            onLaunchRequestConsumed()
            launchRequestInitialized = true
            return@LaunchedEffect
        }

        selectedProviderId = request.companyId
        selectedConsultantId = null
        selectedSlotId = null
        selectedPaymentMethod = PaymentMethodUi.values().firstOrNull { it.apiValue == request.preferredPaymentMethodType }
            ?: PaymentMethodUi.ENTITLEMENT
        selectedEntitlementId = request.entitlementId

        val providerServices = services.filter { it.companyId == request.companyId }
        val candidate = request.sessionTypeId?.let { sessionTypeId ->
            providerServices.firstOrNull { it.sessionTypeId == sessionTypeId }
        } ?: providerServices.firstOrNull { it.name.equals(request.entitlementName, ignoreCase = true) }
            ?: providerServices.firstOrNull { service ->
                service.name.contains(request.entitlementName, ignoreCase = true) ||
                    request.entitlementName.contains(service.name, ignoreCase = true)
            }
            ?: providerServices.singleOrNull()

        if (candidate != null) {
            entitlementLaunchMode = true
            selectedServiceId = candidate.id
            currentStep = BookingFlowStep.DATE_TIME
        } else {
            entitlementLaunchMode = false
            selectedServiceId = null
            availabilityLoadError = bookTr(languageCode, "No matching service is available for this card.", "Za to karto ni na voljo ustrezne storitve.")
            currentStep = BookingFlowStep.DATE_TIME
        }

        onLaunchRequestConsumed()
        launchRequestInitialized = true
    }

    val selectedProvider = providers.firstOrNull { it.companyId == selectedProviderId }
    val skipsOnlinePayment = selectedProvider?.billingEnabled == false || selectedProvider?.requireOnlinePayment == false
    val selectedService = providerScopedServices.firstOrNull { it.id == selectedServiceId }
    val depositPercent = (selectedProvider?.depositPercent ?: 0).coerceIn(1, 100)
    val isDepositMode = !skipsOnlinePayment && selectedProvider?.paymentRequirement.equals("deposit", ignoreCase = true)
    val amountDueNow = if (selectedService != null && isDepositMode) {
        ((selectedService.priceGross * depositPercent) / 100.0)
    } else {
        selectedService?.priceGross ?: 0.0
    }
    val acceptedPaymentApiValues = selectedProvider?.acceptedPaymentMethods?.map { it.uppercase(Locale.ROOT) }.orEmpty()
    fun isMethodAllowed(method: PaymentMethodUi): Boolean {
        if (selectedProvider?.billingEnabled == false) return false
        if (method == PaymentMethodUi.ENTITLEMENT) return true
        val apiValue = method.apiValue ?: return true
        if (acceptedPaymentApiValues.isEmpty()) return true
        return acceptedPaymentApiValues.contains(apiValue)
    }
    val selectedSlot = slots.firstOrNull { it.slotId == selectedSlotId }
    val selectedConsultant = consultants.firstOrNull { it.id == selectedConsultantId }
    val matchingEntitlements = redeemableEntitlements.filter { entitlement ->
        selectedService != null && entitlement.companyId == selectedService.companyId
                && !entitlement.entitlementType.equals("GIFT_CARD", ignoreCase = true)
                && (entitlement.sessionTypeId.isNullOrBlank() || entitlement.sessionTypeId == selectedService.sessionTypeId)
    }
    val selectedEntitlement = if (selectedEntitlementId != null) {
        matchingEntitlements.firstOrNull { it.entitlementId == selectedEntitlementId }
    } else {
        matchingEntitlements.firstOrNull()
    }
    val usesEntitlementPayment = selectedPaymentMethod == PaymentMethodUi.ENTITLEMENT && selectedEntitlement != null
    val showPaymentMethodSummary = !skipsOnlinePayment || usesEntitlementPayment
    val matchingGiftCards = redeemableEntitlements.filter { entitlement ->
        selectedService != null && entitlement.companyId == selectedService.companyId
                && entitlement.entitlementType.equals("GIFT_CARD", ignoreCase = true)
                && ((entitlement.remainingValueGross ?: 0.0) > 0.0)
                && (entitlement.currency.isNullOrBlank() || entitlement.currency.equals(selectedService.currency, ignoreCase = true))
    }.sortedBy { it.remainingValueGross ?: 0.0 }
    val matchingGiftCardsTotal = matchingGiftCards.sumOf { it.remainingValueGross ?: 0.0 }
    val hasGiftCardCoverage = selectedService != null && matchingGiftCardsTotal + 0.0001 >= amountDueNow
    val cardSubtitle = bookTr(
        languageCode,
        "Pay securely with card after confirmation",
        "Po potrditvi plačajte varno s kartico"
    )
    val entitlementSubtitle = selectedEntitlement?.let {
        buildString {
            append(it.productName)
            append(" • ")
            append(it.remainingUses?.let { remaining -> bookTr(languageCode, "$remaining left", "$remaining preostalo") } ?: bookTr(languageCode, "unlimited", "neomejeno"))
            if (!it.validUntil.isNullOrBlank()) {
                append(bookTr(languageCode, " • valid until ", " • velja do "))
                append(it.validUntil.take(10))
            }
        }
    } ?: bookTr(languageCode, "No valid pass or pack available for this service", "Za to storitev ni veljavne karte ali paketa")
    val bestGiftCard = matchingGiftCards.firstOrNull()
    val giftCardSubtitle = bestGiftCard?.let { giftCard ->
        buildString {
            append(giftCard.productName)
            append(" • ")
            append(giftCard.remainingValueGross?.let { balance -> "${balance.formatPrice()} ${giftCard.currency ?: selectedService?.currency.orEmpty()}" } ?: bookTr(languageCode, "available", "na voljo"))
            if (!giftCard.validUntil.isNullOrBlank()) {
                append(bookTr(languageCode, " • valid until ", " • velja do "))
                append(giftCard.validUntil.take(10))
            }
        }
    } ?: PaymentMethodUi.GIFT_CARD.localizedHelper(languageCode)
    val availablePaymentMethods = buildList {
        if (matchingEntitlements.isNotEmpty()) add(PaymentMethodUi.ENTITLEMENT)
        if (hasGiftCardCoverage && isMethodAllowed(PaymentMethodUi.GIFT_CARD)) add(PaymentMethodUi.GIFT_CARD)
        if (isMethodAllowed(PaymentMethodUi.CARD)) add(PaymentMethodUi.CARD)
        if (isMethodAllowed(PaymentMethodUi.BANK_TRANSFER)) add(PaymentMethodUi.BANK_TRANSFER)
        if (isMethodAllowed(PaymentMethodUi.PAYPAL)) add(PaymentMethodUi.PAYPAL)
    }
    fun paymentSubtitle(method: PaymentMethodUi): String? = when (method) {
        PaymentMethodUi.CARD -> cardSubtitle
        PaymentMethodUi.BANK_TRANSFER -> null
        PaymentMethodUi.ENTITLEMENT -> entitlementSubtitle
        PaymentMethodUi.GIFT_CARD -> giftCardSubtitle
        PaymentMethodUi.PAYPAL -> PaymentMethodUi.PAYPAL.localizedHelper(languageCode)
    }

    fun moveBackStep(): Boolean {
        val idx = visibleSteps.indexOf(currentStep)
        if (idx > 0) {
            currentStep = visibleSteps[idx - 1]
            return true
        }
        return false
    }

    BackHandler(enabled = currentStep != BookingFlowStep.PROVIDER || rescheduleContext != null || entitlementLaunchMode) {
        if (entitlementLaunchMode && currentStep == BookingFlowStep.DATE_TIME) {
            onExit()
        } else if (!moveBackStep()) {
            onExit()
        }
    }

    fun refreshSlots() {
        val service = selectedService ?: return
        scope.launch {
            loadingSlots = true
            selectedSlotId = null
            availabilityLoadError = null
            val consultantIdForLoad = if (employeeStepActive && !entitlementLaunchMode) selectedConsultantId else null
            runCatching { onLoadAvailability(service, selectedDate, consultantIdForLoad) }
                .onSuccess { list ->
                    slots = list
                    dateAvailability = dateAvailability + (selectedDate to list.isNotEmpty())
                    selectedSlotId = list.firstOrNull()?.slotId
                    if (BuildConfig.DEBUG) {
                        Log.i(
                            GUEST_AVAILABILITY_DEBUG_TAG,
                            "GET /api/guest/availability companyId=${service.companyId} sessionTypeId=${service.sessionTypeId} date=$selectedDate → slots=${list.size}"
                        )
                    }
                }
                .onFailure { ex ->
                    slots = emptyList()
                    dateAvailability = dateAvailability - selectedDate
                    availabilityLoadError = ex.message?.takeIf { it.isNotBlank() }
                        ?: bookTr(languageCode, "Could not load availability. Check API base URL and backend.", "Razpoložljivosti ni bilo mogoče naložiti. Preverite API osnovni URL in zaledje.")
                    if (BuildConfig.DEBUG) {
                        Log.e(
                            GUEST_AVAILABILITY_DEBUG_TAG,
                            "GET /api/guest/availability companyId=${service.companyId} sessionTypeId=${service.sessionTypeId} date=$selectedDate failed",
                            ex
                        )
                    }
                }
            loadingSlots = false
        }
    }

    LaunchedEffect(selectedService?.id, selectedDate, selectedConsultantId, employeeStepActive) {
        if (selectedService != null) refreshSlots()
    }

    LaunchedEffect(selectedService?.id, selectedMonth, selectedConsultantId, employeeStepActive, currentStep) {
        val service = selectedService ?: run {
            dateAvailability = emptyMap()
            return@LaunchedEffect
        }
        if (currentStep != BookingFlowStep.DATE_TIME) return@LaunchedEffect
        if (employeeStepActive && !entitlementLaunchMode && selectedConsultantId == null) {
            dateAvailability = emptyMap()
            return@LaunchedEffect
        }

        val today = LocalDate.now()
        val monthDates = (1..selectedMonth.lengthOfMonth())
            .map { selectedMonth.atDay(it) }
            .filter { !it.isBefore(today) }
        val consultantIdForLoad = if (employeeStepActive && !entitlementLaunchMode) selectedConsultantId else null
        val loadedAvailability = mutableMapOf<LocalDate, Boolean>()
        dateAvailability = emptyMap()
        for (date in monthDates) {
            val result = runCatching { onLoadAvailability(service, date, consultantIdForLoad) }.getOrNull()
            if (result != null) {
                loadedAvailability[date] = result.isNotEmpty()
                dateAvailability = loadedAvailability.toMap()
            }
        }
    }


    LaunchedEffect(selectedService?.id, employeeStepActive) {
        if (employeeStepActive && selectedService != null) {
            loadingConsultants = true
            consultants = runCatching { onLoadConsultants(selectedService) }.getOrElse { emptyList() }
            loadingConsultants = false
            if (consultants.none { it.id == selectedConsultantId }) {
                selectedConsultantId = null
            }
        } else {
            consultants = emptyList()
            selectedConsultantId = null
        }
    }

    LaunchedEffect(selectedService?.id, matchingEntitlements.joinToString("|") { it.entitlementId }, entitlementLaunchMode) {
        if (matchingEntitlements.isEmpty()) {
            if (!entitlementLaunchMode) selectedEntitlementId = null
        } else if (selectedEntitlementId == null) {
            selectedEntitlementId = matchingEntitlements.first().entitlementId
        } else if (matchingEntitlements.none { it.entitlementId == selectedEntitlementId } && !entitlementLaunchMode) {
            selectedEntitlementId = matchingEntitlements.first().entitlementId
        }
    }

    LaunchedEffect(selectedService?.id, matchingEntitlements.size, matchingGiftCards.size, hasGiftCardCoverage, acceptedPaymentApiValues, entitlementLaunchMode) {
        if (selectedPaymentMethod == PaymentMethodUi.ENTITLEMENT && matchingEntitlements.isEmpty() && !entitlementLaunchMode) {
            selectedPaymentMethod = PaymentMethodUi.CARD
        }
        if (selectedPaymentMethod == PaymentMethodUi.GIFT_CARD && !hasGiftCardCoverage) {
            selectedPaymentMethod = PaymentMethodUi.CARD
        }
        if (!isMethodAllowed(selectedPaymentMethod)) {
            val fallback = listOf(
                PaymentMethodUi.CARD,
                PaymentMethodUi.BANK_TRANSFER,
                PaymentMethodUi.PAYPAL
            ).firstOrNull { isMethodAllowed(it) }
            if (fallback != null) selectedPaymentMethod = fallback
        }
    }

    if (showPaymentMethodChooserDialog) {
        PaymentMethodChooserDialog(
            methods = availablePaymentMethods,
            languageCode = languageCode,
            selectedMethod = selectedPaymentMethod,
            subtitleFor = { paymentSubtitle(it) },
            onDismiss = { showPaymentMethodChooserDialog = false },
            onSelect = { method ->
                selectedPaymentMethod = method
                showPaymentMethodChooserDialog = false
                when {
                    method == PaymentMethodUi.ENTITLEMENT && matchingEntitlements.isNotEmpty() -> {
                        if (selectedEntitlementId == null) {
                            selectedEntitlementId = matchingEntitlements.first().entitlementId
                        }
                        showEntitlementChooserSheet = true
                    }
                }
            }
        )
    }

    if (showEntitlementChooserSheet) {
        EntitlementChooserSheet(
            entitlements = matchingEntitlements,
            languageCode = languageCode,
            selectedEntitlementId = selectedEntitlement?.entitlementId,
            onDismiss = { showEntitlementChooserSheet = false },
            onConfirm = { entitlementId ->
                selectedEntitlementId = entitlementId
                selectedPaymentMethod = PaymentMethodUi.ENTITLEMENT
                showEntitlementChooserSheet = false
            }
        )
    }

    fun canNavigateTo(step: BookingFlowStep): Boolean = when (step) {
        BookingFlowStep.PROVIDER -> true
        BookingFlowStep.SERVICE -> selectedProvider != null
        BookingFlowStep.EMPLOYEE -> selectedService != null
        BookingFlowStep.DATE_TIME -> selectedService != null && (!employeeStepActive || selectedConsultantId != null)
        BookingFlowStep.PAYMENT_REVIEW -> selectedSlot != null
    }

    Box(
        modifier = modifier.fillMaxSize()
    ) {
        Image(
            painter = painterResource(id = bookingBackgroundRes(currentStep)),
            contentDescription = null,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop
        )
        Column(modifier = Modifier.fillMaxSize()) {
            BookingHeader(
                currentStep = currentStep,
                languageCode = languageCode,
                visibleSteps = visibleSteps,
                skipsOnlinePayment = skipsOnlinePayment && !usesEntitlementPayment,
                canNavigateTo = { step -> canNavigateTo(step) },
                onStepSelected = { currentStep = it }
            )
            LazyColumn(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 18.dp, bottom = 8.dp),
                verticalArrangement = Arrangement.spacedBy(18.dp)
            ) {
                when (currentStep) {
                BookingFlowStep.PROVIDER -> {
                    item { StraightSectionHeader(bookTr(languageCode, "SELECT PROVIDER", "IZBERI PONUDNIKA")) }

                    if (providers.isEmpty()) {
                        item {
                            EmptyInlineMessage(bookTr(languageCode, "No providers available", "Ni ponudnikov"), bookTr(languageCode, "The guest is not subscribed to any tenancy yet.", "Gost še ni povezan z nobenim ponudnikom."))
                        }
                    } else {
                        items(providers, key = { it.companyId }) { provider ->
                            ProviderListRow(
                                provider = provider,
                                languageCode = languageCode,
                                selected = provider.companyId == selectedProviderId,
                                onClick = {
                                    selectedProviderId = provider.companyId
                                    selectedServiceId = services.firstOrNull { it.companyId == provider.companyId }?.id
                                    selectedSlotId = null
                                }
                            )
                        }
                    }
                }

                BookingFlowStep.SERVICE -> {
                    item { StraightSectionHeader(bookTr(languageCode, "SELECTED SERVICE", "IZBERI STORITEV")) }

                    if (providerScopedServices.isEmpty()) {
                        item {
                            EmptyInlineMessage(bookTr(languageCode, "No services available", "Ni razpoložljivih storitev"), bookTr(languageCode, "This provider does not currently expose any guest-app services.", "Ta ponudnik trenutno nima storitev za goste."))
                        }
                    } else {
                        items(providerScopedServices, key = { it.id }) { service ->
                            ServiceListRow(
                                service = service,
                                languageCode = languageCode,
                                selected = service.id == selectedServiceId,
                                onClick = {
                                    selectedServiceId = service.id
                                    selectedSlotId = null
                                }
                            )
                        }
                    }
                }

                BookingFlowStep.EMPLOYEE -> {
                    item { StraightSectionHeader(bookTr(languageCode, "SELECT EMPLOYEE", "IZBERI ZAPOSLENEGA")) }

                    if (loadingConsultants) {
                        item {
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                                Text(bookTr(languageCode, "Loading employees…", "Nalaganje zaposlenih…"))
                            }
                        }
                    } else if (consultants.isEmpty()) {
                        item {
                            EmptyInlineMessage(bookTr(languageCode, "No employees available", "Ni razpoložljivih zaposlenih"), bookTr(languageCode, "This service has no bookable employees.", "Ta storitev nima zaposlenih, ki bi jih bilo mogoče rezervirati."))
                        }
                    } else {
                        items(consultants, key = { it.id }) { consultant ->
                            ConsultantListRow(
                                consultant = consultant,
                                selected = consultant.id == selectedConsultantId,
                                onClick = {
                                    selectedConsultantId = consultant.id
                                    selectedSlotId = null
                                }
                            )
                        }
                    }
                }

                BookingFlowStep.DATE_TIME -> {

                    if (selectedService != null) {
                        item { StraightSectionHeader(bookTr(languageCode, "SELECT DATE", "IZBERI DATUM")) }
                        item {
                            MonthCalendar(
                                selectedMonth = selectedMonth,
                                selectedDate = selectedDate,
                                onMonthChange = { selectedMonth = it },
                                onDateSelected = {
                                    selectedDate = it
                                    selectedMonth = YearMonth.from(it)
                                    selectedSlotId = null
                                },
                                compact = true,
                                languageCode = languageCode,
                                dateAvailability = dateAvailability
                            )
                        }
                        item { StraightSectionHeader(bookTr(languageCode, "SELECT TIME", "IZBERI URO")) }
                        item {
                            if (loadingSlots) {
                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                                    Text(bookTr(languageCode, "Loading available times…", "Nalaganje prostih terminov…"))
                                }
                            } else if (slots.isEmpty()) {
                                if (availabilityLoadError != null) {
                                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                        Text(
                                            availabilityLoadError!!,
                                            style = MaterialTheme.typography.bodyMedium,
                                            color = MaterialTheme.colorScheme.error
                                        )
                                        Text(
                                            bookTr(languageCode, "No slots were loaded. Fix the error above or verify the service and date on the server.", "Termini niso bili naloženi. Popravite zgornjo napako ali preverite storitev in datum na strežniku."),
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                } else {
                                    EmptyInlineMessage(bookTr(languageCode, "No slots available", "Ni prostih terminov"), bookTr(languageCode, "There are no available times on this day.", "Na ta dan ni prostih terminov."))
                                }
                            } else {
                                SingleTimeSelector(
                                    slots = slots,
                                    selectedSlotId = selectedSlotId,
                                    onSelectSlot = { selectedSlotId = it }
                                )
                            }
                        }
                    } else {
                        item {
                            EmptyInlineMessage(
                                availabilityLoadError ?: bookTr(languageCode, "Select a service first", "Najprej izberite storitev"),
                                if (availabilityLoadError != null) bookTr(languageCode, "Please choose another card or contact the provider.", "Izberite drugo karto ali kontaktirajte ponudnika.") else bookTr(languageCode, "Choose a service before selecting date and time.", "Pred izbiro datuma in ure izberite storitev.")
                            )
                        }
                    }
                }

                BookingFlowStep.PAYMENT_REVIEW -> {
                    if (selectedService != null) {
                        item {
                            BookingReviewSummary(
                                languageCode = languageCode,
                                providerName = selectedProvider?.tenantName.orEmpty(),
                                serviceName = selectedService.name,
                                employeeName = if (employeeStepActive) selectedConsultant?.fullName else null,
                                duration = selectedService.durationMinutes?.let { bookTr(languageCode, "$it min", "$it min") },
                                dateTime = selectedSlot?.startsAt?.asSummaryDateTime(languageCode).orEmpty(),
                                total = "",
                                depositText = if (!skipsOnlinePayment && isDepositMode) {
                                    bookTr(languageCode, "Pay now: $depositPercent% (${amountDueNow.formatPrice()} ${selectedService.currency})", "Plačilo zdaj: $depositPercent% (${amountDueNow.formatPrice()} ${selectedService.currency})")
                                } else null
                            )
                        }
                    }

                    if (skipsOnlinePayment && !usesEntitlementPayment) {
                        item {
                            EmptyInlineMessage(
                                title = bookTr(languageCode, "Pay at venue", "Plačilo na lokaciji"),
                                description = bookTr(languageCode, "Payment is collected at the venue. Tap Confirm booking to reserve your slot.", "Plačilo se izvede na lokaciji. Tapnite Potrdi rezervacijo za rezervacijo termina.")
                            )
                        }
                    }
                }
            }
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 20.dp, end = 20.dp, top = 0.dp, bottom = 6.dp)
        ) {
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f))
            Spacer(Modifier.height(4.dp))
            val advanceStep: () -> Unit = {
                val idx = visibleSteps.indexOf(currentStep)
                if (idx >= 0 && idx < visibleSteps.size - 1) {
                    currentStep = visibleSteps[idx + 1]
                }
            }
            when (currentStep) {
                BookingFlowStep.PROVIDER -> ContinueButton(
                    label = bookTr(languageCode, "Continue", "Nadaljuj"),
                    enabled = selectedProvider != null,
                    onClick = advanceStep
                )
                BookingFlowStep.SERVICE -> ContinueButton(
                    label = bookTr(languageCode, "Continue", "Nadaljuj"),
                    enabled = selectedService != null,
                    onClick = advanceStep
                )
                BookingFlowStep.EMPLOYEE -> ContinueButton(
                    label = bookTr(languageCode, "Continue", "Nadaljuj"),
                    enabled = selectedConsultantId != null,
                    onClick = advanceStep
                )
                BookingFlowStep.DATE_TIME -> if (rescheduleContext != null) {
                    ContinueButton(
                        label = bookTr(languageCode, "Confirm reschedule", "Potrdi prestavitev"),
                        enabled = selectedSlot != null && !submitting,
                        loading = submitting,
                        onClick = {
                            val slot = selectedSlot ?: return@ContinueButton
                            val context = rescheduleContext
                            scope.launch {
                                submitting = true
                                runCatching {
                                    val consultantIdForOrder = if (employeeStepActive && !entitlementLaunchMode) selectedConsultantId else null
                                    onReschedule(context, slot.slotId, consultantIdForOrder)
                                }
                                    .onFailure { ex ->
                                        availabilityLoadError = ex.message?.takeIf { it.isNotBlank() }
                                            ?: bookTr(languageCode, "Reschedule failed. Please try again.", "Prestavitev ni uspela. Poskusite znova.")
                                    }
                                submitting = false
                            }
                        }
                    )
                } else {
                    ContinueButton(
                        label = bookTr(languageCode, "Continue", "Nadaljuj"),
                        enabled = selectedSlot != null,
                        onClick = advanceStep
                    )
                }
                BookingFlowStep.PAYMENT_REVIEW -> {
                    if (selectedService != null) {
                        if (showPaymentMethodSummary) {
                            SelectedPaymentMethodCard(
                                method = selectedPaymentMethod,
                                languageCode = languageCode,
                                subtitle = paymentSubtitle(selectedPaymentMethod),
                                onChange = { showPaymentMethodChooserDialog = true }
                            )
                            Spacer(Modifier.height(7.dp))
                        }
                        PaymentTotalRow(languageCode = languageCode, total = "${selectedService.priceGross.formatPrice()} ${selectedService.currency}")
                        Spacer(Modifier.height(5.dp))
                    }
                    ContinueButton(
                        label = bookTr(languageCode, "Confirm booking", "Potrdi rezervacijo"),
                        enabled = selectedService != null && selectedSlot != null && !submitting && (
                            (skipsOnlinePayment && !usesEntitlementPayment) || (
                                selectedPaymentMethod.enabled &&
                                    (selectedPaymentMethod != PaymentMethodUi.ENTITLEMENT || selectedEntitlement != null) &&
                                    (selectedPaymentMethod != PaymentMethodUi.GIFT_CARD || hasGiftCardCoverage)
                                )
                            ),
                        loading = submitting,
                        onClick = {
                            val service = selectedService ?: return@ContinueButton
                            val slot = selectedSlot ?: return@ContinueButton
                            val method = if (usesEntitlementPayment) {
                                PaymentMethodUi.ENTITLEMENT.apiValue ?: "ENTITLEMENT"
                            } else if (skipsOnlinePayment) {
                                "PAY_AT_VENUE"
                            } else {
                                selectedPaymentMethod.apiValue ?: return@ContinueButton
                            }
                            scope.launch {
                                submitting = true
                                val consultantIdForOrder = if (employeeStepActive) selectedConsultantId else null
                                val entitlementIdForOrder = if (selectedPaymentMethod == PaymentMethodUi.ENTITLEMENT) selectedEntitlement?.entitlementId else null
                                runCatching { onCheckout(service, slot.slotId, method, consultantIdForOrder, entitlementIdForOrder) }
                                submitting = false
                            }
                        }
                    )
                }
            }
        }
    }
}
}

@Composable
private fun BookingHeader(
    currentStep: BookingFlowStep,
    languageCode: String,
    visibleSteps: List<BookingFlowStep>,
    skipsOnlinePayment: Boolean,
    canNavigateTo: (BookingFlowStep) -> Boolean,
    onStepSelected: (BookingFlowStep) -> Unit
) {
    Surface(
        color = Color.Transparent,
        tonalElevation = 0.dp,
        shadowElevation = 0.dp,
        modifier = Modifier.fillMaxWidth()
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 10.dp, end = 10.dp, top = 10.dp, bottom = 4.dp),
            contentAlignment = Alignment.Center
        ) {
            BookingStepper(
                currentStep = currentStep,
                languageCode = languageCode,
                visibleSteps = visibleSteps,
                skipsOnlinePayment = skipsOnlinePayment,
                canNavigateTo = canNavigateTo,
                onStepSelected = onStepSelected,
                modifier = Modifier.fillMaxWidth()
            )
        }
    }
}

@Composable
private fun BookingStepper(
    currentStep: BookingFlowStep,
    languageCode: String,
    visibleSteps: List<BookingFlowStep> = BookingFlowStep.ordered,
    skipsOnlinePayment: Boolean = false,
    canNavigateTo: (BookingFlowStep) -> Boolean = { false },
    onStepSelected: (BookingFlowStep) -> Unit = {},
    modifier: Modifier = Modifier
) {
    val steps = visibleSteps
    val stateIndex = steps.indexOf(currentStep)
    val primary = Color(0xFF0F6BFF)
    val inactiveConnector = Color(0xFFD6E1F0)

    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top
    ) {
        steps.forEachIndexed { index, step ->
            val active = step == currentStep
            val completed = index < stateIndex
            val leftActive = index > 0 && index <= stateIndex
            val rightActive = index < steps.lastIndex && index < stateIndex
            val enabled = canNavigateTo(step)

            Column(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(14.dp))
                    .clickable(enabled = enabled) { onStepSelected(step) }
                    .padding(vertical = 3.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(34.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Row(
                        modifier = Modifier.matchParentSize(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .height(2.dp)
                                .background(
                                    when {
                                        index == 0 -> Color.Transparent
                                        leftActive -> primary
                                        else -> inactiveConnector
                                    }
                                )
                        )
                        Spacer(Modifier.width(34.dp))
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .height(2.dp)
                                .background(
                                    when {
                                        index == steps.lastIndex -> Color.Transparent
                                        rightActive -> primary
                                        else -> inactiveConnector
                                    }
                                )
                        )
                    }
                    Surface(
                        modifier = Modifier.size(34.dp),
                        shape = CircleShape,
                        color = if (active || completed) primary else Color(0xFFF7FAFF),
                        border = if (active || completed) null else BorderStroke(1.dp, inactiveConnector),
                        shadowElevation = if (active) 4.dp else 0.dp
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            if (completed) {
                                Icon(
                                    Icons.Rounded.Check,
                                    contentDescription = null,
                                    tint = Color.White,
                                    modifier = Modifier.size(17.dp)
                                )
                            } else {
                                Text(
                                    (index + 1).toString(),
                                    color = if (active) Color.White else Color(0xFF73849A),
                                    style = MaterialTheme.typography.labelLarge,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }
                }
                Spacer(Modifier.height(2.dp))
                Text(
                    step.localizedTitle(languageCode, skipsOnlinePayment),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 1.dp),
                    textAlign = TextAlign.Center,
                    style = MaterialTheme.typography.labelSmall,
                    maxLines = 2,
                    fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
                    color = if (active || completed) primary else Color(0xFF60728A)
                )
            }
        }
    }
}

private fun bookingBackgroundRes(step: BookingFlowStep): Int = when (step) {
    BookingFlowStep.PROVIDER -> R.drawable.book_step_provider_background
    BookingFlowStep.SERVICE -> R.drawable.book_step_service_background
    BookingFlowStep.EMPLOYEE -> R.drawable.book_step_employee_background
    BookingFlowStep.DATE_TIME -> R.drawable.book_step_date_time_background
    BookingFlowStep.PAYMENT_REVIEW -> R.drawable.book_step_payment_review_background
}

@Composable
private fun BookingBackgroundDecor() {

    val primary = Color(0xFF0F6BFF)
    val orange = Color(0xFFFF8A00)
    Box(Modifier.fillMaxSize()) {
        Box(
            modifier = Modifier
                .align(Alignment.TopStart)
                .offset(x = (-88).dp, y = (-76).dp)
                .size(220.dp)
                .clip(CircleShape)
                .background(primary.copy(alpha = 0.055f))
        )
        Box(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .offset(x = 72.dp, y = 260.dp)
                .size(172.dp)
                .clip(CircleShape)
                .background(primary.copy(alpha = 0.055f))
        )
        Box(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .offset(x = (-110).dp, y = 64.dp)
                .size(230.dp)
                .clip(CircleShape)
                .background(orange.copy(alpha = 0.06f))
        )
        Box(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .offset(x = 72.dp, y = 72.dp)
                .size(190.dp)
                .clip(CircleShape)
                .background(primary.copy(alpha = 0.05f))
        )
    }
}

@Composable
private fun BookIntroHeader(
    title: String,
    subtitle: String,
    icon: ImageVector,
    accentIcon: ImageVector
) {
    Spacer(modifier = Modifier.height(0.dp))
}

@Composable
private fun StraightSectionHeader(title: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text(
            title,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.6.sp,
            color = Color(0xFF60728A)
        )
        Box(
            modifier = Modifier
                .width(24.dp)
                .height(3.dp)
                .clip(RoundedCornerShape(4.dp))
                .background(Color(0xFFFF8A00).copy(alpha = 0.9f))
        )
    }
}

@Composable
private fun EmptyInlineMessage(title: String, description: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
        Text(description, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        HorizontalDivider(modifier = Modifier.padding(top = 12.dp), color = MaterialTheme.colorScheme.outline)
    }
}

@Composable
private fun SquareBookIcon(icon: ImageVector, selected: Boolean = true) {
    Box(
        modifier = Modifier
            .size(60.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(
                if (selected) {
                    Brush.verticalGradient(listOf(Color(0xFF0F6BFF), Color(0xFF0B57D0)))
                } else {
                    Brush.verticalGradient(listOf(Color(0xFFEAF3FF), Color(0xFFDDEBFF)))
                }
            ),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            icon,
            contentDescription = null,
            modifier = Modifier.size(30.dp),
            tint = if (selected) Color.White else Color(0xFF0F6BFF)
        )
    }
}

@Composable
private fun SelectionRail(selected: Boolean) {
    Box(
        modifier = Modifier
            .width(4.dp)
            .height(74.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(if (selected) Color(0xFF0F6BFF) else Color.Transparent)
    )
}

@Composable
private fun ProviderListRow(provider: ProviderOption, languageCode: String, selected: Boolean, onClick: () -> Unit) {
    ElevatedCard(
        onClick = onClick,
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.elevatedCardColors(containerColor = Color.White),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 4.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            SelectionRail(selected)
            Spacer(Modifier.width(12.dp))
            SquareBookIcon(Icons.Rounded.FitnessCenter, selected = selected)
            Spacer(Modifier.width(16.dp))
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(provider.tenantName, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = Color(0xFF082143))
                Text(provider.tenantAddress ?: bookTr(languageCode, "Subscribed organization", "Povezana organizacija"), style = MaterialTheme.typography.bodyMedium, color = Color(0xFF60728A))
            }
            Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, contentDescription = null, modifier = Modifier.size(28.dp), tint = Color(0xFF8A99AD))
        }
    }
}

@Composable
private fun ServiceListRow(service: ServiceOption, languageCode: String, selected: Boolean, onClick: () -> Unit) {
    ElevatedCard(
        onClick = onClick,
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.elevatedCardColors(containerColor = Color.White),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 4.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            SelectionRail(selected)
            Spacer(Modifier.width(12.dp))
            SquareBookIcon(Icons.Rounded.FitnessCenter, selected = selected)
            Spacer(Modifier.width(16.dp))
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(service.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = Color(0xFF082143))
                Text(
                    service.description?.takeIf { it.isNotBlank() } ?: bookTr(languageCode, "Bookable service", "Storitev za rezervacijo"),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color(0xFF60728A)
                )
                Row(horizontalArrangement = Arrangement.spacedBy(7.dp), verticalAlignment = Alignment.CenterVertically) {
                    TagPillCompact(service.tenantName)
                    service.durationMinutes?.let { TagPillCompact(bookTr(languageCode, "$it min", "$it min")) }
                }
            }
            Text(
                "${service.priceGross.formatPrice()} ${service.currency}",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.ExtraBold,
                color = Color(0xFF0F6BFF)
            )
        }
    }
}

@Composable
private fun ConsultantListRow(consultant: ConsultantOption, selected: Boolean, onClick: () -> Unit) {
    ElevatedCard(
        onClick = onClick,
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.elevatedCardColors(containerColor = Color.White),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 4.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            SelectionRail(selected)
            Spacer(Modifier.width(12.dp))
            SquareBookIcon(Icons.Rounded.Assignment, selected = selected)
            Spacer(Modifier.width(16.dp))
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(consultant.fullName, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = Color(0xFF082143))
                consultant.email?.takeIf { it.isNotBlank() }?.let {
                    Text(it, style = MaterialTheme.typography.bodyMedium, color = Color(0xFF60728A))
                }
            }
            Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, contentDescription = null, modifier = Modifier.size(28.dp), tint = Color(0xFF8A99AD))
        }
    }
}

@Composable
private fun SelectedPaymentMethodCard(
    method: PaymentMethodUi,
    languageCode: String,
    subtitle: String?,
    onChange: () -> Unit
) {
    ElevatedCard(
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.elevatedCardColors(containerColor = Color.White),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 3.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 9.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Text(
                bookTr(languageCode, "PAYMENT METHOD", "NAČIN PLAČILA"),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.0.sp,
                color = Color(0xFF60728A)
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(9.dp)
            ) {
                SelectIndicator(selected = true, enabled = true, size = 20.dp)
                Icon(paymentMethodIcon(method), contentDescription = null, modifier = Modifier.size(22.dp), tint = Color(0xFF0F6BFF))
                Text(method.localizedTitle(languageCode), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = Color(0xFF082143), modifier = Modifier.weight(1f))
                TextButton(onClick = onChange, contentPadding = PaddingValues(horizontal = 6.dp, vertical = 0.dp)) {
                    Text(bookTr(languageCode, "Change", "Spremeni"), color = Color(0xFF0F6BFF), fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodySmall)
                }
            }
            subtitle?.takeIf { it.isNotBlank() }?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.bodySmall,
                    color = Color(0xFF60728A),
                    modifier = Modifier.padding(start = 51.dp, end = 8.dp)
                )
            }
        }
    }
}

private fun paymentMethodIcon(method: PaymentMethodUi): ImageVector = when (method) {
    PaymentMethodUi.CARD -> Icons.Rounded.CreditCard
    PaymentMethodUi.BANK_TRANSFER -> Icons.Rounded.AccountBalance
    PaymentMethodUi.ENTITLEMENT -> Icons.Rounded.EventAvailable
    PaymentMethodUi.GIFT_CARD -> Icons.Rounded.ReceiptLong
    PaymentMethodUi.PAYPAL -> Icons.Rounded.CreditCard
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun EntitlementChooserSheet(
    entitlements: List<RedeemableEntitlementOption>,
    languageCode: String,
    selectedEntitlementId: String?,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var pendingSelection by remember(entitlements, selectedEntitlementId) {
        mutableStateOf(selectedEntitlementId ?: entitlements.firstOrNull()?.entitlementId)
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        dragHandle = {
            Box(
                modifier = Modifier
                    .padding(top = 12.dp, bottom = 4.dp)
                    .size(width = 46.dp, height = 5.dp)
                    .clip(RoundedCornerShape(100.dp))
                    .background(Color(0xFFD2D8E2))
            )
        },
        containerColor = Color(0xFFFDFBFF),
        shape = RoundedCornerShape(topStart = 30.dp, topEnd = 30.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 24.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    bookTr(languageCode, "Choose benefit", "Izberi ugodnost"),
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.ExtraBold,
                    color = Color(0xFF082143)
                )
                Text(
                    bookTr(languageCode, "Available passes and visits for this appointment", "Razpoložljive karte in obiski za ta termin"),
                    style = MaterialTheme.typography.bodyLarge,
                    color = Color(0xFF60728A)
                )
            }

            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                entitlements.forEach { entitlement ->
                    EntitlementChooserRow(
                        entitlement = entitlement,
                        languageCode = languageCode,
                        selected = entitlement.entitlementId == pendingSelection,
                        onClick = { pendingSelection = entitlement.entitlementId }
                    )
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(Color(0xFFEAF3FF))
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Surface(shape = CircleShape, color = Color.White.copy(alpha = 0.88f), modifier = Modifier.size(28.dp)) {
                    Box(contentAlignment = Alignment.Center) {
                        Text("i", color = Color(0xFF60728A), fontWeight = FontWeight.Bold)
                    }
                }
                Text(
                    bookTr(languageCode, "Using a pass will reduce the remaining visits.", "Uporaba karte bo zmanjšala število preostalih obiskov."),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color(0xFF60728A),
                    modifier = Modifier.weight(1f)
                )
            }

            Button(
                onClick = { pendingSelection?.let(onConfirm) },
                enabled = pendingSelection != null,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0F6BFF)),
                shape = RoundedCornerShape(20.dp),
                contentPadding = PaddingValues(vertical = 15.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    bookTr(languageCode, "Use", "Uporabi"),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
            }

            TextButton(
                onClick = onDismiss,
                modifier = Modifier.fillMaxWidth(),
                contentPadding = PaddingValues(vertical = 4.dp)
            ) {
                Text(
                    bookTr(languageCode, "Close", "Zapri"),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF0F6BFF)
                )
            }
        }
    }
}

@Composable
private fun EntitlementChooserRow(
    entitlement: RedeemableEntitlementOption,
    languageCode: String,
    selected: Boolean,
    onClick: () -> Unit
) {
    val borderColor = if (selected) Color(0xFF0F6BFF) else Color(0xFFE0E5EF)
    val backgroundColor = if (selected) Color(0xFFF3F8FF) else Color.White
    OutlinedCard(
        onClick = onClick,
        shape = RoundedCornerShape(20.dp),
        border = BorderStroke(if (selected) 1.6.dp else 1.dp, borderColor),
        colors = CardDefaults.outlinedCardColors(containerColor = backgroundColor),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 13.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(52.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(Color(0xFFEAF3FF)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    entitlementIcon(entitlement.entitlementType),
                    contentDescription = null,
                    modifier = Modifier.size(30.dp),
                    tint = Color(0xFF0F6BFF)
                )
            }

            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(
                    entitlement.productName,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.ExtraBold,
                    color = Color(0xFF082143)
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(7.dp)
                ) {
                    Text(
                        entitlementRemainingLabel(entitlement, languageCode),
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color(0xFF0F6BFF),
                        fontWeight = FontWeight.SemiBold
                    )
                    entitlement.validUntil?.takeIf { it.isNotBlank() }?.let { validUntil ->
                        Text("•", color = Color(0xFF8A99AD), style = MaterialTheme.typography.bodyMedium)
                        Icon(Icons.Rounded.CalendarMonth, contentDescription = null, modifier = Modifier.size(16.dp), tint = Color(0xFF60728A))
                        Text(
                            bookTr(languageCode, "Valid until ${formatEntitlementDate(validUntil, languageCode)}", "Velja do ${formatEntitlementDate(validUntil, languageCode)}"),
                            style = MaterialTheme.typography.bodyMedium,
                            color = Color(0xFF60728A)
                        )
                    }
                }
                Text(
                    entitlementTypeCaption(entitlement.entitlementType, languageCode),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color(0xFF60728A)
                )
            }

            SelectIndicator(selected = selected, enabled = true, size = 34.dp)
        }
    }
}

private fun entitlementIcon(type: String): ImageVector = when (type.uppercase(Locale.ROOT)) {
    "PACK", "TICKET", "CLASS_TICKET" -> Icons.Rounded.ReceiptLong
    "MEMBERSHIP" -> Icons.Rounded.Security
    else -> Icons.Rounded.EventAvailable
}

private fun entitlementTypeCaption(type: String, languageCode: String): String = when (type.uppercase(Locale.ROOT)) {
    "PACK" -> bookTr(languageCode, "Pack", "Karta")
    "TICKET", "CLASS_TICKET" -> bookTr(languageCode, "Ticket", "Obisk")
    "MEMBERSHIP" -> bookTr(languageCode, "Active membership", "Aktivna članarina")
    else -> bookTr(languageCode, "Valid for this service", "Velja za storitev")
}

private fun entitlementRemainingLabel(entitlement: RedeemableEntitlementOption, languageCode: String): String {
    val remaining = entitlement.remainingUses
    return if (remaining == null) {
        bookTr(languageCode, "Unlimited", "Neomejeno")
    } else if (remaining == 1) {
        bookTr(languageCode, "1 left", "1 preostalo")
    } else {
        bookTr(languageCode, "$remaining left", "$remaining preostali")
    }
}

private fun formatEntitlementDate(value: String, languageCode: String): String {
    return runCatching {
        val date = LocalDate.parse(value.take(10))
        val pattern = if (bookIsSl(languageCode)) "d. M. yyyy" else "MMM d, yyyy"
        date.format(DateTimeFormatter.ofPattern(pattern, bookLocale(languageCode)))
    }.getOrElse { value.take(10) }
}

@Composable
private fun PaymentMethodChooserDialog(
    methods: List<PaymentMethodUi>,
    languageCode: String,
    selectedMethod: PaymentMethodUi,
    subtitleFor: (PaymentMethodUi) -> String?,
    onDismiss: () -> Unit,
    onSelect: (PaymentMethodUi) -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(bookTr(languageCode, "Payment method", "Način plačila")) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                methods.forEach { method ->
                    OutlinedCard(
                        onClick = { onSelect(method) },
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.outlinedCardColors(
                            containerColor = if (method == selectedMethod) Color(0xFFEAF2FF) else Color.White
                        )
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Icon(paymentMethodIcon(method), contentDescription = null, modifier = Modifier.size(24.dp), tint = Color(0xFF0F6BFF))
                            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(method.localizedTitle(languageCode), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = Color(0xFF082143))
                                subtitleFor(method)?.takeIf { it.isNotBlank() }?.let {
                                    Text(it, style = MaterialTheme.typography.bodySmall, color = Color(0xFF60728A), maxLines = 2)
                                }
                            }
                            if (method == selectedMethod) {
                                Icon(Icons.Rounded.TaskAlt, contentDescription = null, tint = Color(0xFF0F6BFF))
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text(bookTr(languageCode, "Done", "Končano")) }
        }
    )
}

@Composable
private fun PaymentMethodLine(
    label: String,
    subtitle: String?,
    selected: Boolean,
    enabled: Boolean,
    icon: ImageVector,
    trailing: (@Composable () -> Unit)? = null,
    onChevron: (() -> Unit)? = null,
    onSelect: () -> Unit
) {
    ElevatedCard(
        onClick = onSelect,
        enabled = enabled,
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.elevatedCardColors(containerColor = Color.White),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 3.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            SelectIndicator(selected = selected, enabled = enabled, size = 24.dp)
            SquareBookIcon(icon, selected = selected)
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    label,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = if (enabled) Color(0xFF082143) else Color(0xFF8A99AD)
                )
                subtitle?.takeIf { it.isNotBlank() }?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = Color(0xFF60728A))
                }
            }
            trailing?.invoke()
            IconButton(onClick = onChevron ?: onSelect, enabled = enabled, modifier = Modifier.size(34.dp)) {
                Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, contentDescription = null, tint = Color(0xFF8A99AD))
            }
        }
    }
}

@Composable
private fun BookingReviewSummary(
    languageCode: String,
    providerName: String,
    serviceName: String,
    employeeName: String?,
    duration: String?,
    dateTime: String,
    total: String,
    depositText: String? = null
) {
    ElevatedCard(
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.elevatedCardColors(containerColor = Color.White),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 4.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(0.dp)) {
            Text(
                bookTr(languageCode, "BOOKING SUMMARY", "POVZETEK REZERVACIJE"),
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.2.sp,
                color = Color(0xFF60728A)
            )
            Spacer(Modifier.height(6.dp))
            ReviewSummaryLine(icon = Icons.Rounded.LocationOn, label = bookTr(languageCode, "Provider", "Ponudnik"), value = providerName)
            ReviewSummaryLine(icon = Icons.Rounded.FitnessCenter, label = bookTr(languageCode, "Service", "Storitev"), value = serviceName)
            employeeName?.takeIf { it.isNotBlank() }?.let { ReviewSummaryLine(icon = Icons.Rounded.Assignment, label = bookTr(languageCode, "Employee", "Zaposleni"), value = it) }
            duration?.takeIf { it.isNotBlank() }?.let { ReviewSummaryLine(icon = Icons.Rounded.EventAvailable, label = bookTr(languageCode, "Duration", "Trajanje"), value = it) }
            ReviewSummaryLine(icon = Icons.Rounded.CalendarMonth, label = bookTr(languageCode, "Date & time", "Datum in ura"), value = dateTime)
            depositText?.let { ReviewSummaryLine(icon = Icons.Rounded.CreditCard, label = bookTr(languageCode, "Deposit", "Predplačilo"), value = it) }
        }
    }
}

@Composable
private fun PaymentTotalRow(languageCode: String, total: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            bookTr(languageCode, "TOTAL", "SKUPAJ"),
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Bold,
            color = Color(0xFF60728A),
            modifier = Modifier.weight(1f)
        )
        Text(
            total,
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.ExtraBold,
            color = Color(0xFF082143)
        )
    }
}

@Composable
private fun ReviewSummaryLine(icon: ImageVector, label: String, value: String) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(42.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(20.dp), tint = Color(0xFF0F6BFF))
            Spacer(Modifier.width(12.dp))
            Text(label, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = Color(0xFF082143), modifier = Modifier.weight(1f))
            Text(value, style = MaterialTheme.typography.bodyMedium, color = Color(0xFF60728A), textAlign = TextAlign.End)
        }
        HorizontalDivider(color = Color(0xFFE3EBF6))
    }
}

/** Same footprint as provider/service rows: compact card, 26dp indicator, optional chevron. */
@Composable
private fun PaymentMethodCard(
    label: String,
    subtitle: String?,
    selected: Boolean,
    enabled: Boolean = true,
    onSelect: () -> Unit,
    trailing: (@Composable () -> Unit)? = null,
    onManageChevron: (() -> Unit)? = null
) {
    ElevatedCard(
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 11.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(12.dp))
                    .clickable(enabled = enabled, onClick = onSelect),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                SelectIndicator(selected = selected, enabled = enabled, size = 26.dp)
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                    Text(
                        label,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = if (enabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.65f)
                    )
                    subtitle?.let {
                        Text(
                            it,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
            trailing?.invoke()
            if (onManageChevron != null) {
                IconButton(
                    onClick = onManageChevron,
                    enabled = enabled,
                    modifier = Modifier.size(40.dp)
                ) {
                    Icon(
                        Icons.AutoMirrored.Rounded.KeyboardArrowRight,
                        contentDescription = "Manage cards",
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}


@Composable
private fun MonthCalendar(
    selectedMonth: YearMonth,
    selectedDate: LocalDate,
    onMonthChange: (YearMonth) -> Unit,
    onDateSelected: (LocalDate) -> Unit,
    compact: Boolean = false,
    languageCode: String = "en",
    dateAvailability: Map<LocalDate, Boolean> = emptyMap()
) {
    val today = remember { LocalDate.now() }
    val firstDay = selectedMonth.atDay(1)
    val daysInMonth = selectedMonth.lengthOfMonth()
    val firstWeekOffset = (firstDay.dayOfWeek.value + 6) % 7
    val cells = buildList<LocalDate?> {
        repeat(firstWeekOffset) { add(null) }
        for (day in 1..daysInMonth) add(selectedMonth.atDay(day))
        while (size % 7 != 0) add(null)
    }
    val calendarLocale = remember(languageCode) { bookLocale(languageCode) }
    val shortMonthFmt = remember(calendarLocale) { DateTimeFormatter.ofPattern("MMMM", calendarLocale) }
    val dayHeaders = remember { listOf(DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY, DayOfWeek.SUNDAY) }

    ElevatedCard(
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.elevatedCardColors(containerColor = Color.White),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 4.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = if (compact) 12.dp else 14.dp),
            verticalArrangement = Arrangement.spacedBy(if (compact) 8.dp else 10.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(12.dp))
                        .clickable { onMonthChange(selectedMonth.minusMonths(1)) }
                        .padding(horizontal = 4.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    Icon(Icons.AutoMirrored.Rounded.KeyboardArrowLeft, contentDescription = bookTr(languageCode, "Previous month", "Prejšnji mesec"), modifier = Modifier.size(18.dp), tint = Color(0xFF60728A))
                    Text(selectedMonth.minusMonths(1).format(shortMonthFmt), style = MaterialTheme.typography.bodyMedium, color = Color(0xFF60728A))
                }
                Text(
                    selectedMonth.format(DateTimeFormatter.ofPattern("MMMM yyyy", calendarLocale)),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.ExtraBold,
                    color = Color(0xFF082143)
                )
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(12.dp))
                        .clickable { onMonthChange(selectedMonth.plusMonths(1)) }
                        .padding(horizontal = 4.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    Text(selectedMonth.plusMonths(1).format(shortMonthFmt), style = MaterialTheme.typography.bodyMedium, color = Color(0xFF60728A))
                    Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, contentDescription = bookTr(languageCode, "Next month", "Naslednji mesec"), modifier = Modifier.size(18.dp), tint = Color(0xFF60728A))
                }
            }

            Row(modifier = Modifier.fillMaxWidth()) {
                dayHeaders.forEach { headerDay ->
                    Text(
                        headerDay.getDisplayName(TextStyle.SHORT, calendarLocale).uppercase(calendarLocale),
                        modifier = Modifier.weight(1f),
                        textAlign = TextAlign.Center,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF60728A)
                    )
                }
            }

            cells.chunked(7).forEach { week ->
                Row(modifier = Modifier.fillMaxWidth()) {
                    week.forEach { date ->
                        val hasAvailableSlots = date?.let { dateAvailability[it] } != false
                        CalendarDateCell(
                            date = date,
                            isSelected = date == selectedDate,
                            isEnabled = date != null && !date.isBefore(today) && hasAvailableSlots,
                            compact = compact,
                            onClick = { if (date != null && !date.isBefore(today) && hasAvailableSlots) onDateSelected(date) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun RowScope.CalendarDateCell(
    date: LocalDate?,
    isSelected: Boolean,
    isEnabled: Boolean,
    compact: Boolean,
    onClick: () -> Unit
) {
    val cellSize = if (compact) 30.dp else 42.dp
    Box(
        modifier = Modifier
            .weight(1f)
            .height(if (compact) 32.dp else 46.dp),
        contentAlignment = Alignment.Center
    ) {
        if (date == null) {
            Spacer(Modifier.size(cellSize))
        } else {
            Surface(
                modifier = Modifier
                    .size(cellSize)
                    .clickable(enabled = isEnabled, onClick = onClick),
                shape = CircleShape,
                color = if (isSelected && isEnabled) Color(0xFF0F6BFF) else Color.Transparent
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(
                        date.dayOfMonth.toString(),
                        color = when {
                            isSelected && isEnabled -> Color.White
                            isEnabled -> Color(0xFF082143)
                            else -> Color(0xFF9CA9B8).copy(alpha = 0.55f)
                        },
                        fontSize = if (compact) 14.sp else 16.sp,
                        lineHeight = if (compact) 16.sp else 18.sp,
                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                        textAlign = TextAlign.Center
                    )
                }
            }
        }
    }
}

@Composable
private fun SingleTimeSelector(
    slots: List<AvailabilitySlot>,
    selectedSlotId: String?,
    onSelectSlot: (String) -> Unit
) {
    if (slots.isEmpty()) return

    LaunchedEffect(slots, selectedSlotId) {
        if (selectedSlotId == null || slots.none { it.slotId == selectedSlotId }) {
            onSelectSlot(slots.first().slotId)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp),
        verticalArrangement = Arrangement.spacedBy(9.dp)
    ) {
        slots.chunked(4).forEach { rowSlots ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(7.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                repeat(4) { index ->
                    if (index < rowSlots.size) {
                        val slot = rowSlots[index]
                        TimeChip(
                            time = slot.startsAt.asSlotTime(),
                            selected = slot.slotId == selectedSlotId,
                            onClick = { onSelectSlot(slot.slotId) },
                            modifier = Modifier.weight(1f)
                        )
                    } else {
                        Spacer(
                            modifier = Modifier
                                .weight(1f)
                                .height(42.dp)
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun TimeChip(
    time: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier.clickable(onClick = onClick),
        shape = RoundedCornerShape(13.dp),
        color = if (selected) Color(0xFF0F6BFF) else Color.White,
        border = if (selected) null else BorderStroke(1.dp, Color(0xFFDCE7F5)),
        shadowElevation = if (selected) 4.dp else 2.dp
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(42.dp),
            contentAlignment = Alignment.Center
        ) {
            Text(
                time,
                color = if (selected) Color.White else Color(0xFF0F6BFF),
                fontSize = 16.sp,
                lineHeight = 18.sp,
                fontWeight = FontWeight.Bold
            )
        }
    }
}

@Composable
private fun CardBrandBadges() {
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
        BrandPill("VISA")
        BrandPill("MC")
    }
}

@Composable
private fun BrandPill(text: String) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(2.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(horizontal = 8.dp, vertical = 4.dp)
    ) {
        Text(
            text,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun SummaryHeader(total: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            bookTr("en", "Booking summary", "Povzetek rezervacije"),
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            total,
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold
        )
    }
}

@Composable
private fun ContinueButton(label: String, enabled: Boolean, loading: Boolean = false, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp),
        enabled = enabled && !loading,
        shape = RoundedCornerShape(18.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = if (enabled) Color(0xFF0F6BFF) else Color(0xFF0F6BFF).copy(alpha = 0.42f),
            contentColor = Color.White,
            disabledContainerColor = Color(0xFF0F6BFF).copy(alpha = 0.42f),
            disabledContentColor = Color.White
        ),
        contentPadding = PaddingValues(horizontal = 22.dp)
    ) {
        if (loading) {
            CircularProgressIndicator(
                modifier = Modifier.size(18.dp),
                strokeWidth = 2.dp,
                color = Color.White
            )
        } else {
            Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                Text(label, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Icon(
                    Icons.AutoMirrored.Rounded.KeyboardArrowRight,
                    contentDescription = null,
                    modifier = Modifier.align(Alignment.CenterEnd).size(26.dp),
                    tint = Color.White
                )
            }
        }
    }
}

@Composable
private fun SelectIndicator(selected: Boolean, enabled: Boolean = true, size: Dp = 34.dp) {
    val iconSize = size * 0.53f
    Surface(
        modifier = Modifier.size(size),
        shape = CircleShape,
        color = when {
            selected -> Color(0xFF0F6BFF)
            else -> Color.Transparent
        },
        tonalElevation = if (selected) 0.dp else 0.dp
    ) {
        Box(contentAlignment = Alignment.Center) {
            when {
                selected -> Icon(Icons.Rounded.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(iconSize))
                enabled -> Icon(Icons.Rounded.RadioButtonUnchecked, contentDescription = null, tint = MaterialTheme.colorScheme.outline, modifier = Modifier.size(iconSize))
                else -> Icon(Icons.Rounded.RadioButtonUnchecked, contentDescription = null, tint = MaterialTheme.colorScheme.outlineVariant, modifier = Modifier.size(iconSize))
            }
        }
    }
}

@Composable
private fun PriceChip(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelLarge,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier
            .clip(RoundedCornerShape(2.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(horizontal = 14.dp, vertical = 8.dp)
    )
}

@Composable
private fun PriceChipCompact(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelMedium,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier
            .clip(RoundedCornerShape(10.dp))
            .background(Color(0xFFF1F6FF))
            .padding(horizontal = 10.dp, vertical = 6.dp)
    )
}

@Composable
private fun TagPill(text: String) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(2.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(horizontal = 12.dp, vertical = 7.dp)
    ) {
        Text(text, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun TagPillCompact(text: String) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(10.dp))
            .background(Color(0xFFF1F6FF))
            .padding(horizontal = 10.dp, vertical = 5.dp)
    ) {
        Text(text, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

private fun Double.formatPrice(): String =
    if (this % 1.0 == 0.0) this.toInt().toString() else String.format(Locale.US, "%.2f", this)

private fun String.asSlotTime(): String = runCatching {
    OffsetDateTime.parse(this)
        .atZoneSameInstant(ZoneId.systemDefault())
        .format(DateTimeFormatter.ofPattern("HH:mm"))
}.getOrElse {
    runCatching {
        LocalDateTime.parse(this@asSlotTime)
            .atZone(ZoneId.systemDefault())
            .format(DateTimeFormatter.ofPattern("HH:mm"))
    }.getOrElse { this@asSlotTime }
}

private fun String.asSummaryDateTime(languageCode: String): String = runCatching {
    OffsetDateTime.parse(this)
        .atZoneSameInstant(ZoneId.systemDefault())
        .format(DateTimeFormatter.ofPattern(if (bookIsSl(languageCode)) "EEEE, d MMMM 'ob' HH:mm" else "EEEE, d MMMM 'at' HH:mm", bookLocale(languageCode)))
}.getOrElse {
    runCatching {
        LocalDateTime.parse(this@asSummaryDateTime)
            .atZone(ZoneId.systemDefault())
            .format(DateTimeFormatter.ofPattern(if (bookIsSl(languageCode)) "EEEE, d MMMM 'ob' HH:mm" else "EEEE, d MMMM 'at' HH:mm", bookLocale(languageCode)))
    }.getOrElse { this@asSummaryDateTime }
}
