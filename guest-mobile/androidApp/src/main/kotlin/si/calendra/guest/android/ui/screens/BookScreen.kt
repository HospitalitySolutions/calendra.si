package si.calendra.guest.android.ui.screens

import android.util.Log
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.layout.statusBarsPadding
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
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
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
    val tenantAddress: String?
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
    val autoRenews: Boolean = false
)

enum class BookingFlowStep(
    val index: Int,
    val stepTitle: String,
    val headerTitle: String,
    val headerSubtitle: String
) {
    PROVIDER(1, "Provider", "1. Select provider", "Choose a tenancy/organization you're subscribed to"),
    SERVICE(2, "Service", "2. Select service", "Choose a service from the options provided by the selected provider"),
    DATE_TIME(3, "Date & time", "3. Select date & time", "Pick a date and an available time slot"),
    PAYMENT_REVIEW(4, "Payment & review", "4. Payment & review", "Choose your preferred payment method");

    companion object {
        val ordered = listOf(PROVIDER, SERVICE, DATE_TIME, PAYMENT_REVIEW)
    }
}

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
    onLoadAvailability: suspend (ServiceOption, LocalDate) -> List<AvailabilitySlot>,
    onCheckout: suspend (ServiceOption, String, String) -> Unit
) {
    val scope = rememberCoroutineScope()

    var currentStep by remember { mutableStateOf(BookingFlowStep.PROVIDER) }
    var selectedProviderId by remember { mutableStateOf<String?>(providers.firstOrNull()?.companyId) }
    var selectedServiceId by remember { mutableStateOf<String?>(null) }
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

    val selectedProvider = providers.firstOrNull { it.companyId == selectedProviderId }
    val selectedService = providerScopedServices.firstOrNull { it.id == selectedServiceId }
    val selectedSlot = slots.firstOrNull { it.slotId == selectedSlotId }
    val matchingEntitlements = redeemableEntitlements.filter { entitlement ->
        selectedService != null && entitlement.companyId == selectedService.companyId
                && (entitlement.sessionTypeId.isNullOrBlank() || entitlement.sessionTypeId == selectedService.sessionTypeId)
    }

    fun moveBackStep() {
        currentStep = when (currentStep) {
            BookingFlowStep.PROVIDER -> BookingFlowStep.PROVIDER
            BookingFlowStep.SERVICE -> BookingFlowStep.PROVIDER
            BookingFlowStep.DATE_TIME -> BookingFlowStep.SERVICE
            BookingFlowStep.PAYMENT_REVIEW -> BookingFlowStep.DATE_TIME
        }
    }

    BackHandler(enabled = currentStep != BookingFlowStep.PROVIDER) {
        moveBackStep()
    }

    fun refreshSlots() {
        val service = selectedService ?: return
        scope.launch {
            loadingSlots = true
            selectedSlotId = null
            availabilityLoadError = null
            runCatching { onLoadAvailability(service, selectedDate) }
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

    LaunchedEffect(selectedService?.id, selectedDate) {
        if (selectedService != null) refreshSlots()
    }

    LaunchedEffect(selectedService?.id, matchingEntitlements.size) {
        if (selectedPaymentMethod == PaymentMethodUi.ENTITLEMENT && matchingEntitlements.isEmpty()) {
            selectedPaymentMethod = PaymentMethodUi.CARD
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

    Column(modifier = modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 0.dp, bottom = 4.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            item {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(0.dp)
                ) {
                    BookingHeader(
                        currentStep = currentStep,
                        onOpenNotifications = onOpenNotifications,
                        onBack = ::moveBackStep
                    )
                    BookingStepper(
                        currentStep = currentStep,
                        modifier = Modifier.offset(y = (-8).dp)
                    )
                }
            }

            when (currentStep) {
                BookingFlowStep.PROVIDER -> {
                    item {
                        BookSelectStepHeader(
                            title = BookingFlowStep.PROVIDER.headerTitle,
                            subtitle = BookingFlowStep.PROVIDER.headerSubtitle
                        )
                    }

                    if (providers.isEmpty()) {
                        item {
                            EmptyStateCard(
                                title = "No providers available",
                                description = "The guest is not subscribed to any tenancy yet."
                            )
                        }
                    } else {
                        items(providers, key = { it.companyId }) { provider ->
                            ProviderCard(
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
                        BookSelectStepHeader(
                            title = BookingFlowStep.SERVICE.headerTitle,
                            subtitle = BookingFlowStep.SERVICE.headerSubtitle
                        )
                    }

                    if (providerScopedServices.isEmpty()) {
                        item {
                            EmptyStateCard(
                                title = "No services available",
                                description = "This provider does not currently expose any guest-app services."
                            )
                        }
                    } else {
                        items(providerScopedServices, key = { it.id }) { service ->
                            ServiceCard(
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

                BookingFlowStep.DATE_TIME -> {
                    item {
                        BookSelectStepHeader(
                            title = BookingFlowStep.DATE_TIME.headerTitle,
                            subtitle = BookingFlowStep.DATE_TIME.headerSubtitle
                        )
                    }

                    item {
                        ElevatedCard(
                            shape = RoundedCornerShape(20.dp),
                            colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface)
                        ) {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 14.dp, vertical = 12.dp),
                                verticalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
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

                                Text(
                                    selectedDate.format(DateTimeFormatter.ofPattern("EEEE, d MMMM", Locale.ENGLISH)),
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.SemiBold
                                )

                                if (loadingSlots) {
                                    Row(
                                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                                        Text("Loading available times…")
                                    }
                                } else if (slots.isEmpty()) {
                                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                        if (availabilityLoadError != null) {
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
                                        } else {
                                            Text(
                                                "No slots available on this day.",
                                                style = MaterialTheme.typography.bodyMedium,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                        }
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
                                                repeat(4 - rowSlots.size) {
                                                    Spacer(modifier = Modifier.weight(1f))
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                BookingFlowStep.PAYMENT_REVIEW -> {
                    item {
                        BookSelectStepHeader(
                            title = BookingFlowStep.PAYMENT_REVIEW.headerTitle,
                            subtitle = BookingFlowStep.PAYMENT_REVIEW.headerSubtitle
                        )
                    }

                    item {
                        val activeCard = savedCards.firstOrNull { it.id == selectedSavedCardId }
                        val cardSubtitle = activeCard?.let {
                            "•••• ${it.last4} · valid thru ${it.expiryMonth}/${it.expiryYear}"
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

                        Column(
                            modifier = Modifier.fillMaxWidth(),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            if (matchingEntitlements.isNotEmpty()) {
                                PaymentMethodCard(
                                    label = PaymentMethodUi.ENTITLEMENT.title,
                                    subtitle = if (selectedPaymentMethod == PaymentMethodUi.ENTITLEMENT) entitlementSubtitle else null,
                                    selected = selectedPaymentMethod == PaymentMethodUi.ENTITLEMENT,
                                    enabled = true,
                                    onSelect = { selectedPaymentMethod = PaymentMethodUi.ENTITLEMENT },
                                    trailing = null,
                                    onManageChevron = null
                                )
                            }
                            PaymentMethodCard(
                                label = PaymentMethodUi.CARD.title,
                                subtitle = if (selectedPaymentMethod == PaymentMethodUi.CARD) cardSubtitle else null,
                                selected = selectedPaymentMethod == PaymentMethodUi.CARD,
                                enabled = true,
                                onSelect = { selectedPaymentMethod = PaymentMethodUi.CARD },
                                trailing = { CardBrandBadges() },
                                onManageChevron = {
                                    if (savedCards.isEmpty()) showAddCardDialog = true
                                    else showCardChooserDialog = true
                                }
                            )
                            PaymentMethodCard(
                                label = PaymentMethodUi.BANK_TRANSFER.title,
                                subtitle = null,
                                selected = selectedPaymentMethod == PaymentMethodUi.BANK_TRANSFER,
                                enabled = true,
                                onSelect = { selectedPaymentMethod = PaymentMethodUi.BANK_TRANSFER },
                                trailing = null,
                                onManageChevron = null
                            )
                            PaymentMethodCard(
                                label = PaymentMethodUi.PAYPAL.title,
                                subtitle = if (selectedPaymentMethod == PaymentMethodUi.PAYPAL) PaymentMethodUi.PAYPAL.helper else null,
                                selected = selectedPaymentMethod == PaymentMethodUi.PAYPAL,
                                enabled = true,
                                onSelect = { selectedPaymentMethod = PaymentMethodUi.PAYPAL },
                                trailing = null,
                                onManageChevron = null
                            )
                        }
                    }

                    item {
                        SummaryHeader(
                            total = selectedService?.let { "${it.priceGross.formatPrice()} ${it.currency}" }.orEmpty()
                        )
                    }

                    item {
                        ElevatedCard(
                            shape = RoundedCornerShape(20.dp),
                            colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface)
                        ) {
                            Column(
                                modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 14.dp),
                                verticalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Text(
                                    selectedService?.name.orEmpty(),
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.SemiBold
                                )
                                selectedSlot?.let {
                                    Text(
                                        it.startsAt.asSummaryDateTime(),
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
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
            when (currentStep) {
                BookingFlowStep.PROVIDER -> ContinueButton(
                    label = "Continue",
                    enabled = selectedProvider != null,
                    onClick = { currentStep = BookingFlowStep.SERVICE }
                )
                BookingFlowStep.SERVICE -> ContinueButton(
                    label = "Continue",
                    enabled = selectedService != null,
                    onClick = { currentStep = BookingFlowStep.DATE_TIME }
                )
                BookingFlowStep.DATE_TIME -> ContinueButton(
                    label = "Continue",
                    enabled = selectedSlot != null,
                    onClick = { currentStep = BookingFlowStep.PAYMENT_REVIEW }
                )
                BookingFlowStep.PAYMENT_REVIEW -> ContinueButton(
                    label = "Confirm booking",
                    enabled = selectedService != null && selectedSlot != null && selectedPaymentMethod.enabled && !submitting && (selectedPaymentMethod != PaymentMethodUi.ENTITLEMENT || matchingEntitlements.isNotEmpty()),
                    loading = submitting,
                    onClick = {
                        val service = selectedService ?: return@ContinueButton
                        val slot = selectedSlot ?: return@ContinueButton
                        val method = selectedPaymentMethod.apiValue ?: return@ContinueButton
                        scope.launch {
                            submitting = true
                            runCatching { onCheckout(service, slot.slotId, method) }
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
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .offset(y = (-30).dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(modifier = Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
            IconButton(
                onClick = onBack,
                enabled = currentStep != BookingFlowStep.PROVIDER,
                modifier = Modifier.offset(x = (-8).dp)
            ) {
                Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back", modifier = Modifier.size(20.dp))
            }
            Text(
                "Book a session",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold
            )
        }
        FilledTonalIconButton(
            onClick = onOpenNotifications,
            colors = IconButtonDefaults.filledTonalIconButtonColors(containerColor = MaterialTheme.colorScheme.surface),
            modifier = Modifier.size(40.dp)
        ) {
            Icon(Icons.Rounded.NotificationsNone, contentDescription = "Notifications", modifier = Modifier.size(18.dp))
        }
    }
}

@Composable
private fun BookingStepper(currentStep: BookingFlowStep, modifier: Modifier = Modifier) {
    val steps = BookingFlowStep.ordered
    val stateIndex = currentStep.index
    val primary = MaterialTheme.colorScheme.primary
    val inactiveCircle = MaterialTheme.colorScheme.surfaceVariant
    val inactiveConnector = MaterialTheme.colorScheme.outline

    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top
    ) {
        steps.forEachIndexed { index, step ->
            val active = step == currentStep
            val completed = step.index < stateIndex
            val circleColor = if (active || completed) primary else inactiveCircle
            val leftActive = index > 0 && step.index <= stateIndex
            val rightActive = index < steps.lastIndex && step.index < stateIndex

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
                        color = circleColor
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
                                    step.index.toString(),
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
                    step.stepTitle,
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
                    .clip(RoundedCornerShape(12.dp))
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
                    .clip(RoundedCornerShape(12.dp))
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
                shape = CircleShape,
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
        shape = RoundedCornerShape(12.dp),
        color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface,
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
            .clip(RoundedCornerShape(6.dp))
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
            .height(50.dp),
        enabled = enabled && !loading,
        shape = RoundedCornerShape(18.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = MaterialTheme.colorScheme.primary,
            contentColor = Color.White,
            disabledContainerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.4f),
            disabledContentColor = Color.White
        )
    ) {
        if (loading) {
            CircularProgressIndicator(
                modifier = Modifier.size(18.dp),
                strokeWidth = 2.dp,
                color = Color.White
            )
        } else {
            Text(label, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
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
            .clip(RoundedCornerShape(999.dp))
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
            .clip(RoundedCornerShape(999.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(horizontal = 10.dp, vertical = 6.dp)
    )
}

@Composable
private fun TagPill(text: String) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
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
            .clip(RoundedCornerShape(999.dp))
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
