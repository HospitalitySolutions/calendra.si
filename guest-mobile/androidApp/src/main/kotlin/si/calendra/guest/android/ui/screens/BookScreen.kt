package si.calendra.guest.android.ui.screens

import android.util.Log
import androidx.activity.compose.BackHandler
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
import androidx.compose.material.icons.rounded.Add
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
import androidx.compose.material.icons.rounded.DeleteOutline
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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import si.calendra.guest.android.BuildConfig
import si.calendra.guest.android.ui.PaymentCardBrand
import si.calendra.guest.android.ui.PaymentCardBrandMark
import si.calendra.guest.android.ui.SavedCardUi
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


data class ProviderOption(
    val companyId: String,
    val tenantName: String,
    val tenantAddress: String?,
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

private const val GUEST_AVAILABILITY_DEBUG_TAG = "GuestAvailability"

private enum class PaymentMethodUi(
    val title: String,
    val apiValue: String?,
    val enabled: Boolean,
    val helper: String? = null
) {
    CARD("Credit Card", "CARD", true),
    BANK_TRANSFER("Bank Transfer", "BANK_TRANSFER", true),
    ENTITLEMENT("Use pass or visit", "ENTITLEMENT", true),
    GIFT_CARD("Gift card", "GIFT_CARD", true, "Use your gift card balance"),
    PAYPAL("PayPal", "PAYPAL", true, "Pay securely with PayPal")
}

@Composable
fun BookScreen(
    modifier: Modifier = Modifier,
    providers: List<ProviderOption>,
    services: List<ServiceOption>,
    savedCards: List<SavedCardUi> = emptyList(),
    redeemableEntitlements: List<RedeemableEntitlementOption> = emptyList(),
    onSaveCard: (SavedCardUi) -> Unit = {},
    onRemoveSavedCard: (String) -> Unit = {},
    onOpenNotifications: () -> Unit,
    onLoadAvailability: suspend (ServiceOption, LocalDate, String?) -> List<AvailabilitySlot>,
    onLoadConsultants: suspend (ServiceOption) -> List<ConsultantOption> = { _ -> emptyList() },
    employeeSelectionStepEnabled: (String) -> Boolean = { false },
    onCheckout: suspend (ServiceOption, String, String, String?) -> Unit,
    rescheduleContext: BookingRescheduleContext? = null,
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
    var selectedSlotId by remember { mutableStateOf<String?>(null) }
    var selectedPaymentMethod by remember { mutableStateOf(PaymentMethodUi.CARD) }
    var selectedSavedCardId by remember { mutableStateOf<String?>(savedCards.firstOrNull()?.id) }
    var loadingSlots by remember { mutableStateOf(false) }
    var availabilityLoadError by remember { mutableStateOf<String?>(null) }
    var submitting by remember { mutableStateOf(false) }
    var showAddCardDialog by remember { mutableStateOf(false) }
    var showCardChooserDialog by remember { mutableStateOf(false) }

    val employeeStepActive = selectedProviderId?.let(employeeSelectionStepEnabled) == true
    val visibleSteps = if (rescheduleContext == null) {
        visibleBookingSteps(employeeStepActive)
    } else {
        if (employeeStepActive) {
            listOf(BookingFlowStep.EMPLOYEE, BookingFlowStep.DATE_TIME)
        } else {
            listOf(BookingFlowStep.DATE_TIME)
        }
    }
    var rescheduleInitialized by remember(rescheduleContext?.bookingId) { mutableStateOf(false) }

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

    LaunchedEffect(savedCards) {
        if (savedCards.isEmpty()) {
            selectedSavedCardId = null
        } else if (savedCards.none { it.id == selectedSavedCardId }) {
            selectedSavedCardId = savedCards.first().id
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

    val selectedProvider = providers.firstOrNull { it.companyId == selectedProviderId }
    val skipsOnlinePayment = selectedProvider?.requireOnlinePayment == false
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
        if (method == PaymentMethodUi.ENTITLEMENT) return true
        val apiValue = method.apiValue ?: return true
        if (acceptedPaymentApiValues.isEmpty()) return true
        return acceptedPaymentApiValues.contains(apiValue)
    }
    val selectedSlot = slots.firstOrNull { it.slotId == selectedSlotId }
    val matchingEntitlements = redeemableEntitlements.filter { entitlement ->
        selectedService != null && entitlement.companyId == selectedService.companyId
                && !entitlement.entitlementType.equals("GIFT_CARD", ignoreCase = true)
                && (entitlement.sessionTypeId.isNullOrBlank() || entitlement.sessionTypeId == selectedService.sessionTypeId)
    }
    val matchingGiftCards = redeemableEntitlements.filter { entitlement ->
        selectedService != null && entitlement.companyId == selectedService.companyId
                && entitlement.entitlementType.equals("GIFT_CARD", ignoreCase = true)
                && ((entitlement.remainingValueGross ?: 0.0) > 0.0)
                && (entitlement.currency.isNullOrBlank() || entitlement.currency.equals(selectedService.currency, ignoreCase = true))
    }.sortedBy { it.remainingValueGross ?: 0.0 }
    val matchingGiftCardsTotal = matchingGiftCards.sumOf { it.remainingValueGross ?: 0.0 }
    val hasGiftCardCoverage = selectedService != null && matchingGiftCardsTotal + 0.0001 >= amountDueNow

    fun moveBackStep(): Boolean {
        val idx = visibleSteps.indexOf(currentStep)
        if (idx > 0) {
            currentStep = visibleSteps[idx - 1]
            return true
        }
        return false
    }

    BackHandler(enabled = currentStep != BookingFlowStep.PROVIDER || rescheduleContext != null) {
        if (!moveBackStep()) onExit()
    }

    fun refreshSlots() {
        val service = selectedService ?: return
        scope.launch {
            loadingSlots = true
            selectedSlotId = null
            availabilityLoadError = null
            val consultantIdForLoad = if (employeeStepActive) selectedConsultantId else null
            runCatching { onLoadAvailability(service, selectedDate, consultantIdForLoad) }
                .onSuccess { list ->
                    slots = list
                    if (BuildConfig.DEBUG) {
                        Log.i(
                            GUEST_AVAILABILITY_DEBUG_TAG,
                            "GET /api/guest/availability companyId=${service.companyId} sessionTypeId=${service.sessionTypeId} date=$selectedDate → slots=${list.size}"
                        )
                    }
                }
                .onFailure { ex ->
                    slots = emptyList()
                    availabilityLoadError = ex.message?.takeIf { it.isNotBlank() }
                        ?: "Could not load availability. Check API base URL and backend."
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

    LaunchedEffect(selectedService?.id, matchingEntitlements.size, matchingGiftCards.size, hasGiftCardCoverage, acceptedPaymentApiValues) {
        if (selectedPaymentMethod == PaymentMethodUi.ENTITLEMENT && matchingEntitlements.isEmpty()) {
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

    if (showAddCardDialog) {
        AddCardDialog(
            onDismiss = { showAddCardDialog = false },
            onSave = { card ->
                onSaveCard(card)
                selectedSavedCardId = card.id
                selectedPaymentMethod = PaymentMethodUi.CARD
                showAddCardDialog = false
            }
        )
    }

    if (showCardChooserDialog) {
        CardChooserDialog(
            cards = savedCards,
            selectedCardId = selectedSavedCardId,
            onDismiss = { showCardChooserDialog = false },
            onSelect = {
                selectedSavedCardId = it
                showCardChooserDialog = false
            },
            onRemove = { id -> onRemoveSavedCard(id) },
            onAddNew = {
                showCardChooserDialog = false
                showAddCardDialog = true
            }
        )
    }

    Column(modifier = modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        BookingHeader(
            currentStep = currentStep,
            onOpenNotifications = onOpenNotifications,
            onBack = {
                if (!moveBackStep()) onExit()
            }
        )
        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 18.dp, bottom = 8.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            item {
                BookingStepper(
                    currentStep = currentStep,
                    visibleSteps = visibleSteps,
                    skipsOnlinePayment = skipsOnlinePayment
                )
            }

            when (currentStep) {
                BookingFlowStep.PROVIDER -> {
                    item {
                        BookIntroHeader(
                            title = "Let's get started",
                            subtitle = "Choose the provider where\nyou want to book a session.",
                            icon = Icons.Rounded.LocationOn,
                            accentIcon = Icons.Rounded.FitnessCenter
                        )
                    }
                    item { StraightSectionHeader("SELECT PROVIDER") }

                    if (providers.isEmpty()) {
                        item {
                            EmptyInlineMessage("No providers available", "The guest is not subscribed to any tenancy yet.")
                        }
                    } else {
                        items(providers, key = { it.companyId }) { provider ->
                            ProviderListRow(
                                provider = provider,
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
                    item {
                        BookIntroHeader(
                            title = "Choose a service",
                            subtitle = "Select the service you want\nto book with your provider.",
                            icon = Icons.Rounded.Assignment,
                            accentIcon = Icons.Rounded.FitnessCenter
                        )
                    }
                    item { StraightSectionHeader("SELECTED SERVICE") }

                    if (providerScopedServices.isEmpty()) {
                        item {
                            EmptyInlineMessage("No services available", "This provider does not currently expose any guest-app services.")
                        }
                    } else {
                        items(providerScopedServices, key = { it.id }) { service ->
                            ServiceListRow(
                                service = service,
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
                    item {
                        BookIntroHeader(
                            title = "Choose employee",
                            subtitle = "Select who should perform\nyour service.",
                            icon = Icons.Rounded.Assignment,
                            accentIcon = Icons.Rounded.Check
                        )
                    }
                    item { StraightSectionHeader("SELECT EMPLOYEE") }

                    if (loadingConsultants) {
                        item {
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                                Text("Loading employees…")
                            }
                        }
                    } else if (consultants.isEmpty()) {
                        item {
                            EmptyInlineMessage("No employees available", "This service has no bookable employees.")
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
                    item {
                        BookIntroHeader(
                            title = "Choose date & time",
                            subtitle = "Pick a day and time that\nworks best for you.",
                            icon = Icons.Rounded.CalendarMonth,
                            accentIcon = Icons.Rounded.EventAvailable
                        )
                    }

                    if (selectedService != null) {
                        item { StraightSectionHeader("SELECT DATE") }
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
                                compact = true
                            )
                        }
                        item { StraightSectionHeader("SELECT TIME") }
                        item {
                            if (loadingSlots) {
                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                                    Text("Loading available times…")
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
                                            "No slots were loaded. Fix the error above or verify the service and date on the server.",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                } else {
                                    EmptyInlineMessage("No slots available", "There are no available times on this day.")
                                }
                            } else {
                                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    slots.chunked(4).forEach { rowSlots ->
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                                        ) {
                                            rowSlots.forEach { slot ->
                                                TimeChip(
                                                    modifier = Modifier.weight(1f),
                                                    time = slot.startsAt.asSlotTime(),
                                                    selected = slot.slotId == selectedSlotId,
                                                    onClick = { selectedSlotId = slot.slotId }
                                                )
                                            }
                                            repeat(4 - rowSlots.size) { Spacer(modifier = Modifier.weight(1f)) }
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                        item { EmptyInlineMessage("Select a service first", "Choose a service before selecting date and time.") }
                    }
                }

                BookingFlowStep.PAYMENT_REVIEW -> {
                    item {
                        BookIntroHeader(
                            title = if (skipsOnlinePayment) "Review booking" else "Payment & review",
                            subtitle = if (skipsOnlinePayment) {
                                "Review your booking details\nand confirm your session."
                            } else {
                                "Choose your preferred payment\nmethod and review your booking."
                            },
                            icon = Icons.Rounded.CreditCard,
                            accentIcon = Icons.Rounded.Security
                        )
                    }

                    if (skipsOnlinePayment) {
                        item {
                            EmptyInlineMessage(
                                title = "Pay at venue",
                                description = "Payment is collected at the venue. Tap Confirm booking to reserve your slot."
                            )
                        }
                    } else {
                        val activeCard = savedCards.firstOrNull { it.id == selectedSavedCardId }
                        val cardSubtitle = activeCard?.let {
                            "•••• ${it.last4}        ${it.expiryMonth}/${it.expiryYear}"
                        } ?: "Add a card to pay by credit card"
                        val bestEntitlement = matchingEntitlements.firstOrNull()
                        val entitlementSubtitle = bestEntitlement?.let {
                            buildString {
                                append(it.productName)
                                append(" • ")
                                append(it.remainingUses?.let { remaining -> "$remaining left" } ?: "unlimited")
                                if (!it.validUntil.isNullOrBlank()) {
                                    append(" • valid until ")
                                    append(it.validUntil.take(10))
                                }
                            }
                        } ?: "No valid pass or pack available for this service"

                        val bestGiftCard = matchingGiftCards.firstOrNull()
                        val giftCardSubtitle = bestGiftCard?.let { giftCard ->
                            buildString {
                                append(giftCard.productName)
                                append(" • ")
                                append(giftCard.remainingValueGross?.let { balance -> "${balance.formatPrice()} ${giftCard.currency ?: selectedService?.currency.orEmpty()}" } ?: "available")
                                if (!giftCard.validUntil.isNullOrBlank()) {
                                    append(" • valid until ")
                                    append(giftCard.validUntil.take(10))
                                }
                            }
                        } ?: PaymentMethodUi.GIFT_CARD.helper

                        item { StraightSectionHeader("PAYMENT METHOD") }
                        if (matchingEntitlements.isNotEmpty()) {
                            item {
                                PaymentMethodLine(
                                    label = PaymentMethodUi.ENTITLEMENT.title,
                                    subtitle = if (selectedPaymentMethod == PaymentMethodUi.ENTITLEMENT) entitlementSubtitle else null,
                                    selected = selectedPaymentMethod == PaymentMethodUi.ENTITLEMENT,
                                    enabled = true,
                                    icon = Icons.Rounded.EventAvailable,
                                    onSelect = { selectedPaymentMethod = PaymentMethodUi.ENTITLEMENT }
                                )
                            }
                        }
                        if (hasGiftCardCoverage && isMethodAllowed(PaymentMethodUi.GIFT_CARD)) {
                            item {
                                PaymentMethodLine(
                                    label = PaymentMethodUi.GIFT_CARD.title,
                                    subtitle = if (selectedPaymentMethod == PaymentMethodUi.GIFT_CARD) giftCardSubtitle else PaymentMethodUi.GIFT_CARD.helper,
                                    selected = selectedPaymentMethod == PaymentMethodUi.GIFT_CARD,
                                    enabled = true,
                                    icon = Icons.Rounded.ReceiptLong,
                                    onSelect = { selectedPaymentMethod = PaymentMethodUi.GIFT_CARD }
                                )
                            }
                        }
                        if (isMethodAllowed(PaymentMethodUi.CARD)) {
                            item {
                                PaymentMethodLine(
                                    label = PaymentMethodUi.CARD.title,
                                    subtitle = if (selectedPaymentMethod == PaymentMethodUi.CARD) cardSubtitle else null,
                                    selected = selectedPaymentMethod == PaymentMethodUi.CARD,
                                    enabled = true,
                                    icon = Icons.Rounded.CreditCard,
                                    trailing = { CardBrandBadges() },
                                    onChevron = {
                                        if (savedCards.isEmpty()) showAddCardDialog = true
                                        else showCardChooserDialog = true
                                    },
                                    onSelect = { selectedPaymentMethod = PaymentMethodUi.CARD }
                                )
                            }
                        }
                        if (isMethodAllowed(PaymentMethodUi.BANK_TRANSFER)) {
                            item {
                                PaymentMethodLine(
                                    label = PaymentMethodUi.BANK_TRANSFER.title,
                                    subtitle = null,
                                    selected = selectedPaymentMethod == PaymentMethodUi.BANK_TRANSFER,
                                    enabled = true,
                                    icon = Icons.Rounded.AccountBalance,
                                    onSelect = { selectedPaymentMethod = PaymentMethodUi.BANK_TRANSFER }
                                )
                            }
                        }
                        if (isMethodAllowed(PaymentMethodUi.PAYPAL)) {
                            item {
                                PaymentMethodLine(
                                    label = PaymentMethodUi.PAYPAL.title,
                                    subtitle = if (selectedPaymentMethod == PaymentMethodUi.PAYPAL) PaymentMethodUi.PAYPAL.helper else null,
                                    selected = selectedPaymentMethod == PaymentMethodUi.PAYPAL,
                                    enabled = true,
                                    icon = Icons.Rounded.CreditCard,
                                    onSelect = { selectedPaymentMethod = PaymentMethodUi.PAYPAL }
                                )
                            }
                        }
                    }

                    if (selectedService != null) {
                        item {
                            BookingReviewSummary(
                                serviceName = selectedService.name,
                                dateTime = selectedSlot?.startsAt?.asSummaryDateTime().orEmpty(),
                                total = "${selectedService.priceGross.formatPrice()} ${selectedService.currency}",
                                depositText = if (!skipsOnlinePayment && isDepositMode) {
                                    "Pay now: $depositPercent% (${amountDueNow.formatPrice()} ${selectedService.currency})"
                                } else null
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
                    label = "Continue",
                    enabled = selectedProvider != null,
                    onClick = advanceStep
                )
                BookingFlowStep.SERVICE -> ContinueButton(
                    label = "Continue",
                    enabled = selectedService != null,
                    onClick = advanceStep
                )
                BookingFlowStep.EMPLOYEE -> ContinueButton(
                    label = "Continue",
                    enabled = selectedConsultantId != null,
                    onClick = advanceStep
                )
                BookingFlowStep.DATE_TIME -> if (rescheduleContext != null) {
                    ContinueButton(
                        label = "Confirm reschedule",
                        enabled = selectedSlot != null && !submitting,
                        loading = submitting,
                        onClick = {
                            val slot = selectedSlot ?: return@ContinueButton
                            val context = rescheduleContext
                            scope.launch {
                                submitting = true
                                runCatching {
                                    val consultantIdForOrder = if (employeeStepActive) selectedConsultantId else null
                                    onReschedule(context, slot.slotId, consultantIdForOrder)
                                }
                                    .onFailure { ex ->
                                        availabilityLoadError = ex.message?.takeIf { it.isNotBlank() }
                                            ?: "Reschedule failed. Please try again."
                                    }
                                submitting = false
                            }
                        }
                    )
                } else {
                    ContinueButton(
                        label = "Continue",
                        enabled = selectedSlot != null,
                        onClick = advanceStep
                    )
                }
                BookingFlowStep.PAYMENT_REVIEW -> ContinueButton(
                    label = "Confirm booking",
                    enabled = selectedService != null && selectedSlot != null && !submitting && (
                        skipsOnlinePayment || (
                            selectedPaymentMethod.enabled &&
                                (selectedPaymentMethod != PaymentMethodUi.ENTITLEMENT || matchingEntitlements.isNotEmpty()) &&
                                (selectedPaymentMethod != PaymentMethodUi.GIFT_CARD || hasGiftCardCoverage) &&
                                (selectedPaymentMethod != PaymentMethodUi.CARD || selectedSavedCardId != null)
                            )
                        ),
                    loading = submitting,
                    onClick = {
                        val service = selectedService ?: return@ContinueButton
                        val slot = selectedSlot ?: return@ContinueButton
                        val method = if (skipsOnlinePayment) "PAY_AT_VENUE" else (selectedPaymentMethod.apiValue ?: return@ContinueButton)
                        scope.launch {
                            submitting = true
                            val consultantIdForOrder = if (employeeStepActive) selectedConsultantId else null
                            runCatching { onCheckout(service, slot.slotId, method, consultantIdForOrder) }
                            submitting = false
                        }
                    }
                )
            }
        }
    }
}

@Composable
private fun BookingHeader(
    currentStep: BookingFlowStep,
    onOpenNotifications: () -> Unit,
    onBack: () -> Unit
) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 0.dp,
        shadowElevation = 0.dp,
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp)
                .padding(start = 4.dp, end = 4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(
                onClick = onBack,
                enabled = currentStep != BookingFlowStep.PROVIDER,
                modifier = Modifier.size(44.dp)
            ) {
                Icon(
                    Icons.AutoMirrored.Rounded.ArrowBack,
                    contentDescription = "Back",
                    modifier = Modifier.size(24.dp),
                    tint = MaterialTheme.colorScheme.onSurface
                )
            }
            Text(
                "Book a session",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f)
            )
            IconButton(
                onClick = onOpenNotifications,
                modifier = Modifier.size(44.dp)
            ) {
                Icon(
                    Icons.Rounded.NotificationsNone,
                    contentDescription = "Notifications",
                    modifier = Modifier.size(24.dp),
                    tint = MaterialTheme.colorScheme.onSurface
                )
            }
        }
    }
}

@Composable
private fun BookingStepper(
    currentStep: BookingFlowStep,
    visibleSteps: List<BookingFlowStep> = BookingFlowStep.ordered,
    skipsOnlinePayment: Boolean = false,
    modifier: Modifier = Modifier
) {
    val steps = visibleSteps
    val stateIndex = steps.indexOf(currentStep)
    val primary = MaterialTheme.colorScheme.primary
    val inactiveConnector = MaterialTheme.colorScheme.outline.copy(alpha = 0.85f)

    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top
    ) {
        steps.forEachIndexed { index, step ->
            val active = step == currentStep
            val completed = index < stateIndex
            val circleColor = if (active || completed) primary else Color.Transparent
            val leftActive = index > 0 && index <= stateIndex
            val rightActive = index < steps.lastIndex && index < stateIndex

            Column(
                modifier = Modifier.weight(1f),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(36.dp),
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
                        Spacer(Modifier.width(36.dp))
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
                        modifier = Modifier.size(36.dp),
                        shape = CircleShape,
                        color = circleColor,
                        border = if (active || completed) null else BorderStroke(1.dp, inactiveConnector)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            if (completed) {
                                Icon(
                                    Icons.Rounded.Check,
                                    contentDescription = null,
                                    tint = Color.White,
                                    modifier = Modifier.size(16.dp)
                                )
                            } else {
                                Text(
                                    (index + 1).toString(),
                                    color = if (active) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                        }
                    }
                }
                Spacer(Modifier.height(2.dp))
                Text(
                    if (skipsOnlinePayment && step == BookingFlowStep.PAYMENT_REVIEW) "Review" else step.stepTitle,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 2.dp),
                    textAlign = TextAlign.Center,
                    style = MaterialTheme.typography.labelMedium,
                    maxLines = 2,
                    fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal,
                    color = if (active) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun BookIntroHeader(
    title: String,
    subtitle: String,
    icon: ImageVector,
    accentIcon: ImageVector
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 142.dp)
            .padding(top = 8.dp, bottom = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                title,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onBackground
            )
            Text(
                subtitle,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                lineHeight = 22.sp
            )
        }
        Spacer(Modifier.width(16.dp))
        MinimalBookIllustration(icon = icon, accentIcon = accentIcon)
    }
}

@Composable
private fun MinimalBookIllustration(icon: ImageVector, accentIcon: ImageVector) {
    val primary = MaterialTheme.colorScheme.primary
    val pale = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.42f)
    Box(
        modifier = Modifier
            .width(150.dp)
            .height(120.dp),
        contentAlignment = Alignment.Center
    ) {
        Box(
            modifier = Modifier
                .size(112.dp)
                .align(Alignment.CenterEnd)
                .clip(CircleShape)
                .background(pale)
        )
        Box(
            modifier = Modifier
                .width(78.dp)
                .height(62.dp)
                .align(Alignment.BottomCenter)
                .border(1.2.dp, MaterialTheme.colorScheme.outline, RectangleShape)
                .background(Color.White.copy(alpha = 0.88f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                accentIcon,
                contentDescription = null,
                modifier = Modifier.size(32.dp),
                tint = MaterialTheme.colorScheme.onBackground
            )
        }
        Icon(
            icon,
            contentDescription = null,
            modifier = Modifier
                .size(48.dp)
                .align(Alignment.TopCenter),
            tint = primary
        )
        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .width(112.dp)
                .height(1.dp)
                .background(MaterialTheme.colorScheme.outline)
        )
    }
}

@Composable
private fun StraightSectionHeader(title: String) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text(
            title,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        HorizontalDivider(color = MaterialTheme.colorScheme.outline)
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
            .size(48.dp)
            .background(if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            icon,
            contentDescription = null,
            modifier = Modifier.size(27.dp),
            tint = if (selected) Color.White else MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun SelectionRail(selected: Boolean) {
    Box(
        modifier = Modifier
            .width(3.dp)
            .height(48.dp)
            .background(if (selected) MaterialTheme.colorScheme.primary else Color.Transparent)
    )
}

@Composable
private fun ProviderListRow(provider: ProviderOption, selected: Boolean, onClick: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(onClick = onClick)
                .padding(vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            SelectionRail(selected)
            Spacer(Modifier.width(10.dp))
            SquareBookIcon(Icons.Rounded.FitnessCenter, selected = selected)
            Spacer(Modifier.width(14.dp))
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(provider.tenantName, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                Text(provider.tenantAddress ?: "", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface)
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.78f))
    }
}

@Composable
private fun ServiceListRow(service: ServiceOption, selected: Boolean, onClick: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(onClick = onClick)
                .padding(vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            SelectionRail(selected)
            Spacer(Modifier.width(10.dp))
            SquareBookIcon(Icons.Rounded.FitnessCenter, selected = selected)
            Spacer(Modifier.width(14.dp))
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(service.name, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                Text(
                    service.description?.takeIf { it.isNotBlank() } ?: "Bookable service",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    TagPillCompact(service.tenantName)
                    service.durationMinutes?.let { TagPillCompact("$it min") }
                }
            }
            Text(
                "${service.priceGross.formatPrice()} ${service.currency}",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.primary
            )
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.78f))
    }
}

@Composable
private fun ConsultantListRow(consultant: ConsultantOption, selected: Boolean, onClick: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(onClick = onClick)
                .padding(vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            SelectionRail(selected)
            Spacer(Modifier.width(10.dp))
            SquareBookIcon(Icons.Rounded.Assignment, selected = selected)
            Spacer(Modifier.width(14.dp))
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(consultant.fullName, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                consultant.email?.takeIf { it.isNotBlank() }?.let {
                    Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface)
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.78f))
    }
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
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .then(if (selected) Modifier.border(1.dp, MaterialTheme.colorScheme.primary, RectangleShape) else Modifier)
                .clickable(enabled = enabled, onClick = onSelect)
                .padding(horizontal = if (selected) 12.dp else 13.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            SelectIndicator(selected = selected, enabled = enabled, size = 24.dp)
            SquareBookIcon(icon, selected = selected)
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    label,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = if (enabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.65f)
                )
                subtitle?.takeIf { it.isNotBlank() }?.let {
                    Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            trailing?.invoke()
            IconButton(onClick = onChevron ?: onSelect, enabled = enabled, modifier = Modifier.size(34.dp)) {
                Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface)
            }
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.78f))
    }
}

@Composable
private fun BookingReviewSummary(
    serviceName: String,
    dateTime: String,
    total: String,
    depositText: String? = null
) {
    Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(0.dp)) {
        StraightSectionHeader("REVIEW SUMMARY")
        ReviewSummaryLine(icon = Icons.Rounded.FitnessCenter, label = "Service", value = serviceName)
        ReviewSummaryLine(icon = Icons.Rounded.CalendarMonth, label = "Date & time", value = dateTime)
        depositText?.let { ReviewSummaryLine(icon = Icons.Rounded.CreditCard, label = "Deposit", value = it) }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Rounded.ReceiptLong, contentDescription = null, modifier = Modifier.size(24.dp), tint = MaterialTheme.colorScheme.onSurface)
            Spacer(Modifier.width(14.dp))
            Text("Total", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            Text(total, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
        }
    }
}

@Composable
private fun ReviewSummaryLine(icon: ImageVector, label: String, value: String) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(24.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.width(14.dp))
            Text(label, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
            Text(value, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface, textAlign = TextAlign.End)
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.78f))
    }
}

@Composable
private fun StepHeader(title: String, subtitle: String) {
    Surface(
        shape = RoundedCornerShape(20.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 0.dp,
        shadowElevation = 0.dp
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(
                subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

/** Provider and service steps: compact type and soft bottom fade into the screen background. */
@Composable
private fun BookSelectStepHeader(title: String, subtitle: String) {
    val fadeTarget = MaterialTheme.colorScheme.background
    val shape = RoundedCornerShape(18.dp)
    Box(modifier = Modifier.fillMaxWidth()) {
        Surface(
            shape = shape,
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 0.dp,
            shadowElevation = 0.dp
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 11.dp),
                verticalArrangement = Arrangement.spacedBy(3.dp)
            ) {
                Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                Text(
                    subtitle,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        Box(
            modifier = Modifier
                .matchParentSize()
                .clip(shape)
        ) {
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .height(36.dp)
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(
                                Color.Transparent,
                                fadeTarget.copy(alpha = 0.2f),
                                fadeTarget.copy(alpha = 0.88f)
                            )
                        )
                    )
            )
        }
    }
}

@Composable
private fun EmptyStateCard(title: String, description: String) {
    ElevatedCard(
        shape = RoundedCornerShape(28.dp),
        colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.fillMaxWidth().padding(22.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(description, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun ProviderCard(provider: ProviderOption, selected: Boolean, onClick: () -> Unit) {
    ElevatedCard(
        onClick = onClick,
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 11.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            SelectIndicator(selected = selected, size = 26.dp)
            Spacer(Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                Text(provider.tenantName, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                Text(provider.tenantAddress ?: "", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun ServiceCard(service: ServiceOption, selected: Boolean, onClick: () -> Unit) {
    ElevatedCard(
        onClick = onClick,
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 11.dp),
            verticalArrangement = Arrangement.spacedBy(0.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                SelectIndicator(selected = selected, size = 26.dp)
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(1.dp)
                ) {
                    Text(
                        service.name,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(
                        service.description?.takeIf { it.isNotBlank() } ?: "Bookable service",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                PriceChipCompact("${service.priceGross.formatPrice()} ${service.currency}")
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 36.dp, top = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                TagPillCompact(service.tenantName)
                service.durationMinutes?.let { TagPillCompact("$it min") }
            }
        }
    }
}

@Composable
private fun ConsultantCard(consultant: ConsultantOption, selected: Boolean, onClick: () -> Unit) {
    ElevatedCard(
        onClick = onClick,
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 11.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            SelectIndicator(selected = selected, size = 26.dp)
            Spacer(Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                Text(consultant.fullName, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                consultant.email?.takeIf { it.isNotBlank() }?.let {
                    Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun MonthCalendar(
    selectedMonth: YearMonth,
    selectedDate: LocalDate,
    onMonthChange: (YearMonth) -> Unit,
    onDateSelected: (LocalDate) -> Unit,
    compact: Boolean = false
) {
    val today = LocalDate.now()
    val dayHeaders = DayOfWeek.values().toList()
    val firstOfMonth = selectedMonth.atDay(1)
    val offset = (firstOfMonth.dayOfWeek.value + 6) % 7
    val totalDays = selectedMonth.lengthOfMonth()
    val cells = buildList<LocalDate?> {
        repeat(offset) { add(null) }
        for (day in 1..totalDays) add(selectedMonth.atDay(day))
        while (size % 7 != 0) add(null)
    }

    val shortMonthFmt = DateTimeFormatter.ofPattern("MMMM", Locale.ENGLISH)
    val navStyle = if (compact) MaterialTheme.typography.bodySmall else MaterialTheme.typography.bodyMedium
    val monthTitleStyle = if (compact) MaterialTheme.typography.titleMedium else MaterialTheme.typography.titleLarge
    val arrowSize = if (compact) 16.dp else 18.dp
    val dayHeaderStyle = if (compact) MaterialTheme.typography.labelMedium else MaterialTheme.typography.bodyMedium
    Column(verticalArrangement = Arrangement.spacedBy(if (compact) 8.dp else 12.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                modifier = Modifier
                    .clip(RectangleShape)
                    .clickable { onMonthChange(selectedMonth.minusMonths(1)) }
                    .padding(horizontal = 4.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                Icon(
                    Icons.AutoMirrored.Rounded.KeyboardArrowLeft,
                    contentDescription = "Previous month",
                    modifier = Modifier.size(arrowSize),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    selectedMonth.minusMonths(1).format(shortMonthFmt),
                    style = navStyle,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Text(
                selectedMonth.format(DateTimeFormatter.ofPattern("MMMM yyyy", Locale.ENGLISH)),
                style = monthTitleStyle,
                fontWeight = FontWeight.SemiBold
            )
            Row(
                modifier = Modifier
                    .clip(RectangleShape)
                    .clickable { onMonthChange(selectedMonth.plusMonths(1)) }
                    .padding(horizontal = 4.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                Text(
                    selectedMonth.plusMonths(1).format(shortMonthFmt),
                    style = navStyle,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Icon(
                    Icons.AutoMirrored.Rounded.KeyboardArrowRight,
                    contentDescription = "Next month",
                    modifier = Modifier.size(arrowSize),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        Row(modifier = Modifier.fillMaxWidth()) {
            dayHeaders.forEach { headerDay ->
                Text(
                    headerDay.getDisplayName(TextStyle.SHORT, Locale.ENGLISH),
                    modifier = Modifier.weight(1f),
                    textAlign = TextAlign.Center,
                    style = dayHeaderStyle,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        cells.chunked(7).forEach { week ->
            Row(modifier = Modifier.fillMaxWidth()) {
                week.forEach { date ->
                    CalendarDateCell(
                        date = date,
                        isSelected = date == selectedDate,
                        isEnabled = date != null && !date.isBefore(today),
                        compact = compact,
                        onClick = {
                            if (date != null && !date.isBefore(today)) onDateSelected(date)
                        }
                    )
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
    val cellSize = if (compact) 34.dp else 42.dp
    val placeholder = if (compact) 32.dp else 40.dp
    val dayStyle = if (compact) MaterialTheme.typography.bodyLarge else MaterialTheme.typography.titleMedium
    Box(
        modifier = Modifier
            .weight(1f)
            .padding(vertical = if (compact) 2.dp else 4.dp),
        contentAlignment = Alignment.Center
    ) {
        if (date == null) {
            Spacer(Modifier.size(placeholder))
        } else {
            Surface(
                modifier = Modifier
                    .size(cellSize)
                    .clickable(enabled = isEnabled, onClick = onClick),
                shape = RectangleShape,
                color = when {
                    isSelected -> MaterialTheme.colorScheme.primary
                    else -> Color.Transparent
                }
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(
                        date.dayOfMonth.toString(),
                        color = when {
                            isSelected -> Color.White
                            isEnabled -> MaterialTheme.colorScheme.onSurface
                            else -> MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                        },
                        style = dayStyle,
                        fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                        textAlign = TextAlign.Center
                    )
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
        shape = RectangleShape,
        color = if (selected) MaterialTheme.colorScheme.primary else Color.Transparent,
        border = if (selected) null else BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        tonalElevation = 0.dp
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 10.dp),
            contentAlignment = Alignment.Center
        ) {
            Text(
                time,
                color = if (selected) Color.White else MaterialTheme.colorScheme.onSurface,
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold
            )
        }
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
private fun CardChooserDialog(
    cards: List<SavedCardUi>,
    selectedCardId: String?,
    onDismiss: () -> Unit,
    onSelect: (String) -> Unit,
    onRemove: (String) -> Unit,
    onAddNew: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Choose a card") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (cards.isEmpty()) {
                    Text("No stored cards yet.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    cards.forEach { card ->
                        val brand = PaymentCardBrand.fromDisplayName(card.brand)
                        OutlinedCard(
                            onClick = { onSelect(card.id) },
                            shape = RoundedCornerShape(16.dp),
                            colors = CardDefaults.outlinedCardColors(
                                containerColor = if (card.id == selectedCardId)
                                    MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.45f)
                                else MaterialTheme.colorScheme.surface
                            )
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 10.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                PaymentCardBrandMark(brand = brand)
                                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                    Text(
                                        "${card.brand} · •••• ${card.last4}",
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.Medium
                                    )
                                    Text(
                                        "valid thru ${card.expiryMonth}/${card.expiryYear}",
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                                IconButton(
                                    onClick = { onRemove(card.id) },
                                    modifier = Modifier.size(40.dp)
                                ) {
                                    Icon(
                                        Icons.Rounded.DeleteOutline,
                                        contentDescription = "Remove card",
                                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                                if (card.id == selectedCardId) {
                                    Icon(
                                        Icons.Rounded.TaskAlt,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.primary
                                    )
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onAddNew) {
                Icon(Icons.Rounded.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text("Add new card")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Close") } }
    )
}

@Composable
private fun SummaryHeader(total: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            "Booking summary",
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
            .height(52.dp),
        enabled = enabled && !loading,
        shape = RectangleShape,
        colors = ButtonDefaults.buttonColors(
            containerColor = MaterialTheme.colorScheme.primary,
            contentColor = Color.White,
            disabledContainerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.4f),
            disabledContentColor = Color.White
        ),
        contentPadding = PaddingValues(horizontal = 20.dp)
    ) {
        if (loading) {
            CircularProgressIndicator(
                modifier = Modifier.size(18.dp),
                strokeWidth = 2.dp,
                color = Color.White
            )
        } else {
            Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                Text(label, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                Icon(
                    Icons.AutoMirrored.Rounded.KeyboardArrowRight,
                    contentDescription = null,
                    modifier = Modifier.align(Alignment.CenterEnd).size(24.dp),
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
            selected -> MaterialTheme.colorScheme.primary
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
            .clip(RoundedCornerShape(2.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
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
            .clip(RoundedCornerShape(2.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(horizontal = 10.dp, vertical = 5.dp)
    ) {
        Text(text, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun AddCardDialog(onDismiss: () -> Unit, onSave: (SavedCardUi) -> Unit) {
    var holderName by rememberSaveable { mutableStateOf("") }
    var cardNumber by rememberSaveable { mutableStateOf("") }
    var expiryMonth by rememberSaveable { mutableStateOf("") }
    var expiryYear by rememberSaveable { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add card") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(value = holderName, onValueChange = { holderName = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Cardholder name") })
                OutlinedTextField(value = cardNumber, onValueChange = { cardNumber = it.filter(Char::isDigit).take(19) }, modifier = Modifier.fillMaxWidth(), label = { Text("Card number") })
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                    OutlinedTextField(value = expiryMonth, onValueChange = { expiryMonth = it.filter(Char::isDigit).take(2) }, modifier = Modifier.weight(1f), label = { Text("MM") })
                    OutlinedTextField(value = expiryYear, onValueChange = { expiryYear = it.filter(Char::isDigit).take(2) }, modifier = Modifier.weight(1f), label = { Text("YY") })
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val trimmedDigits = cardNumber.filter(Char::isDigit)
                    if (trimmedDigits.length >= 12 && expiryMonth.length == 2 && expiryYear.length == 2) {
                        onSave(
                            SavedCardUi(
                                id = UUID.randomUUID().toString(),
                                holderName = holderName,
                                brand = detectBrand(trimmedDigits),
                                last4 = trimmedDigits.takeLast(4),
                                expiryMonth = expiryMonth,
                                expiryYear = expiryYear,
                                encodedNumber = trimmedDigits
                            )
                        )
                    }
                }
            ) {
                Text("Save")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

private fun detectBrand(cardNumber: String): String = when {
    cardNumber.startsWith("4") -> "Visa"
    cardNumber.startsWith("5") || cardNumber.startsWith("2") -> "Mastercard"
    else -> "Card"
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

private fun String.asSummaryDateTime(): String = runCatching {
    OffsetDateTime.parse(this)
        .atZoneSameInstant(ZoneId.systemDefault())
        .format(DateTimeFormatter.ofPattern("EEEE, d MMMM 'at' HH:mm", Locale.ENGLISH))
}.getOrElse {
    runCatching {
        LocalDateTime.parse(this@asSummaryDateTime)
            .atZone(ZoneId.systemDefault())
            .format(DateTimeFormatter.ofPattern("EEEE, d MMMM 'at' HH:mm", Locale.ENGLISH))
    }.getOrElse { this@asSummaryDateTime }
}
