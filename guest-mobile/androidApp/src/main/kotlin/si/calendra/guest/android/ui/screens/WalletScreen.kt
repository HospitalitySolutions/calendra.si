package si.calendra.guest.android.ui.screens

import android.graphics.Bitmap
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ReceiptLong
import androidx.compose.material.icons.outlined.LocalActivity
import androidx.compose.material.icons.outlined.ShoppingBag
import androidx.compose.material.icons.outlined.WorkspacePremium
import androidx.compose.material.icons.rounded.CardMembership
import androidx.compose.material.icons.rounded.Business
import androidx.compose.material.icons.rounded.ConfirmationNumber
import androidx.compose.material.icons.rounded.CreditCard
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.NotificationsNone
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.Replay
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.FitnessCenter
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.runtime.key
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.draw.shadow
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import si.calendra.guest.shared.models.WalletOrder
import si.calendra.guest.shared.models.EntitlementSummary
import si.calendra.guest.shared.models.WalletPayload
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.abs
import com.google.zxing.MultiFormatWriter
import com.google.zxing.BarcodeFormat

private val WalletInk = Color(0xFF1F2A44)
private val WalletMuted = Color(0xFF7B879D)
private val WalletGold = Color(0xFFE6892D)
private val WalletGoldSoft = Color(0xFFFFF2E3)
private val WalletLine = Color(0xFFD4E0F2)
private val WalletBlue = Color(0xFF124C9D)
private val WalletBlueSoft = Color(0xFF0D61D3)
private val WalletAmber = Color(0xFFE6892D)
private val WalletGreen = Color(0xFF1F9E5A)
private val WalletGreenSoft = Color(0xFFE6F5EE)
private val WalletSurfaceTint = Color(0xFFF5FAFF)
private val WalletCardCream = Color(0xFFFFF7EE)
private val WalletCardMint = Color(0xFFF1F8EF)
private val WalletCardLavender = Color(0xFFF6F0FF)
private val WalletCardBlue = Color(0xFFEFF8FF)
private val WalletCardRose = Color(0xFFFFF2EC)

enum class WalletSubTab(val icon: androidx.compose.ui.graphics.vector.ImageVector) {
    Entitlements(Icons.Outlined.WorkspacePremium),
    Buy(Icons.Outlined.ShoppingBag),
    Orders(Icons.AutoMirrored.Outlined.ReceiptLong);

    fun localizedTitle(languageCode: String): String = when (this) {
        Entitlements -> "Entitlements"
        Orders -> "Orders"
        Buy -> "Buy"
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
    accessCards: List<AccessCard> = emptyList(),
    offers: List<WalletOfferCard> = emptyList(),
    tenantPaymentMethods: List<String> = listOf("CARD", "BANK_TRANSFER", "PAYPAL"),
    /** Guest profile language (`en`, `sl`, …); drives wallet sub-tab labels. */
    languageCode: String = "en",
    initialSubTab: WalletSubTab = WalletSubTab.Entitlements,
    tenantName: String? = null,
    onOpenTenantPicker: () -> Unit = {},
    onBuyOffer: (WalletOfferCard, String) -> Unit = { _, _ -> },
    onViewReceipt: (WalletOrder) -> Unit = {},
    onToggleAutoRenew: (String, Boolean) -> Unit = { _, _ -> },
    onSwitchToOrders: () -> Unit = {},
    onOpenNotifications: () -> Unit = {},
    onSubTabChanged: (WalletSubTab) -> Unit = {}
) {
    var subTab by remember { mutableStateOf(initialSubTab) }
    var focusedEntitlementId by remember { mutableStateOf<String?>(null) }
    var pendingOffer by remember { mutableStateOf<WalletOfferCard?>(null) }
    var qrPopup by remember { mutableStateOf<WalletQRCodePopupModel?>(null) }
    androidx.compose.runtime.LaunchedEffect(subTab) {
        onSubTabChanged(subTab)
    }

    if (wallet == null) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        return
    }

    val entitlements = wallet.entitlements

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(Color(0xFFF2F8FF), Color(0xFFFFF7EF))
                )
            )
    ) {
        WalletHeader(
            tenantName = tenantName,
            onOpenTenantPicker = onOpenTenantPicker,
            onOpenNotifications = onOpenNotifications
        )

        WalletSegmentedControl(
            current = subTab,
            languageCode = languageCode,
            onSelect = { subTab = it },
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 8.dp)
        )

        when (subTab) {
            WalletSubTab.Entitlements -> EntitlementsPanel(
                entitlements = entitlements,
                accessCards = accessCards,
                focusedEntitlementId = focusedEntitlementId,
                onFocus = { focusedEntitlementId = it },
                onQRCodeTap = { card, code ->
                    qrPopup = WalletQRCodePopupModel(
                        title = "Scan access code",
                        subtitle = "Show this at reception",
                        code = code,
                        entitlementId = card.id
                    )
                },
                onToggleAutoRenew = onToggleAutoRenew
            )
            WalletSubTab.Buy -> BuyPanel(
                offers = offers,
                availableMethods = tenantPaymentMethods,
                onBuyClick = { pendingOffer = it }
            )
            WalletSubTab.Orders -> OrdersPanel(
                orders = wallet.orders,
                tenantName = tenantName,
                onViewReceipt = onViewReceipt
            )
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
                if (paymentMethod == "BANK_TRANSFER") {
                    subTab = WalletSubTab.Orders
                    onSwitchToOrders()
                } else {
                    subTab = WalletSubTab.Entitlements
                }
            }
        )
    }

    qrPopup?.let { popup ->
        WalletQRCodePopupDialog(model = popup, onDismiss = { qrPopup = null })
    }
}

@Composable
private fun WalletHeader(
    tenantName: String?,
    onOpenTenantPicker: () -> Unit,
    onOpenNotifications: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Surface(
            modifier = Modifier
                .widthIn(max = 180.dp)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = onOpenTenantPicker
                ),
            shape = RoundedCornerShape(999.dp),
            color = Color.White,
            border = BorderStroke(1.dp, WalletLine.copy(alpha = 0.95f)),
            shadowElevation = 5.dp,
            tonalElevation = 0.dp
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 9.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Icon(
                    imageVector = Icons.Rounded.Business,
                    contentDescription = null,
                    tint = WalletInk,
                    modifier = Modifier.size(17.dp)
                )
                Text(
                    text = tenantName?.takeIf { it.isNotBlank() } ?: "Calendra",
                    color = WalletInk,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Normal,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.widthIn(max = 52.dp)
                )
                Icon(
                    imageVector = Icons.Rounded.KeyboardArrowDown,
                    contentDescription = null,
                    tint = WalletBlueSoft,
                    modifier = Modifier.size(18.dp)
                )
            }
        }
        Spacer(Modifier.weight(1f))
        Box(
            modifier = Modifier
                .size(44.dp)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = onOpenNotifications
                ),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = Icons.Rounded.NotificationsNone,
                contentDescription = "Notifications",
                tint = WalletInk,
                modifier = Modifier.size(24.dp)
            )
        }
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
        shape = RoundedCornerShape(999.dp),
        color = Color(0xFFE9EEF5),
        border = BorderStroke(1.dp, WalletLine.copy(alpha = 0.85f)),
        tonalElevation = 0.dp,
        shadowElevation = 5.dp
    ) {
        Row(modifier = Modifier.padding(3.dp)) {
            WalletSubTab.values().forEach { tab ->
                val selected = tab == current
                Surface(
                    modifier = Modifier
                        .weight(1f)
                        .height(42.dp)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null
                        ) { onSelect(tab) },
                    color = if (selected) WalletBlueSoft else Color.Transparent,
                    shape = RoundedCornerShape(999.dp),
                    tonalElevation = 0.dp,
                    shadowElevation = if (selected) 8.dp else 0.dp
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text(
                            text = tab.localizedTitle(languageCode),
                            color = if (selected) Color.White else WalletInk.copy(alpha = 0.88f),
                            fontWeight = if (selected) FontWeight.Bold else FontWeight.SemiBold,
                            fontSize = 13.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun WalletEntitlementFilterRow(
    activeCount: Int,
    inactiveCount: Int,
    showInactive: Boolean,
    onToggleStatusFilter: () -> Unit,
    selectedFilter: String,
    onFilterSelected: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        listOf("All", "Tickets", "Memberships").forEach { label ->
            val selected = label == selectedFilter
            Surface(
                modifier = Modifier.clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = { onFilterSelected(label) }
                ),
                shape = RoundedCornerShape(999.dp),
                color = if (selected) WalletBlueSoft else Color.White.copy(alpha = 0.94f),
                border = BorderStroke(1.dp, if (selected) WalletBlueSoft.copy(alpha = 0.45f) else WalletLine.copy(alpha = 0.95f)),
                shadowElevation = if (selected) 6.dp else 2.dp,
                tonalElevation = 0.dp
            ) {
                Box(
                    modifier = Modifier
                        .height(32.dp)
                        .padding(horizontal = if (selected) 12.dp else 10.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = label,
                        color = if (selected) Color.White else WalletInk.copy(alpha = 0.88f),
                        fontSize = 12.sp,
                        fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                        maxLines = 1
                    )
                }
            }
        }
        Spacer(Modifier.weight(1f))
        Surface(
            modifier = Modifier.clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onToggleStatusFilter
            ),
            shape = RoundedCornerShape(999.dp),
            color = Color.White.copy(alpha = 0.94f),
            border = BorderStroke(1.dp, if (showInactive) Color(0xFFF2B8B5) else WalletLine.copy(alpha = 0.95f)),
            tonalElevation = 0.dp,
            shadowElevation = if (showInactive) 4.dp else 2.dp
        ) {
            Row(
                modifier = Modifier.height(34.dp).padding(horizontal = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(7.dp)
            ) {
                Box(
                    Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(if (showInactive) Color(0xFFE53935) else WalletGreen)
                )
                Text(
                    text = if (showInactive) "$inactiveCount Inactive" else "$activeCount Active",
                    color = WalletInk,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    softWrap = false
                )
            }
        }
    }
}

@Composable
private fun WalletFilterControl(labels: List<String>, selectedIndex: Int = 0, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(10.dp),
        color = Color.White.copy(alpha = 0.94f),
        border = BorderStroke(1.dp, WalletLine),
        tonalElevation = 0.dp,
        shadowElevation = 1.dp
    ) {
        Row(modifier = Modifier.padding(2.dp)) {
            labels.forEachIndexed { index, label ->
                val selected = index == selectedIndex
                Surface(
                    modifier = Modifier.weight(1f).heightIn(min = 34.dp),
                    color = if (selected) Color.White else Color.Transparent,
                    shape = RoundedCornerShape(8.dp),
                    border = if (selected) BorderStroke(1.dp, WalletLine.copy(alpha = 0.72f)) else null,
                    tonalElevation = 0.dp,
                    shadowElevation = if (selected) 2.dp else 0.dp
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text(label, color = if (selected) WalletGold else WalletMuted, fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
    }
}

@Composable
private fun WalletCommerceFilterRow(labels: List<String>, selectedIndex: Int = 0, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        labels.forEachIndexed { index, label ->
            val selected = index == selectedIndex
            Surface(
                shape = RoundedCornerShape(999.dp),
                color = Color.White,
                border = BorderStroke(1.dp, if (selected) WalletBlueSoft.copy(alpha = 0.45f) else WalletLine.copy(alpha = 0.95f)),
                shadowElevation = if (selected) 5.dp else 2.dp,
                tonalElevation = 0.dp
            ) {
                Box(
                    modifier = Modifier
                        .height(32.dp)
                        .padding(horizontal = if (selected) 12.dp else 9.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = label,
                        color = if (selected) WalletBlueSoft else WalletInk.copy(alpha = 0.88f),
                        fontSize = 12.sp,
                        fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                        maxLines = 1
                    )
                }
            }
        }
        Spacer(Modifier.weight(1f))
    }
}

@Composable
private fun SwipeHint(modifier: Modifier = Modifier) {
    Row(modifier = modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
        Text("↕", color = WalletMuted, fontSize = 14.sp)
        Spacer(Modifier.width(6.dp))
        Text("Swipe up or down", color = WalletMuted, fontSize = 12.sp, fontWeight = FontWeight.Medium)
    }
}

private data class WalletDeckLayer<T>(val offset: Int, val item: T, val index: Int)

private fun <T> buildWalletDeckLayers(items: List<T>, activeIndex: Int): List<WalletDeckLayer<T>> {
    if (items.isEmpty()) return emptyList()
    val offsets = when (items.size) {
        1 -> listOf(0)
        2 -> listOf(0, 1)
        else -> listOf(-1, 0, 1)
    }
    return offsets.map { offset ->
        val index = ((activeIndex + offset) % items.size + items.size) % items.size
        WalletDeckLayer(offset = offset, item = items[index], index = index)
    }
}

@Composable
private fun <T> WalletVerticalCarousel(
    items: List<T>,
    modifier: Modifier = Modifier,
    onActiveItemChanged: (T) -> Unit = {},
    cardContent: @Composable (item: T, index: Int, active: Boolean) -> Unit
) {
    var activeIndex by remember(items) { mutableStateOf(if (items.size >= 3) 1 else 0) }
    var dragOffsetPx by remember(items) { mutableStateOf(0f) }
    val density = LocalDensity.current
    val swipeThresholdPx = with(density) { 112.dp.toPx() }
    val dragProgress = if (items.size > 1) {
        (-dragOffsetPx / swipeThresholdPx).coerceIn(-1f, 1f)
    } else {
        0f
    }
    val layers = remember(items, activeIndex) { buildWalletDeckLayers(items, activeIndex) }

    if (items.isNotEmpty()) {
        androidx.compose.runtime.LaunchedEffect(items, activeIndex) {
            onActiveItemChanged(items[activeIndex.coerceIn(0, items.lastIndex)])
        }
    }

    Column(modifier = modifier.fillMaxSize()) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .padding(horizontal = 20.dp, vertical = 16.dp)
                .pointerInput(items.size, activeIndex) {
                    detectVerticalDragGestures(
                        onVerticalDrag = { _, dragAmount ->
                            if (items.size > 1) {
                                dragOffsetPx = (dragOffsetPx + dragAmount)
                                    .coerceIn(-swipeThresholdPx, swipeThresholdPx)
                            }
                        },
                        onDragCancel = {
                            dragOffsetPx = 0f
                        },
                        onDragEnd = {
                            if (items.size > 1) {
                                when {
                                    dragOffsetPx < -swipeThresholdPx * 0.38f ->
                                        activeIndex = (activeIndex + 1) % items.size
                                    dragOffsetPx > swipeThresholdPx * 0.38f ->
                                        activeIndex = (activeIndex - 1 + items.size) % items.size
                                }
                            }
                            dragOffsetPx = 0f
                        }
                    )
                },
            contentAlignment = Alignment.Center
        ) {
            layers.forEach { layer ->
                key(layer.index) {
                    val liveOffset = layer.offset - dragProgress
                    val distance = abs(liveOffset).coerceIn(0f, 2f)
                    val yOffset by animateDpAsState(
                        targetValue = (liveOffset * 166f).dp,
                        animationSpec = spring(),
                        label = "walletDeckOffset"
                    )
                    val scale by animateFloatAsState(
                        targetValue = when {
                            distance < 0.5f -> 1f
                            distance < 1.5f -> 0.985f
                            else -> 0.965f
                        },
                        animationSpec = spring(),
                        label = "walletDeckScale"
                    )
                    val alpha by animateFloatAsState(
                        targetValue = when {
                            distance < 0.5f -> 1f
                            distance < 1.5f -> 0.96f
                            else -> 0.88f
                        },
                        animationSpec = spring(),
                        label = "walletDeckAlpha"
                    )
                    val elevation by animateFloatAsState(
                        targetValue = when {
                            distance < 0.5f -> 18f
                            distance < 1.5f -> 10f
                            else -> 3f
                        },
                        animationSpec = spring(),
                        label = "walletDeckElevation"
                    )
                    Box(
                        modifier = Modifier
                            .align(Alignment.Center)
                            .offset(y = yOffset)
                            .graphicsLayer {
                                scaleX = scale
                                scaleY = scale
                                this.alpha = alpha
                                shadowElevation = elevation
                            }
                            .zIndex(10f - distance)
                    ) {
                        cardContent(layer.item, layer.index, distance < 0.5f)
                    }
                }
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth().padding(bottom = 14.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            val maxDots = minOf(items.size, 5)
            repeat(maxDots) { index ->
                Box(
                    modifier = Modifier
                        .padding(horizontal = 4.dp)
                        .size(if (index == activeIndex) 8.dp else 7.dp)
                        .clip(CircleShape)
                        .background(if (index == activeIndex) WalletBlueSoft else WalletMuted.copy(alpha = 0.28f))
                )
            }
        }
    }
}

// ---------- Entitlements ----------

private data class WalletPassCardData(
    val id: String,
    val title: String,
    val type: String,
    val tenantName: String?,
    val entitlementCode: String?,
    val remainingUses: Int?,
    val totalUses: Int?,
    val validUntil: String?,
    val validityDays: Int?,
    val displayCode: String?,
    val priceGross: Double?,
    val remainingValueGross: Double?,
    val currency: String?,
    val autoRenews: Boolean,
    val status: String
)


private data class WalletQRCodePopupModel(
    val title: String,
    val subtitle: String,
    val code: String,
    val entitlementId: String
)

@Composable
private fun WalletQRCodePopupDialog(
    model: WalletQRCodePopupModel,
    onDismiss: () -> Unit
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.46f))
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = onDismiss
                ),
            contentAlignment = Alignment.Center
        ) {
            Column(
                modifier = Modifier
                    .padding(horizontal = 30.dp)
                    .widthIn(max = 330.dp)
                    .shadow(28.dp, RoundedCornerShape(30.dp), clip = false)
                    .clip(RoundedCornerShape(30.dp))
                    .background(Color.White.copy(alpha = 0.98f))
                    .border(BorderStroke(1.dp, Color.White.copy(alpha = 0.82f)), RoundedCornerShape(30.dp))
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClick = {}
                    ),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Box(modifier = Modifier.fillMaxWidth().padding(top = 18.dp, start = 18.dp, end = 18.dp)) {
                    Column(
                        modifier = Modifier.align(Alignment.TopCenter).padding(top = 34.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(7.dp)
                    ) {
                        Text(model.title, color = WalletInk, fontSize = 24.sp, fontWeight = FontWeight.Bold)
                        Text(model.subtitle, color = WalletInk.copy(alpha = 0.66f), fontSize = 15.sp, fontWeight = FontWeight.Medium)
                    }
                    Box(
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .size(38.dp)
                            .clip(CircleShape)
                            .background(Color(0xFFEFF1F5).copy(alpha = 0.82f))
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null,
                                onClick = onDismiss
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("×", color = WalletInk.copy(alpha = 0.82f), fontSize = 28.sp, lineHeight = 28.sp)
                    }
                }

                WalletQRCode(
                    content = model.code,
                    modifier = Modifier.padding(top = 50.dp).size(184.dp).shadow(12.dp, RoundedCornerShape(12.dp), clip = false)
                )

                Text(
                    text = model.code,
                    color = WalletInk,
                    fontSize = 26.sp,
                    fontWeight = FontWeight.Medium,
                    fontFamily = FontFamily.Monospace,
                    letterSpacing = 1.5.sp,
                    modifier = Modifier.padding(top = 26.dp, bottom = 34.dp)
                )
            }

            Text(
                text = "Tap anywhere outside to close",
                color = Color.White.copy(alpha = 0.82f),
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 52.dp)
            )
        }
    }
}

