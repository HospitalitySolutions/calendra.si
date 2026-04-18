package si.calendra.guest.android.ui.screens

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.CreditCard
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import si.calendra.guest.android.ui.SavedCardUi
import si.calendra.guest.shared.models.AvailabilitySlot
import java.time.DayOfWeek
import java.time.LocalDate
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
    val tenantCity: String?
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

private enum class PaymentMethodUi(
    val title: String,
    val apiValue: String?,
    val enabled: Boolean,
    val helper: String? = null
) {
    CARD("Credit Card", "CARD", true),
    BANK_TRANSFER("Bank Transfer", "BANK_TRANSFER", true),
    PAYPAL("PayPal", null, false, "Coming soon")
}

@Composable
fun BookScreen(
    modifier: Modifier = Modifier,
    providers: List<ProviderOption>,
    services: List<ServiceOption>,
    savedCards: List<SavedCardUi> = emptyList(),
    onSaveCard: (SavedCardUi) -> Unit = {},
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
    fun refreshSlots() {
        val service = selectedService ?: return
        scope.launch {
            loadingSlots = true
            selectedSlotId = null
            slots = runCatching { onLoadAvailability(service, selectedDate) }.getOrElse { emptyList() }
            loadingSlots = false
        }
    }

    LaunchedEffect(selectedService?.id, selectedDate) {
        if (selectedService != null) refreshSlots()
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
            onAddNew = {
                showCardChooserDialog = false
                showAddCardDialog = true
            }
        )
    }

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 124.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp)
    ) {
        item {
            BookingHeader(
                currentStep = currentStep,
                onBack = {
                    currentStep = when (currentStep) {
                        BookingFlowStep.PROVIDER -> BookingFlowStep.PROVIDER
                        BookingFlowStep.SERVICE -> BookingFlowStep.PROVIDER
                        BookingFlowStep.DATE_TIME -> BookingFlowStep.SERVICE
                        BookingFlowStep.PAYMENT_REVIEW -> BookingFlowStep.DATE_TIME
                    }
                }
            )
        }

        item {
            BookingStepper(currentStep = currentStep)
        }

        when (currentStep) {
            BookingFlowStep.PROVIDER -> {
                item {
                    StepHeader(
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

                item {
                    ContinueButton(
                        label = "Continue",
                        enabled = selectedProvider != null,
                        onClick = { currentStep = BookingFlowStep.SERVICE }
                    )
                }
            }

            BookingFlowStep.SERVICE -> {
                item {
                    StepHeader(
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

                item {
                    ContinueButton(
                        label = "Continue",
                        enabled = selectedService != null,
                        onClick = { currentStep = BookingFlowStep.DATE_TIME }
                    )
                }
            }

            BookingFlowStep.DATE_TIME -> {
                item {
                    StepHeader(
                        title = BookingFlowStep.DATE_TIME.headerTitle,
                        subtitle = BookingFlowStep.DATE_TIME.headerSubtitle
                    )
                }

                item {
                    ElevatedCard(
                        shape = RoundedCornerShape(28.dp),
                        colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface)
                    ) {
                        Column(
                            modifier = Modifier.fillMaxWidth().padding(18.dp),
                            verticalArrangement = Arrangement.spacedBy(18.dp)
                        ) {
                            MonthCalendar(
                                selectedMonth = selectedMonth,
                                selectedDate = selectedDate,
                                onMonthChange = { selectedMonth = it },
                                onDateSelected = {
                                    selectedDate = it
                                    selectedMonth = YearMonth.from(it)
                                    selectedSlotId = null
                                }
                            )

                            Text(
                                selectedDate.format(DateTimeFormatter.ofPattern("EEEE, d MMMM", Locale.ENGLISH)),
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Medium
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
                                Text(
                                    "No slots available on this day.",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            } else {
                                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
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

                item {
                    ContinueButton(
                        label = "Continue",
                        enabled = selectedSlot != null,
                        onClick = { currentStep = BookingFlowStep.PAYMENT_REVIEW }
                    )
                }
            }

            BookingFlowStep.PAYMENT_REVIEW -> {
                item {
                    StepHeader(
                        title = BookingFlowStep.PAYMENT_REVIEW.headerTitle,
                        subtitle = BookingFlowStep.PAYMENT_REVIEW.headerSubtitle
                    )
                }

                item {
                    val activeCard = savedCards.firstOrNull { it.id == selectedSavedCardId }
                    val cardSubtitle = activeCard?.let {
                        "**${it.last4} valid thru ${it.expiryMonth}/${it.expiryYear}"
                    } ?: "Add a card to pay by credit card"

                    ElevatedCard(
                        shape = RoundedCornerShape(24.dp),
                        colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface)
                    ) {
                        Column(
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 4.dp)
                        ) {
                            PaymentMethodRow(
                                label = PaymentMethodUi.CARD.title,
                                subtitle = if (selectedPaymentMethod == PaymentMethodUi.CARD) cardSubtitle else null,
                                selected = selectedPaymentMethod == PaymentMethodUi.CARD,
                                trailing = { CardBrandBadges() },
                                onClick = { selectedPaymentMethod = PaymentMethodUi.CARD },
                                onTrailingChevronClick = {
                                    if (savedCards.isEmpty()) showAddCardDialog = true
                                    else showCardChooserDialog = true
                                }
                            )

                            HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.4f))

                            PaymentMethodRow(
                                label = PaymentMethodUi.BANK_TRANSFER.title,
                                selected = selectedPaymentMethod == PaymentMethodUi.BANK_TRANSFER,
                                onClick = { selectedPaymentMethod = PaymentMethodUi.BANK_TRANSFER }
                            )

                            HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.4f))

                            PaymentMethodRow(
                                label = PaymentMethodUi.PAYPAL.title,
                                selected = false,
                                enabled = false,
                                subtitle = PaymentMethodUi.PAYPAL.helper,
                                onClick = {}
                            )
                        }
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

                item {
                    ContinueButton(
                        label = "Confirm booking",
                        enabled = selectedService != null && selectedSlot != null && selectedPaymentMethod.enabled && !submitting,
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
}

@Composable
private fun BookingHeader(
    currentStep: BookingFlowStep,
    onBack: () -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack, enabled = currentStep != BookingFlowStep.PROVIDER) {
                Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back")
            }
            Text(
                "Book a session",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold
            )
        }
    }
}

@Composable
private fun BookingStepper(currentStep: BookingFlowStep) {
    val steps = BookingFlowStep.ordered
    val stateIndex = currentStep.index
    val primary = MaterialTheme.colorScheme.primary
    val inactiveCircle = MaterialTheme.colorScheme.surfaceVariant
    val inactiveConnector = MaterialTheme.colorScheme.outline

    Row(
        modifier = Modifier.fillMaxWidth(),
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
                Spacer(Modifier.height(6.dp))
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
    ElevatedCard(
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 18.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Text(
                subtitle,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant
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
        shape = RoundedCornerShape(28.dp),
        colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 20.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            SelectIndicator(selected = selected)
            Spacer(Modifier.width(16.dp))
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(provider.tenantName, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                Text(provider.tenantCity ?: "Subscribed provider", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun ServiceCard(service: ServiceOption, selected: Boolean, onClick: () -> Unit) {
    ElevatedCard(
        onClick = onClick,
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.elevatedCardColors(
            containerColor = if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface
        )
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                SelectIndicator(selected = selected)
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text(
                        service.name,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(
                        service.description?.takeIf { it.isNotBlank() } ?: "Bookable service",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                PriceChip("${service.priceGross.formatPrice()} ${service.currency}")
            }
            Row(
                modifier = Modifier.padding(start = 46.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                TagPill(service.tenantName)
                service.durationMinutes?.let { TagPill("$it min") }
            }
        }
    }
}

@Composable
private fun MonthCalendar(
    selectedMonth: YearMonth,
    selectedDate: LocalDate,
    onMonthChange: (YearMonth) -> Unit,
    onDateSelected: (LocalDate) -> Unit
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
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
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
                    Icons.AutoMirrored.Rounded.ArrowBack,
                    contentDescription = "Previous month",
                    modifier = Modifier.size(18.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    selectedMonth.minusMonths(1).format(shortMonthFmt),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Text(
                selectedMonth.format(DateTimeFormatter.ofPattern("MMMM yyyy", Locale.ENGLISH)),
                style = MaterialTheme.typography.titleLarge,
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
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Icon(
                    Icons.AutoMirrored.Rounded.KeyboardArrowRight,
                    contentDescription = "Next month",
                    modifier = Modifier.size(18.dp),
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
                    style = MaterialTheme.typography.bodyMedium,
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
private fun RowScope.CalendarDateCell(date: LocalDate?, isSelected: Boolean, isEnabled: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .weight(1f)
            .padding(vertical = 4.dp),
        contentAlignment = Alignment.Center
    ) {
        if (date == null) {
            Spacer(Modifier.size(40.dp))
        } else {
            Surface(
                modifier = Modifier
                    .size(42.dp)
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
                        style = MaterialTheme.typography.titleMedium,
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
        shape = RoundedCornerShape(16.dp),
        color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface,
        border = if (selected) null else BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        tonalElevation = 0.dp
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 14.dp),
            contentAlignment = Alignment.Center
        ) {
            Text(
                time,
                color = if (selected) Color.White else MaterialTheme.colorScheme.onSurface,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Medium
            )
        }
    }
}

@Composable
private fun PaymentMethodRow(
    label: String,
    selected: Boolean,
    enabled: Boolean = true,
    subtitle: String? = null,
    trailing: (@Composable () -> Unit)? = null,
    onClick: () -> Unit,
    onTrailingChevronClick: (() -> Unit)? = null
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = enabled, onClick = onClick)
            .padding(vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        SelectIndicator(selected = selected, enabled = enabled)
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                label,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = if (enabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
            )
            subtitle?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        trailing?.invoke()
        if (onTrailingChevronClick != null) {
            IconButton(
                onClick = onTrailingChevronClick,
                enabled = enabled,
                modifier = Modifier.size(32.dp)
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
                                    .padding(horizontal = 14.dp, vertical = 12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                Icon(
                                    Icons.Rounded.CreditCard,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                    Text(
                                        card.label,
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.Medium
                                    )
                                    Text(
                                        "valid thru ${card.expiryMonth}/${card.expiryYear}",
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
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
            .height(56.dp),
        enabled = enabled && !loading,
        shape = RoundedCornerShape(22.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = MaterialTheme.colorScheme.primary,
            contentColor = Color.White,
            disabledContainerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.4f),
            disabledContentColor = Color.White
        )
    ) {
        if (loading) {
            CircularProgressIndicator(
                modifier = Modifier.size(20.dp),
                strokeWidth = 2.dp,
                color = Color.White
            )
        } else {
            Text(label, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun SelectIndicator(selected: Boolean, enabled: Boolean = true) {
    Surface(
        modifier = Modifier.size(34.dp),
        shape = CircleShape,
        color = when {
            selected -> MaterialTheme.colorScheme.primary
            else -> Color.Transparent
        },
        tonalElevation = if (selected) 0.dp else 0.dp
    ) {
        Box(contentAlignment = Alignment.Center) {
            when {
                selected -> Icon(Icons.Rounded.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
                enabled -> Icon(Icons.Rounded.RadioButtonUnchecked, contentDescription = null, tint = MaterialTheme.colorScheme.outline, modifier = Modifier.size(18.dp))
                else -> Icon(Icons.Rounded.RadioButtonUnchecked, contentDescription = null, tint = MaterialTheme.colorScheme.outlineVariant, modifier = Modifier.size(18.dp))
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
}.getOrElse { this }

private fun String.asSummaryDateTime(): String = runCatching {
    OffsetDateTime.parse(this)
        .atZoneSameInstant(ZoneId.systemDefault())
        .format(DateTimeFormatter.ofPattern("EEEE, d MMMM 'at' HH:mm", Locale.ENGLISH))
}.getOrElse { this }
