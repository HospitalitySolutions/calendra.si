package si.calendra.guest.android.ui.screens

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ReceiptLong
import androidx.compose.material.icons.outlined.LocalActivity
import androidx.compose.material.icons.outlined.ShoppingBag
import androidx.compose.material.icons.outlined.WorkspacePremium
import androidx.compose.material.icons.rounded.CardMembership
import androidx.compose.material.icons.rounded.ConfirmationNumber
import androidx.compose.material.icons.rounded.CreditCard
import androidx.compose.ui.draw.rotate
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import si.calendra.guest.shared.models.WalletOrder
import si.calendra.guest.shared.models.EntitlementSummary
import si.calendra.guest.shared.models.WalletPayload
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

private val WalletBlue = Color(0xFF124C9D)
private val WalletBlueSoft = Color(0xFF2E66B3)
private val WalletAmber = Color(0xFFE6892D)
private val WalletGreen = Color(0xFF1F9E5A)
private val WalletGreenSoft = Color(0xFFE6F5EE)
private val WalletSurfaceTint = Color(0xFFF4F7FC)

enum class WalletSubTab(val icon: androidx.compose.ui.graphics.vector.ImageVector) {
    Entitlements(Icons.Outlined.WorkspacePremium),
    Buy(Icons.Outlined.ShoppingBag),
    Orders(Icons.AutoMirrored.Outlined.ReceiptLong);

    fun localizedTitle(languageCode: String): String {
        val sl = languageCode.equals("sl", ignoreCase = true)
        return when (this) {
            Entitlements -> if (sl) "Vstopnice" else "Entitlements"
            Buy -> if (sl) "Nakup" else "Buy"
            Orders -> if (sl) "Naročila" else "Orders"
        }
    }
}

data class WalletOfferCard(
    val companyId: String,
    val productId: String,
    val name: String,
    val productType: String,
    val priceGross: Double,
    val currency: String,
    val description: String? = null,
    val sessionTypeName: String? = null,
    val promoText: String? = null,
    val validityDays: Int? = null,
    val usageLimit: Int? = null
)

@Composable
fun WalletScreen(
    wallet: WalletPayload?,
    offers: List<WalletOfferCard> = emptyList(),
    tenantPaymentMethods: List<String> = listOf("CARD", "BANK_TRANSFER", "PAYPAL"),
    /** Guest profile language (`en`, `sl`, …); drives wallet sub-tab labels. */
    languageCode: String = "en",
    initialSubTab: WalletSubTab = WalletSubTab.Entitlements,
    onBuyOffer: (WalletOfferCard, String) -> Unit = { _, _ -> },
    onToggleAutoRenew: (String, Boolean) -> Unit = { _, _ -> },
    onSwitchToOrders: () -> Unit = {}
) {
    var subTab by remember { mutableStateOf(initialSubTab) }
    var focusedEntitlementId by remember { mutableStateOf<String?>(null) }
    var pendingOffer by remember { mutableStateOf<WalletOfferCard?>(null) }

    if (wallet == null) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        return
    }

    val entitlements = wallet.entitlements
    val orderedEntitlements = remember(entitlements, focusedEntitlementId) {
        if (focusedEntitlementId == null) entitlements
        else {
            val target = entitlements.firstOrNull { it.entitlementId == focusedEntitlementId }
            if (target == null) entitlements
            else listOf(target) + entitlements.filter { it.entitlementId != focusedEntitlementId }
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        WalletSegmentedControl(
            current = subTab,
            languageCode = languageCode,
            onSelect = { subTab = it },
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 12.dp)
        )

        AnimatedContent(
            targetState = subTab,
            transitionSpec = {
                (fadeIn(tween(180)) + slideInVertically { it / 12 }) togetherWith
                    (fadeOut(tween(120)) + slideOutVertically { -it / 12 })
            },
            label = "walletSubTab"
        ) { tab ->
            when (tab) {
                WalletSubTab.Entitlements -> EntitlementsPanel(
                    entitlements = orderedEntitlements,
                    onFocus = { focusedEntitlementId = it },
                    onToggleAutoRenew = onToggleAutoRenew
                )
                WalletSubTab.Buy -> BuyPanel(
                    offers = offers,
                    onBuyClick = { pendingOffer = it }
                )
                WalletSubTab.Orders -> OrdersPanel(orders = wallet.orders)
            }
        }
    }

    pendingOffer?.let { offer ->
        BuyPaymentSheet(
            offer = offer,
            availableMethods = tenantPaymentMethods,
            onDismiss = { pendingOffer = null },
            onConfirm = { paymentMethod ->
                pendingOffer = null
                onBuyOffer(offer, paymentMethod)
                subTab = WalletSubTab.Orders
                onSwitchToOrders()
            }
        )
    }
}

