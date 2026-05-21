package si.calendra.guest.android.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AccessTime
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Call
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.Message
import androidx.compose.material.icons.rounded.NotificationsNone
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.PersonOutline
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import si.calendra.guest.android.R
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.absoluteValue

private const val HERO_PREVIEW_COUNT = 5

private val HomeBg = Color(0xFFF3F4F8)
private val BrandBlue = Color(0xFF1568F4)
private val BrandBlueSoft = Color(0xFFEAF2FF)
private val BrandOrange = Color(0xFFFF9D1B)
private val BrandText = Color(0xFF0E2558)
private val MutedText = Color(0xFF6C7893)
private val SoftBorder = Color(0xFFE5EAF3)

private enum class BookingTab(val label: String) {
    Future("Future"),
    Past("Past"),
    Cancelled("Cancelled")
}

data class UpcomingBookingCard(
    val id: String,
    val companyId: String,
    val title: String,
    val sessionTypeId: String?,
    val startsAt: String,
    val endsAt: String?,
    val status: String,
    val tenantName: String,
    val tenantCity: String?,
    val tenantAddress: String?,
    val consultantName: String?,
    val tenantPhone: String?,
    val cardImageUrl: String?,
    val logoImageUrl: String?,
    val iconImageUrl: String?
)

data class AccessCard(
    val id: String,
    val name: String,
    val type: String,
    val tenantName: String,
    val entitlementCode: String? = null,
    val validUntil: String?,
    val remainingUses: Int?,
    val totalUses: Int? = null,
    val displayCode: String? = null,
    val priceGross: Double? = null,
    val currency: String? = null,
    val validityDays: Int? = null,
    val autoRenews: Boolean = false
)

@Composable
fun HomeScreen(
    modifier: Modifier = Modifier,
    guestFirstName: String?,
    bookings: List<UpcomingBookingCard>,
    accesses: List<AccessCard>,
    onChooseTenant: () -> Unit,
    onOpenNotifications: () -> Unit,
    onBookNow: () -> Unit,
    onCall: (String) -> Unit,
    onSms: (String) -> Unit,
    onReschedule: (UpcomingBookingCard) -> Unit,
    onCancelBooking: (UpcomingBookingCard) -> Unit = {}
) {
    var selectedBookingTab by remember { mutableStateOf(BookingTab.Future) }
    var bookingPendingCancel by remember { mutableStateOf<UpcomingBookingCard?>(null) }
    val filteredBookings = remember(bookings, selectedBookingTab) {
        bookings.filterForTab(selectedBookingTab).take(HERO_PREVIEW_COUNT)
    }

    bookingPendingCancel?.let { booking ->
        AlertDialog(
            onDismissRequest = { bookingPendingCancel = null },
            title = { Text("Cancel booking?") },
            text = { Text("This will cancel ${booking.title} on ${formatBookingDate(booking.startsAt)}.") },
            confirmButton = {
                TextButton(onClick = { bookingPendingCancel = null; onCancelBooking(booking) }) {
                    Text("Cancel booking", color = BrandBlue, fontWeight = FontWeight.SemiBold)
                }
            },
            dismissButton = { TextButton(onClick = { bookingPendingCancel = null }) { Text("Keep booking") } }
        )
    }

    LazyColumn(
        modifier = modifier.fillMaxSize().background(HomeBg),
        userScrollEnabled = false,
        contentPadding = PaddingValues(top = 18.dp, bottom = 104.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            HomeHeaderBlock(
                guestFirstName = guestFirstName,
                hasBookings = bookings.isNotEmpty(),
                onChooseTenant = onChooseTenant,
                onOpenNotifications = onOpenNotifications,
                modifier = Modifier.padding(horizontal = 24.dp)
            )
        }
        item {
            BookingTabsRow(
                selected = selectedBookingTab,
                onSelected = { selectedBookingTab = it },
                modifier = Modifier.padding(horizontal = 24.dp)
            )
        }
        item {
            when {
                filteredBookings.isEmpty() -> EmptyBookingsCard(
                    selected = selectedBookingTab,
                    onBookNow = onBookNow,
                    modifier = Modifier.padding(horizontal = 24.dp)
                )
                else -> UpcomingBookingsCarousel(
                    bookings = filteredBookings,
                    onCall = onCall,
                    onSms = onSms,
                    onReschedule = onReschedule,
                    onCancelBooking = { bookingPendingCancel = it }
                )
            }
        }
    }
}