private data class WalletTicketStyle(
    val background: Color,
    val accent: Color,
    val border: Color,
    val softAccent: Color
)

@Composable
private fun EntitlementsPanel(
    entitlements: List<EntitlementSummary>,
    accessCards: List<AccessCard>,
    focusedEntitlementId: String?,
    onFocus: (String?) -> Unit,
    onQRCodeTap: (WalletPassCardData, String) -> Unit,
    onToggleAutoRenew: (String, Boolean) -> Unit
) {
    val cards = remember(entitlements, accessCards) {
        val fromEntitlements = entitlements.map { it.toWalletPassCardData() }
        val existingIds = fromEntitlements.map { it.id }.toSet()
        fromEntitlements + accessCards
            .map { it.toWalletPassCardData() }
            .filterNot { existingIds.contains(it.id) }
    }

    var selectedFilter by remember { mutableStateOf("All") }
    var showInactive by remember { mutableStateOf(false) }
    var showAllCards by remember { mutableStateOf(false) }
    val filteredByType = remember(cards, selectedFilter) {
        when (selectedFilter) {
            "Tickets" -> cards.filter { it.type == "PACK" || it.type == "CLASS_TICKET" }
            "Memberships" -> cards.filter { it.type == "MEMBERSHIP" }
            else -> cards
        }
    }
    val activeCards = remember(filteredByType) {
        filteredByType.filter { card ->
            !isInactiveWalletCard(card)
        }
    }
    val inactiveCards = remember(filteredByType) {
        filteredByType.filter { card ->
            isInactiveWalletCard(card)
        }
    }
    val filteredCards = remember(filteredByType, showInactive) {
        if (showInactive) {
            filteredByType.filter { card ->
                isInactiveWalletCard(card)
            }
        } else {
            filteredByType.filter { card ->
                !isInactiveWalletCard(card)
            }
        }
    }
    val hasMoreThanFive = filteredCards.size > 5
    val previewCards = remember(filteredCards) { filteredCards.take(4) }

    androidx.compose.runtime.LaunchedEffect(selectedFilter, showInactive) {
        showAllCards = false
    }

    if (cards.isEmpty()) {
        EmptyState(
            icon = Icons.Rounded.ConfirmationNumber,
            title = "No entitlements yet",
            subtitle = "Purchases from the Buy tab will show up here as tickets, packs and memberships."
        )
        return
    }

    Column(modifier = Modifier.fillMaxSize()) {
        WalletEntitlementFilterRow(
            activeCount = activeCards.size,
            inactiveCount = inactiveCards.size,
            showInactive = showInactive,
            onToggleStatusFilter = { showInactive = !showInactive },
            selectedFilter = selectedFilter,
            onFilterSelected = { selectedFilter = it },
            modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 14.dp)
        )

        if (filteredCards.isEmpty()) {
            EmptyState(
                icon = Icons.Rounded.ConfirmationNumber,
                title = "No ${selectedFilter.lowercase(Locale.getDefault())} yet",
                subtitle = "Switch filters or purchase a new pass from the Buy tab."
            )
        } else {
            if (showAllCards) {
                WalletEntitlementFullList(
                    cards = filteredCards,
                    onQRCodeTap = onQRCodeTap,
                    onToggleAutoRenew = onToggleAutoRenew,
                    onShowLess = { showAllCards = false },
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(start = 20.dp, top = 2.dp, end = 20.dp, bottom = 8.dp)
                )
            } else {
                WalletPullOutEntitlementDeck(
                    cards = previewCards,
                    focusedEntitlementId = focusedEntitlementId,
                    onFocus = onFocus,
                    onQRCodeTap = onQRCodeTap,
                    onToggleAutoRenew = onToggleAutoRenew,
                    showAllEnabled = hasMoreThanFive,
                    onShowAll = { showAllCards = true },
                    modifier = Modifier.fillMaxSize().padding(start = 20.dp, top = 2.dp, end = 20.dp, bottom = 8.dp)
                )
            }
        }
    }
}

@Composable
private fun WalletEntitlementFullList(
    cards: List<WalletPassCardData>,
    onQRCodeTap: (WalletPassCardData, String) -> Unit,
    onToggleAutoRenew: (String, Boolean) -> Unit,
    onShowLess: () -> Unit,
    modifier: Modifier = Modifier
) {
    LazyColumn(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(12.dp),
        contentPadding = PaddingValues(bottom = 8.dp)
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End
            ) {
                Surface(
                    modifier = Modifier.clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClick = onShowLess
                    ),
                    shape = RoundedCornerShape(999.dp),
                    color = Color.White.copy(alpha = 0.94f),
                    border = BorderStroke(1.dp, WalletLine.copy(alpha = 0.95f)),
                    tonalElevation = 0.dp,
                    shadowElevation = 2.dp
                ) {
                    Text(
                        text = "Show less",
                        color = WalletInk,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp)
                    )
                }
            }
        }
        itemsIndexed(cards, key = { _, card -> card.id }) { index, card ->
            WalletStackedPassCard(
                card = card,
                index = index,
                onTap = {},
                onQRCodeTap = { code -> onQRCodeTap(card, code) },
                onToggleAutoRenew = onToggleAutoRenew,
                modifier = Modifier.fillMaxWidth()
            )
        }
    }
}

@Composable
private fun WalletPullOutEntitlementDeck(
    cards: List<WalletPassCardData>,
    focusedEntitlementId: String?,
    onFocus: (String?) -> Unit,
    onQRCodeTap: (WalletPassCardData, String) -> Unit,
    onToggleAutoRenew: (String, Boolean) -> Unit,
    showAllEnabled: Boolean,
    onShowAll: () -> Unit,
    modifier: Modifier = Modifier
) {
    val walletCards = remember(cards) { cards.take(4) }
    if (walletCards.isEmpty()) return

    var activeIndex by remember(walletCards) { mutableStateOf(0) }
    var isPulledForward by remember(walletCards) { mutableStateOf(false) }

    androidx.compose.runtime.LaunchedEffect(focusedEntitlementId, walletCards) {
        val requestedIndex = walletCards.indexOfFirst { it.id == focusedEntitlementId }
        if (requestedIndex >= 0) {
            activeIndex = requestedIndex
            isPulledForward = true
        }
    }

    val stackCards = remember(walletCards, activeIndex) {
        List(walletCards.size) { offset -> walletCards[(activeIndex + offset) % walletCards.size] }
    }

    BoxWithConstraints(
        modifier = modifier.pointerInput(walletCards.size, activeIndex, isPulledForward) {
            var totalDrag = 0f
            detectVerticalDragGestures(
                onDragStart = { totalDrag = 0f },
                onVerticalDrag = { change, dragAmount ->
                    change.consume()
                    totalDrag += dragAmount
                },
                onDragEnd = {
                    when {
                        totalDrag < -28f -> {
                            if (!isPulledForward) {
                                isPulledForward = true
                                onFocus(walletCards[activeIndex].id)
                            } else if (walletCards.size > 1) {
                                val next = (activeIndex + 1) % walletCards.size
                                activeIndex = next
                                onFocus(walletCards[next].id)
                            }
                        }
                        totalDrag > 28f -> {
                            if (isPulledForward) {
                                isPulledForward = false
                                onFocus(walletCards[activeIndex].id)
                            } else if (walletCards.size > 1) {
                                val previous = (activeIndex - 1 + walletCards.size) % walletCards.size
                                activeIndex = previous
                                onFocus(walletCards[previous].id)
                            }
                        }
                    }
                },
                onDragCancel = { totalDrag = 0f }
            )
        },
        contentAlignment = Alignment.TopCenter
    ) {
        val compactLayout = maxHeight < 540.dp
        val fullCardHeight = if (compactLayout) 220.dp else 248.dp
        val pocketHeight = if (compactLayout) 260.dp else 320.dp
        val visiblePocketSlice = if (isPulledForward) {
            if (compactLayout) 46.dp else 56.dp
        } else {
            if (compactLayout) 168.dp else 188.dp
        }
        val pocketOffsetDown = pocketHeight - visiblePocketSlice
        val pocketVisibleTop = maxHeight - visiblePocketSlice

        val storedStep = if (compactLayout) 56.dp else 66.dp
        val storedBackTop = pocketVisibleTop - (storedStep * stackCards.size)
        val pulledFrontTop = if (compactLayout) 6.dp else 8.dp
        val pulledWalletBackTop = pocketVisibleTop - (storedStep * 3)
        val pulledStackStep = storedStep

        stackCards.asReversed().forEach { card ->
            key(card.id) {
                val stackPosition = stackCards.indexOf(card)
                val originalIndex = cards.indexOfFirst { it.id == card.id }.coerceAtLeast(0)
                val isActive = stackPosition == 0
                val cardTop = if (isPulledForward) {
                    if (stackPosition == 0) {
                        pulledFrontTop
                    } else {
                        val walletStackPosition = stackPosition - 1
                        val walletStackCount = (stackCards.size - 1).coerceAtLeast(1)
                        pulledWalletBackTop + (pulledStackStep * ((walletStackCount - 1) - walletStackPosition))
                    }
                } else {
                    storedBackTop + (storedStep * (stackCards.lastIndex - stackPosition))
                }
                val yOffset by animateDpAsState(
                    targetValue = cardTop,
                    animationSpec = spring(dampingRatio = 0.82f, stiffness = 280f),
                    label = "walletStoredPassYOffset"
                )

                val cardClick = {
                    val nextIndex = walletCards.indexOfFirst { it.id == card.id }
                    if (nextIndex >= 0) {
                        if (isActive && isPulledForward) {
                            isPulledForward = false
                            onFocus(card.id)
                        } else {
                            activeIndex = nextIndex
                            isPulledForward = true
                            onFocus(card.id)
                        }
                    }
                }

                Box(
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .fillMaxWidth()
                        .offset(y = yOffset)
                        .height(fullCardHeight)
                        .graphicsLayer {
                            scaleX = 1f
                            scaleY = 1f
                            shadowElevation = if (isActive) 26f else 10f
                        }
                        .zIndex(if (isPulledForward) { if (isActive) 90f else 40f - stackPosition.toFloat() } else { 50f - stackPosition.toFloat() })
                        .clip(RoundedCornerShape(22.dp))
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            onClick = cardClick
                        )
                ) {
                    WalletStackedPassCard(
                        card = card,
                        index = originalIndex,
                        onTap = cardClick,
                        onQRCodeTap = { code -> onQRCodeTap(card, code) },
                        onToggleAutoRenew = onToggleAutoRenew,
                        modifier = Modifier.fillMaxSize()
                    )
                }
            }
        }

        WalletLeatherPocket(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .height(pocketHeight)
                .offset(y = pocketOffsetDown)
                .zIndex(56f)
        )
        if (showAllEnabled) {
            Surface(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .offset(y = pocketVisibleTop + 8.dp)
                    .zIndex(70f)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClick = onShowAll
                    ),
                shape = RoundedCornerShape(999.dp),
                color = Color(0xFF17243A).copy(alpha = 0.96f),
                border = BorderStroke(1.dp, Color(0xFF3A516F)),
                tonalElevation = 0.dp,
                shadowElevation = 6.dp
            ) {
                Text(
                    text = "Show all",
                    color = Color.White.copy(alpha = 0.96f),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp)
                )
            }
        }
    }
}