@Composable
private fun WalletSegmentedControl(
    current: WalletSubTab,
    languageCode: String,
    onSelect: (WalletSubTab) -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(14.dp),
        color = WalletSurfaceTint,
        tonalElevation = 0.dp
    ) {
        Row(modifier = Modifier.padding(4.dp)) {
            WalletSubTab.values().forEach { tab ->
                val selected = tab == current
                Surface(
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(min = 44.dp)
                        .clickable { onSelect(tab) },
                    color = if (selected) WalletBlue else Color.Transparent,
                    shape = RoundedCornerShape(10.dp),
                    tonalElevation = 0.dp
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 6.dp),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = tab.icon,
                            contentDescription = null,
                            tint = if (selected) Color.White else Color(0xFF4E617B),
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(Modifier.width(4.dp))
                        Text(
                            text = tab.localizedTitle(languageCode),
                            color = if (selected) Color.White else Color(0xFF4E617B),
                            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
                            fontSize = 12.sp,
                            lineHeight = 14.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
            }
        }
    }
}

// ---------- Entitlements ----------

@Composable
private fun EntitlementsPanel(
    entitlements: List<EntitlementSummary>,
    onFocus: (String) -> Unit,
    onToggleAutoRenew: (String, Boolean) -> Unit
) {
    if (entitlements.isEmpty()) {
        EmptyState(
            icon = Icons.Rounded.ConfirmationNumber,
            title = "No entitlements yet",
            subtitle = "Purchases from the Buy tab will show up here as tickets, packs and memberships."
        )
        return
    }
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 4.dp, bottom = 124.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        val top = entitlements.firstOrNull()
        if (top != null) {
            item(key = "top-${top.entitlementId}") {
                Column {
                    EntitlementTicketCard(
                        entitlement = top,
                        onToggleAutoRenew = onToggleAutoRenew,
                        onTap = { onFocus(top.entitlementId) }
                    )
                    Spacer(Modifier.height(6.dp))
                }
            }
        }
        val rest = if (entitlements.size > 1) entitlements.drop(1) else emptyList()
        if (rest.isNotEmpty()) {
            items(rest, key = { it.entitlementId }) { ent ->
                EntitlementCompactRow(ent, onClick = { onFocus(ent.entitlementId) })
            }
        }
    }
}