@Composable
private fun HomeHeaderBlock(
    guestFirstName: String?,
    hasBookings: Boolean,
    onChooseTenant: () -> Unit,
    onOpenNotifications: () -> Unit,
    modifier: Modifier = Modifier
) {
    val name = guestFirstName?.takeIf { it.isNotBlank() } ?: "Alex"
    Column(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Image(
                painter = painterResource(id = R.drawable.calendra_logo),
                contentDescription = "Calendra",
                modifier = Modifier
                    .height(34.dp)
                    .wrapContentWidth(Alignment.Start),
                contentScale = ContentScale.Fit
            )
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                AddTenantButton(onClick = onChooseTenant)
                NotificationButton(onClick = onOpenNotifications)
            }
        }
        Spacer(Modifier.height(12.dp))
        Text(
            text = "Hello, $name",
            fontSize = 28.sp,
            lineHeight = 32.sp,
            fontWeight = FontWeight.ExtraBold,
            color = BrandText
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = if (hasBookings) "Here’s your upcoming booking." else "Here’s what’s next.",
            fontSize = 14.sp,
            lineHeight = 19.sp,
            color = MutedText
        )
    }
}

@Composable
private fun AddTenantButton(onClick: () -> Unit) {
    OutlinedButton(
        onClick = onClick,
        shape = RoundedCornerShape(18.dp),
        border = BorderStroke(1.2.dp, BrandBlue),
        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 0.dp),
        colors = ButtonDefaults.outlinedButtonColors(containerColor = Color.Transparent, contentColor = BrandBlue),
        modifier = Modifier.height(34.dp)
    ) {
        Icon(Icons.Rounded.PersonOutline, contentDescription = null, modifier = Modifier.size(14.dp))
        Spacer(Modifier.width(6.dp))
        Text("Add tenant", fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun NotificationButton(onClick: () -> Unit) {
    Box {
        IconButton(onClick = onClick, modifier = Modifier.size(34.dp)) {
            Icon(Icons.Rounded.NotificationsNone, contentDescription = "Notifications", tint = BrandText, modifier = Modifier.size(19.dp))
        }
        Box(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .offset(x = (-3).dp, y = 5.dp)
                .size(10.dp)
                .clip(CircleShape)
                .background(BrandBlue)
        )
    }
}

@Composable
private fun BookingTabsRow(selected: BookingTab, onSelected: (BookingTab) -> Unit, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier.fillMaxWidth().height(50.dp),
        shape = RoundedCornerShape(18.dp),
        color = Color.White,
        shadowElevation = 4.dp
    ) {
        Row(modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
            BookingTab.values().forEach { tab ->
                val active = tab == selected
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .clickable { onSelected(tab) },
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        tab.label,
                        color = if (active) BrandBlue else MutedText,
                        fontSize = 12.sp,
                        fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
                        modifier = Modifier.padding(top = 5.dp, bottom = 5.dp)
                    )
                    Box(
                        modifier = Modifier
                            .width(72.dp)
                            .height(3.dp)
                            .clip(RoundedCornerShape(topStart = 4.dp, topEnd = 4.dp))
                            .background(if (active) BrandBlue else Color.Transparent)
                    )
                }
            }
        }
    }
}