@Composable
private fun EntitlementSwipeHint(modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier.shadow(6.dp, RoundedCornerShape(999.dp), clip = false),
        shape = RoundedCornerShape(999.dp),
        color = Color.White.copy(alpha = 0.94f),
        border = BorderStroke(1.dp, WalletLine.copy(alpha = 0.86f)),
        tonalElevation = 0.dp
    ) {
        Row(
            modifier = Modifier.height(34.dp).padding(horizontal = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(7.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("⌃", color = WalletInk.copy(alpha = 0.78f), fontSize = 18.sp, fontWeight = FontWeight.Bold, lineHeight = 18.sp)
            Text(
                text = "Swipe up to pull pass forward",
                color = WalletInk.copy(alpha = 0.72f),
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1
            )
        }
    }
}

@Composable
private fun PulledForwardBadge(modifier: Modifier = Modifier) {
    EntitlementSwipeHint(modifier = modifier)
}

@Composable
private fun WalletLeatherPocket(modifier: Modifier = Modifier) {
    val outerShape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp, bottomStart = 30.dp, bottomEnd = 30.dp)
    Box(
        modifier = modifier
            .shadow(26.dp, outerShape, clip = false)
            .clip(outerShape)
            .background(
                Brush.verticalGradient(
                    colors = listOf(Color(0xFF263752), Color(0xFF17243A), Color(0xFF0D1627))
                )
            )
            .border(BorderStroke(1.2.dp, Color(0xFF31435F).copy(alpha = 0.96f)), outerShape)
    ) {
        Box(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .fillMaxWidth()
                .height(44.dp)
                .background(
                    Brush.verticalGradient(
                        colors = listOf(Color.White.copy(alpha = 0.08f), Color.Transparent)
                    )
                )
        )
        Box(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(horizontal = 16.dp, vertical = 18.dp)
                .fillMaxWidth()
                .height(2.dp)
                .clip(RoundedCornerShape(999.dp))
                .background(Color.White.copy(alpha = 0.12f))
        )
        androidx.compose.foundation.Canvas(modifier = Modifier.fillMaxSize()) {
            val stitchInsetX = 16.dp.toPx()
            val stitchTop = 24.dp.toPx()
            val stitchBottom = 18.dp.toPx()
            drawRoundRect(
                color = Color.White.copy(alpha = 0.13f),
                topLeft = Offset(stitchInsetX, stitchTop),
                size = Size(size.width - stitchInsetX * 2, size.height - stitchTop - stitchBottom),
                cornerRadius = CornerRadius(24.dp.toPx(), 24.dp.toPx()),
                style = Stroke(width = 1.1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(5f, 6f)))
            )
            for (i in 0..14) {
                val y = size.height * (0.18f + i * 0.045f)
                drawLine(
                    color = Color.White.copy(alpha = 0.025f),
                    start = Offset(size.width * 0.10f, y),
                    end = Offset(size.width * 0.90f, y + ((i % 2) * 1.5f)),
                    strokeWidth = 1.dp.toPx()
                )
            }
        }

        Column(
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(start = 24.dp, top = 92.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("♢", color = Color.White.copy(alpha = 0.68f), fontSize = 21.sp, lineHeight = 21.sp)
                Text("Wallet pocket", color = Color.White.copy(alpha = 0.78f), fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("▣", color = Color.White.copy(alpha = 0.48f), fontSize = 17.sp, lineHeight = 17.sp)
                Text("Secure passes", color = Color.White.copy(alpha = 0.52f), fontSize = 14.sp, fontWeight = FontWeight.Medium)
            }
        }
    }
}


private fun AccessCard.toWalletPassCardData(): WalletPassCardData = WalletPassCardData(
    id = id,
    title = name,
    type = type,
    tenantName = tenantName,
    entitlementCode = entitlementCode,
    remainingUses = remainingUses,
    totalUses = totalUses,
    validUntil = validUntil,
    validityDays = validityDays,
    displayCode = displayCode,
    priceGross = priceGross,
    remainingValueGross = null,
    currency = currency,
    autoRenews = autoRenews,
    status = "ACTIVE"
)

private fun EntitlementSummary.toWalletPassCardData(): WalletPassCardData = WalletPassCardData(
    id = entitlementId,
    title = productName,
    type = entitlementType,
    tenantName = sessionTypeName,
    entitlementCode = entitlementCode,
    remainingUses = remainingUses,
    totalUses = totalUses,
    validUntil = validUntil,
    validityDays = validityDays,
    displayCode = displayCode,
    priceGross = priceGross,
    remainingValueGross = remainingValueGross,
    currency = currency,
    autoRenews = autoRenews,
    status = status
)

@Composable
private fun WalletStackedPassCard(
    card: WalletPassCardData,
    index: Int,
    onTap: () -> Unit,
    onQRCodeTap: (String) -> Unit,
    onToggleAutoRenew: (String, Boolean) -> Unit,
    modifier: Modifier = Modifier
) {
    val shape = remember { CompactTicketShape(cornerRadius = 20.dp, notchRadius = 10.dp, notchFractionY = 0.48f) }
    val style = walletTicketStyle(card.type, index)
    val code = card.entitlementCode?.takeIf { it.isNotBlank() }
        ?: card.displayCode?.takeIf { it.isNotBlank() }
        ?: card.id
    val headerStatus = entitlementHeaderStatus(card)
    val headerStatusAccent = if (headerStatus == "Inactive") Color(0xFFE53935) else WalletGreen
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(248.dp)
            .shadow(12.dp, shape, clip = false)
            .clip(shape)
            .background(
                Brush.linearGradient(
                    colors = listOf(style.background, Color.White, style.softAccent),
                    start = Offset(0f, 0f),
                    end = Offset(900f, 900f)
                )
            )
            .border(BorderStroke(1.25.dp, style.border), shape)
            .clickable { onTap() }
    ) {
        WalletPassWave(
            accent = style.accent,
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = 14.dp, bottom = 16.dp)
                .size(width = 190.dp, height = 90.dp)
        )

        Column(modifier = Modifier.fillMaxSize()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(82.dp)
                    .padding(start = 18.dp, end = 18.dp, top = 10.dp, bottom = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    modifier = Modifier.weight(1f),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    WalletTypeTag(label = entitlementHeaderTypeTag(card.type), accent = style.accent)
                    Text(
                        text = entitlementHeaderCardName(card.title),
                        color = WalletInk,
                        fontSize = 18.sp,
                        lineHeight = 22.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    WalletStatusChip(status = headerStatus, accent = headerStatusAccent)
                    if (card.type == "PACK" && card.remainingUses != null) {
                        WalletCountChip(
                            label = "${card.remainingUses} left",
                            accent = style.accent
                        )
                    }
                }
            }

            CompactDashedSeparator(color = style.accent.copy(alpha = 0.62f), modifier = Modifier.padding(horizontal = 17.dp))

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .padding(start = 18.dp, end = 18.dp, top = 10.dp, bottom = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        val primary = primaryMetric(card)
                        val secondary = secondaryMetric(card)
                        TicketDetailBlock(
                            label = primary.first.uppercase(Locale.getDefault()),
                            value = primary.second,
                            accent = style.accent,
                            modifier = Modifier.weight(1f)
                        )
                        Box(
                            modifier = Modifier
                                .height(42.dp)
                                .width(1.dp)
                                .background(WalletLine.copy(alpha = 0.95f))
                        )
                        TicketDetailBlock(
                            label = secondary.first.uppercase(Locale.getDefault()),
                            value = secondary.second,
                            accent = style.accent,
                            modifier = Modifier.weight(1f).padding(start = 18.dp)
                        )
                    }
                    Box(Modifier.fillMaxWidth().height(1.dp).background(WalletLine.copy(alpha = 0.55f)))
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            text = "SCAN CODE",
                            color = WalletInk.copy(alpha = 0.58f),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Medium
                        )
                        Text(
                            text = code,
                            color = WalletInk,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
                Spacer(Modifier.width(10.dp))
                Box(
                    modifier = Modifier
                        .size(96.dp)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            onClick = { onQRCodeTap(code) }
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Box(Modifier.size(92.dp).border(BorderStroke(1.dp, style.accent.copy(alpha = 0.12f)), CircleShape))
                    Box(Modifier.size(82.dp).border(BorderStroke(1.dp, style.accent.copy(alpha = 0.22f)), CircleShape))
                    WalletQRCode(content = code, modifier = Modifier.size(74.dp))
                }
            }
        }
    }
}

@Composable
private fun WalletCommercePassCard(
    type: String,
    index: Int,
    title: String,
    subtitle: String,
    statusLabel: String,
    statusAccent: Color,
    primaryLabel: String,
    primaryValue: String,
    secondaryLabel: String,
    secondaryValue: String,
    code: String,
    onTap: (() -> Unit)? = null
) {
    val shape = remember { CompactTicketShape(cornerRadius = 20.dp, notchRadius = 10.dp, notchFractionY = 0.48f) }
    val style = walletTicketStyle(type, index)
    val baseModifier = Modifier
        .fillMaxWidth()
        .height(158.dp)
        .shadow(9.dp, shape, clip = false)
        .clip(shape)
        .background(
            Brush.linearGradient(
                colors = listOf(style.background, Color.White, style.softAccent),
                start = Offset(0f, 0f),
                end = Offset(900f, 900f)
            )
        )
        .border(BorderStroke(1.25.dp, style.border), shape)
    val modifier = if (onTap != null) {
        baseModifier.clickable { onTap() }
    } else {
        baseModifier
    }

    Box(modifier = modifier) {
        WalletPassWave(
            accent = style.accent,
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = 14.dp, bottom = 16.dp)
                .size(width = 190.dp, height = 90.dp)
        )

        Column(modifier = Modifier.fillMaxSize()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 18.dp, end = 18.dp, top = 18.dp, bottom = 16.dp),
                verticalAlignment = Alignment.Top
            ) {
                WalletPassIconBadge(type = type, accent = style.accent)
                Spacer(Modifier.width(14.dp))
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        text = productTypeLabel(type).uppercase(Locale.getDefault()),
                        color = style.accent,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 0.8.sp,
                        maxLines = 1
                    )
                    Text(
                        text = title,
                        color = WalletInk,
                        fontSize = 22.sp,
                        lineHeight = 24.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                        Text("⌖", color = WalletInk.copy(alpha = 0.68f), fontSize = 13.sp, lineHeight = 13.sp)
                        Text(
                            text = subtitle,
                            color = WalletInk.copy(alpha = 0.70f),
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
                WalletStatusChip(status = statusLabel, accent = statusAccent)
            }

            CompactDashedSeparator(color = style.accent.copy(alpha = 0.62f), modifier = Modifier.padding(horizontal = 17.dp))

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 18.dp, end = 18.dp, top = 18.dp, bottom = 18.dp),
                verticalAlignment = Alignment.Bottom
            ) {
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        TicketDetailBlock(
                            label = primaryLabel.uppercase(Locale.getDefault()),
                            value = primaryValue,
                            accent = style.accent,
                            modifier = Modifier.weight(1f)
                        )
                        Box(
                            modifier = Modifier
                                .height(42.dp)
                                .width(1.dp)
                                .background(WalletLine.copy(alpha = 0.95f))
                        )
                        TicketDetailBlock(
                            label = secondaryLabel.uppercase(Locale.getDefault()),
                            value = secondaryValue,
                            accent = style.accent,
                            modifier = Modifier.weight(1f).padding(start = 18.dp)
                        )
                    }
                    Box(Modifier.fillMaxWidth().height(1.dp).background(WalletLine.copy(alpha = 0.55f)))
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            text = "SCAN CODE",
                            color = WalletInk.copy(alpha = 0.58f),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Medium
                        )
                        Text(
                            text = code,
                            color = WalletInk,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
                Spacer(Modifier.width(14.dp))
                WalletQRCode(content = code, modifier = Modifier.size(74.dp))
            }
        }
    }
}

@Composable
private fun WalletPassIconBadge(type: String, accent: Color) {
    Box(
        modifier = Modifier
            .size(58.dp)
            .clip(CircleShape)
            .background(Color.White.copy(alpha = 0.74f))
            .border(BorderStroke(1.dp, accent.copy(alpha = 0.18f)), CircleShape),
        contentAlignment = Alignment.Center
    ) {
        val icon = when (type) {
            "MEMBERSHIP" -> Icons.Outlined.WorkspacePremium
            "PACK" -> Icons.Outlined.LocalActivity
            "CLASS_TICKET" -> Icons.Rounded.ConfirmationNumber
            else -> Icons.Rounded.CardMembership
        }
        Icon(imageVector = icon, contentDescription = null, tint = accent, modifier = Modifier.size(27.dp))
    }
}

@Composable
private fun WalletQRCode(content: String, modifier: Modifier = Modifier) {
    val bitmap = remember(content) { generateQRCodeBitmap(content) }
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(Color.White.copy(alpha = 0.94f))
            .border(BorderStroke(1.dp, Color.Black.copy(alpha = 0.04f)), RoundedCornerShape(12.dp)),
        contentAlignment = Alignment.Center
    ) {
        if (bitmap != null) {
            Image(
                bitmap = bitmap.asImageBitmap(),
                contentDescription = "QR code",
                modifier = Modifier.padding(7.dp).fillMaxSize()
            )
        } else {
            Text("QR", color = WalletInk, fontSize = 14.sp, fontWeight = FontWeight.Bold)
        }
    }
}

private fun generateQRCodeBitmap(content: String): Bitmap? = runCatching {
    val size = 220
    val matrix = MultiFormatWriter().encode(content, BarcodeFormat.QR_CODE, size, size)
    Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888).apply {
        for (x in 0 until size) {
            for (y in 0 until size) {
                setPixel(x, y, if (matrix[x, y]) android.graphics.Color.BLACK else android.graphics.Color.WHITE)
            }
        }
    }
}.getOrNull()

@Composable
private fun WalletPassWave(accent: Color, modifier: Modifier = Modifier) {
    androidx.compose.foundation.Canvas(modifier = modifier) {
        repeat(8) { i ->
            val y = size.height * (0.30f + i * 0.055f)
            val path = Path().apply {
                moveTo(size.width * 0.12f, y)
                cubicTo(
                    size.width * 0.42f, y - 20f,
                    size.width * 0.70f, y + 18f,
                    size.width, y + (i % 3) * 2f
                )
            }
            drawPath(path, color = accent.copy(alpha = 0.055f), style = Stroke(width = 1f))
        }
    }
}