@Composable
private fun EntitlementTicketCard(
    entitlement: EntitlementSummary,
    onToggleAutoRenew: (String, Boolean) -> Unit,
    onTap: () -> Unit
) {
    val type = entitlement.entitlementType
    val currency = entitlement.currency?.takeIf { it.isNotBlank() } ?: "EUR"
    val price = entitlement.priceGross
    val priceLine = buildString {
        if (price != null) {
            append(formatPrice(price))
            append(' ')
            append(currency)
            append(" • ")
        }
        append(productTypeLabel(type))
    }
    val validUntilText = if (entitlement.validityDays != null) formatLongDate(entitlement.validUntil) else null
    val accessHeadline = when (type) {
        "PACK" -> "Event access"
        "CLASS_TICKET" -> "Single entry"
        "MEMBERSHIP" -> "Event access"
        else -> "Access"
    }
    val accessSub = when (type) {
        "PACK" -> {
            val remaining = entitlement.remainingUses
            val total = entitlement.totalUses
            when {
                remaining != null && total != null -> "$remaining of $total tickets remaining"
                remaining != null -> "$remaining remaining"
                total != null -> "Valid for $total entries"
                else -> null
            }
        }
        else -> null
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onTap() }
    ) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = TicketShape(cornerRadius = 28.dp, notchRadius = 14.dp, notchFractionX = 0.62f),
            color = WalletBlue,
            tonalElevation = 0.dp,
            shadowElevation = 6.dp
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(IntrinsicSize.Min),
                verticalAlignment = Alignment.Top
            ) {
                Column(
                    modifier = Modifier
                        .weight(0.62f)
                        .padding(start = 20.dp, top = 20.dp, bottom = 20.dp, end = 14.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    EntitlementIconBadge(
                        type = type,
                        size = 52.dp,
                        background = Color.White.copy(alpha = 0.15f),
                        tint = Color.White
                    )
                    Text(
                        text = entitlement.productName,
                        color = Color.White,
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold,
                        lineHeight = 26.sp
                    )
                    Text(
                        text = priceLine,
                        color = Color.White.copy(alpha = 0.88f),
                        fontWeight = FontWeight.Medium
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(Color.White.copy(alpha = 0.18f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.LocalActivity,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                        Spacer(Modifier.width(10.dp))
                        Column(modifier = Modifier.weight(1f, fill = false)) {
                            Text(
                                text = accessHeadline,
                                color = Color.White,
                                fontWeight = FontWeight.SemiBold
                            )
                            if (!accessSub.isNullOrBlank()) {
                                Text(
                                    text = accessSub,
                                    color = Color.White.copy(alpha = 0.75f),
                                    fontSize = 12.sp
                                )
                            }
                        }
                    }
                }

                VerticalDashedDivider(
                    modifier = Modifier
                        .padding(vertical = 20.dp)
                        .fillMaxHeight()
                )

                Column(
                    modifier = Modifier
                        .weight(0.38f)
                        .padding(start = 14.dp, top = 20.dp, bottom = 20.dp, end = 20.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Text(
                        text = "TICKET ID",
                        color = Color.White.copy(alpha = 0.65f),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        letterSpacing = 0.5.sp
                    )
                    Text(
                        text = entitlement.displayCode ?: "—",
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp
                    )
                    if (validUntilText != null) {
                        Spacer(Modifier.height(4.dp))
                        DashedSeparator()
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = "VALID UNTIL",
                            color = Color.White.copy(alpha = 0.65f),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold,
                            letterSpacing = 0.5.sp
                        )
                        Text(
                            text = validUntilText,
                            color = Color.White,
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp
                        )
                    }
                }
            }
        }

        if (type == "MEMBERSHIP") {
            Spacer(Modifier.height(8.dp))
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                color = Color.White,
                tonalElevation = 0.dp,
                shadowElevation = 1.dp
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(text = "Auto-renew", fontWeight = FontWeight.Medium)
                    Switch(
                        checked = entitlement.autoRenews,
                        onCheckedChange = { checked -> onToggleAutoRenew(entitlement.entitlementId, checked) }
                    )
                }
            }
        }
    }
}

@Composable
private fun VerticalDashedDivider(modifier: Modifier = Modifier) {
    val color = Color.White.copy(alpha = 0.45f)
    androidx.compose.foundation.Canvas(
        modifier = modifier.width(1.dp)
    ) {
        drawLine(
            color = color,
            start = Offset(size.width / 2, 0f),
            end = Offset(size.width / 2, size.height),
            strokeWidth = 1.5f,
            pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 8f))
        )
    }
}

/**
 * Rounded rectangle with a circular notch cut out of the top and bottom edges at `notchFractionX`.
 * Produces the classic "ticket" silhouette where the notches sit on the vertical perforation.
 */