@Composable
private fun EmptyBookingsCard(selected: BookingTab, onBookNow: () -> Unit, modifier: Modifier = Modifier) {
    val title = when (selected) {
        BookingTab.Future -> "No upcoming bookings"
        BookingTab.Past -> "No past bookings"
        BookingTab.Cancelled -> "No cancelled bookings"
    }
    val subtitle = when (selected) {
        BookingTab.Future -> "You’re all set — there are no future bookings right now."
        BookingTab.Past -> "Completed visits will appear here."
        BookingTab.Cancelled -> "Cancelled bookings will appear here."
    }
    ElevatedCard(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(30.dp),
        colors = CardDefaults.elevatedCardColors(containerColor = Color.White),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 6.dp)
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            when (selected) {
                BookingTab.Future -> {
                    Image(
                        painter = painterResource(id = R.drawable.home_empty_illustration),
                        contentDescription = null,
                        modifier = Modifier.fillMaxWidth().aspectRatio(694f / 392f),
                        contentScale = ContentScale.Fit
                    )
                    Spacer(Modifier.height(14.dp))
                }
                BookingTab.Past -> {
                    Image(
                        painter = painterResource(id = R.drawable.home_empty_past_illustration),
                        contentDescription = null,
                        modifier = Modifier.fillMaxWidth().aspectRatio(735f / 450f),
                        contentScale = ContentScale.Fit
                    )
                    Spacer(Modifier.height(12.dp))
                }
                BookingTab.Cancelled -> {
                    Image(
                        painter = painterResource(id = R.drawable.home_empty_cancelled_illustration),
                        contentDescription = null,
                        modifier = Modifier.fillMaxWidth().aspectRatio(735f / 450f),
                        contentScale = ContentScale.Fit
                    )
                    Spacer(Modifier.height(12.dp))
                }
            }

            Text(title, color = BrandText, fontSize = 21.sp, lineHeight = 26.sp, fontWeight = FontWeight.ExtraBold)
            Spacer(Modifier.height(10.dp))
            Text(
                subtitle,
                color = MutedText,
                fontSize = 13.sp,
                lineHeight = 19.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 22.dp)
            )
            Spacer(Modifier.height(22.dp))

            if (selected == BookingTab.Future || selected == BookingTab.Cancelled) {
                Button(
                    onClick = onBookNow,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp).height(54.dp),
                    shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = BrandBlue)
                ) {
                    Text("Book now", fontSize = 14.sp, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.height(12.dp))
            }

            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
                Icon(Icons.Rounded.CalendarMonth, contentDescription = null, tint = BrandBlue, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(10.dp))
                Text("Explore available sessions from the Book tab.", color = MutedText, fontSize = 12.sp)
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun UpcomingBookingsCarousel(
    bookings: List<UpcomingBookingCard>,
    onCall: (String) -> Unit,
    onSms: (String) -> Unit,
    onReschedule: (UpcomingBookingCard) -> Unit,
    onCancelBooking: (UpcomingBookingCard) -> Unit
) {
    val pagerState = rememberPagerState(pageCount = { bookings.size })
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        HorizontalPager(
            state = pagerState,
            contentPadding = PaddingValues(horizontal = 26.dp),
            pageSpacing = 12.dp,
            modifier = Modifier.fillMaxWidth().height(760.dp)
        ) { page ->
            val booking = bookings[page]
            val pageOffset = ((pagerState.currentPage - page) + pagerState.currentPageOffsetFraction).absoluteValue
            UpcomingBookingFocusCard(
                booking = booking,
                onCall = onCall,
                onSms = onSms,
                onReschedule = onReschedule,
                onCancelBooking = onCancelBooking,
                modifier = Modifier
                    .graphicsLayer {
                        val scale = 1f - (pageOffset.coerceIn(0f, 1f) * 0.06f)
                        scaleX = scale
                        scaleY = scale
                        alpha = 1f - (pageOffset.coerceIn(0f, 1f) * 0.18f)
                    }
                    .fillMaxSize()
            )
        }
        CarouselDots(count = bookings.size, selectedIndex = pagerState.currentPage)
    }
}