@Composable
private fun WalletTypeTag(label: String, accent: Color) {
    Surface(color = accent.copy(alpha = 0.14f), shape = RoundedCornerShape(6.dp)) {
        Text(label, color = accent, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp), maxLines = 1)
    }
}

@Composable
private fun WalletLogoBadge(text: String) {
    Box(
        modifier = Modifier
            .size(56.dp)
            .clip(CircleShape)
            .background(Color(0xFF202126)),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = text,
            color = Color.White,
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            lineHeight = 14.sp,
            letterSpacing = 1.5.sp
        )
    }
}

@Composable
private fun WalletStatusChip(status: String, accent: Color) {
    Surface(
        color = accent.copy(alpha = 0.10f),
        shape = RoundedCornerShape(999.dp),
        border = BorderStroke(1.dp, accent.copy(alpha = 0.16f)),
        tonalElevation = 0.dp
    ) {
        Row(
            modifier = Modifier.height(36.dp).padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Box(Modifier.size(6.dp).clip(CircleShape).background(accent))
            Text(
                text = status,
                color = accent,
                fontWeight = FontWeight.SemiBold,
                fontSize = 13.sp,
                maxLines = 1
            )
        }
    }
}

@Composable
private fun WalletCountChip(label: String, accent: Color) {
    Surface(
        color = accent.copy(alpha = 0.10f),
        shape = RoundedCornerShape(999.dp),
        border = BorderStroke(1.dp, accent.copy(alpha = 0.16f)),
        tonalElevation = 0.dp
    ) {
        Box(
            modifier = Modifier.height(36.dp).padding(horizontal = 12.dp),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = label,
                color = accent,
                fontWeight = FontWeight.SemiBold,
                fontSize = 13.sp,
                maxLines = 1
            )
        }
    }
}

@Composable
private fun TicketDetailBlock(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    accent: Color = WalletInk
) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Text(
            text = label,
            color = WalletInk.copy(alpha = 0.58f),
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
            letterSpacing = 0.4.sp,
            maxLines = 1
        )
        Text(
            text = value,
            color = accent,
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun CompactDashedSeparator(color: Color, modifier: Modifier = Modifier) {
    androidx.compose.foundation.Canvas(
        modifier = modifier
            .fillMaxWidth()
            .height(1.dp)
    ) {
        drawLine(
            color = color,
            start = Offset(0f, size.height / 2),
            end = Offset(size.width, size.height / 2),
            strokeWidth = 1.2f,
            pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 6f))
        )
    }
}

private fun walletTicketStyle(type: String, index: Int): WalletTicketStyle = when (type) {
    "MEMBERSHIP" -> WalletTicketStyle(
        background = Color(0xFFF0FAF4),
        accent = WalletGreen,
        border = WalletGreen.copy(alpha = 0.82f),
        softAccent = Color(0xFFCDEFD9)
    )
    "PACK" -> WalletTicketStyle(
        background = Color(0xFFEFF6FF),
        accent = WalletBlueSoft,
        border = WalletBlueSoft.copy(alpha = 0.78f),
        softAccent = Color(0xFFC7E5FF)
    )
    "CLASS_TICKET" -> WalletTicketStyle(
        background = Color(0xFFFFF4E6),
        accent = WalletAmber,
        border = WalletAmber.copy(alpha = 0.66f),
        softAccent = Color(0xFFFFD9A8)
    )
    "GIFT_CARD" -> WalletTicketStyle(
        background = Color(0xFFFFF7ED),
        accent = WalletAmber,
        border = WalletAmber.copy(alpha = 0.74f),
        softAccent = Color(0xFFFFE1B8)
    )
    else -> {
        val isBlue = index % 2 == 0
        WalletTicketStyle(
            background = if (isBlue) Color(0xFFF0F8FF) else Color(0xFFFFF4E6),
            accent = if (isBlue) WalletBlueSoft else WalletAmber,
            border = (if (isBlue) WalletBlueSoft else WalletAmber).copy(alpha = 0.66f),
            softAccent = if (isBlue) Color(0xFFC7E5FF) else Color(0xFFFFD9A8)
        )
    }
}

private fun primaryMetric(card: WalletPassCardData): Pair<String, String> = when (card.type) {
    "MEMBERSHIP" -> "Access" to "Unlimited"
    "PACK" -> "Access" to usesSummary(card)
    "CLASS_TICKET" -> "Access" to "1 class"
    "GIFT_CARD" -> "Balance" to "${formatPrice(card.remainingValueGross ?: 0.0)} ${card.currency ?: ""}".trim()
    else -> productTypeLabel(card.type) to usesSummary(card)
}

private fun secondaryMetric(card: WalletPassCardData): Pair<String, String> = when (card.type) {
    "MEMBERSHIP" -> "Valid until" to (formatLongDate(card.validUntil).takeIf { it != "—" } ?: "No expiry")
    "PACK" -> "Expires" to (formatLongDate(card.validUntil).takeIf { it != "—" } ?: "No expiry")
    "CLASS_TICKET" -> "Date" to (formatLongDate(card.validUntil).takeIf { it != "—" } ?: "No expiry")
    "GIFT_CARD" -> "Valid until" to (formatLongDate(card.validUntil).takeIf { it != "—" } ?: "No expiry")
    else -> "Valid until" to (formatLongDate(card.validUntil).takeIf { it != "—" } ?: "No expiry")
}

private fun usesSummary(card: WalletPassCardData): String = when {
    card.remainingUses != null -> "${card.remainingUses} classes"
    card.totalUses != null -> "${card.totalUses} classes"
    card.type == "MEMBERSHIP" -> "Unlimited"
    else -> "1 class"
}

private fun entitlementHeaderTypeTag(type: String): String = when (type.uppercase(Locale.getDefault())) {
    "MEMBERSHIP" -> "MEMBERSHIP"
    "PACK" -> "PACK"
    "CLASS_TICKET" -> "CLASS"
    "GIFT_CARD" -> "GIFT"
    else -> productTypeLabel(type).uppercase(Locale.getDefault())
}

private fun entitlementHeaderStatus(card: WalletPassCardData): String {
    val normalizedStatus = card.status.uppercase(Locale.getDefault()).ifBlank { "ACTIVE" }
    return if (normalizedStatus in setOf("EXPIRED", "USED_UP", "CANCELLED", "INACTIVE")) {
        "Inactive"
    } else {
        "Active"
    }
}

private fun entitlementHeaderCardName(rawTitle: String): String {
    val trimmed = rawTitle.trim()
    if (trimmed.isEmpty()) return rawTitle
    return trimmed.split(Regex("\\s+")).joinToString(" ") { word ->
        if (word.length <= 4 && word.any { it.isLetter() } && word == word.uppercase(Locale.getDefault())) {
            word
        } else if (word.contains("-")) {
            val parts = word.split("-")
            parts.mapIndexed { index, part ->
                if (index == 0) titleCaseWord(part) else part.lowercase(Locale.getDefault())
            }.joinToString("-")
        } else {
            titleCaseWord(word)
        }
    }
}

private fun titleCaseWord(word: String): String {
    if (word.isBlank()) return word
    val lowered = word.lowercase(Locale.getDefault())
    return lowered.replaceFirstChar { it.uppercase() }
}

private fun typeLabelForCard(type: String): String = when (type) {
    "CLASS_TICKET" -> "Single"
    else -> productTypeLabel(type)
}

private fun subtitleForCard(card: WalletPassCardData): String = when (card.type) {
    "MEMBERSHIP" -> "All locations"
    else -> card.tenantName?.takeIf { it.isNotBlank() } ?: "All locations"
}

private fun statusLabelForCard(card: WalletPassCardData): String {
    when (card.status.uppercase(Locale.getDefault()).ifBlank { "ACTIVE" }) {
        "EXPIRED" -> return "Expired"
        "USED_UP" -> return "Used up"
        "CANCELLED" -> return "Cancelled"
        "PENDING" -> return "Pending"
    }
    return when (card.type) {
        "PACK" -> card.remainingUses?.let { "$it left" } ?: "Active"
        "CLASS_TICKET" -> "Ready"
        else -> "Active"
    }
}

private fun statusAccentForCard(card: WalletPassCardData, typeAccent: Color): Color = when (card.status.uppercase(Locale.getDefault())) {
    "EXPIRED", "CANCELLED", "USED_UP" -> WalletMuted
    "PENDING" -> WalletAmber
    else -> if (card.type == "MEMBERSHIP") WalletGreen else typeAccent
}

private fun displayStatusLabel(status: String): String = status
    .ifBlank { "ACTIVE" }
    .replace('_', ' ')
    .lowercase(Locale.getDefault())
    .replaceFirstChar { it.uppercase() }

private fun isInactiveWalletCard(card: WalletPassCardData): Boolean {
    val status = card.status.uppercase(Locale.getDefault()).ifBlank { "ACTIVE" }
    if (status in setOf("EXPIRED", "USED_UP", "CANCELLED", "INACTIVE")) return true
    return card.type == "GIFT_CARD" && (card.remainingValueGross ?: 0.0) <= 0.0
}

private fun normalizeWalletBuyMethods(rawMethods: List<String>): List<String> {
    val normalized = rawMethods
        .map { it.uppercase(Locale.ROOT) }
        // Wallet Buy follows tenant accepted methods but intentionally excludes gift cards.
        .filter { it == "CARD" || it == "BANK_TRANSFER" || it == "PAYPAL" }
        .distinct()
    val ordered = listOf("CARD", "BANK_TRANSFER", "PAYPAL")
        .filter { normalized.contains(it) }
    return if (ordered.isNotEmpty()) ordered else listOf("CARD", "BANK_TRANSFER", "PAYPAL")
}

private fun locationPlaceholder(type: String): String? = when (type) {
    "MEMBERSHIP", "PACK", "CLASS_TICKET" -> null
    else -> null
}

private fun walletInitials(raw: String): String {
    val words = raw.split(Regex("\\s+"))
        .mapNotNull { it.firstOrNull()?.uppercaseChar()?.toString() }
    return words.take(2).joinToString("").ifBlank { "W" }
}