private class TicketShape(
    private val cornerRadius: Dp,
    private val notchRadius: Dp,
    private val notchFractionX: Float
) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        val r = with(density) { cornerRadius.toPx() }.coerceAtMost(size.minDimension / 2f)
        val nr = with(density) { notchRadius.toPx() }.coerceAtMost(size.minDimension / 3f)
        val cx = size.width * notchFractionX
        val path = Path().apply {
            moveTo(r, 0f)
            lineTo(cx - nr, 0f)
            // Top notch (concave, opens downward into the card)
            arcTo(
                rect = Rect(left = cx - nr, top = -nr, right = cx + nr, bottom = nr),
                startAngleDegrees = 180f,
                sweepAngleDegrees = -180f,
                forceMoveTo = false
            )
            lineTo(size.width - r, 0f)
            arcTo(
                rect = Rect(left = size.width - 2 * r, top = 0f, right = size.width, bottom = 2 * r),
                startAngleDegrees = -90f,
                sweepAngleDegrees = 90f,
                forceMoveTo = false
            )
            lineTo(size.width, size.height - r)
            arcTo(
                rect = Rect(left = size.width - 2 * r, top = size.height - 2 * r, right = size.width, bottom = size.height),
                startAngleDegrees = 0f,
                sweepAngleDegrees = 90f,
                forceMoveTo = false
            )
            lineTo(cx + nr, size.height)
            // Bottom notch (concave, opens upward into the card)
            arcTo(
                rect = Rect(left = cx - nr, top = size.height - nr, right = cx + nr, bottom = size.height + nr),
                startAngleDegrees = 0f,
                sweepAngleDegrees = -180f,
                forceMoveTo = false
            )
            lineTo(r, size.height)
            arcTo(
                rect = Rect(left = 0f, top = size.height - 2 * r, right = 2 * r, bottom = size.height),
                startAngleDegrees = 90f,
                sweepAngleDegrees = 90f,
                forceMoveTo = false
            )
            lineTo(0f, r)
            arcTo(
                rect = Rect(left = 0f, top = 0f, right = 2 * r, bottom = 2 * r),
                startAngleDegrees = 180f,
                sweepAngleDegrees = 90f,
                forceMoveTo = false
            )
            close()
        }
        return Outline.Generic(path)
    }
}

@Composable
private fun EntitlementCompactRow(entitlement: EntitlementSummary, onClick: () -> Unit) {
    val compactShape = remember {
        CompactTicketShape(cornerRadius = 18.dp, notchRadius = 10.dp)
    }
    val priceGross = entitlement.priceGross
    val currency = entitlement.currency?.takeIf { it.isNotBlank() } ?: "EUR"
    val subtitle = when (entitlement.entitlementType) {
        "CLASS_TICKET" -> "Single entry"
        "MEMBERSHIP" -> "Event access"
        "PACK" -> {
            val remaining = entitlement.remainingUses
            if (remaining != null) "Event access • $remaining left" else "Event access"
        }
        else -> productTypeLabel(entitlement.entitlementType)
    }
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() },
        shape = compactShape,
        color = Color.White,
        tonalElevation = 0.dp,
        shadowElevation = 1.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(IntrinsicSize.Min),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                modifier = Modifier
                    .weight(1f)
                    .padding(start = 14.dp, top = 14.dp, bottom = 14.dp, end = 10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                EntitlementIconBadge(
                    type = entitlement.entitlementType,
                    size = 44.dp,
                    background = WalletBlue.copy(alpha = 0.12f),
                    tint = WalletBlue
                )
                Spacer(Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = entitlement.productName,
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = subtitle,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            CompactVerticalDashedDivider(
                modifier = Modifier
                    .padding(vertical = 14.dp)
                    .fillMaxHeight()
            )
            Box(
                modifier = Modifier
                    .width(120.dp)
                    .padding(start = 10.dp, top = 14.dp, bottom = 14.dp, end = 14.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = if (priceGross != null) "${formatPrice(priceGross)} $currency" else "—",
                    color = WalletBlue,
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp
                )
            }
        }
    }
}

@Composable
private fun CompactVerticalDashedDivider(modifier: Modifier = Modifier) {
    val color = WalletBlue.copy(alpha = 0.35f)
    androidx.compose.foundation.Canvas(
        modifier = modifier.width(1.dp)
    ) {
        drawLine(
            color = color,
            start = Offset(size.width / 2, 0f),
            end = Offset(size.width / 2, size.height),
            strokeWidth = 1.5f,
            pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 6f))
        )
    }
}

/**
 * Horizontal ticket silhouette: rounded rectangle with circular notches cut from the left and
 * right edges at `notchFractionY` (defaults to middle-height). Used for the stacked entitlement
 * rows below the focused ticket.
 */