@Composable
private fun UpcomingBookingFocusCard(
    booking: UpcomingBookingCard,
    onCall: (String) -> Unit,
    onSms: (String) -> Unit,
    onReschedule: (UpcomingBookingCard) -> Unit,
    onCancelBooking: (UpcomingBookingCard) -> Unit,
    modifier: Modifier = Modifier
) {
    ElevatedCard(
        modifier = modifier,
        shape = RoundedCornerShape(30.dp),
        colors = CardDefaults.elevatedCardColors(containerColor = Color.White),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 7.dp)
    ) {
        Column(Modifier.fillMaxSize()) {
            Box(modifier = Modifier.fillMaxWidth().height(286.dp)) {
                if (!booking.cardImageUrl.isNullOrBlank()) {
                    AsyncImage(
                        model = booking.cardImageUrl,
                        contentDescription = booking.tenantName,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop
                    )
                } else {
                    Image(
                        painter = painterResource(id = R.drawable.gym_booking_background),
                        contentDescription = null,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop
                    )
                }
                Surface(
                    modifier = Modifier.align(Alignment.TopStart).padding(16.dp).size(68.dp),
                    shape = RoundedCornerShape(18.dp),
                    color = Color.White
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        if (!booking.logoImageUrl.isNullOrBlank()) {
                            AsyncImage(model = booking.logoImageUrl, contentDescription = null, modifier = Modifier.fillMaxSize().padding(8.dp), contentScale = ContentScale.Fit)
                        } else {
                            Image(painterResource(id = R.drawable.calendra_logo), contentDescription = null, modifier = Modifier.padding(10.dp), contentScale = ContentScale.Fit)
                        }
                    }
                }
                StatusPill(
                    status = booking.status,
                    modifier = Modifier.align(Alignment.TopEnd).padding(18.dp)
                )
            }
            Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 18.dp)) {
                Text(
                    text = booking.title,
                    color = BrandText,
                    fontSize = 22.sp,
                    lineHeight = 27.sp,
                    fontWeight = FontWeight.ExtraBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(Modifier.height(14.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    CompactMetaItem(Icons.Rounded.CalendarMonth, formatBookingDate(booking.startsAt))
                    CompactMetaItem(Icons.Rounded.AccessTime, formatBookingTime(booking.startsAt))
                }
                Spacer(Modifier.height(14.dp))
                HorizontalDivider(color = SoftBorder)
                Spacer(Modifier.height(14.dp))
                DetailLine(icon = Icons.Rounded.PersonOutline, iconTint = BrandBlue, label = "Tenant", value = booking.tenantName)
                Spacer(Modifier.height(14.dp))
                HorizontalDivider(color = SoftBorder)
                Spacer(Modifier.height(14.dp))
                DetailLine(icon = Icons.Rounded.Person, iconTint = BrandOrange, label = "Consultant", value = booking.consultantName?.takeIf { it.isNotBlank() } ?: "To be confirmed")
                Spacer(Modifier.height(14.dp))
                HorizontalDivider(color = SoftBorder)
                Spacer(Modifier.height(14.dp))
                DetailLine(
                    icon = Icons.Rounded.LocationOn,
                    iconTint = Color(0xFF7B61FF),
                    label = "Location",
                    value = booking.tenantName,
                    subvalue = formatTenantAddressLine(booking.tenantAddress, booking.tenantCity)
                )
                Spacer(Modifier.height(22.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                    ActionButton("Call", Icons.Rounded.Call, BrandBlue, Color.White, SoftBorder, enabled = !booking.tenantPhone.isNullOrBlank(), modifier = Modifier.weight(1f)) {
                        booking.tenantPhone?.let(onCall)
                    }
                    ActionButton("SMS", Icons.Rounded.Message, BrandBlue, Color.White, SoftBorder, enabled = !booking.tenantPhone.isNullOrBlank(), modifier = Modifier.weight(1f)) {
                        booking.tenantPhone?.let(onSms)
                    }
                    ActionButton("Reschedule", Icons.Rounded.Schedule, BrandOrange, Color.White, SoftBorder, enabled = booking.canBeCancelled(), modifier = Modifier.weight(1f)) {
                        onReschedule(booking)
                    }
                    ActionButton("Cancel", Icons.Rounded.Close, Color(0xFFE53935), Color.White, SoftBorder, enabled = booking.canBeCancelled(), modifier = Modifier.weight(1f)) {
                        onCancelBooking(booking)
                    }
                }
            }
        }
    }
}

