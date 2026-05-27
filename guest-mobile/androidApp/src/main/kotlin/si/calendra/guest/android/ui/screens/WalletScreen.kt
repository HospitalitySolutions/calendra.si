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
import androidx.compose.foundation.layout.fillMaxHeight
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
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.layout.ContentScale
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
import si.calendra.guest.android.R
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
        Entitlements -> walletTr(languageCode, "Entitlements", "Vstopnice")
        Orders -> walletTr(languageCode, "Orders", "Naročila")
        Buy -> walletTr(languageCode, "Buy", "Nakup")
    }
}

private fun walletIsSl(languageCode: String): Boolean = languageCode.lowercase(Locale.ROOT).startsWith("sl")

private fun walletTr(languageCode: String, en: String, sl: String): String =
    if (walletIsSl(languageCode)) sl else en

private fun walletFilterDisplay(label: String, languageCode: String): String = when (label) {
    "All" -> walletTr(languageCode, "All", "Vse")
    "Tickets" -> walletTr(languageCode, "Tickets", "Vstopnice")
    "Memberships" -> walletTr(languageCode, "Memberships", "Članarine")
    "Paid" -> walletTr(languageCode, "Paid", "Plačano")
    "Pending" -> walletTr(languageCode, "Pending", "V čakanju")
    "Refunded" -> walletTr(languageCode, "Refunded", "Vrnjeno")
    "Cancelled" -> walletTr(languageCode, "Cancelled", "Preklicano")
    else -> label
}

private fun walletProductTypeLabel(type: String, languageCode: String): String = when (type.uppercase(Locale.getDefault())) {
    "PACK" -> walletTr(languageCode, "Pack", "Paket")
    "MEMBERSHIP" -> walletTr(languageCode, "Membership", "Članarina")
    "CLASS_TICKET" -> walletTr(languageCode, "Class ticket", "Vstopnica")
    "GIFT_CARD" -> walletTr(languageCode, "Gift card", "Darilna kartica")
    else -> type.lowercase(Locale.getDefault()).replaceFirstChar { it.uppercase() }
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
    onBookWithEntitlement: (WalletPassCardData) -> Unit = {},
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
        WalletSegmentedControl(
            current = subTab,
            languageCode = languageCode,
            onSelect = { subTab = it },
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 20.dp, end = 20.dp, top = 18.dp, bottom = 8.dp)
        )

        when (subTab) {
            WalletSubTab.Entitlements -> EntitlementsPanel(
                entitlements = entitlements,
                languageCode = languageCode,
                accessCards = accessCards,
                focusedEntitlementId = focusedEntitlementId,
                onFocus = { focusedEntitlementId = it },
                onBrowseOffers = { subTab = WalletSubTab.Buy },
                onQRCodeTap = { card, code ->
                    qrPopup = WalletQRCodePopupModel(
                        title = walletTr(languageCode, "Scan access code", "Skenirajte dostopno kodo"),
                        subtitle = walletTr(languageCode, "Show this at reception", "Pokažite to na recepciji"),
                        code = code,
                        entitlementId = card.id
                    )
                },
                onToggleAutoRenew = onToggleAutoRenew,
                onBookWithEntitlement = onBookWithEntitlement
            )
            WalletSubTab.Buy -> BuyPanel(
                offers = offers,
                languageCode = languageCode,
                availableMethods = tenantPaymentMethods,
                onChangeTenant = onOpenTenantPicker,
                onBuyClick = { pendingOffer = it }
            )
            WalletSubTab.Orders -> OrdersPanel(
                orders = wallet.orders,
                languageCode = languageCode,
                tenantName = tenantName,
                onGoToBuy = { subTab = WalletSubTab.Buy },
                onViewReceipt = onViewReceipt
            )
        }
    }

    pendingOffer?.let { offer ->
        BuyPaymentSheet(
            offer = offer,
            languageCode = languageCode,
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
        WalletQRCodePopupDialog(model = popup, languageCode = languageCode, onDismiss = { qrPopup = null })
    }
}

@Composable
private fun WalletHeader(
    tenantName: String?,
    languageCode: String,
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
                .widthIn(max = 220.dp)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = onOpenTenantPicker
                ),
            shape = RoundedCornerShape(22.dp),
            color = Color.White,
            shadowElevation = 6.dp,
            tonalElevation = 0.dp
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Surface(
                    modifier = Modifier.size(34.dp),
                    shape = CircleShape,
                    color = WalletBlueSoft,
                    tonalElevation = 0.dp,
                    shadowElevation = 0.dp
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = Icons.Rounded.Business,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }
                Text(
                    text = tenantName?.takeIf { it.isNotBlank() } ?: "Calendra",
                    color = WalletInk,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false)
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
                contentDescription = walletTr(languageCode, "Notifications", "Obvestila"),
                tint = WalletInk,
                modifier = Modifier.size(18.dp)
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
        modifier = modifier
            .fillMaxWidth()
            .height(50.dp),
        shape = RoundedCornerShape(18.dp),
        color = Color.White,
        tonalElevation = 0.dp,
        shadowElevation = 4.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 2.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            WalletSubTab.values().forEach { tab ->
                val selected = tab == current
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null
                        ) { onSelect(tab) },
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = tab.localizedTitle(languageCode),
                        color = if (selected) WalletBlueSoft else WalletMuted,
                        fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                        fontSize = 12.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = 5.dp, bottom = 5.dp)
                    )
                    Box(
                        modifier = Modifier
                            .width(72.dp)
                            .height(3.dp)
                            .clip(RoundedCornerShape(topStart = 4.dp, topEnd = 4.dp))
                            .background(if (selected) WalletBlueSoft else Color.Transparent)
                    )
                }
            }
        }
    }
}