private class CompactTicketShape(
    private val cornerRadius: Dp,
    private val notchRadius: Dp,
    private val notchFractionY: Float = 0.5f
) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        val r = with(density) { cornerRadius.toPx() }.coerceAtMost(size.minDimension / 2f)
        val nr = with(density) { notchRadius.toPx() }.coerceAtMost(size.height / 3f)
        val cy = size.height * notchFractionY
        val path = Path().apply {
            moveTo(r, 0f)
            lineTo(size.width - r, 0f)
            arcTo(
                rect = Rect(left = size.width - 2 * r, top = 0f, right = size.width, bottom = 2 * r),
                startAngleDegrees = -90f,
                sweepAngleDegrees = 90f,
                forceMoveTo = false
            )
            lineTo(size.width, cy - nr)
            // Right notch (concave, opens leftward into the card)
            arcTo(
                rect = Rect(left = size.width - nr, top = cy - nr, right = size.width + nr, bottom = cy + nr),
                startAngleDegrees = 270f,
                sweepAngleDegrees = -180f,
                forceMoveTo = false
            )
            lineTo(size.width, size.height - r)
            arcTo(
                rect = Rect(left = size.width - 2 * r, top = size.height - 2 * r, right = size.width, bottom = size.height),
                startAngleDegrees = 0f,
                sweepAngleDegrees = 90f,
                forceMoveTo = false
            )
            lineTo(r, size.height)
            arcTo(
                rect = Rect(left = 0f, top = size.height - 2 * r, right = 2 * r, bottom = size.height),
                startAngleDegrees = 90f,
                sweepAngleDegrees = 90f,
                forceMoveTo = false
            )
            lineTo(0f, cy + nr)
            // Left notch (concave, opens rightward into the card)
            arcTo(
                rect = Rect(left = -nr, top = cy - nr, right = nr, bottom = cy + nr),
                startAngleDegrees = 90f,
                sweepAngleDegrees = -180f,
                forceMoveTo = false
            )
            lineTo(0f, r)
            arcTo(
                rect = Rect(left = 0f, top = 0f, right = 2 * r, bottom = 2 * r),
                startAngleDegrees = 180f,
                sweepAngleDegrees = 90f,
                forceMoveTo = false
            )
            close()
        }
        return Outline.Generic(path)
    }
}

@Composable
private fun EntitlementIconBadge(type: String, size: Dp, background: Color, tint: Color) {
    Box(
        modifier = Modifier
            .size(size)
            .clip(RoundedCornerShape(14.dp))
            .background(background),
        contentAlignment = Alignment.Center
    ) {
        when (type) {
            "PACK" -> {
                Box(modifier = Modifier.size(size * 0.75f), contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = Icons.Outlined.LocalActivity,
                        contentDescription = null,
                        tint = tint.copy(alpha = 0.55f),
                        modifier = Modifier
                            .size(size * 0.6f)
                            .align(Alignment.TopEnd)
                            .rotate(14f)
                    )
                    Icon(
                        imageVector = Icons.Outlined.LocalActivity,
                        contentDescription = null,
                        tint = tint,
                        modifier = Modifier
                            .size(size * 0.6f)
                            .align(Alignment.BottomStart)
                            .rotate(-8f)
                    )
                }
            }
            "MEMBERSHIP" -> Icon(
                imageVector = Icons.Rounded.CardMembership,
                contentDescription = null,
                tint = tint,
                modifier = Modifier.size(size * 0.5f)
            )
            else -> Icon(
                imageVector = Icons.Outlined.LocalActivity,
                contentDescription = null,
                tint = tint,
                modifier = Modifier.size(size * 0.58f)
            )
        }
    }
}

private fun productTypeLabel(type: String): String = when (type) {
    "PACK" -> "Pack"
    "MEMBERSHIP" -> "Membership"
    "CLASS_TICKET" -> "Class ticket"
    else -> type.lowercase(Locale.getDefault()).replaceFirstChar { it.uppercase() }
}

@Composable
private fun DashedSeparator() {
    val color = Color.White.copy(alpha = 0.45f)
    androidx.compose.foundation.Canvas(
        modifier = Modifier
            .fillMaxWidth()
            .height(1.dp)
    ) {
        drawLine(
            color = color,
            start = Offset(0f, size.height / 2),
            end = Offset(size.width, size.height / 2),
            strokeWidth = 1.5f,
            pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 8f))
        )
    }
}

// ---------- Buy ----------

@Composable
private fun BuyPanel(
    offers: List<WalletOfferCard>,
    onBuyClick: (WalletOfferCard) -> Unit
) {
    if (offers.isEmpty()) {
        EmptyState(
            icon = Icons.Rounded.CreditCard,
            title = "Nothing to buy yet",
            subtitle = "Your tenant has not published any tickets, packs, or memberships."
        )
        return
    }
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 4.dp, bottom = 124.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        items(offers, key = { it.companyId + "-" + it.productId }) { offer ->
            BuyOfferCard(offer = offer, onBuyClick = { onBuyClick(offer) })
        }
    }
}