@Composable
private fun CompactMetaItem(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(icon, contentDescription = null, tint = MutedText, modifier = Modifier.size(20.dp))
        Text(text, color = MutedText, fontSize = 12.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun DetailLine(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    iconTint: Color,
    label: String,
    value: String,
    subvalue: String? = null
) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top, modifier = Modifier.fillMaxWidth()) {
        Box(
            modifier = Modifier
                .size(42.dp)
                .clip(CircleShape)
                .background(iconTint.copy(alpha = 0.10f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, contentDescription = null, tint = iconTint, modifier = Modifier.size(20.dp))
        }
        Column(modifier = Modifier.fillMaxWidth()) {
            Text(label, color = MutedText, fontSize = 12.sp)
            Text(value, color = BrandText, fontSize = 16.sp, lineHeight = 21.sp, fontWeight = FontWeight.SemiBold)
            subvalue?.let {
                Spacer(Modifier.height(2.dp))
                Text(it, color = MutedText, fontSize = 13.sp, lineHeight = 18.sp)
            }
        }
    }
}

@Composable
private fun ActionButton(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    color: Color,
    background: Color,
    border: Color,
    enabled: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.height(74.dp),
        shape = RoundedCornerShape(18.dp),
        border = BorderStroke(1.dp, border),
        colors = ButtonDefaults.outlinedButtonColors(
            containerColor = background,
            contentColor = color,
            disabledContainerColor = background,
            disabledContentColor = MutedText.copy(alpha = 0.4f)
        ),
        contentPadding = PaddingValues(horizontal = 4.dp, vertical = 8.dp)
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(21.dp))
            Text(label, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
        }
    }
}

@Composable
private fun StatusPill(status: String, modifier: Modifier = Modifier) {
    val pretty = status.replace('_', ' ').lowercase(Locale.ENGLISH).replaceFirstChar { it.titlecase(Locale.ENGLISH) }
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(999.dp))
            .background(Color(0xFFE5F8E9))
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Box(modifier = Modifier.size(12.dp).clip(CircleShape).background(Color(0xFF2AA952)))
        Text(pretty, color = Color(0xFF219653), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun CarouselDots(count: Int, selectedIndex: Int) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
        repeat(count) { index ->
            Box(
                modifier = Modifier
                    .padding(horizontal = 5.dp)
                    .size(if (index == selectedIndex) 10.dp else 8.dp)
                    .clip(CircleShape)
                    .background(if (index == selectedIndex) BrandBlue else Color(0xFFCAD0DA))
            )
        }
    }
}

private fun List<UpcomingBookingCard>.filterForTab(tab: BookingTab): List<UpcomingBookingCard> {
    val now = ZonedDateTime.now()
    return when (tab) {
        BookingTab.Future -> filter { it.canBeCancelled(now) }.sortedBy { it.sortEpochMillis() }
        BookingTab.Past -> filter { !it.isCancelled() && !it.canBeCancelled(now) }.sortedByDescending { it.sortEpochMillis() }
        BookingTab.Cancelled -> filter { it.isCancelled() }.sortedByDescending { it.sortEpochMillis() }
    }
}

private fun UpcomingBookingCard.canBeCancelled(now: ZonedDateTime = ZonedDateTime.now()): Boolean {
    val start = parseZonedDateTime(startsAt) ?: return !isCancelled()
    return !isCancelled() && start.isAfter(now)
}

private fun UpcomingBookingCard.isCancelled(): Boolean =
    status.contains("cancel", ignoreCase = true) || status.equals("NO_SHOW", ignoreCase = true)

private fun UpcomingBookingCard.sortEpochMillis(): Long =
    parseZonedDateTime(startsAt)?.toInstant()?.toEpochMilli() ?: Long.MAX_VALUE

private fun formatBookingDate(raw: String): String =
    parseZonedDateTime(raw)?.format(DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.ENGLISH)) ?: raw

private fun formatBookingTime(raw: String): String =
    parseZonedDateTime(raw)?.format(DateTimeFormatter.ofPattern("h:mm a", Locale.ENGLISH)) ?: "Time to be confirmed"

private fun formatTenantAddressLine(address: String?, city: String?): String {
    val parts = listOfNotNull(address?.trim()?.takeIf { it.isNotEmpty() }, city?.trim()?.takeIf { it.isNotEmpty() })
    return parts.joinToString(", ").ifBlank { "Location to be confirmed" }
}

private fun parseZonedDateTime(raw: String): ZonedDateTime? = runCatching {
    OffsetDateTime.parse(raw).atZoneSameInstant(ZoneId.systemDefault())
}.getOrElse {
    runCatching { LocalDateTime.parse(raw).atZone(ZoneId.systemDefault()) }.getOrNull()
}
