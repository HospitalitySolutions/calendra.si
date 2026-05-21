package si.calendra.guest.android.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AccessTime
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.Call
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.Layers
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.Message
import androidx.compose.material.icons.rounded.NotificationsNone
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Storefront
import androidx.compose.material3.*
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.util.lerp
import androidx.compose.ui.res.painterResource
import coil.compose.AsyncImage
import si.calendra.guest.android.R
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale
import kotlin.math.absoluteValue

private const val HERO_PREVIEW_COUNT = 5

private val LoginBlue = Color(0xFF0568F5)
private val LoginBlueSoft = Color(0xFFE6F1FF)
private val LoginBorder = Color(0xFFD3DEEC)
private val LoginDark = Color(0xFF071735)


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
                TextButton(
                    onClick = {
                        bookingPendingCancel = null
                        onCancelBooking(booking)
                    }
                ) {
                    Text("Cancel booking", color = LoginBlue, fontWeight = FontWeight.SemiBold)
                }
            },
            dismissButton = {
                TextButton(onClick = { bookingPendingCancel = null }) { Text("Keep booking") }
            }
        )
    }

    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(
                        Color(0xFFF5FAFF),
                        Color(0xFFE8F2FF),
                        Color(0xFFFFFFFF)
                    )
                )
            ),
        userScrollEnabled = false,
        contentPadding = PaddingValues(top = 12.dp, bottom = 104.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            HomeHeader(
                guestFirstName = guestFirstName,
                onChooseTenant = onChooseTenant,
                onOpenNotifications = onOpenNotifications,
                modifier = Modifier.padding(horizontal = 24.dp)
            )
        }

        if (bookings.isEmpty()) {
            item {
                EmptyBookingHero(onBookNow = onBookNow)
            }
        } else {
            item {
                BookingTabsRow(
                    selected = selectedBookingTab,
                    onSelected = { selectedBookingTab = it },
                    modifier = Modifier.padding(horizontal = 24.dp)
                )
            }
            item {
                if (filteredBookings.isEmpty()) {
                    EmptyFilteredBookingsCard(
                        selected = selectedBookingTab,
                        modifier = Modifier.padding(horizontal = 24.dp)
                    )
                } else {
                    UpcomingBookingsCarousel(
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
}

@Composable
private fun HomeHeader(
    guestFirstName: String?,
    onChooseTenant: () -> Unit,
    onOpenNotifications: () -> Unit,
    modifier: Modifier = Modifier
) {
    val name = guestFirstName?.takeIf { it.isNotBlank() } ?: "there"
    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = "Hello, $name",
            fontSize = 24.sp,
            lineHeight = 28.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onBackground,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f)
        )
        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            ChooseTenantButton(onClick = onChooseTenant)
            IconButton(onClick = onOpenNotifications, modifier = Modifier.size(34.dp)) {
                Icon(
                    Icons.Rounded.NotificationsNone,
                    contentDescription = "Notifications",
                    tint = MaterialTheme.colorScheme.onBackground,
                    modifier = Modifier.size(20.dp)
                )
            }
        }
    }
}

@Composable
private fun ChooseTenantButton(onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(8.dp),
        color = Color.White,
        tonalElevation = 0.dp,
        shadowElevation = 0.dp,
        border = BorderStroke(1.dp, LoginBorder),
        modifier = Modifier.height(34.dp)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                Icons.Rounded.Storefront,
                contentDescription = null,
                modifier = Modifier.size(16.dp),
                tint = LoginDark
            )
            Text(
                text = "Add tenant",
                fontSize = 12.sp,
                lineHeight = 15.sp,
                fontWeight = FontWeight.SemiBold,
                color = LoginDark,
                maxLines = 1
            )
        }
    }
}

@Composable
private fun EmptyBookingHero(onBookNow: () -> Unit, modifier: Modifier = Modifier) {
    Image(
        painter = painterResource(id = R.drawable.home_booking_background),
        contentDescription = "Book your next appointment",
        contentScale = ContentScale.FillWidth,
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(941f / 965f)
            .clickable(onClick = onBookNow)
    )
}