@Composable
private fun BuyOfferCard(offer: WalletOfferCard, onBuyClick: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(22.dp),
        color = Color.White,
        tonalElevation = 0.dp,
        shadowElevation = 2.dp
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                EntitlementIconBadge(
                    type = offer.productType,
                    size = 96.dp,
                    background = WalletBlue,
                    tint = Color.White
                )
                Spacer(Modifier.width(14.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.Top
                    ) {
                        Text(
                            text = offer.name,
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 17.sp,
                            modifier = Modifier.weight(1f, fill = false)
                        )
                        if (!offer.promoText.isNullOrBlank()) {
                            Spacer(Modifier.width(8.dp))
                            PromoChip(text = offer.promoText)
                        }
                    }
                    Text(
                        text = productTypeLabel(offer.productType),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = FontWeight.Medium
                    )
                    if (!offer.description.isNullOrBlank()) {
                        Text(
                            text = offer.description,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 4.dp)
                        )
                    }
                    Text(
                        text = "${formatPrice(offer.priceGross)} ${offer.currency}",
                        color = MaterialTheme.colorScheme.onSurface,
                        fontWeight = FontWeight.Bold,
                        fontSize = 18.sp,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                }
            }
            Button(
                onClick = onBuyClick,
                modifier = Modifier.fillMaxWidth().height(48.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(containerColor = WalletBlue, contentColor = Color.White)
            ) {
                Icon(Icons.Rounded.CreditCard, contentDescription = null, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Text("Buy", fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
private fun PromoChip(text: String) {
    Surface(
        color = WalletGreenSoft,
        shape = RoundedCornerShape(999.dp)
    ) {
        Text(
            text = text,
            color = WalletGreen,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
            fontSize = 12.sp
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BuyPaymentSheet(
    offer: WalletOfferCard,
    availableMethods: List<String>,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val methods = remember(availableMethods) {
        availableMethods
            .filter { it == "CARD" || it == "BANK_TRANSFER" || it == "PAYPAL" }
            .ifEmpty { listOf("CARD", "BANK_TRANSFER", "PAYPAL") }
    }
    var selected by remember { mutableStateOf(methods.firstOrNull() ?: "CARD") }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = Color.White
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(bottom = 20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text("Choose a payment method", fontWeight = FontWeight.Bold, fontSize = 18.sp)
            Text(
                text = "${offer.name} • ${formatPrice(offer.priceGross)} ${offer.currency}",
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            methods.forEach { method ->
                PaymentMethodRow(
                    method = method,
                    selected = selected == method,
                    onSelect = { selected = method }
                )
            }
            Button(
                onClick = { onConfirm(selected) },
                modifier = Modifier.fillMaxWidth().height(52.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(containerColor = WalletBlue, contentColor = Color.White)
            ) {
                Text("Continue", fontWeight = FontWeight.SemiBold)
            }
            TextButton(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) { Text("Cancel") }
        }
    }
}

@Composable
private fun PaymentMethodRow(method: String, selected: Boolean, onSelect: () -> Unit) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onSelect() },
        shape = RoundedCornerShape(14.dp),
        color = if (selected) WalletBlue.copy(alpha = 0.08f) else WalletSurfaceTint,
        border = if (selected) androidx.compose.foundation.BorderStroke(1.5.dp, WalletBlue) else null,
        tonalElevation = 0.dp
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            RadioButton(selected = selected, onClick = onSelect)
            Spacer(Modifier.width(4.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(text = paymentMethodLabel(method), fontWeight = FontWeight.SemiBold)
                Text(text = paymentMethodHelper(method), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

private fun paymentMethodLabel(method: String): String = when (method) {
    "CARD" -> "Credit or debit card"
    "PAYPAL" -> "PayPal"
    "BANK_TRANSFER" -> "Bank transfer"
    else -> method
}

private fun paymentMethodHelper(method: String): String = when (method) {
    "CARD" -> "Instant confirmation"
    "PAYPAL" -> "Redirects to PayPal"
    "BANK_TRANSFER" -> "Pay with reference code; activated after reconciliation"
    else -> ""
}

// ---------- Orders ----------

@Composable
private fun OrdersPanel(orders: List<WalletOrder>) {
    if (orders.isEmpty()) {
        EmptyState(
            icon = Icons.Rounded.CreditCard,
            title = "No orders yet",
            subtitle = "Purchases made on the Buy tab will appear here with their invoice status."
        )
        return
    }
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 4.dp, bottom = 124.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Recent orders", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                Text("View all orders", color = WalletBlue, fontWeight = FontWeight.SemiBold)
            }
        }
        items(orders, key = { it.orderId }) { order ->
            OrderRow(order = order)
        }
    }
}

@Composable
private fun OrderRow(order: WalletOrder) {
    val status = resolveOrderStatus(order)
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        color = Color.White,
        tonalElevation = 0.dp,
        shadowElevation = 1.dp
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            EntitlementIconBadge(
                type = order.productType ?: "CLASS_TICKET",
                size = 44.dp,
                background = WalletBlue.copy(alpha = 0.12f),
                tint = WalletBlue
            )
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = order.productName ?: "Order",
                    fontWeight = FontWeight.SemiBold
                )
                val reference = order.referenceCode?.takeIf { it.isNotBlank() }?.let { "Order #$it" } ?: "Order ${order.orderId}"
                Text(
                    text = reference,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 12.sp
                )
                val createdAt = formatOrderDate(order.createdAt)
                if (createdAt.isNotBlank()) {
                    Text(
                        text = createdAt,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 12.sp
                    )
                }
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = "${formatPrice(order.totalGross)} ${order.currency}",
                    fontWeight = FontWeight.SemiBold
                )
                Spacer(Modifier.height(4.dp))
                StatusChip(status = status)
            }
        }
    }
}

private enum class OrderChipStatus { Completed, Pending, Refunded }

private fun resolveOrderStatus(order: WalletOrder): OrderChipStatus {
    val bill = order.billPaymentStatus?.uppercase()
    val status = order.status.uppercase()
    if (status == "REFUNDED") return OrderChipStatus.Refunded
    if (status == "PAID" && bill == "PAID") return OrderChipStatus.Completed
    if (order.paymentMethodType.uppercase() == "BANK_TRANSFER" && bill == "PAYMENT_PENDING") return OrderChipStatus.Pending
    if (status == "PAID") return OrderChipStatus.Completed
    return OrderChipStatus.Pending
}

@Composable
private fun StatusChip(status: OrderChipStatus) {
    val (label, bg, fg) = when (status) {
        OrderChipStatus.Completed -> Triple("Completed", WalletGreenSoft, WalletGreen)
        OrderChipStatus.Pending -> Triple("Pending", Color(0xFFFFF3E0), WalletAmber)
        OrderChipStatus.Refunded -> Triple("Refunded", Color(0xFFEDEFF3), Color(0xFF54627A))
    }
    Surface(color = bg, shape = RoundedCornerShape(999.dp)) {
        Text(
            text = label,
            color = fg,
            fontWeight = FontWeight.SemiBold,
            fontSize = 12.sp,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
        )
    }
}

// ---------- Utilities ----------

@Composable
private fun EmptyState(icon: ImageVector, title: String, subtitle: String) {
    Box(modifier = Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(48.dp)
            )
            Text(title, fontWeight = FontWeight.SemiBold, fontSize = 18.sp, textAlign = TextAlign.Center)
            Text(
                subtitle,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
        }
    }
}

private fun formatPrice(value: Double): String =
    String.format(Locale.getDefault(), "%.2f", value)

private fun formatLongDate(iso: String?): String {
    if (iso.isNullOrBlank()) return "—"
    return runCatching {
        val parsed = OffsetDateTime.parse(iso)
        parsed.format(DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.getDefault()))
    }.getOrElse { iso.take(10) }
}

private fun formatOrderDate(iso: String?): String {
    if (iso.isNullOrBlank()) return ""
    return runCatching {
        val parsed = OffsetDateTime.parse(iso)
        parsed.format(DateTimeFormatter.ofPattern("MMM d, yyyy • HH:mm", Locale.getDefault()))
    }.getOrElse { iso.take(16) }
}