/**
 * Horizontal ticket silhouette: rounded rectangle with concave circular notches cut from the
 * left and right edges at `notchFractionY`. Used for the stacked wallet passes.
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
    "GIFT_CARD" -> "Gift card"
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
    availableMethods: List<String>,
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

    var query by remember { mutableStateOf("") }
    val categories = remember { BuyMarketplaceCategory.values().toList() }
    val initialCategory = remember(offers) {
        categories.firstOrNull { category -> offers.any { offer -> offerMatchesMarketplaceCategory(offer, category) } }
            ?: BuyMarketplaceCategory.Memberships
    }
    var selectedCategory by remember(offers) { mutableStateOf(initialCategory) }
    val featuredOffer = remember(offers) {
        offers.firstOrNull { it.productType.uppercase(Locale.getDefault()) == "MEMBERSHIP" }
            ?: offers.first()
    }
    val visibleOffers = remember(offers, selectedCategory, query, featuredOffer) {
        val normalizedQuery = query.trim()
        offers
            .asSequence()
            .filter { it.productId != featuredOffer.productId }
            .filter { offerMatchesMarketplaceCategory(it, selectedCategory) }
            .filter { offer ->
                normalizedQuery.isBlank() ||
                    offer.name.contains(normalizedQuery, ignoreCase = true) ||
                    offer.productType.contains(normalizedQuery, ignoreCase = true) ||
                    (offer.description?.contains(normalizedQuery, ignoreCase = true) == true) ||
                    (offer.sessionTypeName?.contains(normalizedQuery, ignoreCase = true) == true)
            }
            .toList()
            .ifEmpty {
                offers
                    .filter { it.productId != featuredOffer.productId }
                    .filter { offer ->
                        normalizedQuery.isBlank() ||
                            offer.name.contains(normalizedQuery, ignoreCase = true) ||
                            offer.productType.contains(normalizedQuery, ignoreCase = true) ||
                            (offer.description?.contains(normalizedQuery, ignoreCase = true) == true) ||
                            (offer.sessionTypeName?.contains(normalizedQuery, ignoreCase = true) == true)
                    }
            }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item { BuyMarketplaceHeader() }
        item {
            BuyMarketplaceSearchRow(
                query = query,
                onQueryChange = { query = it },
                modifier = Modifier.fillMaxWidth()
            )
        }
        item {
            BuyMarketplaceCategoryRow(
                categories = categories,
                selected = selectedCategory,
                offers = offers,
                onSelect = { selectedCategory = it },
                modifier = Modifier.fillMaxWidth()
            )
        }
        item {
            BuyMarketplaceFeaturedCard(
                offer = featuredOffer,
                availableMethods = availableMethods,
                onBuyClick = { onBuyClick(featuredOffer) },
                modifier = Modifier.fillMaxWidth()
            )
        }
        if (visibleOffers.isEmpty()) {
            item { BuyMarketplaceEmptyFilterState() }
        } else {
            itemsIndexed(visibleOffers, key = { _, offer -> offer.productId }) { index, offer ->
                BuyMarketplaceOfferCard(
                    offer = offer,
                    index = index,
                    onBuyClick = { onBuyClick(offer) },
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
        item { Spacer(Modifier.height(18.dp)) }
    }
}

private enum class BuyMarketplaceCategory(val title: String) {
    Memberships("Memberships"),
    ClassPacks("Class Packs"),
    DropIns("Drop-ins"),
    GiftCards("Gift Cards")
}

private fun offerMatchesMarketplaceCategory(offer: WalletOfferCard, category: BuyMarketplaceCategory): Boolean {
    val type = offer.productType.uppercase(Locale.getDefault())
    return when (category) {
        BuyMarketplaceCategory.Memberships -> type == "MEMBERSHIP"
        BuyMarketplaceCategory.ClassPacks -> !isGiftOffer(offer) && (type == "PACK" || (offer.usageLimit ?: 0) > 1)
        BuyMarketplaceCategory.DropIns -> !isGiftOffer(offer) && type in setOf("CLASS_TICKET", "TICKET", "DROP_IN", "DROPIN") ||
            (!isGiftOffer(offer) && type !in setOf("MEMBERSHIP", "PACK") && (offer.usageLimit ?: 1) <= 1)
        BuyMarketplaceCategory.GiftCards -> isGiftOffer(offer)
    }
}

@Composable
private fun BuyMarketplaceHeader() {
    Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
        Text(
            text = "Find something to buy",
            color = WalletInk,
            fontSize = 31.sp,
            lineHeight = 34.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = (-0.6f).sp
        )
        Text(
            text = "Passes, packs, memberships, and offers ready for instant checkout.",
            color = WalletMuted,
            fontSize = 15.sp,
            lineHeight = 20.sp,
            fontWeight = FontWeight.Medium
        )
    }
}

@Composable
private fun BuyMarketplaceSearchRow(
    query: String,
    onQueryChange: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Surface(
            modifier = Modifier
                .weight(1f)
                .height(56.dp),
            shape = RoundedCornerShape(19.dp),
            color = Color.White.copy(alpha = 0.92f),
            border = BorderStroke(1.dp, WalletLine.copy(alpha = 0.95f)),
            shadowElevation = 2.dp,
            tonalElevation = 0.dp
        ) {
            BasicTextField(
                value = query,
                onValueChange = onQueryChange,
                singleLine = true,
                textStyle = TextStyle(
                    color = WalletInk,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Medium
                ),
                modifier = Modifier.fillMaxWidth(),
                decorationBox = { innerTextField ->
                    Row(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(horizontal = 15.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(11.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Search,
                            contentDescription = null,
                            tint = WalletMuted,
                            modifier = Modifier.size(22.dp)
                        )
                        Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                            if (query.isBlank()) {
                                Text(
                                    text = "Search passes, classes, offers...",
                                    color = WalletMuted.copy(alpha = 0.74f),
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.Medium,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                            innerTextField()
                        }
                    }
                }
            )
        }

        Surface(
            modifier = Modifier.height(56.dp),
            shape = RoundedCornerShape(19.dp),
            color = Color.White.copy(alpha = 0.92f),
            border = BorderStroke(1.dp, WalletLine.copy(alpha = 0.95f)),
            shadowElevation = 2.dp,
            tonalElevation = 0.dp
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(7.dp)
            ) {
                Icon(Icons.Rounded.Tune, contentDescription = null, tint = WalletInk, modifier = Modifier.size(21.dp))
                Text("Filters", color = WalletInk, fontSize = 14.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun BuyMarketplaceCategoryRow(
    categories: List<BuyMarketplaceCategory>,
    selected: BuyMarketplaceCategory,
    offers: List<WalletOfferCard>,
    onSelect: (BuyMarketplaceCategory) -> Unit,
    modifier: Modifier = Modifier
) {
    LazyRow(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        contentPadding = PaddingValues(end = 2.dp)
    ) {
        items(categories, key = { it.title }) { category ->
            val active = selected == category
            val count = offers.count { offerMatchesMarketplaceCategory(it, category) }
            Surface(
                modifier = Modifier.clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = { onSelect(category) }
                ),
                shape = RoundedCornerShape(999.dp),
                color = if (active) Color(0xFF1E5AE8) else Color.White.copy(alpha = 0.92f),
                border = BorderStroke(1.dp, if (active) Color(0xFF1E5AE8) else WalletLine.copy(alpha = 0.95f)),
                shadowElevation = if (active) 7.dp else 1.dp,
                tonalElevation = 0.dp
            ) {
                Row(
                    modifier = Modifier
                        .height(45.dp)
                        .padding(horizontal = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(7.dp)
                ) {
                    BuyMarketplaceCategoryIcon(category = category, selected = active)
                    Text(
                        text = category.title,
                        color = if (active) Color.White else WalletInk,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1
                    )
                    if (count > 0) {
                        Text(
                            text = count.toString(),
                            color = if (active) Color.White.copy(alpha = 0.7f) else WalletMuted,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun BuyMarketplaceCategoryIcon(category: BuyMarketplaceCategory, selected: Boolean) {
    val tint = if (selected) Color.White else WalletInk
    when (category) {
        BuyMarketplaceCategory.Memberships -> Icon(Icons.Rounded.FitnessCenter, contentDescription = null, tint = tint, modifier = Modifier.size(18.dp))
        BuyMarketplaceCategory.ClassPacks -> Icon(Icons.Rounded.ConfirmationNumber, contentDescription = null, tint = tint, modifier = Modifier.size(18.dp))
        BuyMarketplaceCategory.DropIns -> Icon(Icons.Rounded.Schedule, contentDescription = null, tint = tint, modifier = Modifier.size(18.dp))
        BuyMarketplaceCategory.GiftCards -> Text("🎁", fontSize = 16.sp, lineHeight = 16.sp)
    }
}

@Composable
private fun BuyMarketplaceFeaturedCard(
    offer: WalletOfferCard,
    availableMethods: List<String>,
    onBuyClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val price = buyOfferPriceLabel(offer)
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(25.dp),
        color = Color.Transparent,
        shadowElevation = 8.dp,
        tonalElevation = 0.dp
    ) {
        Box(
            modifier = Modifier
                .heightIn(min = 205.dp)
                .background(
                    Brush.linearGradient(
                        colors = listOf(Color(0xFF061B42), Color(0xFF082B66), Color(0xFF0A4EA8)),
                        start = Offset(0f, 0f),
                        end = Offset(850f, 520f)
                    )
                )
                .padding(18.dp)
        ) {
            Box(
                modifier = Modifier
                    .align(Alignment.CenterEnd)
                    .offset(x = 64.dp, y = 16.dp)
                    .size(190.dp)
                    .clip(CircleShape)
                    .background(Color(0xFF236BDA).copy(alpha = 0.36f))
            )
            WalletPassWave(
                accent = Color(0xFF2B80FF),
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(end = 4.dp, bottom = 2.dp)
                    .size(width = 185.dp, height = 84.dp)
            )
            Box(
                modifier = Modifier
                    .align(Alignment.CenterEnd)
                    .padding(end = 20.dp)
                    .size(92.dp)
                    .clip(RoundedCornerShape(28.dp))
                    .background(Color.White.copy(alpha = 0.13f))
                    .border(BorderStroke(1.dp, Color.White.copy(alpha = 0.16f)), RoundedCornerShape(28.dp)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Rounded.FitnessCenter,
                    contentDescription = null,
                    tint = Color.White.copy(alpha = 0.86f),
                    modifier = Modifier.size(50.dp)
                )
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth(0.68f)
                    .align(Alignment.TopStart),
                verticalArrangement = Arrangement.spacedBy(11.dp)
            ) {
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = WalletAmber.copy(alpha = 0.22f),
                    border = BorderStroke(1.dp, WalletAmber.copy(alpha = 0.24f)),
                    tonalElevation = 0.dp
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Icon(Icons.Rounded.Star, contentDescription = null, tint = WalletAmber, modifier = Modifier.size(15.dp))
                        Text(
                            text = marketplaceFeaturedTag(offer).uppercase(Locale.getDefault()),
                            color = Color(0xFFFFB161),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1
                        )
                    }
                }

                Text(
                    text = offer.name.ifBlank { "Unlimited Monthly" },
                    color = Color.White,
                    fontSize = 29.sp,
                    lineHeight = 31.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = marketplaceFeaturedDescription(offer),
                    color = Color.White.copy(alpha = 0.82f),
                    fontSize = 15.sp,
                    lineHeight = 21.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Text(
                        text = price,
                        color = Color.White,
                        fontSize = 30.sp,
                        lineHeight = 32.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1
                    )
                    if (availableMethods.isNotEmpty()) {
                        Text(
                            text = "Secure checkout",
                            color = Color.White.copy(alpha = 0.68f),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1
                        )
                    }
                }
                Surface(
                    modifier = Modifier
                        .height(50.dp)
                        .widthIn(min = 132.dp)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            onClick = onBuyClick
                        ),
                    shape = RoundedCornerShape(15.dp),
                    color = Color(0xFFFF6B4A),
                    shadowElevation = 5.dp,
                    tonalElevation = 0.dp
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text("Buy now", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
private fun BuyMarketplaceOfferCard(
    offer: WalletOfferCard,
    index: Int,
    onBuyClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val accent = marketplaceOfferAccent(offer, index)
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(22.dp),
        color = Color.White.copy(alpha = 0.96f),
        border = BorderStroke(1.dp, WalletLine.copy(alpha = 0.76f)),
        shadowElevation = 5.dp,
        tonalElevation = 0.dp
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(74.dp)
                    .clip(RoundedCornerShape(18.dp))
                    .background(accent.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center
            ) {
                BuyMarketplaceOfferIcon(offer = offer, accent = accent)
            }

            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Text(
                    text = offer.name.ifBlank { productTypeLabel(offer.productType) },
                    color = WalletInk,
                    fontSize = 20.sp,
                    lineHeight = 23.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    Icon(Icons.Rounded.Star, contentDescription = null, tint = WalletAmber, modifier = Modifier.size(15.dp))
                    Text(
                        text = marketplaceOfferTag(offer),
                        color = WalletAmber,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                Text(
                    text = marketplaceOfferDescription(offer),
                    color = WalletMuted,
                    fontSize = 14.sp,
                    lineHeight = 18.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }

            Column(
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text = buyOfferPriceLabel(offer),
                    color = WalletInk,
                    fontSize = 25.sp,
                    lineHeight = 27.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.End,
                    maxLines = 1
                )
                Surface(
                    modifier = Modifier
                        .height(44.dp)
                        .width(112.dp)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            onClick = onBuyClick
                        ),
                    shape = RoundedCornerShape(14.dp),
                    color = Color(0xFF1E5AE8),
                    shadowElevation = 4.dp,
                    tonalElevation = 0.dp
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text("Buy now", color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
private fun BuyMarketplaceOfferIcon(offer: WalletOfferCard, accent: Color) {
    when {
        isGiftOffer(offer) -> Text("🎁", fontSize = 31.sp, lineHeight = 31.sp)
        offer.productType.uppercase(Locale.getDefault()) == "MEMBERSHIP" -> Icon(Icons.Rounded.CardMembership, contentDescription = null, tint = accent, modifier = Modifier.size(34.dp))
        offer.productType.uppercase(Locale.getDefault()) == "PACK" -> Text(
            text = (offer.usageLimit?.takeIf { it > 0 } ?: 10).toString(),
            color = accent,
            fontSize = 27.sp,
            fontWeight = FontWeight.Bold
        )
        else -> Icon(Icons.Rounded.FitnessCenter, contentDescription = null, tint = accent, modifier = Modifier.size(34.dp))
    }
}

@Composable
private fun BuyMarketplaceEmptyFilterState() {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(22.dp),
        color = Color.White.copy(alpha = 0.92f),
        border = BorderStroke(1.dp, WalletLine.copy(alpha = 0.84f)),
        tonalElevation = 0.dp,
        shadowElevation = 2.dp
    ) {
        Column(
            modifier = Modifier.padding(22.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(Icons.Outlined.ShoppingBag, contentDescription = null, tint = WalletMuted, modifier = Modifier.size(32.dp))
            Text("No matching offers", color = WalletInk, fontSize = 18.sp, fontWeight = FontWeight.Bold)
            Text(
                text = "Try another category or search term.",
                color = WalletMuted,
                fontSize = 14.sp,
                textAlign = TextAlign.Center
            )
        }
    }
}

private fun marketplaceFeaturedTag(offer: WalletOfferCard): String = when {
    offer.promoText?.isNotBlank() == true -> offer.promoText
    offer.productType.uppercase(Locale.getDefault()) == "MEMBERSHIP" -> "Most popular"
    else -> "Featured"
}

private fun marketplaceFeaturedDescription(offer: WalletOfferCard): String = when {
    offer.description?.isNotBlank() == true -> offer.description
    offer.productType.uppercase(Locale.getDefault()) == "MEMBERSHIP" -> "Unlimited classes, all locations. Cancel anytime."
    else -> buyOfferSubtitle(offer)
}

private fun marketplaceOfferTag(offer: WalletOfferCard): String = when {
    offer.promoText?.isNotBlank() == true -> offer.promoText
    isGiftOffer(offer) -> "Gift-ready"
    offer.name.contains("training", ignoreCase = true) -> "New member offer"
    offer.productType.uppercase(Locale.getDefault()) == "PACK" && (offer.usageLimit ?: 0) >= 5 -> "Best value"
    offer.productType.uppercase(Locale.getDefault()) == "MEMBERSHIP" -> "Most popular"
    else -> "Great for trying out"
}

private fun marketplaceOfferDescription(offer: WalletOfferCard): String = when {
    offer.description?.isNotBlank() == true -> offer.description
    offer.name.contains("training", ignoreCase = true) -> "One session with a certified coach."
    offer.productType.uppercase(Locale.getDefault()) == "PACK" -> "${offerVisitCountShortLabel(offer.usageLimit)} to use anytime, any location."
    offer.productType.uppercase(Locale.getDefault()) == "MEMBERSHIP" -> "Unlimited classes, all locations."
    else -> "One class. Any time, any location."
}

private fun marketplaceOfferAccent(offer: WalletOfferCard, index: Int): Color = when {
    isGiftOffer(offer) -> WalletAmber
    offer.productType.uppercase(Locale.getDefault()) == "MEMBERSHIP" -> Color(0xFF1E5AE8)
    offer.productType.uppercase(Locale.getDefault()) == "PACK" -> Color(0xFF1E5AE8)
    index % 2 == 0 -> Color(0xFFA06A1B)
    else -> Color(0xFF8B4B2B)
}

private enum class BuyCategory(val title: String) {
    Packs("Packs"),
    Memberships("Memberships"),
    GiftCards("Gift Cards")
}

private fun buyCategoriesForOffers(offers: List<WalletOfferCard>): List<BuyCategory> {
    val available = buildList {
        if (offers.any { offerMatchesBuyCategory(it, BuyCategory.Packs) }) add(BuyCategory.Packs)
        if (offers.any { offerMatchesBuyCategory(it, BuyCategory.Memberships) }) add(BuyCategory.Memberships)
        if (offers.any { offerMatchesBuyCategory(it, BuyCategory.GiftCards) }) add(BuyCategory.GiftCards)
    }
    return available.ifEmpty { listOf(BuyCategory.Packs, BuyCategory.Memberships, BuyCategory.GiftCards) }
}

private fun offerMatchesBuyCategory(offer: WalletOfferCard, category: BuyCategory): Boolean = when (category) {
    BuyCategory.Packs -> offer.productType.uppercase(Locale.getDefault()) in setOf("PACK", "CLASS_TICKET", "TICKET")
    BuyCategory.Memberships -> offer.productType.uppercase(Locale.getDefault()) == "MEMBERSHIP"
    BuyCategory.GiftCards -> isGiftOffer(offer)
}

private fun isGiftOffer(offer: WalletOfferCard): Boolean {
    val type = offer.productType.uppercase(Locale.getDefault())
    return type in setOf("GIFT_CARD", "GIFT", "VOUCHER") || offer.name.contains("gift", ignoreCase = true)
}

@Composable
private fun BuyShopHeroCard(
    availableMethods: List<String>,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(26.dp),
        color = Color.White.copy(alpha = 0.88f),
        border = BorderStroke(1.dp, WalletLine.copy(alpha = 0.92f)),
        shadowElevation = 7.dp,
        tonalElevation = 0.dp
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Box(
                    modifier = Modifier
                        .size(62.dp)
                        .clip(RoundedCornerShape(20.dp))
                        .background(Color(0xFFEAF4FF)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Outlined.ShoppingBag,
                        contentDescription = null,
                        tint = WalletBlueSoft,
                        modifier = Modifier.size(31.dp)
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Wallet shop",
                        color = WalletBlueSoft,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "Buy passes",
                        color = WalletInk,
                        fontSize = 31.sp,
                        lineHeight = 34.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = (-0.5f).sp
                    )
                    Text(
                        text = "Purchase memberships, class packs, and gift cards instantly.",
                        color = WalletInk.copy(alpha = 0.72f),
                        fontSize = 15.sp,
                        lineHeight = 21.sp,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier.padding(top = 5.dp)
                    )
                }
            }

            SecurePaymentBlock(
                availableMethods = availableMethods,
                modifier = Modifier.fillMaxWidth()
            )
        }
    }
}

@Composable
private fun SecurePaymentBlock(
    availableMethods: List<String>,
    modifier: Modifier = Modifier
) {
    val normalized = remember(availableMethods) { normalizeWalletBuyMethods(availableMethods) }
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(18.dp),
        color = Color(0xFFF4F8FF),
        border = BorderStroke(1.dp, WalletLine.copy(alpha = 0.86f)),
        tonalElevation = 0.dp,
        shadowElevation = 1.dp
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 13.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(34.dp)
                    .clip(CircleShape)
                    .background(Color.White),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Rounded.CheckCircle,
                    contentDescription = null,
                    tint = WalletBlueSoft,
                    modifier = Modifier.size(20.dp)
                )
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    text = "Pay securely",
                    color = WalletInk,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = paymentMethodsSentence(normalized),
                    color = WalletInk.copy(alpha = 0.66f),
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    fontWeight = FontWeight.Medium
                )
            }
            PaymentLogoStrip(methods = normalized)
        }
    }
}

@Composable
private fun PaymentLogoStrip(methods: List<String>) {
    Row(horizontalArrangement = Arrangement.spacedBy(5.dp), verticalAlignment = Alignment.CenterVertically) {
        methods.take(3).forEach { method ->
            val label = when (method) {
                "CARD" -> "VISA"
                "PAYPAL" -> "PayPal"
                "BANK_TRANSFER" -> "BANK"
                else -> method.take(4)
            }
            Surface(
                shape = RoundedCornerShape(8.dp),
                color = Color.White,
                border = BorderStroke(1.dp, WalletLine.copy(alpha = 0.9f)),
                tonalElevation = 0.dp
            ) {
                Box(modifier = Modifier.height(28.dp).padding(horizontal = 7.dp), contentAlignment = Alignment.Center) {
                    Text(
                        text = label,
                        color = WalletBlue,
                        fontSize = if (label.length > 5) 9.sp else 10.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1
                    )
                }
            }
        }
    }
}

private fun paymentMethodsSentence(methods: List<String>): String {
    val labels = methods.map { paymentMethodDisplayName(it) }
    return when (labels.size) {
        0 -> "Card, PayPal, or Bank transfer"
        1 -> labels.first()
        2 -> labels.joinToString(" or ")
        else -> labels.dropLast(1).joinToString(", ") + ", or " + labels.last()
    }
}

private fun paymentMethodDisplayName(method: String): String = when (method) {
    "CARD" -> "Card"
    "PAYPAL" -> "PayPal"
    "BANK_TRANSFER" -> "Bank transfer"
    else -> method.replace('_', ' ').lowercase(Locale.getDefault()).replaceFirstChar { it.uppercase() }
}

@Composable
private fun BuyCategoryFilterRow(
    categories: List<BuyCategory>,
    selected: BuyCategory,
    offers: List<WalletOfferCard>,
    onSelect: (BuyCategory) -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        categories.forEach { category ->
            val count = offers.count { offerMatchesBuyCategory(it, category) }
            val active = selected == category
            Surface(
                modifier = Modifier.clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = { onSelect(category) }
                ),
                shape = RoundedCornerShape(999.dp),
                color = if (active) WalletBlueSoft else Color.White.copy(alpha = 0.9f),
                border = BorderStroke(1.dp, if (active) WalletBlueSoft.copy(alpha = 0.55f) else WalletLine.copy(alpha = 0.95f)),
                shadowElevation = if (active) 6.dp else 2.dp,
                tonalElevation = 0.dp
            ) {
                Row(
                    modifier = Modifier.height(42.dp).padding(horizontal = 13.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(7.dp)
                ) {
                    BuyCategoryIcon(category = category, active = active)
                    Text(
                        text = category.title,
                        color = if (active) Color.White else WalletInk,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1
                    )
                    if (count > 0) {
                        Text(
                            text = count.toString(),
                            color = if (active) Color.White.copy(alpha = 0.72f) else WalletMuted,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun BuyCategoryIcon(category: BuyCategory, active: Boolean) {
    val tint = if (active) Color.White else WalletInk
    when (category) {
        BuyCategory.Packs -> Icon(Icons.Outlined.LocalActivity, contentDescription = null, tint = tint, modifier = Modifier.size(18.dp))
        BuyCategory.Memberships -> Icon(Icons.Outlined.WorkspacePremium, contentDescription = null, tint = tint, modifier = Modifier.size(18.dp))
        BuyCategory.GiftCards -> Text("🎁", fontSize = 16.sp, lineHeight = 16.sp)
    }
}

private data class BuyOfferStyle(
    val accent: Color,
    val background: Color,
    val border: Color,
    val soft: Color,
    val tag: String?
)

private fun buyOfferStyle(offer: WalletOfferCard): BuyOfferStyle = when {
    offer.productType.uppercase(Locale.getDefault()) == "MEMBERSHIP" -> BuyOfferStyle(
        accent = WalletBlueSoft,
        background = Color(0xFFF7FBFF),
        border = WalletLine.copy(alpha = 0.95f),
        soft = Color(0xFFEAF4FF),
        tag = "Most popular"
    )
    isGiftOffer(offer) -> BuyOfferStyle(
        accent = WalletGold,
        background = Color(0xFFFFFAF2),
        border = WalletGold.copy(alpha = 0.35f),
        soft = WalletGoldSoft,
        tag = null
    )
    else -> BuyOfferStyle(
        accent = WalletGreen,
        background = Color(0xFFF3FCF7),
        border = WalletGreen.copy(alpha = 0.46f),
        soft = WalletGreenSoft,
        tag = offer.promoText?.takeIf { it.isNotBlank() } ?: "Best value"
    )
}

@Composable
private fun BuyShopOfferCard(
    offer: WalletOfferCard,
    index: Int,
    onBuyClick: () -> Unit
) {
    val style = buyOfferStyle(offer)
    val type = offer.productType.uppercase(Locale.getDefault())
    val isPackLike = type in setOf("PACK", "CLASS_TICKET", "TICKET") && !isGiftOffer(offer)
    val ticketShape = remember { CompactTicketShape(cornerRadius = 22.dp, notchRadius = 13.dp, notchFractionY = 0.48f) }
    val shape: Shape = if (isPackLike) ticketShape else RoundedCornerShape(22.dp)

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = shape,
        color = style.background,
        border = BorderStroke(1.15f.dp, style.border),
        shadowElevation = if (index == 0) 7.dp else 5.dp,
        tonalElevation = 0.dp
    ) {
        Box(
            modifier = Modifier
                .background(
                    Brush.linearGradient(
                        colors = listOf(style.background, Color.White.copy(alpha = 0.86f), style.soft.copy(alpha = 0.68f)),
                        start = Offset(0f, 0f),
                        end = Offset(850f, 600f)
                    )
                )
        ) {
            WalletPassWave(
                accent = style.accent,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(end = 10.dp, bottom = 10.dp)
                    .size(width = 150.dp, height = 78.dp)
            )

            if (isPackLike) {
                VerticalTicketDivider(
                    color = style.accent.copy(alpha = 0.26f),
                    modifier = Modifier
                        .align(Alignment.CenterStart)
                        .padding(start = 52.dp, top = 10.dp, bottom = 10.dp)
                )
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = if (isPackLike) 72.dp else 18.dp, top = 17.dp, end = 18.dp, bottom = 16.dp),
                verticalArrangement = Arrangement.spacedBy(13.dp)
            ) {
                Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(13.dp)) {
                    if (!isPackLike) {
                        BuyOfferIconBadge(offer = offer, style = style)
                    }
                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                            Text(
                                text = buyOfferTypeLabel(offer).uppercase(Locale.getDefault()),
                                color = style.accent,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 0.8.sp,
                                maxLines = 1
                            )
                            style.tag?.let { tag ->
                                BuySmallTag(text = tag, accent = style.accent)
                            }
                        }
                        Text(
                            text = offer.name.ifBlank { productTypeLabel(offer.productType) },
                            color = WalletInk,
                            fontSize = 21.sp,
                            lineHeight = 24.sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis
                        )
                        Text(
                            text = buyOfferSubtitle(offer),
                            color = WalletInk.copy(alpha = 0.68f),
                            fontSize = 14.sp,
                            lineHeight = 18.sp,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                    Text(
                        text = buyOfferPriceLabel(offer),
                        color = style.accent,
                        fontSize = if (type == "MEMBERSHIP") 25.sp else 29.sp,
                        lineHeight = 31.sp,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.End,
                        maxLines = 1
                    )
                }

                val metrics = buyOfferMetrics(offer)
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    BuyOfferMetricTile(
                        label = metrics[0].first,
                        value = metrics[0].second,
                        accent = style.accent,
                        modifier = Modifier.weight(1f)
                    )
                    BuyOfferMetricTile(
                        label = metrics[1].first,
                        value = metrics[1].second,
                        accent = style.accent,
                        modifier = Modifier.weight(1f)
                    )
                }

                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    BuyOutlineActionButton(
                        text = "Details",
                        accent = WalletBlueSoft,
                        onClick = {},
                        modifier = Modifier.weight(1f)
                    )
                    BuyPrimaryActionButton(
                        text = "Buy now",
                        onClick = onBuyClick,
                        modifier = Modifier.weight(1.25f)
                    )
                }
            }
        }
    }
}

@Composable
private fun BuyOfferIconBadge(offer: WalletOfferCard, style: BuyOfferStyle) {
    Box(
        modifier = Modifier
            .size(54.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(style.soft),
        contentAlignment = Alignment.Center
    ) {
        when {
            isGiftOffer(offer) -> Text("🎁", fontSize = 26.sp, lineHeight = 26.sp)
            offer.productType.uppercase(Locale.getDefault()) == "MEMBERSHIP" -> Text("∞", color = style.accent, fontSize = 31.sp, fontWeight = FontWeight.Bold)
            else -> Icon(Icons.Outlined.LocalActivity, contentDescription = null, tint = style.accent, modifier = Modifier.size(28.dp))
        }
    }
}

@Composable
private fun BuySmallTag(text: String, accent: Color) {
    Surface(
        color = accent.copy(alpha = 0.12f),
        shape = RoundedCornerShape(999.dp),
        border = BorderStroke(1.dp, accent.copy(alpha = 0.12f)),
        tonalElevation = 0.dp
    ) {
        Text(
            text = text.uppercase(Locale.getDefault()),
            color = accent,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
        )
    }
}

@Composable
private fun BuyOfferMetricTile(
    label: String,
    value: String,
    accent: Color,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier.heightIn(min = 56.dp),
        shape = RoundedCornerShape(14.dp),
        color = Color.White.copy(alpha = 0.58f),
        border = BorderStroke(1.dp, WalletLine.copy(alpha = 0.58f)),
        tonalElevation = 0.dp
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(
                imageVector = if (label.equals("Validity", ignoreCase = true) || label.equals("Delivery", ignoreCase = true)) Icons.Rounded.Schedule else Icons.Rounded.Info,
                contentDescription = null,
                tint = accent,
                modifier = Modifier.size(19.dp)
            )
            Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
                Text(
                    text = label,
                    color = WalletInk.copy(alpha = 0.58f),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1
                )
                Text(
                    text = value,
                    color = WalletInk,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

@Composable
private fun BuyOutlineActionButton(
    text: String,
    accent: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier
            .height(44.dp)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick
            ),
        shape = RoundedCornerShape(13.dp),
        color = Color.White.copy(alpha = 0.82f),
        border = BorderStroke(1.25.dp, accent.copy(alpha = 0.82f)),
        tonalElevation = 0.dp
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(text = text, color = accent, fontWeight = FontWeight.Bold, fontSize = 14.sp)
        }
    }
}

@Composable
private fun BuyPrimaryActionButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier
            .height(44.dp)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick
            ),
        shape = RoundedCornerShape(13.dp),
        color = WalletBlueSoft,
        shadowElevation = 4.dp,
        tonalElevation = 0.dp
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(text = text, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp)
        }
    }
}

private fun buyOfferTypeLabel(offer: WalletOfferCard): String = when {
    isGiftOffer(offer) -> "Gift card"
    else -> productTypeLabel(offer.productType)
}

private fun buyOfferSubtitle(offer: WalletOfferCard): String = when {
    isGiftOffer(offer) -> offer.description?.takeIf { it.isNotBlank() } ?: "Send to a friend"
    offer.productType.uppercase(Locale.getDefault()) == "MEMBERSHIP" -> offer.sessionTypeName?.takeIf { it.isNotBlank() } ?: "All club access"
    else -> offer.sessionTypeName?.takeIf { it.isNotBlank() } ?: "Studio access"
}

private fun buyOfferPriceLabel(offer: WalletOfferCard): String {
    val suffix = if (offer.productType.uppercase(Locale.getDefault()) == "MEMBERSHIP") "/mo" else ""
    return "${currencySymbol(offer.currency)}${formatCompactPrice(offer.priceGross)}$suffix"
}

private fun buyOfferMetrics(offer: WalletOfferCard): List<Pair<String, String>> = when {
    isGiftOffer(offer) -> listOf(
        "Value" to "${currencySymbol(offer.currency)}${formatCompactPrice(offer.priceGross)}",
        "Delivery" to "Instant"
    )
    offer.productType.uppercase(Locale.getDefault()) == "MEMBERSHIP" -> listOf(
        "Billing" to "Monthly",
        "Perks" to if ((offer.usageLimit ?: 0) <= 0) "Unlimited classes" else offerVisitCountShortLabel(offer.usageLimit)
    )
    else -> listOf(
        "Access" to offerVisitCountShortLabel(offer.usageLimit),
        "Validity" to offerValidityShortLabel(offer.validityDays)
    )
}

private fun offerVisitCountShortLabel(limit: Int?): String = when {
    limit == null || limit <= 1 -> "1 class"
    else -> "$limit classes"
}

private fun offerValidityShortLabel(days: Int?): String = when {
    days == null || days <= 0 -> "Flexible"
    days >= 120 && days % 30 == 0 -> "${days / 30} months"
    days >= 60 -> "${days / 30} months"
    days == 1 -> "1 day"
    else -> "$days days"
}

private fun currencySymbol(currency: String): String = when (currency.uppercase(Locale.getDefault())) {
    "EUR" -> "€"
    "USD" -> "\$"
    "GBP" -> "£"
    else -> "$currency "
}

private fun formatCompactPrice(value: Double): String =
    if (value % 1.0 == 0.0) String.format(Locale.getDefault(), "%.0f", value)
    else String.format(Locale.getDefault(), "%.2f", value)

@Composable
private fun BuyOfferCard(offer: WalletOfferCard, index: Int, onBuyClick: () -> Unit) {
    when (offer.productType) {
        "PACK" -> PackOfferCard(offer = offer, index = index, onBuyClick = onBuyClick)
        "MEMBERSHIP" -> MembershipOfferCard(offer = offer, onBuyClick = onBuyClick)
        else -> ClassTicketOfferCard(offer = offer, onBuyClick = onBuyClick)
    }
}

@Composable
private fun ClassTicketOfferCard(offer: WalletOfferCard, onBuyClick: () -> Unit) {
    val shape = remember { CompactTicketShape(cornerRadius = 20.dp, notchRadius = 11.dp) }
    val border = Color(0xFFE8D8C3)
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = shape,
        color = WalletCardCream,
        border = BorderStroke(1.dp, border),
        tonalElevation = 0.dp,
        shadowElevation = 6.dp
    ) {
        Row(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(start = 20.dp, top = 18.dp, end = 16.dp, bottom = 18.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text = "CLASS TICKET",
                    color = WalletGold,
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.sp,
                    letterSpacing = 1.2.sp
                )
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        text = offer.name,
                        color = WalletInk,
                        fontWeight = FontWeight.Bold,
                        fontSize = 28.sp,
                        lineHeight = 30.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = offerStudioName(offer),
                        color = WalletInk.copy(alpha = 0.82f),
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                Box(
                    modifier = Modifier
                        .fillMaxWidth(0.82f)
                        .height(1.dp)
                        .background(WalletGold.copy(alpha = 0.45f))
                )
                Text(
                    text = offerClassDescription(offer),
                    color = WalletMuted,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                    minLines = 2,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OfferMetricBlock(
                        title = if ((offer.usageLimit ?: 1) <= 1) "Valid for 1 class" else "Valid for ${offer.usageLimit} classes",
                        subtitle = offerValidityLabel(offer.validityDays),
                        accent = WalletGold,
                        modifier = Modifier.weight(1f)
                    )
                    OfferMetricBlock(
                        title = offerVisitCountLabel(offer.usageLimit),
                        subtitle = if ((offer.usageLimit ?: 1) <= 1) "Single use" else "Multi-use",
                        accent = WalletGold,
                        modifier = Modifier.weight(1f)
                    )
                }
                Button(
                    onClick = onBuyClick,
                    modifier = Modifier.height(44.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = WalletGold, contentColor = Color.White)
                ) {
                    Text("Buy now", fontWeight = FontWeight.SemiBold)
                }
            }

            VerticalTicketDivider(color = WalletGold.copy(alpha = 0.65f), modifier = Modifier.padding(vertical = 14.dp))

            Column(
                modifier = Modifier
                    .width(132.dp)
                    .padding(start = 14.dp, top = 18.dp, end = 16.dp, bottom = 18.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(58.dp)
                        .clip(CircleShape)
                        .background(WalletGold.copy(alpha = 0.16f)),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = walletInitials(offerStudioName(offer)),
                        color = WalletGold,
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp
                    )
                }
                Text("PRICE", color = WalletGold, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.sp)
                Text(
                    text = "\$${formatPrice(offer.priceGross)}",
                    color = WalletInk,
                    fontWeight = FontWeight.Bold,
                    fontSize = 30.sp
                )
                BarcodeStub(code = offerDisplayCode(offer), accent = WalletInk)
                Text(
                    text = offerDisplayCode(offer),
                    color = WalletMuted,
                    fontSize = 12.sp,
                    maxLines = 1
                )
            }
        }
    }
}

@Composable
private fun PackOfferCard(offer: WalletOfferCard, index: Int, onBuyClick: () -> Unit) {
    val shape = remember { CompactTicketShape(cornerRadius = 20.dp, notchRadius = 11.dp) }
    val backBorder = Color(0xFFD8EADA)
    Box(modifier = Modifier.fillMaxWidth().padding(bottom = 18.dp)) {
        repeat(2) { layer ->
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = (10 + layer * 8).dp)
                    .offset(y = (12 + layer * 8).dp),
                shape = shape,
                color = WalletCardMint.copy(alpha = 0.7f - layer * 0.14f),
                border = BorderStroke(1.dp, backBorder.copy(alpha = 0.7f)),
                tonalElevation = 0.dp,
                shadowElevation = 0.dp
            ) {
                Spacer(modifier = Modifier.height(220.dp))
            }
        }

        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = shape,
            color = WalletCardMint,
            border = BorderStroke(1.dp, backBorder),
            tonalElevation = 0.dp,
            shadowElevation = 6.dp
        ) {
            Box(modifier = Modifier.fillMaxWidth()) {
                if (!offer.promoText.isNullOrBlank() || (offer.usageLimit ?: 0) > 1) {
                    Surface(
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .padding(top = 12.dp, end = 14.dp),
                        color = WalletGreen,
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Text(
                            text = offer.promoText?.takeIf { it.isNotBlank() } ?: "BEST VALUE",
                            color = Color.White,
                            fontWeight = FontWeight.Bold,
                            fontSize = 11.sp,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                        )
                    }
                }

                Row(modifier = Modifier.fillMaxWidth()) {
                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .padding(start = 20.dp, top = 18.dp, end = 14.dp, bottom = 18.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text("PACK", color = WalletGreen, fontWeight = FontWeight.Bold, fontSize = 12.sp, letterSpacing = 1.2.sp)
                        Text(
                            text = offerPackTitle(offer),
                            color = Color(0xFF153D2A),
                            fontWeight = FontWeight.Bold,
                            fontSize = 26.sp,
                            lineHeight = 28.sp,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis
                        )
                        Text(
                            text = offerStudioName(offer),
                            color = Color(0xFF285540),
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(0.82f)
                                .height(1.dp)
                                .background(WalletGreen.copy(alpha = 0.32f))
                        )
                        Text(
                            text = offerPackDescription(offer),
                            color = WalletMuted,
                            fontSize = 14.sp,
                            lineHeight = 20.sp,
                            minLines = 2,
                            maxLines = 3,
                            overflow = TextOverflow.Ellipsis
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            OfferMetricBlock(
                                title = offerValidityLabel(offer.validityDays),
                                subtitle = "Flexible redemption",
                                accent = WalletGreen,
                                modifier = Modifier.weight(1f)
                            )
                            OfferMetricBlock(
                                title = if ((offer.usageLimit ?: 1) > 1) "${offer.usageLimit} visits" else "Shareable",
                                subtitle = if ((offer.usageLimit ?: 1) > 1) "Shareable pack" else "Multi-use",
                                accent = WalletGreen,
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }

                    VerticalTicketDivider(color = WalletGreen.copy(alpha = 0.55f), modifier = Modifier.padding(vertical = 14.dp))

                    Column(
                        modifier = Modifier
                            .width(138.dp)
                            .padding(start = 12.dp, top = 22.dp, end = 16.dp, bottom = 18.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(88.dp)
                                .clip(CircleShape)
                                .background(Color.White.copy(alpha = 0.55f))
                                .background(Color.Transparent),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text(
                                    text = "${offer.usageLimit ?: 10}",
                                    color = Color(0xFF1B5B3A),
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 28.sp
                                )
                                Text(
                                    text = if ((offer.usageLimit ?: 10) == 1) "VISIT" else "VISITS",
                                    color = Color(0xFF1B5B3A),
                                    fontWeight = FontWeight.SemiBold,
                                    fontSize = 12.sp,
                                    letterSpacing = 1.sp
                                )
                            }
                        }
                        Text(
                            text = "\$${formatPrice(offer.priceGross)}",
                            color = Color(0xFF105A35),
                            fontWeight = FontWeight.Bold,
                            fontSize = 28.sp
                        )
                        Text(
                            text = offer.promoText?.takeIf { it.isNotBlank() } ?: "Flexible visits",
                            color = WalletMuted,
                            fontSize = 12.sp,
                            textAlign = TextAlign.Center,
                            lineHeight = 16.sp
                        )
                        Button(
                            onClick = onBuyClick,
                            modifier = Modifier.fillMaxWidth().height(44.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = WalletGreen, contentColor = Color.White)
                        ) {
                            Text("Buy now", fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MembershipOfferCard(offer: WalletOfferCard, onBuyClick: () -> Unit) {
    val shape = RoundedCornerShape(24.dp)
    val border = Color(0xFFE1D8F7)
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = shape,
        color = WalletCardLavender,
        border = BorderStroke(1.dp, border),
        tonalElevation = 0.dp,
        shadowElevation = 6.dp
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 18.dp, top = 18.dp, end = 18.dp, bottom = 16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Row(verticalAlignment = Alignment.Top) {
                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("MEMBERSHIP", color = Color(0xFF7B5ACB), fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.2.sp)
                        Text(
                            text = offer.name,
                            color = Color(0xFF34245E),
                            fontWeight = FontWeight.Bold,
                            fontSize = 24.sp,
                            lineHeight = 26.sp,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis
                        )
                        Text(
                            text = "ALL ACCESS MEMBERSHIP",
                            color = WalletGold,
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 12.sp,
                            letterSpacing = 1.2.sp
                        )
                    }
                    Box(
                        modifier = Modifier
                            .size(52.dp)
                            .clip(CircleShape)
                            .background(Color.White.copy(alpha = 0.72f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(walletInitials(offerStudioName(offer)), color = WalletGold, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    }
                }

                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Box(
                        modifier = Modifier
                            .size(88.dp)
                            .clip(CircleShape)
                            .background(Color.White),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = walletInitials(offer.name),
                            color = Color(0xFF7B5ACB),
                            fontWeight = FontWeight.Bold,
                            fontSize = 26.sp,
                            letterSpacing = 1.2.sp
                        )
                    }
                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Column {
                            Text("Member", color = Color(0xFF7B5ACB), fontSize = 12.sp, fontWeight = FontWeight.Medium)
                            Text("Guest Member", color = Color(0xFF34245E), fontSize = 22.sp, fontWeight = FontWeight.Bold)
                        }
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(0.86f)
                                .height(1.dp)
                                .background(Color(0xFFD7CCEF))
                        )
                        Column {
                            Text("Member ID", color = Color(0xFF7B5ACB), fontSize = 12.sp, fontWeight = FontWeight.Medium)
                            Text(offerMemberId(offer), color = Color(0xFF34245E), fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }

                Row(horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("BENEFITS", color = Color(0xFF7B5ACB), fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
                        membershipBenefits(offer).forEach { benefit ->
                            Text(
                                text = "✓ $benefit",
                                color = Color(0xFF463370),
                                fontSize = 14.sp,
                                lineHeight = 18.sp
                            )
                        }
                    }
                }
            }

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(1.dp)
                    .background(border)
            )

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 18.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Billed monthly", color = Color(0xFF463370), fontSize = 14.sp, fontWeight = FontWeight.Medium)
                    Text("Cancel anytime", color = WalletMuted, fontSize = 12.sp)
                }
                Text(
                    text = "\$${formatPrice(offer.priceGross)}/month",
                    color = Color(0xFF5A3F9E),
                    fontWeight = FontWeight.Bold,
                    fontSize = 28.sp
                )
                Button(
                    onClick = onBuyClick,
                    modifier = Modifier.height(44.dp),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF7B5ACB), contentColor = Color.White)
                ) {
                    Text("Join now", fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

@Composable
private fun OfferMetricBlock(
    title: String,
    subtitle: String,
    accent: Color,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            text = title,
            color = WalletInk,
            fontWeight = FontWeight.SemiBold,
            fontSize = 14.sp,
            lineHeight = 18.sp,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
        )
        Text(
            text = subtitle,
            color = accent,
            fontWeight = FontWeight.Medium,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun VerticalTicketDivider(color: Color, modifier: Modifier = Modifier) {
    androidx.compose.foundation.Canvas(modifier = modifier.width(1.dp).fillMaxSize()) {
        drawLine(
            color = color,
            start = Offset(size.width / 2f, 0f),
            end = Offset(size.width / 2f, size.height),
            strokeWidth = 1.5f,
            pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 8f))
        )
    }
}

@Composable
private fun BarcodeStub(code: String, accent: Color) {
    val pattern = remember(code) {
        code.mapIndexed { index, char -> (((char.code + index) % 3) + 1).toFloat() }
    }
    androidx.compose.foundation.Canvas(
        modifier = Modifier
            .fillMaxWidth()
            .height(34.dp)
    ) {
        var x = 0f
        pattern.forEachIndexed { index, widthUnit ->
            val lineWidth = widthUnit * 1.6f
            if (index % 2 == 0) {
                drawRect(
                    color = accent,
                    topLeft = Offset(x, 0f),
                    size = Size(lineWidth, size.height)
                )
            }
            x += lineWidth + 1.4f
            if (x >= size.width) return@forEachIndexed
        }
    }
}

private fun offerStudioName(offer: WalletOfferCard): String =
    offer.sessionTypeName?.takeIf { it.isNotBlank() } ?: "Studio access"

private fun offerClassDescription(offer: WalletOfferCard): String =
    offer.description?.takeIf { it.isNotBlank() }
        ?: "A flexible single-class pass to book your next visit with ease."

private fun offerPackTitle(offer: WalletOfferCard): String {
    val uses = offer.usageLimit
    val name = offer.name.trim()
    if (uses != null && uses > 1 && !name.contains(uses.toString())) return "$uses Class Pack"
    return name.ifBlank { if ((uses ?: 0) > 1) "$uses Class Pack" else "Class Pack" }
}

private fun offerPackDescription(offer: WalletOfferCard): String =
    offer.description?.takeIf { it.isNotBlank() }
        ?: "Flexible visits to use on any eligible class. Shareable with friends or family."

private fun offerValidityLabel(days: Int?): String = when {
    days == null || days <= 0 -> "Flexible validity"
    days >= 120 && days % 30 == 0 -> "Valid for ${days / 30} months"
    days >= 60 -> "Valid for ${days / 30} months"
    days == 30 -> "Valid for 30 days"
    else -> "Valid for $days days"
}

private fun offerVisitCountLabel(limit: Int?): String = when {
    limit == null || limit <= 1 -> "1 visit"
    else -> "$limit visits"
}

private fun offerDisplayCode(offer: WalletOfferCard): String {
    val seed = (offer.productId.ifBlank { offer.name }).uppercase().filter { it.isLetterOrDigit() }
    val chunks = seed.chunked(4).take(3)
    return if (chunks.isNotEmpty()) chunks.joinToString("-") else "TKT-0000"
}

private fun offerMemberId(offer: WalletOfferCard): String {
    val seed = offer.productId.ifBlank { offer.name }.uppercase().filter { it.isLetterOrDigit() }
    val suffix = seed.takeLast(6).padStart(6, '0')
    return "MBR-$suffix"
}

private fun membershipBenefits(offer: WalletOfferCard): List<String> {
    val lines = offer.description
        ?.split("\n")
        ?.map { it.trim().trimStart('•', '-', '✓') }
        ?.filter { it.isNotBlank() }
        .orEmpty()
    return if (lines.isNotEmpty()) lines.take(4) else listOf(
        "Unlimited classes",
        "Priority booking",
        "Guest passes each month",
        "10% off retail"
    )
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
    val methods = remember(availableMethods) { normalizeWalletBuyMethods(availableMethods) }
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
private fun OrdersPanel(
    orders: List<WalletOrder>,
    tenantName: String?,
    onViewReceipt: (WalletOrder) -> Unit
) {
    var selectedFilter by remember { mutableStateOf("All") }
    var paymentInstructionsOrder by remember { mutableStateOf<WalletOrder?>(null) }
    val visibleOrders = remember(orders, selectedFilter) {
        if (selectedFilter == "All") {
            orders
        } else {
            orders.filter { orderStatusLabel(resolveOrderStatus(it)) == selectedFilter }
        }
    }

    if (orders.isEmpty()) {
        EmptyState(
            icon = Icons.AutoMirrored.Outlined.ReceiptLong,
            title = "No orders yet",
            subtitle = "Purchases made on the Buy tab will appear here with their invoice status."
        )
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            WalletOrderFilterRow(
                selected = selectedFilter,
                onSelected = { selectedFilter = it },
                modifier = Modifier.fillMaxWidth()
            )
        }
        if (visibleOrders.isEmpty()) {
            item {
                Surface(
                    modifier = Modifier.fillMaxWidth().padding(top = 24.dp),
                    shape = RoundedCornerShape(24.dp),
                    color = Color.White.copy(alpha = 0.78f),
                    border = BorderStroke(1.dp, WalletLine),
                    tonalElevation = 0.dp,
                    shadowElevation = 4.dp
                ) {
                    Column(
                        modifier = Modifier.fillMaxWidth().padding(28.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Outlined.ReceiptLong,
                            contentDescription = null,
                            tint = WalletBlueSoft,
                            modifier = Modifier.size(40.dp)
                        )
                        Text("No $selectedFilter orders", color = Color(0xFF071C4D), fontWeight = FontWeight.Bold, fontSize = 18.sp)
                        Text(
                            "Orders matching this status will appear here.",
                            color = Color(0xFF53617C),
                            textAlign = TextAlign.Center,
                            fontSize = 14.sp
                        )
                    }
                }
            }
        } else {
            items(visibleOrders, key = { order -> order.orderId }) { order ->
                WalletOrderReceiptCard(
                    order = order,
                    tenantName = tenantName,
                    onPaymentInstructions = { paymentInstructionsOrder = order },
                    onViewReceipt = { onViewReceipt(order) }
                )
            }
        }
    }
    paymentInstructionsOrder?.let { selectedOrder ->
        WalletPaymentInstructionsDialog(
            order = selectedOrder,
            tenantName = tenantName,
            onDismiss = { paymentInstructionsOrder = null }
        )
    }
}

@Composable
private fun WalletOrderFilterRow(
    selected: String,
    onSelected: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier.padding(top = 2.dp, bottom = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        listOf("All", "Paid", "Pending", "Refunded").forEach { label ->
            val selectedChip = selected == label
            Surface(
                modifier = Modifier
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null
                    ) { onSelected(label) },
                shape = RoundedCornerShape(999.dp),
                color = if (selectedChip) WalletBlueSoft else Color.White.copy(alpha = 0.94f),
                border = BorderStroke(1.dp, if (selectedChip) WalletBlueSoft.copy(alpha = 0.45f) else WalletLine.copy(alpha = 0.95f)),
                tonalElevation = 0.dp,
                shadowElevation = if (selectedChip) 6.dp else 2.dp
            ) {
                Box(
                    modifier = Modifier
                        .height(34.dp)
                        .padding(horizontal = if (selectedChip) 13.dp else 11.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = label,
                        color = if (selectedChip) Color.White else WalletInk.copy(alpha = 0.88f),
                        fontSize = 13.sp,
                        fontWeight = if (selectedChip) FontWeight.Bold else FontWeight.Medium,
                        maxLines = 1
                    )
                }
            }
        }
    }
}

private data class WalletOrderStatusStyle(
    val label: String,
    val fg: Color,
    val bg: Color,
    val icon: ImageVector,
    val receiptIcon: ImageVector,
    val iconBg: Color,
    val cardBorder: Color
)

private fun walletOrderStatusStyle(status: OrderChipStatus): WalletOrderStatusStyle = when (status) {
    OrderChipStatus.Completed -> WalletOrderStatusStyle(
        label = "Paid",
        fg = Color(0xFF0B9E61),
        bg = Color(0xFFDFF4E9),
        icon = Icons.Rounded.CheckCircle,
        receiptIcon = Icons.AutoMirrored.Outlined.ReceiptLong,
        iconBg = Color(0xFFEAF8F0),
        cardBorder = WalletLine
    )
    OrderChipStatus.Pending -> WalletOrderStatusStyle(
        label = "Pending",
        fg = Color(0xFFB96800),
        bg = Color(0xFFFFF2DE),
        icon = Icons.Rounded.Schedule,
        receiptIcon = Icons.AutoMirrored.Outlined.ReceiptLong,
        iconBg = Color(0xFFFFF1E1),
        cardBorder = Color(0xFFE6892D).copy(alpha = 0.62f)
    )
    OrderChipStatus.Refunded -> WalletOrderStatusStyle(
        label = "Refunded",
        fg = Color(0xFF5D687A),
        bg = Color(0xFFEFF1F4),
        icon = Icons.Rounded.Replay,
        receiptIcon = Icons.Rounded.Replay,
        iconBg = Color(0xFFF0F2F5),
        cardBorder = WalletLine
    )
}

private fun orderStatusLabel(status: OrderChipStatus): String = walletOrderStatusStyle(status).label

@Composable
private fun WalletOrderReceiptCard(
    order: WalletOrder,
    tenantName: String?,
    onPaymentInstructions: () -> Unit,
    onViewReceipt: () -> Unit
) {
    val status = resolveOrderStatus(order)
    val style = walletOrderStatusStyle(status)
    val isPendingTransfer = status == OrderChipStatus.Pending && order.paymentMethodType.equals("BANK_TRANSFER", ignoreCase = true)
    val reference = order.referenceCode?.takeIf { it.isNotBlank() } ?: "ORD-${order.orderId.takeLast(8)}"
    val displayOrderId = order.invoiceOrderId?.takeIf { it.isNotBlank() } ?: reference

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = Color.White,
        border = BorderStroke(1.dp, style.cardBorder),
        tonalElevation = 0.dp,
        shadowElevation = 4.dp
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(74.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(style.iconBg),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = style.receiptIcon,
                        contentDescription = null,
                        tint = style.fg,
                        modifier = Modifier.size(38.dp)
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.Top) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = order.productName?.takeIf { it.isNotBlank() } ?: "Order",
                                color = Color(0xFF071C4D),
                                fontSize = 22.sp,
                                lineHeight = 25.sp,
                                fontWeight = FontWeight.ExtraBold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            Text(
                                text = tenantName?.takeIf { it.isNotBlank() } ?: "Calendra",
                                color = Color(0xFF53617C),
                                fontSize = 15.sp,
                                lineHeight = 20.sp,
                                fontWeight = FontWeight.Medium,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            Text(
                                text = displayOrderId,
                                color = Color(0xFF53617C),
                                fontSize = 15.sp,
                                lineHeight = 22.sp,
                                fontWeight = FontWeight.Medium,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                        WalletOrderStatusPill(style = style)
                    }
                }
            }

            Box(Modifier.fillMaxWidth().height(1.dp).background(WalletLine.copy(alpha = 0.72f)))

            WalletOrderDetailRows(
                total = "${formatPrice(order.totalGross)} ${order.currency}",
                ordered = formatOrderDateShort(order.createdAt).ifBlank { "—" },
                paymentMethod = walletOrderPaymentLabel(order.paymentMethodType),
                orderId = displayOrderId
            )

            if (isPendingTransfer) {
                WalletPendingTransferCallout(onPaymentInstructions = onPaymentInstructions)
            } else {
                WalletViewReceiptRow(onClick = onViewReceipt)
            }
        }
    }
}

@Composable
private fun WalletOrderStatusPill(style: WalletOrderStatusStyle) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = style.bg,
        tonalElevation = 0.dp
    ) {
        Row(
            modifier = Modifier.height(38.dp).padding(horizontal = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Icon(
                imageVector = style.icon,
                contentDescription = null,
                tint = style.fg,
                modifier = Modifier.size(17.dp)
            )
            Text(
                text = style.label,
                color = style.fg,
                fontSize = 14.sp,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 1
            )
        }
    }
}

@Composable
private fun WalletOrderDetailRows(
    total: String,
    ordered: String,
    paymentMethod: String,
    orderId: String
) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        WalletOrderDetailRow(label = "Total", value = total)
        WalletOrderDetailRow(label = "Ordered", value = ordered)
        WalletOrderDetailRow(label = "Payment method", value = paymentMethod)
        WalletOrderDetailRow(label = "Order ID", value = orderId)
    }
}

@Composable
private fun WalletOrderDetailRow(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
        Text(
            text = label,
            color = Color(0xFF53617C),
            fontSize = 15.sp,
            lineHeight = 20.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.weight(1f)
        )
        Text(
            text = value,
            color = Color(0xFF071C4D),
            fontSize = 15.sp,
            lineHeight = 20.sp,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.End,
            modifier = Modifier.weight(1.12f)
        )
    }
}

@Composable
private fun WalletPendingTransferCallout(onPaymentInstructions: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = Color(0xFFFFF2DE).copy(alpha = 0.72f),
        border = BorderStroke(1.dp, Color(0xFFB96800).copy(alpha = 0.20f)),
        tonalElevation = 0.dp
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Icon(
                imageVector = Icons.Rounded.Info,
                contentDescription = null,
                tint = Color(0xFFB96800),
                modifier = Modifier.size(25.dp)
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Awaiting transfer",
                    color = Color(0xFFB96800),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.ExtraBold
                )
            }
            Surface(
                modifier = Modifier.clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = onPaymentInstructions
                ),
                shape = RoundedCornerShape(11.dp),
                color = Color(0xFF0067F5),
                tonalElevation = 0.dp,
                shadowElevation = 0.dp
            ) {
                Text(
                    text = "Payment instructions",
                    color = Color.White,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.ExtraBold,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                    maxLines = 1
                )
            }
        }
    }
}

@Composable
private fun WalletPaymentInstructionsDialog(
    order: WalletOrder,
    tenantName: String?,
    onDismiss: () -> Unit
) {
    val clipboardManager = LocalClipboardManager.current
    val reference = order.invoiceOrderId?.takeIf { it.isNotBlank() }
        ?: order.referenceCode?.takeIf { it.isNotBlank() }
        ?: "ORD-${order.orderId.takeLast(8)}"
    val companyName = order.paymentCompanyName?.takeIf { it.isNotBlank() }
        ?: tenantName?.takeIf { it.isNotBlank() }
        ?: "Company name unavailable"
    val companyAddress = order.paymentCompanyAddress?.takeIf { it.isNotBlank() } ?: "Address unavailable"
    val iban = order.paymentIban?.takeIf { it.isNotBlank() } ?: "IBAN unavailable"

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp),
            shape = RoundedCornerShape(20.dp),
            color = Color.White,
            border = BorderStroke(1.dp, WalletLine),
            tonalElevation = 0.dp,
            shadowElevation = 10.dp
        ) {
            Column(
                modifier = Modifier.padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text = "Payment instructions",
                    color = Color(0xFF071C4D),
                    fontSize = 20.sp,
                    fontWeight = FontWeight.ExtraBold
                )
                Text(
                    text = "Use these details to complete your bank transfer.",
                    color = Color(0xFF53617C),
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                    fontWeight = FontWeight.Medium
                )

                WalletInstructionRow(label = "Company", value = companyName)
                WalletInstructionRow(label = "Address", value = companyAddress)
                WalletInstructionRowWithCopy(
                    label = "IBAN",
                    value = iban,
                    onCopy = { clipboardManager.setText(AnnotatedString(iban)) }
                )
                WalletInstructionRowWithCopy(
                    label = "Reference",
                    value = reference,
                    onCopy = { clipboardManager.setText(AnnotatedString(reference)) }
                )

                TextButton(
                    onClick = onDismiss,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Close", fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

@Composable
private fun WalletInstructionRow(label: String, value: String) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(
            text = label,
            color = Color(0xFF53617C),
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold
        )
        Text(
            text = value,
            color = Color(0xFF071C4D),
            fontSize = 14.sp,
            lineHeight = 20.sp,
            fontWeight = FontWeight.SemiBold
        )
    }
}

@Composable
private fun WalletInstructionRowWithCopy(
    label: String,
    value: String,
    onCopy: () -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(3.dp)
        ) {
            Text(
                text = label,
                color = Color(0xFF53617C),
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold
            )
            Text(
                text = value,
                color = Color(0xFF071C4D),
                fontSize = 14.sp,
                lineHeight = 20.sp,
                fontWeight = FontWeight.SemiBold
            )
        }
        Surface(
            modifier = Modifier.clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onCopy
            ),
            shape = RoundedCornerShape(10.dp),
            color = Color(0xFFEFF5FF),
            border = BorderStroke(1.dp, WalletLine.copy(alpha = 0.9f)),
            tonalElevation = 0.dp
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(5.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Rounded.ContentCopy,
                    contentDescription = null,
                    tint = Color(0xFF0067F5),
                    modifier = Modifier.size(15.dp)
                )
                Text(
                    text = "Copy",
                    color = Color(0xFF0067F5),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

@Composable
private fun WalletViewReceiptRow(onClick: () -> Unit) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        color = Color.White,
        border = BorderStroke(1.dp, WalletLine),
        tonalElevation = 0.dp,
        shadowElevation = 0.dp
    ) {
        Row(
            modifier = Modifier.height(48.dp).padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Rounded.Description,
                contentDescription = null,
                tint = Color(0xFF0067F5),
                modifier = Modifier.size(22.dp)
            )
            Spacer(Modifier.width(9.dp))
            Text(
                text = "View receipt",
                color = Color(0xFF0067F5),
                fontSize = 16.sp,
                fontWeight = FontWeight.ExtraBold,
                modifier = Modifier.weight(1f)
            )
            Icon(
                imageVector = Icons.Rounded.KeyboardArrowRight,
                contentDescription = null,
                tint = Color(0xFF0067F5),
                modifier = Modifier.size(25.dp)
            )
        }
    }
}

private fun walletOrderPaymentLabel(raw: String?): String = when (raw?.uppercase(Locale.getDefault())) {
    "BANK_TRANSFER" -> "Bank transfer"
    "CARD" -> "Card"
    "PAYPAL" -> "PayPal"
    "OTHER" -> "Other"
    "ENTITLEMENT" -> "Entitlement"
    "GIFT_CARD" -> "Gift card"
    else -> raw?.replace('_', ' ')?.lowercase(Locale.getDefault())?.replaceFirstChar { it.titlecase(Locale.getDefault()) } ?: "—"
}

private fun formatOrderDateShort(iso: String?): String {
    if (iso.isNullOrBlank()) return ""
    return runCatching {
        val parsed = OffsetDateTime.parse(iso)
        parsed.format(DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.getDefault()))
    }.getOrElse { iso.take(10) }
}

private fun normalizeOrderProductType(productType: String?): String = when (productType) {
    "PACK", "MEMBERSHIP", "CLASS_TICKET", "GIFT_CARD" -> productType
    else -> "ORDER"
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
        OrderChipStatus.Completed -> Triple("Paid", WalletGreenSoft, WalletGreen)
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