@Composable
private fun BookingTabsRow(
    selected: BookingTab,
    onSelected: (BookingTab) -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        BookingTab.values().forEach { tab ->
            val active = tab == selected
            Surface(
                modifier = Modifier
                    .weight(1f)
                    .height(36.dp)
                    .clickable { onSelected(tab) },
                shape = RoundedCornerShape(0.dp),
                color = if (active) LoginBlue else Color.White.copy(alpha = 0.62f),
                border = BorderStroke(
                    1.dp,
                    if (active) LoginBlue else LoginBorder
                ),
                tonalElevation = 0.dp,
                shadowElevation = 0.dp
            ) {
                Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
                    Text(
                        text = tab.label,
                        fontSize = 13.sp,
                        lineHeight = 16.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = if (active) Color.White else LoginDark,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}

@Composable
private fun EmptyFilteredBookingsCard(selected: BookingTab, modifier: Modifier = Modifier) {
    val title = when (selected) {
        BookingTab.Future -> "No future bookings"
        BookingTab.Past -> "No past bookings"
        BookingTab.Cancelled -> "No cancelled bookings"
    }
    val body = when (selected) {
        BookingTab.Future -> "Book your next visit from the Book tab."
        BookingTab.Past -> "Completed visits will appear here."
        BookingTab.Cancelled -> "Cancelled bookings will appear here."
    }
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(0.dp),
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 6.dp,
        tonalElevation = 0.dp,
        border = BorderStroke(1.dp, Color.White.copy(alpha = 0.85f))
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 18.dp, vertical = 22.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Rounded.CalendarMonth, contentDescription = null, tint = LoginBlue, modifier = Modifier.size(22.dp))
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(title, fontSize = 18.sp, lineHeight = 22.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                Text(body, fontSize = 13.sp, lineHeight = 17.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
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
    onCancelBooking: (UpcomingBookingCard) -> Unit = {}
) {
    val pagerState = rememberPagerState(pageCount = { bookings.size })

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        HorizontalPager(
            state = pagerState,
            contentPadding = PaddingValues(horizontal = 58.dp),
            pageSpacing = (-18).dp,
            modifier = Modifier
                .fillMaxWidth()
                .height(506.dp)
        ) { page ->
            val booking = bookings[page]
            val pageOffset = ((pagerState.currentPage - page) + pagerState.currentPageOffsetFraction).absoluteValue
            val progress = 1f - pageOffset.coerceIn(0f, 1f)
            BookingCarouselCard(
                booking = booking,
                active = pageOffset < 0.5f,
                onCall = onCall,
                onSms = onSms,
                onReschedule = onReschedule,
                onCancelBooking = onCancelBooking,
                modifier = Modifier
                    .graphicsLayer {
                        val scale = lerp(0.86f, 1f, progress)
                        scaleX = scale
                        scaleY = scale
                        alpha = lerp(0.58f, 1f, progress)
                        shadowElevation = lerp(2f, 18f, progress)
                    }
                    .fillMaxWidth()
                    .fillMaxHeight()
            )
        }

        CarouselDots(count = bookings.size, selectedIndex = pagerState.currentPage)

    }
}

@Composable
private fun BookingCarouselCard(
    booking: UpcomingBookingCard,
    active: Boolean,
    onCall: (String) -> Unit,
    onSms: (String) -> Unit,
    onReschedule: (UpcomingBookingCard) -> Unit,
    onCancelBooking: (UpcomingBookingCard) -> Unit,
    modifier: Modifier = Modifier
) {
    ElevatedCard(
        modifier = modifier.fillMaxHeight(),
        shape = RoundedCornerShape(0.dp),
        colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = if (active) 12.dp else 4.dp)
    ) {
        Column(Modifier.fillMaxSize()) {
            BookingHero(
                tenantName = booking.tenantName,
                cardImageUrl = booking.cardImageUrl,
                logoImageUrl = booking.logoImageUrl,
                iconImageUrl = booking.iconImageUrl
            )
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .padding(start = 18.dp, end = 18.dp, top = 14.dp, bottom = 14.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    booking.title,
                    fontSize = 24.sp,
                    lineHeight = 28.sp,
                    color = MaterialTheme.colorScheme.onSurface,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                StatusPill(booking.status)
                HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.18f))
                BookingDetailRow(Icons.Rounded.CalendarMonth, formatBookingDate(booking.startsAt))
                BookingDetailRow(Icons.Rounded.AccessTime, formatBookingTimeRange(booking.startsAt, booking.endsAt))
                BookingDetailRow(Icons.Rounded.Storefront, booking.tenantName)
                if (!booking.consultantName.isNullOrBlank()) {
                    BookingDetailRow(Icons.Rounded.Person, booking.consultantName.trim())
                }
                BookingDetailRow(Icons.Rounded.LocationOn, formatTenantAddressLine(booking.tenantAddress, booking.tenantCity))

                Spacer(Modifier.weight(1f))

                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                    BookingContactButton(
                        label = "Call",
                        icon = { Icon(Icons.Rounded.Call, contentDescription = null, modifier = Modifier.size(18.dp)) },
                        enabled = !booking.tenantPhone.isNullOrBlank(),
                        onClick = { booking.tenantPhone?.let(onCall) },
                        modifier = Modifier.weight(1f)
                    )
                    BookingContactButton(
                        label = "SMS",
                        icon = { Icon(Icons.Rounded.Message, contentDescription = null, modifier = Modifier.size(18.dp)) },
                        enabled = !booking.tenantPhone.isNullOrBlank(),
                        onClick = { booking.tenantPhone?.let(onSms) },
                        modifier = Modifier.weight(1f)
                    )
                }

                RescheduleButton(
                    enabled = booking.canBeCancelled(),
                    onClick = { onReschedule(booking) },
                    modifier = Modifier.fillMaxWidth()
                )

                CancelBookingButton(
                    enabled = booking.canBeCancelled(),
                    onClick = { onCancelBooking(booking) },
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
    }
}

@Composable
private fun BookingHero(
    tenantName: String,
    cardImageUrl: String?,
    logoImageUrl: String?,
    iconImageUrl: String?
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(126.dp)
            .background(Color(0xFF111820))
    ) {
        Image(
            painter = painterResource(id = R.drawable.gym_booking_background),
            contentDescription = "Tenant card image",
            modifier = Modifier.matchParentSize(),
            contentScale = ContentScale.Crop
        )
        Box(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .offset(x = (-42).dp, y = 42.dp)
                .size(82.dp)
                .clip(CircleShape)
                .background(LoginBlueSoft)
                .padding(9.dp),
            contentAlignment = Alignment.Center
        ) {
            Image(
                painter = painterResource(id = R.drawable.gym_booking_icon),
                contentDescription = "Tenant icon image",
                modifier = Modifier
                    .fillMaxSize()
                    .clip(CircleShape),
                contentScale = ContentScale.Crop
            )
        }
    }
}

@Composable
private fun StatusPill(status: String, modifier: Modifier = Modifier) {
    val pretty = status.replace('_', ' ').lowercase(Locale.ENGLISH).replaceFirstChar { it.titlecase(Locale.ENGLISH) }
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(999.dp))
            .background(LoginBlueSoft.copy(alpha = 0.92f))
            .padding(horizontal = 8.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(12.dp)
                .clip(CircleShape)
                .background(LoginBlue),
            contentAlignment = Alignment.Center
        ) {
            Text("✓", style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp), color = MaterialTheme.colorScheme.onPrimary)
        }
        Text(pretty, fontSize = 13.sp, lineHeight = 16.sp, color = LoginBlue, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun BookingDetailRow(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            text,
            fontSize = 14.sp,
            lineHeight = 18.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun BookingContactButton(
    label: String,
    icon: @Composable () -> Unit,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    OutlinedButton(
        onClick = onClick,
        modifier = modifier,
        enabled = enabled,
        shape = RoundedCornerShape(0.dp),
        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 10.dp),
        border = BorderStroke(1.dp, if (enabled) LoginBlue.copy(alpha = 0.5f) else LoginBorder.copy(alpha = 0.5f)),
        colors = ButtonDefaults.outlinedButtonColors(
            containerColor = Color.White,
            contentColor = LoginBlue,
            disabledContainerColor = Color.White,
            disabledContentColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.38f)
        )
    ) {
        icon()
        Spacer(Modifier.width(7.dp))
        Text(label, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}

@Composable
private fun CancelBookingButton(enabled: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    OutlinedButton(
        modifier = modifier.height(42.dp),
        onClick = onClick,
        enabled = enabled,
        shape = RoundedCornerShape(0.dp),
        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 8.dp),
        border = BorderStroke(1.dp, if (enabled) Color(0xFFD14343) else Color(0xFFD14343).copy(alpha = 0.28f)),
        colors = ButtonDefaults.outlinedButtonColors(
            containerColor = Color.White,
            contentColor = Color(0xFFB42318),
            disabledContainerColor = Color.White,
            disabledContentColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.38f)
        )
    ) {
        Icon(Icons.Rounded.Close, contentDescription = null, modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(6.dp))
        Text("Cancel", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}

@Composable
private fun RescheduleButton(enabled: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    OutlinedButton(
        modifier = modifier.height(42.dp),
        onClick = onClick,
        enabled = enabled,
        shape = RoundedCornerShape(0.dp),
        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 10.dp),
        border = BorderStroke(1.dp, if (enabled) LoginBlue.copy(alpha = 0.5f) else LoginBorder.copy(alpha = 0.5f)),
        colors = ButtonDefaults.outlinedButtonColors(
            containerColor = Color.White,
            contentColor = LoginBlue,
            disabledContainerColor = Color.White,
            disabledContentColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.38f)
        )
    ) {
        Icon(
            Icons.Rounded.CalendarMonth,
            contentDescription = null,
            modifier = Modifier.size(16.dp)
        )
        Spacer(Modifier.width(7.dp))
        Text(
            "Reschedule",
            fontSize = 13.sp,
            lineHeight = 16.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun CarouselDots(count: Int, selectedIndex: Int) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        repeat(count) { index ->
            Box(
                modifier = Modifier
                    .padding(horizontal = 5.dp)
                    .size(if (index == selectedIndex) 8.dp else 7.dp)
                    .clip(CircleShape)
                    .background(
                        if (index == selectedIndex) LoginBlue
                        else LoginBorder.copy(alpha = 0.72f)
                    )
            )
        }
    }
}

@Composable
private fun ScopePill(text: String, dark: Boolean = false, companyAccent: Boolean = false) {
    val accentOrange = MaterialTheme.colorScheme.secondary
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(
                when {
                    dark && companyAccent -> Color.White.copy(alpha = 0.14f)
                    dark -> Color.White.copy(alpha = 0.16f)
                    else -> MaterialTheme.colorScheme.surfaceVariant
                }
            )
            .padding(horizontal = 12.dp, vertical = 7.dp)
    ) {
        Text(
            text,
            style = MaterialTheme.typography.labelLarge,
            color = when {
                dark && companyAccent -> accentOrange
                dark -> Color.White
                else -> MaterialTheme.colorScheme.onSurfaceVariant
            },
            fontWeight = FontWeight.Medium
        )
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

private data class BookingScheduleLines(val line1: String, val line2: String)

private fun parseBookingScheduleLines(raw: String): BookingScheduleLines? {
    val zoned: ZonedDateTime = runCatching {
        OffsetDateTime.parse(raw).atZoneSameInstant(ZoneId.systemDefault())
    }.getOrElse {
        runCatching {
            LocalDateTime.parse(raw).atZone(ZoneId.systemDefault())
        }.getOrElse { return null }
    }
    val locale = Locale.ENGLISH
    val line1 = zoned.format(DateTimeFormatter.ofPattern("EEEE 'at' HH:mm", locale))
    val day = zoned.dayOfMonth
    val month = zoned.month.getDisplayName(TextStyle.FULL, locale)
    val line2 = "${ordinalEnglish(day)} $month"
    return BookingScheduleLines(line1, line2)
}

private fun formatBookingDate(raw: String): String = parseZonedDateTime(raw)?.format(DateTimeFormatter.ofPattern("EEE, d MMM", Locale.ENGLISH))
    ?: runCatching { parseBookingScheduleLines(raw)?.line2 }.getOrNull()
    ?: raw

private fun formatBookingTime(raw: String): String = parseZonedDateTime(raw)?.format(DateTimeFormatter.ofPattern("HH:mm", Locale.ENGLISH)) ?: "Time to be confirmed"

private fun formatBookingTimeRange(startRaw: String, endRaw: String?): String {
    val startZ = parseZonedDateTime(startRaw) ?: return formatBookingTime(startRaw)
    val startFmt = startZ.format(DateTimeFormatter.ofPattern("HH:mm", Locale.ENGLISH))
    val endZ = endRaw?.let { parseZonedDateTime(it) } ?: return startFmt
    val endFmt = endZ.format(DateTimeFormatter.ofPattern("HH:mm", Locale.ENGLISH))
    return "$startFmt – $endFmt"
}

private fun formatTenantAddressLine(address: String?, city: String?): String {
    val parts = listOfNotNull(
        address?.trim()?.takeIf { it.isNotEmpty() },
        city?.trim()?.takeIf { it.isNotEmpty() }
    )
    return parts.joinToString(", ").ifBlank { "Location to be confirmed" }
}

private fun parseZonedDateTime(raw: String): ZonedDateTime? = runCatching {
    OffsetDateTime.parse(raw).atZoneSameInstant(ZoneId.systemDefault())
}.getOrElse {
    runCatching { LocalDateTime.parse(raw).atZone(ZoneId.systemDefault()) }.getOrNull()
}

private fun initials(name: String): String {
    val parts = name.split(' ', '-', '&').mapNotNull { it.trim().firstOrNull()?.uppercaseChar()?.toString() }
    return parts.take(2).joinToString("").ifBlank { "C" }
}

private fun ordinalEnglish(day: Int): String = when {
    day % 100 in 11..13 -> "${day}th"
    day % 10 == 1 -> "${day}st"
    day % 10 == 2 -> "${day}nd"
    day % 10 == 3 -> "${day}rd"
    else -> "${day}th"
}

private fun formatDateTime(raw: String): String = runCatching {
    OffsetDateTime.parse(raw)
        .atZoneSameInstant(ZoneId.systemDefault())
        .format(DateTimeFormatter.ofPattern("EEE, d MMM • HH:mm"))
}.getOrElse { raw }