@Composable
private fun WalletEntitlementFilterRow(
    activeCount: Int,
    languageCode: String,
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
                        text = walletFilterDisplay(label, languageCode),
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
                modifier = Modifier.height(32.dp).padding(horizontal = 9.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(7.dp)
            ) {
                Box(
                    Modifier
                        .size(6.dp)
                        .clip(CircleShape)
                        .background(if (showInactive) Color(0xFFE53935) else WalletGreen)
                )
                Text(
                    text = if (showInactive) walletTr(languageCode, "$inactiveCount Inactive", "$inactiveCount neaktivnih") else walletTr(languageCode, "$activeCount Active", "$activeCount aktivnih"),
                    color = WalletInk,
                    fontSize = 10.sp,
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
private fun WalletCommerceFilterRow(labels: List<String>, selectedIndex: Int = 0, languageCode: String = "en", modifier: Modifier = Modifier) {
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
                        text = walletFilterDisplay(label, languageCode),
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

data class WalletPassCardData(
    val id: String,
    val title: String,
    val type: String,
    val tenantName: String?,
    val sessionTypeId: String?,
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
    languageCode: String,
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
                text = walletTr(languageCode, "Tap anywhere outside to close", "Tapnite zunaj za zapiranje"),
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
    languageCode: String,
    accessCards: List<AccessCard>,
    focusedEntitlementId: String?,
    onFocus: (String?) -> Unit,
    onBrowseOffers: () -> Unit,
    onQRCodeTap: (WalletPassCardData, String) -> Unit,
    onToggleAutoRenew: (String, Boolean) -> Unit,
    onBookWithEntitlement: (WalletPassCardData) -> Unit
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
        WalletShowcaseEmptyState(
            art = WalletEmptyArt.Entitlements,
            title = walletTr(languageCode, "No entitlements yet", "Vstopnic še ni"),
            subtitle = walletTr(languageCode, "Purchases from the Buy tab will appear here as tickets, packs and memberships.", "Nakupi iz zavihka Nakup bodo tukaj prikazani kot vstopnice, paketi in članarine."),
            primaryButtonText = walletTr(languageCode, "Browse offers", "Oglejte si ponudbe"),
            footerText = walletTr(languageCode, "Looking for something? Explore offers and find what’s right for you.", "Iščete nekaj zase? Oglejte si ponudbe in izberite pravo."),
            footerIcon = Icons.Rounded.ConfirmationNumber,
            onPrimaryClick = onBrowseOffers
        )
        return
    }

    Column(modifier = Modifier.fillMaxSize()) {
        WalletEntitlementFilterRow(
            activeCount = activeCards.size,
            languageCode = languageCode,
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
                title = walletTr(languageCode, "No ${selectedFilter.lowercase(Locale.getDefault())} yet", "Ni zadetkov za ${walletFilterDisplay(selectedFilter, languageCode).lowercase(Locale.getDefault())}"),
                subtitle = walletTr(languageCode, "Switch filters or purchase a new pass from the Buy tab.", "Spremenite filter ali kupite novo vstopnico v zavihku Nakup.")
            )
        } else {
            if (showAllCards) {
                WalletEntitlementFullList(
                    cards = filteredCards,
                    languageCode = languageCode,
                    onQRCodeTap = onQRCodeTap,
                    onToggleAutoRenew = onToggleAutoRenew,
                    onBookWithEntitlement = onBookWithEntitlement,
                    onShowLess = { showAllCards = false },
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(start = 20.dp, top = 2.dp, end = 20.dp, bottom = 8.dp)
                )
            } else {
                WalletPullOutEntitlementDeck(
                    cards = previewCards,
                    languageCode = languageCode,
                    focusedEntitlementId = focusedEntitlementId,
                    onFocus = onFocus,
                    onQRCodeTap = onQRCodeTap,
                    onToggleAutoRenew = onToggleAutoRenew,
                    onBookWithEntitlement = onBookWithEntitlement,
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
    languageCode: String,
    onQRCodeTap: (WalletPassCardData, String) -> Unit,
    onToggleAutoRenew: (String, Boolean) -> Unit,
    onBookWithEntitlement: (WalletPassCardData) -> Unit,
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
                        text = walletTr(languageCode, "Show less", "Prikaži manj"),
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
                languageCode = languageCode,
                index = index,
                onTap = {},
                onQRCodeTap = { code -> onQRCodeTap(card, code) },
                onToggleAutoRenew = onToggleAutoRenew,
                onBookWithEntitlement = { onBookWithEntitlement(card) },
                modifier = Modifier.fillMaxWidth()
            )
        }
    }
}

@Composable
private fun WalletPullOutEntitlementDeck(
    cards: List<WalletPassCardData>,
    languageCode: String,
    focusedEntitlementId: String?,
    onFocus: (String?) -> Unit,
    onQRCodeTap: (WalletPassCardData, String) -> Unit,
    onToggleAutoRenew: (String, Boolean) -> Unit,
    onBookWithEntitlement: (WalletPassCardData) -> Unit,
    showAllEnabled: Boolean,
    onShowAll: () -> Unit,
    modifier: Modifier = Modifier
) {
    val walletCards = remember(cards) { cards.take(4) }
    if (walletCards.isEmpty()) return

    var activeIndex by remember(walletCards) { mutableStateOf(0) }
    var isPulledForward by remember(walletCards) { mutableStateOf(true) }

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
                                isPulledForward = true
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
        val compactLayout = maxHeight < 560.dp
        val fullCardHeight = if (compactLayout) 260.dp else 316.dp
        val pocketHeight = if (compactLayout) 270.dp else 328.dp
        val pocketTopWhenStored = maxHeight - if (compactLayout) 178.dp else 214.dp
        // In the pulled-out state the leather pocket should slide almost completely
        // down, leaving only a small top slice visible. The remaining passes stay
        // stacked just above that visible pocket edge, so the selected pass can own
        // the screen while the wallet still reads as the storage area.
        val pocketVisibleSliceWhenPulled = if (compactLayout) 26.dp else 34.dp
        val pocketTopWhenPulled = maxHeight - pocketVisibleSliceWhenPulled
        val pocketTop = if (isPulledForward) pocketTopWhenPulled else pocketTopWhenStored
        val pocketOffsetDown = pocketTop
        val storedCardStep = if (isPulledForward) {
            if (compactLayout) 42.dp else 48.dp
        } else {
            if (compactLayout) 52.dp else 60.dp
        }
        val storedCards = (if (isPulledForward) stackCards.drop(1) else stackCards).take(3)

        if (isPulledForward) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .offset(y = (pocketTop - (storedCardStep * storedCards.size.coerceAtLeast(1)) - 36.dp).coerceAtLeast(fullCardHeight + 18.dp))
                    .zIndex(110f)
            ) {
                Text("⌃", color = WalletInk.copy(alpha = 0.62f), fontSize = 30.sp, fontWeight = FontWeight.Bold, lineHeight = 30.sp)
            }
        }

        stackCards.asReversed().forEach { card ->
            key(card.id) {
                val stackPosition = stackCards.indexOf(card)
                val originalIndex = cards.indexOfFirst { it.id == card.id }.coerceAtLeast(0)
                val isActive = stackPosition == 0
                val cardHeight = if (isActive && isPulledForward) fullCardHeight else if (compactLayout) 148.dp else 172.dp
                val cardTop = if (isPulledForward) {
                    if (isActive) {
                        0.dp
                    } else {
                        val visibleIndex = (stackPosition - 1).coerceAtLeast(0)
                        val visibleCount = storedCards.size.coerceAtLeast(1)
                        pocketTop - (storedCardStep * (visibleCount - visibleIndex)) - 8.dp
                    }
                } else {
                    val visibleCount = stackCards.size.coerceAtLeast(1)
                    pocketTop - (storedCardStep * (visibleCount - stackPosition)) - 8.dp
                }
                val yOffset by animateDpAsState(
                    targetValue = cardTop,
                    animationSpec = spring(dampingRatio = 0.84f, stiffness = 260f),
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
                        .height(cardHeight)
                        .graphicsLayer {
                            shadowElevation = if (isActive && isPulledForward) 30f else 14f
                            scaleX = 1f
                            scaleY = 1f
                        }
                        .zIndex(if (isActive && isPulledForward) 120f else 40f + stackPosition.toFloat())
                        .clip(RoundedCornerShape(26.dp))
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            onClick = cardClick
                        )
                ) {
                    WalletStackedPassCard(
                        card = card,
                        languageCode = languageCode,
                        index = originalIndex,
                        onTap = cardClick,
                        onQRCodeTap = { code -> onQRCodeTap(card, code) },
                        onToggleAutoRenew = onToggleAutoRenew,
                        onBookWithEntitlement = { onBookWithEntitlement(card) },
                        modifier = Modifier.fillMaxSize()
                    )
                }
            }
        }

        WalletLeatherPocket(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .fillMaxWidth()
                .height(pocketHeight)
                .offset(y = pocketOffsetDown)
                .zIndex(70f)
        )

        if (showAllEnabled && !isPulledForward) {
            Surface(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .offset(y = pocketTop + 14.dp)
                    .zIndex(95f)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClick = onShowAll
                    ),
                shape = RoundedCornerShape(999.dp),
                color = Color.White.copy(alpha = 0.96f),
                border = BorderStroke(1.dp, WalletLine.copy(alpha = 0.95f)),
                tonalElevation = 0.dp,
                shadowElevation = 6.dp
            ) {
                Text(
                    text = walletTr(languageCode, "Show all entitlements", "Prikaži vse vstopnice"),
                    color = WalletBlueSoft,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp)
                )
            }
        }
    }
}

@Composable
private fun EntitlementSwipeHint(languageCode: String = "en", modifier: Modifier = Modifier) {
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
            Text("⌃", color = WalletInk.copy(alpha = 0.78f), fontSize = 16.sp, fontWeight = FontWeight.Bold, lineHeight = 18.sp)
            Text(
                text = walletTr(languageCode, "Swipe up to pull pass forward", "Povlecite navzgor za prikaz vstopnice"),
                color = WalletInk.copy(alpha = 0.72f),
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1
            )
        }
    }
}

@Composable
private fun PulledForwardBadge(languageCode: String = "en", modifier: Modifier = Modifier) {
    EntitlementSwipeHint(languageCode = languageCode, modifier = modifier)
}

@Composable
private fun WalletLeatherPocket(modifier: Modifier = Modifier) {
    val outerShape = RoundedCornerShape(topStart = 36.dp, topEnd = 36.dp, bottomStart = 32.dp, bottomEnd = 32.dp)
    Box(
        modifier = modifier
            .shadow(28.dp, outerShape, clip = false)
            .clip(outerShape)
            .background(
                Brush.verticalGradient(
                    colors = listOf(Color(0xFF0F4C99), Color(0xFF0A3474), Color(0xFF082552))
                )
            )
            .border(BorderStroke(1.3.dp, Color(0xFF2D73C9).copy(alpha = 0.88f)), outerShape)
    ) {
        WalletLeatherTexture(modifier = Modifier.fillMaxSize())
        androidx.compose.foundation.Canvas(modifier = Modifier.fillMaxSize()) {
            val rimHeight = 54.dp.toPx()
            val stitchInset = 18.dp.toPx()
            val stitchTop = 28.dp.toPx()
            val orange = Color(0xFFFF8B19)
            drawLine(
                color = Color.White.copy(alpha = 0.18f),
                start = Offset(18.dp.toPx(), rimHeight * 0.34f),
                end = Offset(size.width - 18.dp.toPx(), rimHeight * 0.34f),
                strokeWidth = 1.2.dp.toPx()
            )
            drawLine(
                color = orange.copy(alpha = 0.82f),
                start = Offset(stitchInset, stitchTop),
                end = Offset(size.width - stitchInset, stitchTop),
                strokeWidth = 1.2.dp.toPx(),
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 8f))
            )
            val wave = Path().apply {
                moveTo(0f, rimHeight * 0.55f)
                cubicTo(size.width * 0.22f, rimHeight * 0.95f, size.width * 0.45f, rimHeight * 0.02f, size.width * 0.62f, rimHeight * 0.46f)
                cubicTo(size.width * 0.78f, rimHeight * 0.86f, size.width * 0.90f, rimHeight * 0.30f, size.width, rimHeight * 0.48f)
                lineTo(size.width, 0f)
                lineTo(0f, 0f)
                close()
            }
            drawPath(wave, color = Color.White.copy(alpha = 0.09f))
            drawRoundRect(
                color = Color.Black.copy(alpha = 0.10f),
                topLeft = Offset(0f, rimHeight * 0.82f),
                size = Size(size.width, 6.dp.toPx()),
                cornerRadius = CornerRadius(8.dp.toPx(), 8.dp.toPx())
            )
        }

        Box(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .offset(y = 18.dp)
                .width(54.dp)
                .height(4.dp)
                .clip(RoundedCornerShape(999.dp))
                .background(Color.White.copy(alpha = 0.20f))
        )

        Surface(
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .offset(x = 10.dp, y = 12.dp)
                .size(width = 92.dp, height = 74.dp),
            shape = RoundedCornerShape(topStart = 42.dp, bottomStart = 42.dp, topEnd = 18.dp, bottomEnd = 18.dp),
            color = Color(0xFF0B3C83),
            border = BorderStroke(1.dp, Color(0xFF2B70C8).copy(alpha = 0.65f)),
            tonalElevation = 0.dp,
            shadowElevation = 12.dp
        ) {
            Box(contentAlignment = Alignment.CenterStart) {
                Surface(
                    modifier = Modifier.padding(start = 16.dp).size(42.dp),
                    shape = CircleShape,
                    color = WalletAmber,
                    shadowElevation = 8.dp,
                    tonalElevation = 0.dp
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text("C", color = Color(0xFF0B3C83), fontSize = 24.sp, fontWeight = FontWeight.ExtraBold)
                    }
                }
            }
        }

        Text(
            text = "calendra",
            color = Color.White.copy(alpha = 0.09f),
            fontSize = 24.sp,
            fontWeight = FontWeight.ExtraBold,
            modifier = Modifier.align(Alignment.Center).padding(top = 86.dp)
        )
    }
}

@Composable
private fun WalletLeatherTexture(modifier: Modifier = Modifier) {
    androidx.compose.foundation.Canvas(modifier = modifier) {
        for (i in 0..20) {
            val y = size.height * (0.12f + i * 0.041f)
            drawLine(
                color = Color.White.copy(alpha = 0.025f),
                start = Offset(size.width * 0.06f, y),
                end = Offset(size.width * 0.94f, y + ((i % 3) - 1) * 2f),
                strokeWidth = 1.dp.toPx()
            )
        }
        repeat(5) { i ->
            val path = Path().apply {
                val y = size.height * (0.35f + i * 0.08f)
                moveTo(size.width * 0.03f, y)
                cubicTo(size.width * 0.25f, y - 22f, size.width * 0.52f, y + 16f, size.width * 0.97f, y - 8f)
            }
            drawPath(path, color = Color.White.copy(alpha = 0.035f), style = Stroke(width = 1.1.dp.toPx()))
        }
    }
}


private fun AccessCard.toWalletPassCardData(): WalletPassCardData = WalletPassCardData(
    id = id,
    title = name,
    type = type,
    tenantName = tenantName,
    sessionTypeId = null,
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
    sessionTypeId = sessionTypeId,
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
    languageCode: String,
    index: Int,
    onTap: () -> Unit,
    onQRCodeTap: (String) -> Unit,
    onToggleAutoRenew: (String, Boolean) -> Unit,
    onBookWithEntitlement: () -> Unit,
    modifier: Modifier = Modifier
) {
    val type = card.type.uppercase(Locale.getDefault())
    val style = walletTicketStyle(card.type, index)
    val isLightCard = type == "CLASS_TICKET" || type == "GIFT_CARD"
    val shape = RoundedCornerShape(26.dp)
    val code = card.entitlementCode?.takeIf { it.isNotBlank() }
        ?: card.displayCode?.takeIf { it.isNotBlank() }
        ?: card.id
    val headerStatus = entitlementHeaderStatus(card)
    val statusAccent = if (headerStatus == "Inactive") Color(0xFF7C8798) else WalletGreen
    val primary = primaryMetric(card, languageCode)
    val secondary = secondaryMetric(card, languageCode)
    val textColor = if (isLightCard) WalletInk else Color.White
    val mutedColor = if (isLightCard) WalletMuted else Color.White.copy(alpha = 0.78f)
    val lineColor = if (isLightCard) WalletLine.copy(alpha = 0.85f) else Color.White.copy(alpha = 0.22f)
    val bookableWithEntitlement = (type == "PACK" || type == "CLASS_TICKET") && !isInactiveWalletCard(card)

    Box(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 154.dp)
            .shadow(16.dp, shape, clip = false)
            .clip(shape)
            .background(
                Brush.linearGradient(
                    colors = walletPassGradient(card.type, index),
                    start = Offset(0f, 0f),
                    end = Offset(1000f, 750f)
                )
            )
            .border(BorderStroke(1.25.dp, style.border.copy(alpha = 0.95f)), shape)
            .clickable { onTap() }
    ) {
        WalletPassWave(
            accent = if (isLightCard) style.accent else Color.White,
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = 10.dp, bottom = 8.dp)
                .size(width = 230.dp, height = 116.dp)
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 18.dp, vertical = 16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                if (bookableWithEntitlement) {
                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.Top,
                            horizontalArrangement = Arrangement.spacedBy(14.dp)
                        ) {
                            WalletPassIconBadge(
                                type = card.type,
                                accent = style.accent
                            )
                            Column(
                                modifier = Modifier.weight(1f),
                                verticalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Text(
                                    text = "VSTOPNICE",
                                    color = if (isLightCard) style.accent else Color.White.copy(alpha = 0.82f),
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    maxLines = 1
                                )
                                Text(
                                    text = entitlementHeaderCardName(card.title),
                                    color = textColor,
                                    fontSize = 25.sp,
                                    lineHeight = 30.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }

                        Button(
                            onClick = onBookWithEntitlement,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(42.dp),
                            shape = RoundedCornerShape(999.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF082552), contentColor = Color.White),
                            contentPadding = PaddingValues(horizontal = 14.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Schedule,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                text = walletTr(languageCode, "Choose slot", "Izberi termin"),
                                fontSize = 15.sp,
                                fontWeight = FontWeight.ExtraBold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            Spacer(Modifier.weight(1f))
                            Icon(
                                imageVector = Icons.Rounded.KeyboardArrowRight,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                    }

                    Column(
                        horizontalAlignment = Alignment.End,
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        WalletStatusChip(status = walletStatusDisplay(headerStatus, languageCode), accent = statusAccent)
                        Box(
                            modifier = Modifier
                                .width(72.dp)
                                .clickable(
                                    interactionSource = remember { MutableInteractionSource() },
                                    indication = null,
                                    onClick = { onQRCodeTap(code) }
                                ),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                WalletQRCode(content = code, modifier = Modifier.size(44.dp))
                                Spacer(Modifier.height(6.dp))
                                Text(walletTr(languageCode, "Show QR", "Prikaži QR"), color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                } else {
                    WalletPassIconBadge(
                        type = card.type,
                        accent = style.accent
                    )
                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Text(
                            text = entitlementHeaderTypeTag(card.type, languageCode),
                            color = if (isLightCard) style.accent else Color.White.copy(alpha = 0.82f),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1
                        )
                        Text(
                            text = entitlementHeaderCardName(card.title),
                            color = textColor,
                            fontSize = 25.sp,
                            lineHeight = 30.sp,
                            fontWeight = FontWeight.ExtraBold,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis
                        )
                        Text(
                            text = card.tenantName?.takeIf { it.isNotBlank() } ?: "Oceanview Club",
                            color = mutedColor,
                            fontSize = 17.sp,
                            lineHeight = 21.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                    Column(
                        horizontalAlignment = Alignment.End,
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        WalletStatusChip(status = walletStatusDisplay(headerStatus, languageCode), accent = statusAccent)
                        Box(
                            modifier = Modifier
                                .width(72.dp)
                                .clickable(
                                    interactionSource = remember { MutableInteractionSource() },
                                    indication = null,
                                    onClick = { onQRCodeTap(code) }
                                ),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                WalletQRCode(content = code, modifier = Modifier.size(44.dp))
                                Spacer(Modifier.height(6.dp))
                                Text(walletTr(languageCode, "Show QR", "Prikaži QR"), color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(16.dp))
            Box(Modifier.fillMaxWidth().height(1.dp).background(lineColor))
            Spacer(Modifier.height(14.dp))

            if (bookableWithEntitlement) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.Top
                ) {
                    WalletMetricColumn(
                        label = walletTr(languageCode, "EXPIRES", "POTEČE"),
                        value = secondary.second,
                        textColor = textColor,
                        mutedColor = mutedColor,
                        modifier = Modifier.weight(1f)
                    )
                    Box(Modifier.height(40.dp).width(1.dp).background(lineColor))
                    WalletMetricColumn(
                        label = walletTr(languageCode, "ACCESS", "DOSTOP"),
                        value = primary.second,
                        textColor = textColor,
                        mutedColor = mutedColor,
                        modifier = Modifier.weight(1f).padding(start = 16.dp)
                    )
                    Box(Modifier.height(40.dp).width(1.dp).background(lineColor))
                    WalletMetricColumn(
                        label = walletTr(languageCode, "REMAINING", "PREOSTALO"),
                        value = card.remainingUses?.let { walletTr(languageCode, "$it left", "$it preostalo") } ?: statusLabelForCard(card, languageCode),
                        textColor = textColor,
                        mutedColor = mutedColor,
                        modifier = Modifier.weight(1f).padding(start = 16.dp)
                    )
                }
            } else {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    WalletMetricColumn(
                        label = secondary.first.uppercase(Locale.getDefault()),
                        value = secondary.second,
                        textColor = textColor,
                        mutedColor = mutedColor,
                        modifier = Modifier.weight(1f)
                    )
                    Box(Modifier.height(40.dp).width(1.dp).background(lineColor))
                    WalletMetricColumn(
                        label = primary.first.uppercase(Locale.getDefault()),
                        value = primary.second,
                        textColor = textColor,
                        mutedColor = mutedColor,
                        modifier = Modifier.weight(1f).padding(start = 16.dp)
                    )
                    Box(Modifier.height(40.dp).width(1.dp).background(lineColor))
                    Column(
                        modifier = Modifier.weight(1f).padding(start = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        if (type == "MEMBERSHIP") {
                            Text(walletTr(languageCode, "AUTO-RENEW", "SAMODEJNO PODALJŠANJE"), color = mutedColor, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                            Switch(
                                checked = card.autoRenews,
                                onCheckedChange = { onToggleAutoRenew(card.id, it) },
                                modifier = Modifier.height(28.dp)
                            )
                        } else {
                            Text(card.remainingUses?.let { walletTr(languageCode, "$it left", "$it preostalo") } ?: statusLabelForCard(card, languageCode), color = textColor, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }

                Spacer(Modifier.weight(1f))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(42.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(if (isLightCard) style.accent.copy(alpha = 0.12f) else Color.White.copy(alpha = 0.12f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("▦", color = if (isLightCard) style.accent else Color.White, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text(walletTr(languageCode, "YOUR ACCESS CODE", "VAŠA DOSTOPNA KODA"), color = mutedColor, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                        Text(code, color = textColor, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Text(walletTr(languageCode, "Tap at check-in", "Tapnite ob prijavi"), color = mutedColor, fontSize = 16.sp, fontWeight = FontWeight.Medium)
                }
            }
        }
    }
}

@Composable
private fun WalletMetricColumn(
    label: String,
    value: String,
    textColor: Color,
    mutedColor: Color,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, color = mutedColor, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
        Text(value, color = textColor, fontSize = 12.sp, lineHeight = 15.sp, fontWeight = FontWeight.ExtraBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

private fun walletPassGradient(type: String, index: Int): List<Color> = when (type.uppercase(Locale.getDefault())) {
    "MEMBERSHIP" -> listOf(Color(0xFF0F7BFF), Color(0xFF0056D6), Color(0xFF003DA8))
    "PACK" -> listOf(Color(0xFFFFB11E), Color(0xFFFF8A00), Color(0xFFFF6D00))
    "CLASS_TICKET" -> listOf(Color(0xFFF5FAFF), Color(0xFFEAF4FF), Color(0xFFFFFFFF))
    "GIFT_CARD" -> listOf(Color(0xFFFFF8EF), Color(0xFFFFF1DD), Color(0xFFFFFFFF))
    else -> if (index % 2 == 0) listOf(Color(0xFFF5FAFF), Color(0xFFEAF4FF), Color.White) else listOf(Color(0xFF0F7BFF), Color(0xFF0056D6), Color(0xFF003DA8))
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
                Spacer(Modifier.width(12.dp))
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

            CompactDashedSeparator(color = style.accent.copy(alpha = 0.62f), modifier = Modifier.padding(horizontal = 13.dp))

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
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
                Spacer(Modifier.width(12.dp))
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
        Icon(imageVector = icon, contentDescription = null, tint = accent, modifier = Modifier.size(22.dp))
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

private fun walletTicketStyle(type: String, index: Int): WalletTicketStyle = when (type.uppercase(Locale.getDefault())) {
    "MEMBERSHIP" -> WalletTicketStyle(
        background = Color(0xFF0F7BFF),
        accent = Color(0xFF0F6BE8),
        border = Color(0xFF2C8BFF),
        softAccent = Color(0xFF003DA8)
    )
    "PACK" -> WalletTicketStyle(
        background = Color(0xFFFF9800),
        accent = Color(0xFFFF8A00),
        border = Color(0xFFFFB33E),
        softAccent = Color(0xFFFF6D00)
    )
    "CLASS_TICKET" -> WalletTicketStyle(
        background = Color(0xFFEFF7FF),
        accent = WalletBlueSoft,
        border = WalletBlueSoft.copy(alpha = 0.72f),
        softAccent = Color(0xFFFFFFFF)
    )
    "GIFT_CARD" -> WalletTicketStyle(
        background = Color(0xFFFFF7ED),
        accent = WalletAmber,
        border = WalletAmber.copy(alpha = 0.74f),
        softAccent = Color(0xFFFFFFFF)
    )
    else -> {
        val isBlue = index % 2 == 0
        WalletTicketStyle(
            background = if (isBlue) Color(0xFFEFF7FF) else Color(0xFFFF9800),
            accent = if (isBlue) WalletBlueSoft else WalletAmber,
            border = (if (isBlue) WalletBlueSoft else WalletAmber).copy(alpha = 0.66f),
            softAccent = if (isBlue) Color.White else Color(0xFFFF6D00)
        )
    }
}

private fun primaryMetric(card: WalletPassCardData, languageCode: String = "en"): Pair<String, String> = when (card.type) {
    "MEMBERSHIP" -> walletTr(languageCode, "Access", "Dostop") to walletTr(languageCode, "Unlimited", "Neomejeno")
    "PACK" -> walletTr(languageCode, "Access", "Dostop") to usesSummary(card, languageCode)
    "CLASS_TICKET" -> walletTr(languageCode, "Access", "Dostop") to walletTr(languageCode, "1 class", "1 obisk")
    "GIFT_CARD" -> walletTr(languageCode, "Balance", "Dobroimetje") to "${formatPrice(card.remainingValueGross ?: 0.0)} ${card.currency ?: ""}".trim()
    else -> productTypeLabel(card.type) to usesSummary(card)
}

private fun secondaryMetric(card: WalletPassCardData, languageCode: String = "en"): Pair<String, String> = when (card.type) {
    "MEMBERSHIP" -> walletTr(languageCode, "Valid until", "Velja do") to (formatLongDate(card.validUntil).takeIf { it != "—" } ?: walletTr(languageCode, "No expiry", "Brez poteka"))
    "PACK" -> walletTr(languageCode, "Expires", "Poteče") to (formatLongDate(card.validUntil).takeIf { it != "—" } ?: walletTr(languageCode, "No expiry", "Brez poteka"))
    "CLASS_TICKET" -> walletTr(languageCode, "Date", "Datum") to (formatLongDate(card.validUntil).takeIf { it != "—" } ?: walletTr(languageCode, "No expiry", "Brez poteka"))
    "GIFT_CARD" -> walletTr(languageCode, "Valid until", "Velja do") to (formatLongDate(card.validUntil).takeIf { it != "—" } ?: walletTr(languageCode, "No expiry", "Brez poteka"))
    else -> walletTr(languageCode, "Valid until", "Velja do") to (formatLongDate(card.validUntil).takeIf { it != "—" } ?: walletTr(languageCode, "No expiry", "Brez poteka"))
}

private fun usesSummary(card: WalletPassCardData, languageCode: String = "en"): String = when {
    card.remainingUses != null -> walletTr(languageCode, "${card.remainingUses} classes", "${card.remainingUses} obiskov")
    card.totalUses != null -> walletTr(languageCode, "${card.totalUses} classes", "${card.totalUses} obiskov")
    card.type == "MEMBERSHIP" -> walletTr(languageCode, "Unlimited", "Neomejeno")
    else -> walletTr(languageCode, "1 class", "1 obisk")
}

private fun entitlementHeaderTypeTag(type: String, languageCode: String = "en"): String = when (type.uppercase(Locale.getDefault())) {
    "MEMBERSHIP" -> walletTr(languageCode, "MEMBERSHIP", "ČLANARINA")
    "PACK" -> walletTr(languageCode, "PACK", "PAKET")
    "CLASS_TICKET" -> walletTr(languageCode, "CLASS", "VSTOPNICA")
    "GIFT_CARD" -> walletTr(languageCode, "GIFT", "DARILO")
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

private fun statusLabelForCard(card: WalletPassCardData, languageCode: String = "en"): String {
    when (card.status.uppercase(Locale.getDefault()).ifBlank { "ACTIVE" }) {
        "EXPIRED" -> return walletTr(languageCode, "Expired", "Poteklo")
        "USED_UP" -> return walletTr(languageCode, "Used up", "Porabljeno")
        "CANCELLED" -> return walletTr(languageCode, "Cancelled", "Preklicano")
        "PENDING" -> return walletTr(languageCode, "Pending", "V čakanju")
    }
    return when (card.type) {
        "PACK" -> card.remainingUses?.let { walletTr(languageCode, "$it left", "$it preostalo") } ?: walletTr(languageCode, "Active", "Aktivno")
        "CLASS_TICKET" -> walletTr(languageCode, "Ready", "Pripravljeno")
        else -> walletTr(languageCode, "Active", "Aktivno")
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
    // If tenant config exposes no wallet-compatible methods, default to bank transfer only.
    return if (ordered.isNotEmpty()) ordered else listOf("BANK_TRANSFER")
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

private fun productTypeLabel(type: String): String = walletProductTypeLabel(type, "en")

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
    languageCode: String,
    availableMethods: List<String>,
    onChangeTenant: () -> Unit,
    onBuyClick: (WalletOfferCard) -> Unit
) {
    if (offers.isEmpty()) {
        WalletShowcaseEmptyState(
            art = WalletEmptyArt.Buy,
            title = walletTr(languageCode, "No offers available", "Ponudbe niso na voljo"),
            subtitle = walletTr(languageCode, "This tenant does not have any memberships, cards or gift cards available to buy right now.", "Ta ponudnik trenutno nima članarin, kart ali darilnih kartic za nakup."),
            primaryButtonText = walletTr(languageCode, "Change tenant", "Zamenjaj ponudnika"),
            footerText = "",
            footerIcon = Icons.Rounded.Business,
            onPrimaryClick = onChangeTenant
        )
        return
    }

    val availableCategories = remember(offers) { buyMarketplaceCategoriesForOffers(offers) }
    var selectedCategory by remember(offers) { mutableStateOf(BuyMarketplaceCategory.All) }
    val safeSelectedCategory = selectedCategory.takeIf { it in availableCategories } ?: BuyMarketplaceCategory.All
    val visibleOffers = remember(offers, safeSelectedCategory) {
        offers
            .asSequence()
            .filter { offerMatchesMarketplaceCategory(it, safeSelectedCategory) }
            .sortedWith(compareBy<WalletOfferCard> { buyMarketplaceSortRank(it) }.thenBy { it.name.lowercase(Locale.getDefault()) })
            .toList()
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 6.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        item {
            BuyMarketplaceCategoryRow(
                categories = availableCategories,
                languageCode = languageCode,
                selected = safeSelectedCategory,
                offers = offers,
                onSelect = { selectedCategory = it },
                modifier = Modifier.fillMaxWidth()
            )
        }
        itemsIndexed(visibleOffers, key = { _, offer -> offer.productId }) { index, offer ->
            BuyMarketplaceOfferCard(
                offer = offer,
                languageCode = languageCode,
                index = index,
                onBuyClick = { onBuyClick(offer) },
                modifier = Modifier.fillMaxWidth()
            )
        }
        item { Spacer(Modifier.height(16.dp)) }
    }
}

private enum class BuyMarketplaceCategory(val title: String) {
    All("All"),
    Memberships("Memberships"),
    Cards("Cards"),
    GiftCards("Gift Cards");

    fun localizedTitle(languageCode: String): String = when (this) {
        All -> walletTr(languageCode, "All", "Vse")
        Memberships -> walletTr(languageCode, "Memberships", "Članarine")
        Cards -> walletTr(languageCode, "Cards", "Karte")
        GiftCards -> walletTr(languageCode, "Gift Cards", "Darilne kartice")
    }
}

private fun buyMarketplaceCategoriesForOffers(offers: List<WalletOfferCard>): List<BuyMarketplaceCategory> = buildList {
    add(BuyMarketplaceCategory.All)
    if (offers.any { offerMatchesMarketplaceCategory(it, BuyMarketplaceCategory.Memberships) }) add(BuyMarketplaceCategory.Memberships)
    if (offers.any { offerMatchesMarketplaceCategory(it, BuyMarketplaceCategory.Cards) }) add(BuyMarketplaceCategory.Cards)
    if (offers.any { offerMatchesMarketplaceCategory(it, BuyMarketplaceCategory.GiftCards) }) add(BuyMarketplaceCategory.GiftCards)
}

private fun buyMarketplaceSortRank(offer: WalletOfferCard): Int {
    val type = offer.productType.uppercase(Locale.getDefault())
    return when {
        type == "MEMBERSHIP" -> 0
        !isGiftOffer(offer) -> 1
        else -> 2
    }
}

private fun offerMatchesMarketplaceCategory(offer: WalletOfferCard, category: BuyMarketplaceCategory): Boolean {
    val type = offer.productType.uppercase(Locale.getDefault())
    return when (category) {
        BuyMarketplaceCategory.All -> true
        BuyMarketplaceCategory.Memberships -> type == "MEMBERSHIP"
        BuyMarketplaceCategory.Cards -> !isGiftOffer(offer) && type != "MEMBERSHIP"
        BuyMarketplaceCategory.GiftCards -> isGiftOffer(offer)
    }
}

@Composable
private fun BuyMarketplaceCategoryRow(
    categories: List<BuyMarketplaceCategory>,
    languageCode: String,
    selected: BuyMarketplaceCategory,
    offers: List<WalletOfferCard>,
    onSelect: (BuyMarketplaceCategory) -> Unit,
    modifier: Modifier = Modifier
) {
    LazyRow(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        contentPadding = PaddingValues(end = 4.dp)
    ) {
        items(categories, key = { it.title }) { category ->
            val active = selected == category
            Surface(
                modifier = Modifier.clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = { onSelect(category) }
                ),
                shape = RoundedCornerShape(999.dp),
                color = Color.White.copy(alpha = 0.94f),
                border = BorderStroke(1.dp, if (active) WalletBlueSoft.copy(alpha = 0.45f) else WalletLine.copy(alpha = 0.95f)),
                shadowElevation = if (active) 6.dp else 2.dp,
                tonalElevation = 0.dp
            ) {
                Box(
                    modifier = Modifier
                        .height(32.dp)
                        .padding(horizontal = if (active) 12.dp else 10.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = category.localizedTitle(languageCode),
                        color = if (active) WalletBlue else WalletInk.copy(alpha = 0.88f),
                        fontSize = 12.sp,
                        fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
                        maxLines = 1
                    )
                }
            }
        }
    }
}

@Composable
private fun BuyMarketplaceCategoryIcon(category: BuyMarketplaceCategory, selected: Boolean) {
    val tint = if (selected) Color.White else WalletInk
    when (category) {
        BuyMarketplaceCategory.All -> Icon(Icons.Rounded.Tune, contentDescription = null, tint = tint, modifier = Modifier.size(15.dp))
        BuyMarketplaceCategory.Memberships -> Icon(Icons.Rounded.FitnessCenter, contentDescription = null, tint = tint, modifier = Modifier.size(15.dp))
        BuyMarketplaceCategory.Cards -> Icon(Icons.Rounded.ConfirmationNumber, contentDescription = null, tint = tint, modifier = Modifier.size(15.dp))
        BuyMarketplaceCategory.GiftCards -> Text("🎁", fontSize = 13.sp, lineHeight = 13.sp)
    }
}

@Composable
private fun BuyMarketplaceOfferCard(
    offer: WalletOfferCard,
    languageCode: String,
    index: Int,
    onBuyClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val accent = marketplaceOfferAccent(offer, index)
    Surface(
        modifier = modifier.height(142.dp),
        shape = RoundedCornerShape(22.dp),
        color = Color.White,
        border = BorderStroke(1.dp, WalletLine.copy(alpha = 0.62f)),
        shadowElevation = 7.dp,
        tonalElevation = 0.dp
    ) {
        Row(
            modifier = Modifier.fillMaxSize(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            BuyMarketplaceVisualPanel(
                offer = offer,
                languageCode = languageCode,
                accent = accent,
                modifier = Modifier
                    .fillMaxHeight()
                    .width(112.dp)
            )

            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .padding(start = 12.dp, top = 12.dp, bottom = 11.dp, end = 8.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = WalletGoldSoft,
                    tonalElevation = 0.dp
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Icon(Icons.Rounded.Star, contentDescription = null, tint = WalletGold, modifier = Modifier.size(10.dp))
                        Text(
                            text = marketplaceOfferTag(offer, languageCode).uppercase(Locale.getDefault()),
                            color = WalletGold,
                            fontSize = 9.sp,
                            fontWeight = FontWeight.ExtraBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }

                Text(
                    text = offer.name.ifBlank { walletProductTypeLabel(offer.productType, languageCode) },
                    color = WalletInk,
                    fontSize = 16.sp,
                    lineHeight = 18.sp,
                    fontWeight = FontWeight.ExtraBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )

                Text(
                    text = marketplaceOfferDescription(offer, languageCode),
                    color = WalletMuted,
                    fontSize = 10.sp,
                    lineHeight = 13.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis
                )

                Spacer(Modifier.weight(1f))

                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    Icon(Icons.Rounded.Schedule, contentDescription = null, tint = WalletMuted, modifier = Modifier.size(13.dp))
                    Text(
                        text = buyMarketplaceExpiryLabel(offer, languageCode),
                        color = WalletMuted,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            Box(
                modifier = Modifier
                    .width(1.dp)
                    .height(104.dp)
                    .background(WalletLine.copy(alpha = 0.82f))
            )

            Column(
                modifier = Modifier
                    .fillMaxHeight()
                    .width(108.dp)
                    .padding(start = 10.dp, end = 10.dp, top = 14.dp, bottom = 12.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
                horizontalAlignment = Alignment.Start
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    BuyOfferSmallIcon(offer = offer, accent = accent)
                    Text(
                        text = buyMarketplaceQuantityLabel(offer, languageCode),
                        color = accent,
                        fontSize = 10.sp,
                        lineHeight = 12.sp,
                        fontWeight = FontWeight.ExtraBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                Spacer(Modifier.weight(1f))

                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    Text(
                        text = buyOfferPriceLabel(offer),
                        color = accent,
                        fontSize = 22.sp,
                        lineHeight = 24.sp,
                        fontWeight = FontWeight.ExtraBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = buyMarketplacePriceSubtitle(offer, languageCode),
                        color = WalletMuted,
                        fontSize = 9.sp,
                        lineHeight = 11.sp,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                Surface(
                    modifier = Modifier
                        .height(38.dp)
                        .fillMaxWidth()
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            onClick = onBuyClick
                        ),
                    shape = RoundedCornerShape(999.dp),
                    color = accent,
                    shadowElevation = 4.dp,
                    tonalElevation = 0.dp
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 9.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = walletTr(languageCode, "Buy now", "Kupi zdaj"),
                            color = Color.White,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.ExtraBold,
                            maxLines = 1
                        )
                        Icon(Icons.Rounded.KeyboardArrowRight, contentDescription = null, tint = Color.White, modifier = Modifier.size(17.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun BuyMarketplaceVisualPanel(
    offer: WalletOfferCard,
    languageCode: String,
    accent: Color,
    modifier: Modifier = Modifier
) {
    val type = offer.productType.uppercase(Locale.getDefault())
    val colors = when {
        isGiftOffer(offer) -> listOf(Color(0xFF8A6AF6), Color(0xFF6746D8))
        type == "MEMBERSHIP" -> listOf(Color(0xFF2F91FF), Color(0xFF0C5FDC))
        else -> listOf(Color(0xFF21C9C4), Color(0xFF0F87D7))
    }
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(topStart = 22.dp, bottomStart = 22.dp))
            .background(Brush.linearGradient(colors = colors, start = Offset(0f, 0f), end = Offset(220f, 300f)))
    ) {
        Box(
            modifier = Modifier
                .align(Alignment.TopStart)
                .offset(x = (-24).dp, y = (-24).dp)
                .size(80.dp)
                .clip(CircleShape)
                .background(Color.White.copy(alpha = 0.14f))
        )
        Box(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .offset(x = 28.dp, y = 20.dp)
                .size(116.dp)
                .clip(CircleShape)
                .background(Color.White.copy(alpha = 0.10f))
        )
        BuyMarketplaceImageBadge(
            text = buyMarketplaceCardTypeLabel(offer, languageCode).uppercase(Locale.getDefault()),
            modifier = Modifier.align(Alignment.TopStart).padding(10.dp)
        )
        Box(
            modifier = Modifier
                .align(Alignment.Center)
                .size(78.dp),
            contentAlignment = Alignment.Center
        ) {
            when {
                isGiftOffer(offer) -> BuyGiftCardIllustration(languageCode = languageCode)
                type == "MEMBERSHIP" -> BuyMembershipIllustration()
                else -> BuyCardIllustration(accent = Color.White)
            }
        }
    }
}

@Composable
private fun BuyMarketplaceImageBadge(text: String, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(8.dp),
        color = Color.White.copy(alpha = 0.94f),
        tonalElevation = 0.dp
    ) {
        Text(
            text = text,
            color = Color(0xFF1E63E9),
            fontSize = 9.sp,
            lineHeight = 10.sp,
            fontWeight = FontWeight.ExtraBold,
            modifier = Modifier.padding(horizontal = 7.dp, vertical = 4.dp),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun BuyMembershipIllustration() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Box(
            modifier = Modifier
                .width(56.dp)
                .height(20.dp)
                .offset(y = (-20).dp)
                .clip(RoundedCornerShape(8.dp))
                .background(Color.White.copy(alpha = 0.35f))
        )
        Icon(
            Icons.Rounded.FitnessCenter,
            contentDescription = null,
            tint = Color.White,
            modifier = Modifier
                .size(56.dp)
                .rotate(-24f)
        )
    }
}

@Composable
private fun BuyCardIllustration(accent: Color) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Icon(
            Icons.Rounded.ConfirmationNumber,
            contentDescription = null,
            tint = accent,
            modifier = Modifier
                .size(58.dp)
                .rotate(-14f)
        )
        androidx.compose.foundation.Canvas(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .height(24.dp)
        ) {
            val stroke = Stroke(width = 2f)
            repeat(4) { i ->
                val y = size.height * (0.25f + i * 0.18f)
                drawLine(
                    color = Color.White.copy(alpha = 0.22f),
                    start = Offset(-10f, y),
                    end = Offset(size.width + 10f, y + 12f),
                    strokeWidth = stroke.width
                )
            }
        }
    }
}

@Composable
private fun BuyGiftCardIllustration(languageCode: String) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Surface(
            modifier = Modifier
                .width(62.dp)
                .height(40.dp)
                .rotate(-10f),
            shape = RoundedCornerShape(10.dp),
            color = Color.White,
            shadowElevation = 4.dp,
            tonalElevation = 0.dp
        ) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("🎁", fontSize = 23.sp, lineHeight = 23.sp)
            }
        }
    }
}

@Composable
private fun BuyOfferSmallIcon(offer: WalletOfferCard, accent: Color) {
    when {
        isGiftOffer(offer) -> Icon(Icons.Rounded.CardMembership, contentDescription = null, tint = accent, modifier = Modifier.size(14.dp))
        offer.productType.uppercase(Locale.getDefault()) == "MEMBERSHIP" -> Icon(Icons.Rounded.FitnessCenter, contentDescription = null, tint = accent, modifier = Modifier.size(14.dp))
        else -> Icon(Icons.Rounded.ConfirmationNumber, contentDescription = null, tint = accent, modifier = Modifier.size(14.dp))
    }
}

private fun buyMarketplaceCardTypeLabel(offer: WalletOfferCard, languageCode: String): String {
    val type = offer.productType.uppercase(Locale.getDefault())
    return when {
        type == "MEMBERSHIP" -> walletTr(languageCode, "Membership", "Članarina")
        isGiftOffer(offer) -> walletTr(languageCode, "Gift card", "Darilna kartica")
        else -> walletTr(languageCode, "Card", "Karta")
    }
}

private fun buyMarketplaceQuantityLabel(offer: WalletOfferCard, languageCode: String): String {
    val limit = offer.usageLimit ?: 0
    val type = offer.productType.uppercase(Locale.getDefault())
    return when {
        limit > 1 -> walletTr(languageCode, "$limit visits", "$limit obiskov")
        limit == 1 -> "1x"
        type == "MEMBERSHIP" -> "1x"
        isGiftOffer(offer) -> "1x"
        else -> "1x"
    }
}

private fun buyMarketplaceExpiryLabel(offer: WalletOfferCard, languageCode: String): String {
    val date = offer.validityDays?.takeIf { it > 0 }?.let { days ->
        java.time.LocalDate.now().plusDays(days.toLong()).format(java.time.format.DateTimeFormatter.ofPattern("dd.MM.yyyy"))
    } ?: "31.12.2026"
    return walletTr(languageCode, "Valid until: $date", "Velja do: $date")
}

private fun buyMarketplacePriceSubtitle(offer: WalletOfferCard, languageCode: String): String {
    val type = offer.productType.uppercase(Locale.getDefault())
    return when {
        type == "MEMBERSHIP" -> walletTr(languageCode, "monthly payment", "mesečno plačilo")
        isGiftOffer(offer) -> walletTr(languageCode, "value", "vrednost")
        else -> walletTr(languageCode, "total", "skupaj")
    }
}

private fun marketplaceOfferTag(offer: WalletOfferCard, languageCode: String): String =
    offer.promoText?.takeIf { it.isNotBlank() } ?: walletTr(languageCode, "Promo", "PROMO")

private fun marketplaceOfferDescription(offer: WalletOfferCard, languageCode: String): String = when {
    offer.description?.isNotBlank() == true -> offer.description
    isGiftOffer(offer) -> walletTr(languageCode, "A thoughtful gift for every occasion.", "Popolno darilo za vsak poseben trenutek.")
    offer.productType.uppercase(Locale.getDefault()) == "MEMBERSHIP" -> walletTr(languageCode, "A perfect start for new members.", "Popoln začetek za nove člane.")
    (offer.usageLimit ?: 0) > 1 -> walletTr(languageCode, "Flexible visits for all available sessions.", "Karta za več obiskov. Velja za vse termine.")
    else -> walletTr(languageCode, "Flexible access for your next visit.", "Prilagodljiv dostop za naslednji obisk.")
}

private fun marketplaceOfferAccent(offer: WalletOfferCard, index: Int): Color {
    val type = offer.productType.uppercase(Locale.getDefault())
    return when {
        type == "MEMBERSHIP" -> Color(0xFF0D61D3)
        isGiftOffer(offer) -> Color(0xFF6F52E8)
        else -> Color(0xFF079B91)
    }
}

private enum class BuyCategory(val title: String) {
    Packs("Packs"),
    Memberships("Memberships"),
    GiftCards("Gift Cards");

    fun localizedTitle(languageCode: String): String = when (this) {
        Packs -> walletTr(languageCode, "Packs", "Paketi")
        Memberships -> walletTr(languageCode, "Memberships", "Članarine")
        GiftCards -> walletTr(languageCode, "Gift Cards", "Darilne kartice")
    }
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

private fun paymentMethodDisplayName(method: String, languageCode: String = "en"): String = when (method) {
    "CARD" -> walletTr(languageCode, "Card", "Kartica")
    "PAYPAL" -> "PayPal"
    "BANK_TRANSFER" -> walletTr(languageCode, "Bank transfer", "Bančno nakazilo")
    else -> method.replace('_', ' ').lowercase(Locale.getDefault()).replaceFirstChar { it.uppercase() }
}

@Composable
private fun BuyCategoryFilterRow(
    categories: List<BuyCategory>,
    selected: BuyCategory,
    offers: List<WalletOfferCard>,
    onSelect: (BuyCategory) -> Unit,
    languageCode: String = "en",
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
                        text = category.localizedTitle(languageCode),
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
    onBuyClick: () -> Unit,
    languageCode: String = "en"
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
                            text = offer.name.ifBlank { walletProductTypeLabel(offer.productType, languageCode) },
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

private fun offerVisitCountShortLabel(limit: Int?, languageCode: String = "en"): String = when {
    limit == null || limit <= 1 -> walletTr(languageCode, "1 class", "1 obisk")
    else -> walletTr(languageCode, "$limit classes", "$limit obiskov")
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
    languageCode: String,
    availableMethods: List<String>,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val methods = remember(availableMethods) { normalizeWalletBuyMethods(availableMethods) }
    var selected by remember { mutableStateOf(methods.firstOrNull() ?: "CARD") }
    val actionBlue = Color(0xFF1568F4)
    val ink = Color(0xFF0F172A)
    val muted = Color(0xFF667085)
    val line = Color(0xFFE2E8F0)
    val summaryBg = Color(0xFFF2F7FF)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = Color.White,
        dragHandle = {
            Box(
                modifier = Modifier
                    .padding(top = 8.dp, bottom = 10.dp)
                    .width(46.dp)
                    .height(4.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(actionBlue)
            )
        }
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(bottom = 18.dp),
            verticalArrangement = Arrangement.spacedBy(9.dp)
        ) {
            Text(
                text = walletTr(languageCode, "Choose a payment method", "Izberite način plačila"),
                color = ink,
                fontSize = 19.sp,
                fontWeight = FontWeight.Normal,
                letterSpacing = 0.1.sp
            )

            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                color = summaryBg,
                tonalElevation = 0.dp
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Surface(
                        modifier = Modifier.size(40.dp),
                        shape = CircleShape,
                        color = Color.White
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                imageVector = Icons.Rounded.ConfirmationNumber,
                                contentDescription = null,
                                tint = actionBlue,
                                modifier = Modifier.size(22.dp)
                            )
                        }
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = offer.name,
                            color = ink,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Text(
                            text = walletTr(languageCode, "Service", "Storitev"),
                            color = muted,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }
                    Box(
                        modifier = Modifier
                            .width(1.dp)
                            .height(36.dp)
                            .background(line)
                    )
                    Spacer(Modifier.width(12.dp))
                    Column(horizontalAlignment = Alignment.End) {
                        Text(
                            text = "${formatPrice(offer.priceGross)} ${offer.currency}",
                            color = ink,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1
                        )
                        Text(
                            text = walletTr(languageCode, "Amount", "Znesek"),
                            color = muted,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
            }

            methods.forEach { method ->
                PaymentMethodRow(
                    method = method,
                    languageCode = languageCode,
                    selected = selected == method,
                    actionBlue = actionBlue,
                    ink = ink,
                    muted = muted,
                    line = line,
                    onSelect = { selected = method }
                )
            }

            Button(
                onClick = { onConfirm(selected) },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(46.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent, contentColor = Color.White),
                contentPadding = PaddingValues(0.dp)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxSize()
                        .clip(RoundedCornerShape(14.dp))
                        .background(Brush.horizontalGradient(listOf(actionBlue.copy(alpha = 0.96f), actionBlue))),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = walletTr(languageCode, "Continue", "Nadaljuj"),
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color.White
                    )
                }
            }
            TextButton(
                onClick = onDismiss,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = walletTr(languageCode, "Cancel", "Prekliči"),
                    color = actionBlue,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
    }
}

@Composable
private fun PaymentMethodRow(
    method: String,
    languageCode: String,
    selected: Boolean,
    actionBlue: Color,
    ink: Color,
    muted: Color,
    line: Color,
    onSelect: () -> Unit
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onSelect() },
        shape = RoundedCornerShape(14.dp),
        color = if (selected) Color(0xFFF2F7FF) else Color.White,
        border = BorderStroke(if (selected) 1.5.dp else 1.dp, if (selected) actionBlue else line),
        shadowElevation = if (selected) 2.dp else 0.dp,
        tonalElevation = 0.dp
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier.size(22.dp),
                contentAlignment = Alignment.Center
            ) {
                Box(
                    modifier = Modifier
                        .size(20.dp)
                        .clip(CircleShape)
                        .border(2.dp, if (selected) actionBlue else muted, CircleShape)
                )
                if (selected) {
                    Box(
                        modifier = Modifier
                            .size(10.dp)
                            .clip(CircleShape)
                            .background(actionBlue)
                    )
                }
            }
            Spacer(Modifier.width(12.dp))
            Surface(
                modifier = Modifier.size(40.dp),
                shape = RoundedCornerShape(13.dp),
                color = Color.White,
                shadowElevation = if (selected) 5.dp else 2.dp,
                tonalElevation = 0.dp
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = paymentMethodIcon(method),
                        contentDescription = null,
                        tint = actionBlue,
                        modifier = Modifier.size(22.dp)
                    )
                }
            }
            Spacer(Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = paymentMethodLabel(method, languageCode),
                    color = ink,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(Modifier.height(3.dp))
                Text(
                    text = paymentMethodHelper(method, languageCode),
                    color = muted,
                    fontSize = 13.sp,
                    lineHeight = 16.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

private fun paymentMethodIcon(method: String): ImageVector = when (method) {
    "BANK_TRANSFER" -> Icons.Rounded.Business
    "PAYPAL" -> Icons.Rounded.CreditCard
    else -> Icons.Rounded.CreditCard
}

private fun paymentMethodLabel(method: String, languageCode: String = "en"): String = when (method) {
    "CARD" -> walletTr(languageCode, "Credit or debit card", "Kreditna ali debetna kartica")
    "PAYPAL" -> "PayPal"
    "BANK_TRANSFER" -> walletTr(languageCode, "Bank transfer", "Bančno nakazilo")
    else -> method
}

private fun paymentMethodHelper(method: String, languageCode: String = "en"): String = when (method) {
    "CARD" -> walletTr(languageCode, "Instant confirmation", "Takojšnja potrditev")
    "PAYPAL" -> walletTr(languageCode, "Redirects to PayPal", "Preusmeritev na PayPal")
    "BANK_TRANSFER" -> walletTr(languageCode, "Pay with reference code; activated after reconciliation", "Plačajte s sklicem; aktivacija po uskladitvi")
    else -> ""
}

// ---------- Orders ----------


@Composable
private fun OrdersPanel(
    orders: List<WalletOrder>,
    languageCode: String,
    tenantName: String?,
    onGoToBuy: () -> Unit,
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
        WalletShowcaseEmptyState(
            art = WalletEmptyArt.Orders,
            title = walletTr(languageCode, "No orders yet", "Naročil še ni"),
            subtitle = walletTr(languageCode, "Completed purchases from the Buy tab will appear here once you place your first order.", "Zaključeni nakupi iz zavihka Nakup bodo prikazani tukaj po prvem naročilu."),
            primaryButtonText = walletTr(languageCode, "Go to Buy", "Pojdi na nakup"),
            footerText = "",
            footerIcon = Icons.Outlined.ShoppingBag,
            onPrimaryClick = onGoToBuy
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
                languageCode = languageCode,
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
                        Text(walletTr(languageCode, "No $selectedFilter orders", "Ni naročil: ${walletFilterDisplay(selectedFilter, languageCode)}"), color = Color(0xFF071C4D), fontWeight = FontWeight.Bold, fontSize = 18.sp)
                        Text(
                            walletTr(languageCode, "Orders matching this status will appear here.", "Tukaj bodo prikazana naročila s tem statusom."),
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
                    languageCode = languageCode,
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
            languageCode = languageCode,
            tenantName = tenantName,
            onDismiss = { paymentInstructionsOrder = null }
        )
    }
}

@Composable
private fun WalletOrderFilterRow(
    selected: String,
    languageCode: String,
    onSelected: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    LazyRow(
        modifier = modifier.padding(top = 2.dp, bottom = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        items(listOf("All", "Paid", "Pending", "Refunded", "Cancelled")) { label ->
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
                        .height(32.dp)
                        .padding(horizontal = if (selectedChip) 12.dp else 10.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = walletFilterDisplay(label, languageCode),
                        color = if (selectedChip) Color.White else WalletInk.copy(alpha = 0.88f),
                        fontSize = 12.sp,
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

private fun walletOrderStatusStyle(status: OrderChipStatus, languageCode: String = "en"): WalletOrderStatusStyle = when (status) {
    OrderChipStatus.Completed -> WalletOrderStatusStyle(
        label = walletTr(languageCode, "Paid", "Plačano"),
        fg = Color(0xFF0B9E61),
        bg = Color(0xFFDFF4E9),
        icon = Icons.Rounded.CheckCircle,
        receiptIcon = Icons.AutoMirrored.Outlined.ReceiptLong,
        iconBg = Color(0xFFEAF8F0),
        cardBorder = WalletLine
    )
    OrderChipStatus.Pending -> WalletOrderStatusStyle(
        label = walletTr(languageCode, "Pending", "V čakanju"),
        fg = Color(0xFFB96800),
        bg = Color(0xFFFFF2DE),
        icon = Icons.Rounded.Schedule,
        receiptIcon = Icons.AutoMirrored.Outlined.ReceiptLong,
        iconBg = Color(0xFFFFF1E1),
        cardBorder = Color(0xFFE6892D).copy(alpha = 0.62f)
    )
    OrderChipStatus.Refunded -> WalletOrderStatusStyle(
        label = walletTr(languageCode, "Refunded", "Vračilo"),
        fg = Color(0xFF5D687A),
        bg = Color(0xFFEFF1F4),
        icon = Icons.Rounded.Replay,
        receiptIcon = Icons.Rounded.Replay,
        iconBg = Color(0xFFF0F2F5),
        cardBorder = WalletLine
    )
    OrderChipStatus.Cancelled -> WalletOrderStatusStyle(
        label = walletTr(languageCode, "Cancelled", "Preklicano"),
        fg = Color(0xFF8A4A18),
        bg = Color(0xFFFFEFE2),
        icon = Icons.Rounded.Info,
        receiptIcon = Icons.Rounded.Info,
        iconBg = Color(0xFFFFF3E8),
        cardBorder = Color(0xFFE6892D).copy(alpha = 0.42f)
    )
}

private fun orderStatusLabel(status: OrderChipStatus): String = when (status) {
    OrderChipStatus.Completed -> "Paid"
    OrderChipStatus.Pending -> "Pending"
    OrderChipStatus.Refunded -> "Refunded"
    OrderChipStatus.Cancelled -> "Cancelled"
}

private fun walletStatusDisplay(status: String, languageCode: String): String = when (status) {
    "Active" -> walletTr(languageCode, "Active", "Aktivno")
    "Inactive" -> walletTr(languageCode, "Inactive", "Neaktivno")
    "Expired" -> walletTr(languageCode, "Expired", "Poteklo")
    "Used up" -> walletTr(languageCode, "Used up", "Porabljeno")
    "Cancelled" -> walletTr(languageCode, "Cancelled", "Preklicano")
    "Pending" -> walletTr(languageCode, "Pending", "V čakanju")
    "Ready" -> walletTr(languageCode, "Ready", "Pripravljeno")
    else -> status
}

@Composable
private fun WalletOrderReceiptCard(
    order: WalletOrder,
    languageCode: String,
    tenantName: String?,
    onPaymentInstructions: () -> Unit,
    onViewReceipt: () -> Unit
) {
    val status = resolveOrderStatus(order)
    val style = walletOrderStatusStyle(status, languageCode)
    val isPendingTransfer = status == OrderChipStatus.Pending && order.paymentMethodType.equals("BANK_TRANSFER", ignoreCase = true)
    val reference = order.referenceCode?.takeIf { it.isNotBlank() } ?: "ORD-${order.orderId.takeLast(8)}"
    val displayOrderId = order.invoiceOrderId?.takeIf { it.isNotBlank() } ?: reference
    val amount = "${formatPrice(order.totalGross)} ${order.currency}"

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        color = Color.White,
        border = BorderStroke(1.dp, WalletLine.copy(alpha = 0.86f)),
        tonalElevation = 0.dp,
        shadowElevation = 5.dp
    ) {
        Box(modifier = Modifier.fillMaxWidth()) {
            Box(
                modifier = Modifier
                    .align(Alignment.CenterStart)
                    .width(4.dp)
                    .fillMaxHeight()
                    .background(style.fg)
            )
            Column(
                modifier = Modifier.fillMaxWidth().padding(start = 14.dp, top = 13.dp, end = 14.dp, bottom = 13.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.Top,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(56.dp)
                            .clip(CircleShape)
                            .background(style.iconBg),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = orderProductIcon(order.productType),
                            contentDescription = null,
                            tint = style.fg,
                            modifier = Modifier.size(28.dp)
                        )
                    }
                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            text = order.productName?.takeIf { it.isNotBlank() } ?: walletTr(languageCode, "Order", "Naročilo"),
                            color = WalletInk,
                            fontSize = 18.sp,
                            lineHeight = 21.sp,
                            fontWeight = FontWeight.ExtraBold,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis
                        )
                        Text(
                            text = tenantName?.takeIf { it.isNotBlank() } ?: "Calendra",
                            color = WalletMuted,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                    Column(
                        horizontalAlignment = Alignment.End,
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.widthIn(min = 92.dp)
                    ) {
                        WalletOrderStatusPill(style = style)
                        Text(walletTr(languageCode, "Total", "Skupaj"), color = WalletMuted, fontSize = 11.sp, fontWeight = FontWeight.Medium)
                        Text(
                            amount,
                            color = WalletInk,
                            fontSize = 20.sp,
                            lineHeight = 22.sp,
                            fontWeight = FontWeight.ExtraBold,
                            textAlign = TextAlign.End,
                            maxLines = 1
                        )
                    }
                }

                Box(Modifier.fillMaxWidth().height(1.dp).background(WalletLine.copy(alpha = 0.78f)))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(9.dp)
                ) {
                    WalletOrderMetric(label = walletTr(languageCode, "Order ID", "ID naročila"), value = displayOrderId, modifier = Modifier.weight(1.0f))
                    Box(Modifier.width(1.dp).height(36.dp).background(WalletLine.copy(alpha = 0.72f)))
                    WalletOrderMetric(label = walletTr(languageCode, "Ordered on", "Datum naročila"), value = formatOrderDateShort(order.createdAt).ifBlank { "—" }, modifier = Modifier.weight(1.0f))
                    Box(Modifier.width(1.dp).height(36.dp).background(WalletLine.copy(alpha = 0.72f)))
                    WalletOrderMetric(label = walletTr(languageCode, "Payment method", "Način plačila"), value = walletOrderPaymentLabel(order.paymentMethodType, languageCode), modifier = Modifier.weight(1.15f))
                }

                if (status == OrderChipStatus.Cancelled) {
                    WalletCancelledOrderCallout(languageCode = languageCode)
                } else if (isPendingTransfer) {
                    WalletPendingTransferCallout(languageCode = languageCode, onPaymentInstructions = onPaymentInstructions)
                } else {
                    WalletViewReceiptRow(languageCode = languageCode, onClick = onViewReceipt)
                }
            }
        }
    }
}

private fun orderProductIcon(productType: String?): ImageVector {
    val type = productType.orEmpty().uppercase(Locale.getDefault())
    return when {
        type == "MEMBERSHIP" -> Icons.Rounded.CardMembership
        type == "PACK" -> Icons.Rounded.FitnessCenter
        type.contains("GIFT") -> Icons.Rounded.Star
        else -> Icons.Rounded.ConfirmationNumber
    }
}

@Composable
private fun WalletOrderMetric(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(
            text = label,
            color = WalletMuted,
            fontSize = 10.sp,
            lineHeight = 13.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        Text(
            text = value,
            color = WalletInk,
            fontSize = 13.sp,
            lineHeight = 16.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
        )
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
            modifier = Modifier.height(30.dp).padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp)
        ) {
            Icon(
                imageVector = style.icon,
                contentDescription = null,
                tint = style.fg,
                modifier = Modifier.size(14.dp)
            )
            Text(
                text = style.label,
                color = style.fg,
                fontSize = 12.sp,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 1
            )
        }
    }
}


@Composable
private fun WalletCancelledOrderCallout(languageCode: String) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = Color(0xFFFFF2DE).copy(alpha = 0.55f),
        border = BorderStroke(1.dp, Color(0xFFB96800).copy(alpha = 0.18f)),
        tonalElevation = 0.dp
    ) {
        Row(
            modifier = Modifier.padding(11.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(
                imageVector = Icons.Rounded.Info,
                contentDescription = null,
                tint = Color(0xFFB96800),
                modifier = Modifier.size(19.dp)
            )
            Text(
                text = walletTr(languageCode, "Checkout was cancelled", "Plačilo je bilo preklicano"),
                color = Color(0xFF8A4A18),
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold
            )
        }
    }
}

@Composable
private fun WalletPendingTransferCallout(languageCode: String, onPaymentInstructions: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = Color(0xFFFFF2DE).copy(alpha = 0.72f),
        border = BorderStroke(1.dp, Color(0xFFB96800).copy(alpha = 0.20f)),
        tonalElevation = 0.dp
    ) {
        Row(
            modifier = Modifier.padding(10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(
                imageVector = Icons.Rounded.Info,
                contentDescription = null,
                tint = Color(0xFFB96800),
                modifier = Modifier.size(20.dp)
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = walletTr(languageCode, "Awaiting transfer", "Čakamo nakazilo"),
                    color = Color(0xFFB96800),
                    fontSize = 12.sp,
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
                    text = walletTr(languageCode, "Payment instructions", "Navodila za plačilo"),
                    color = Color.White,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.ExtraBold,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 7.dp),
                    maxLines = 1
                )
            }
        }
    }
}

@Composable
private fun WalletPaymentInstructionsDialog(
    order: WalletOrder,
    languageCode: String,
    tenantName: String?,
    onDismiss: () -> Unit
) {
    val clipboardManager = LocalClipboardManager.current
    val reference = order.invoiceOrderId?.takeIf { it.isNotBlank() }
        ?: order.referenceCode?.takeIf { it.isNotBlank() }
        ?: "ORD-${order.orderId.takeLast(8)}"
    val companyName = order.paymentCompanyName?.takeIf { it.isNotBlank() }
        ?: tenantName?.takeIf { it.isNotBlank() }
        ?: walletTr(languageCode, "Company name unavailable", "Ime podjetja ni na voljo")
    val companyAddress = order.paymentCompanyAddress?.takeIf { it.isNotBlank() } ?: walletTr(languageCode, "Address unavailable", "Naslov ni na voljo")
    val iban = order.paymentIban?.takeIf { it.isNotBlank() } ?: walletTr(languageCode, "IBAN unavailable", "IBAN ni na voljo")

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
                    text = walletTr(languageCode, "Payment instructions", "Navodila za plačilo"),
                    color = Color(0xFF071C4D),
                    fontSize = 20.sp,
                    fontWeight = FontWeight.ExtraBold
                )
                Text(
                    text = walletTr(languageCode, "Use these details to complete your bank transfer.", "Uporabite te podatke za izvedbo bančnega nakazila."),
                    color = Color(0xFF53617C),
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                    fontWeight = FontWeight.Medium
                )

                WalletInstructionRow(label = walletTr(languageCode, "Company", "Podjetje"), value = companyName)
                WalletInstructionRow(label = walletTr(languageCode, "Address", "Naslov"), value = companyAddress)
                WalletInstructionRowWithCopy(
                    label = "IBAN",
                    languageCode = languageCode,
                    value = iban,
                    onCopy = { clipboardManager.setText(AnnotatedString(iban)) }
                )
                WalletInstructionRowWithCopy(
                    label = walletTr(languageCode, "Reference", "Sklic"),
                    languageCode = languageCode,
                    value = reference,
                    onCopy = { clipboardManager.setText(AnnotatedString(reference)) }
                )

                TextButton(
                    onClick = onDismiss,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(walletTr(languageCode, "Close", "Zapri"), fontWeight = FontWeight.SemiBold)
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
    languageCode: String,
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
                    text = walletTr(languageCode, "Copy", "Kopiraj"),
                    color = Color(0xFF0067F5),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

@Composable
private fun WalletViewReceiptRow(languageCode: String, onClick: () -> Unit) {
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
                text = walletTr(languageCode, "View receipt", "Ogled računa"),
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

private fun walletOrderPaymentLabel(raw: String?, languageCode: String = "en"): String = when (raw?.uppercase(Locale.getDefault())) {
    "BANK_TRANSFER" -> walletTr(languageCode, "Bank transfer", "Bančno nakazilo")
    "CARD" -> walletTr(languageCode, "Card", "Kartica")
    "PAYPAL" -> "PayPal"
    "OTHER" -> walletTr(languageCode, "Other", "Drugo")
    "ENTITLEMENT" -> walletTr(languageCode, "Entitlement", "Vstopnica")
    "GIFT_CARD" -> walletTr(languageCode, "Gift card", "Darilna kartica")
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

private enum class OrderChipStatus { Completed, Pending, Refunded, Cancelled }

private fun resolveOrderStatus(order: WalletOrder): OrderChipStatus {
    val bill = order.billPaymentStatus?.uppercase()
    val status = order.status.uppercase()
    if (status == "CANCELLED" || bill == "CANCELLED") return OrderChipStatus.Cancelled
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
        OrderChipStatus.Cancelled -> Triple("Cancelled", Color(0xFFFFEFE2), Color(0xFF8A4A18))
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

private enum class WalletEmptyArt { Entitlements, Buy, Orders }

@Composable
private fun WalletShowcaseEmptyState(
    art: WalletEmptyArt,
    title: String,
    subtitle: String,
    primaryButtonText: String,
    footerText: String,
    footerIcon: ImageVector,
    onPrimaryClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp, vertical = 12.dp),
        contentAlignment = Alignment.TopCenter
    ) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(30.dp),
            color = Color.White,
            tonalElevation = 0.dp,
            shadowElevation = 8.dp
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 18.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                WalletShowcaseIllustration(art = art)
                Spacer(Modifier.height(16.dp))
                Text(
                    title,
                    color = Color(0xFF0E2558),
                    fontSize = 28.sp,
                    lineHeight = 32.sp,
                    fontWeight = FontWeight.ExtraBold,
                    textAlign = TextAlign.Center
                )
                Spacer(Modifier.height(10.dp))
                Text(
                    subtitle,
                    color = WalletMuted,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(horizontal = 12.dp)
                )
                Spacer(Modifier.height(22.dp))
                Button(
                    onClick = onPrimaryClick,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                    shape = RoundedCornerShape(18.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1568F4), contentColor = Color.White)
                ) {
                    Text(primaryButtonText, fontSize = 14.sp, fontWeight = FontWeight.ExtraBold)
                }
                if (footerText.isNotEmpty()) {
                    Spacer(Modifier.height(18.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalAlignment = Alignment.Top
                    ) {
                        Surface(
                            modifier = Modifier.size(42.dp),
                            shape = CircleShape,
                            color = Color(0xFFF1F5FD),
                            tonalElevation = 0.dp,
                            shadowElevation = 0.dp
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(footerIcon, contentDescription = null, tint = Color(0xFF1568F4), modifier = Modifier.size(20.dp))
                            }
                        }
                        Text(
                            footerText,
                            color = WalletMuted,
                            fontSize = 12.sp,
                            lineHeight = 18.sp,
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun WalletShowcaseIllustration(art: WalletEmptyArt) {
    val illustrationRes = when (art) {
        WalletEmptyArt.Entitlements -> R.drawable.wallet_empty_entitlements_illustration
        WalletEmptyArt.Buy -> R.drawable.wallet_empty_buy_illustration
        WalletEmptyArt.Orders -> R.drawable.wallet_empty_orders_illustration
    }

    Image(
        painter = painterResource(id = illustrationRes),
        contentDescription = null,
        modifier = Modifier
            .fillMaxWidth()
            .height(250.dp),
        contentScale = ContentScale.Fit
    )
}

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
