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
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.KeyboardArrowDown
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

private enum class BookingTab { Future, Past, Cancelled }
private enum class BookingActionMenu { Contact, Manage }

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
    val autoRenews: Boolean = false,
    val accessUrl: String? = null
)

@Composable
fun HomeScreen(
    modifier: Modifier = Modifier,
    guestFirstName: String?,
    bookings: List<UpcomingBookingCard>,
    accesses: List<AccessCard>,
    languageCode: String,
    onChooseTenant: () -> Unit,
    onOpenNotifications: () -> Unit,
    onBookNow: () -> Unit,
    onCall: (String) -> Unit,
    onSms: (String) -> Unit,
    onReschedule: (UpcomingBookingCard) -> Unit,
    onCancelBooking: (UpcomingBookingCard) -> Unit = {}
) {
    val isSl = languageCode.lowercase().startsWith("sl")
    var selectedBookingTab by remember { mutableStateOf(BookingTab.Future) }
    var bookingPendingCancel by remember { mutableStateOf<UpcomingBookingCard?>(null) }
    val filteredBookings = remember(bookings, selectedBookingTab) {
        bookings.filterForTab(selectedBookingTab).take(HERO_PREVIEW_COUNT)
    }

    bookingPendingCancel?.let { booking ->
        AlertDialog(
            onDismissRequest = { bookingPendingCancel = null },
            title = { Text(if (isSl) "Prekličem termin?" else "Cancel booking?") },
            text = {
                Text(
                    if (isSl) "S tem boste preklicali ${booking.title} dne ${formatBookingDate(booking.startsAt, isSl)}."
                    else "This will cancel ${booking.title} on ${formatBookingDate(booking.startsAt, isSl)}."
                )
            },
            confirmButton = {
                TextButton(onClick = { bookingPendingCancel = null; onCancelBooking(booking) }) {
                    Text(if (isSl) "Prekliči termin" else "Cancel booking", color = BrandBlue, fontWeight = FontWeight.SemiBold)
                }
            },
            dismissButton = { TextButton(onClick = { bookingPendingCancel = null }) { Text(if (isSl) "Obdrži termin" else "Keep booking") } }
        )
    }

    LazyColumn(
        modifier = modifier.fillMaxSize().background(HomeBg),
        userScrollEnabled = false,
        contentPadding = PaddingValues(top = 18.dp, bottom = 104.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            BookingTabsRow(
                selected = selectedBookingTab,
                isSl = isSl,
                onSelected = { selectedBookingTab = it },
                modifier = Modifier.padding(horizontal = 24.dp)
            )
        }
        item {
            when {
                filteredBookings.isEmpty() -> EmptyBookingsCard(
                    selected = selectedBookingTab,
                    isSl = isSl,
                    onBookNow = onBookNow,
                    modifier = Modifier.padding(horizontal = 24.dp)
                )
                else -> UpcomingBookingsCarousel(
                    bookings = filteredBookings,
                    onCall = onCall,
                    onSms = onSms,
                    isSl = isSl,
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
    isSl: Boolean,
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
                painter = painterResource(id = R.drawable.calendra_book_logo),
                contentDescription = "Calendra Book",
                modifier = Modifier
                    .height(38.dp)
                    .wrapContentWidth(Alignment.Start),
                contentScale = ContentScale.Fit
            )
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                AddTenantButton(label = if (isSl) "Dodaj ponudnika" else "Add tenant", onClick = onChooseTenant)
                NotificationButton(contentDescription = if (isSl) "Obvestila" else "Notifications", onClick = onOpenNotifications)
            }
        }
        Spacer(Modifier.height(2.dp))
    }
}

@Composable
private fun AddTenantButton(label: String, onClick: () -> Unit) {
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
        Text(label, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun NotificationButton(contentDescription: String, onClick: () -> Unit) {
    Box {
        IconButton(onClick = onClick, modifier = Modifier.size(34.dp)) {
            Icon(Icons.Rounded.NotificationsNone, contentDescription = contentDescription, tint = BrandText, modifier = Modifier.size(19.dp))
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
private fun BookingTabsRow(selected: BookingTab, isSl: Boolean, onSelected: (BookingTab) -> Unit, modifier: Modifier = Modifier) {
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
                        tab.label(isSl),
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
private fun EmptyBookingsCard(selected: BookingTab, isSl: Boolean, onBookNow: () -> Unit, modifier: Modifier = Modifier) {
    val title = when (selected) {
        BookingTab.Future -> if (isSl) "Ni prihajajočih terminov" else "No upcoming bookings"
        BookingTab.Past -> if (isSl) "Ni preteklih terminov" else "No past bookings"
        BookingTab.Cancelled -> if (isSl) "Ni preklicanih terminov" else "No cancelled bookings"
    }
    val subtitle = when (selected) {
        BookingTab.Future -> if (isSl) "Trenutno nimate prihodnjih terminov." else "You’re all set — there are no future bookings right now."
        BookingTab.Past -> if (isSl) "Zaključeni obiski bodo prikazani tukaj." else "Completed visits will appear here."
        BookingTab.Cancelled -> if (isSl) "Preklicani termini bodo prikazani tukaj." else "Cancelled bookings will appear here."
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
                    Text(if (isSl) "Rezerviraj zdaj" else "Book now", fontSize = 14.sp, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.height(12.dp))
            }

            Spacer(Modifier.height(24.dp))
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun UpcomingBookingsCarousel(
    bookings: List<UpcomingBookingCard>,
    onCall: (String) -> Unit,
    onSms: (String) -> Unit,
    isSl: Boolean,
    onReschedule: (UpcomingBookingCard) -> Unit,
    onCancelBooking: (UpcomingBookingCard) -> Unit
) {
    val pagerState = rememberPagerState(pageCount = { bookings.size })
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        HorizontalPager(
            state = pagerState,
            contentPadding = PaddingValues(horizontal = 26.dp),
            pageSpacing = 12.dp,
            modifier = Modifier.fillMaxWidth().height(466.dp)
        ) { page ->
            val booking = bookings[page]
            val pageOffset = ((pagerState.currentPage - page) + pagerState.currentPageOffsetFraction).absoluteValue
            UpcomingBookingFocusCard(
                booking = booking,
                onCall = onCall,
                onSms = onSms,
                onReschedule = onReschedule,
                onCancelBooking = onCancelBooking,
                isSl = isSl,
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
fun UpcomingBookingFocusCard(
    booking: UpcomingBookingCard,
    onCall: (String) -> Unit,
    onSms: (String) -> Unit,
    isSl: Boolean,
    onReschedule: (UpcomingBookingCard) -> Unit,
    onCancelBooking: (UpcomingBookingCard) -> Unit,
    modifier: Modifier = Modifier
) {
    var activeActionMenu by remember(booking.id) { mutableStateOf<BookingActionMenu?>(null) }

    Box(modifier = modifier) {
        ElevatedCard(
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.TopCenter),
            shape = RoundedCornerShape(30.dp),
            colors = CardDefaults.elevatedCardColors(containerColor = Color.White),
            elevation = CardDefaults.elevatedCardElevation(defaultElevation = 7.dp)
        ) {
            Column(Modifier.fillMaxWidth()) {
                BookingHeroHeader(booking = booking, isSl = isSl)
                BookingDateTimeStrip(booking = booking, isSl = isSl)

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 13.dp, vertical = 5.dp)
                ) {
                    BookingInfoLine(
                        icon = Icons.Rounded.Person,
                        label = if (isSl) "ZAPOSLENI" else "EMPLOYEE",
                        value = booking.consultantName?.takeIf { it.isNotBlank() } ?: if (isSl) "Bo potrjeno" else "To be confirmed"
                    )
                    HorizontalDivider(color = SoftBorder, modifier = Modifier.padding(start = 34.dp, top = 3.dp, bottom = 3.dp))
                    BookingInfoLine(
                        icon = Icons.Rounded.LocationOn,
                        label = if (isSl) "LOKACIJA" else "LOCATION",
                        value = formatTenantAddressLine(booking.tenantAddress, booking.tenantCity, isSl)
                    )
                    HorizontalDivider(color = SoftBorder, modifier = Modifier.padding(start = 34.dp, top = 3.dp, bottom = 3.dp))
                    BookingInfoLine(
                        icon = Icons.Rounded.CalendarMonth,
                        label = if (isSl) "PONUDNIK" else "TENANT",
                        value = booking.tenantName
                    )
                    Spacer(Modifier.height(4.dp))

                    BookingPrimaryActionButton(
                        label = if (isSl) "Kontakt" else "Contact",
                        icon = Icons.Rounded.Call,
                        container = BrandBlue,
                        content = Color.White,
                        border = BrandBlue,
                        onClick = { activeActionMenu = if (activeActionMenu == BookingActionMenu.Contact) null else BookingActionMenu.Contact }
                    )
                    if (activeActionMenu == BookingActionMenu.Contact) {
                        Spacer(Modifier.height(6.dp))
                        BookingActionSheet(
                            menu = BookingActionMenu.Contact,
                            isSl = isSl,
                            canContact = !booking.tenantPhone.isNullOrBlank(),
                            canManage = booking.canBeCancelled(),
                            onCall = { booking.tenantPhone?.let(onCall); activeActionMenu = null },
                            onSms = { booking.tenantPhone?.let(onSms); activeActionMenu = null },
                            onReschedule = { onReschedule(booking); activeActionMenu = null },
                            onCancel = { onCancelBooking(booking); activeActionMenu = null }
                        )
                    }
                    Spacer(Modifier.height(5.dp))
                    BookingPrimaryActionButton(
                        label = if (isSl) "Upravljaj rezervacijo" else "Manage reservation",
                        icon = Icons.Rounded.NotificationsNone,
                        container = Color.White,
                        content = BrandBlue,
                        border = BrandBlue,
                        onClick = { activeActionMenu = if (activeActionMenu == BookingActionMenu.Manage) null else BookingActionMenu.Manage }
                    )
                    if (activeActionMenu == BookingActionMenu.Manage) {
                        Spacer(Modifier.height(6.dp))
                        BookingActionSheet(
                            menu = BookingActionMenu.Manage,
                            isSl = isSl,
                            canContact = !booking.tenantPhone.isNullOrBlank(),
                            canManage = booking.canBeCancelled(),
                            onCall = { booking.tenantPhone?.let(onCall); activeActionMenu = null },
                            onSms = { booking.tenantPhone?.let(onSms); activeActionMenu = null },
                            onReschedule = { onReschedule(booking); activeActionMenu = null },
                            onCancel = { onCancelBooking(booking); activeActionMenu = null }
                        )
                    }
                }
            }
        }

    }
}

@Composable
private fun BookingHeroHeader(booking: UpcomingBookingCard, isSl: Boolean) {
    Box(modifier = Modifier.fillMaxWidth().height(154.dp)) {
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
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(Color.Black.copy(alpha = 0.15f), Color.Black.copy(alpha = 0.54f)),
                        startY = 0f,
                        endY = Float.POSITIVE_INFINITY
                    )
                )
        )

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.Top
        ) {
            StatusPill(status = booking.status, isSl = isSl)
            Spacer(Modifier.weight(1f))
        }

        Row(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 20.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(13.dp)
        ) {
            BookingLogoBubble(booking = booking)
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = booking.title,
                    color = Color.White,
                    fontSize = 22.sp,
                    lineHeight = 26.sp,
                    fontWeight = FontWeight.ExtraBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

@Composable
private fun BookingLogoBubble(booking: UpcomingBookingCard) {
    Surface(
        modifier = Modifier.size(60.dp),
        shape = CircleShape,
        color = Color(0xFF0E2558).copy(alpha = 0.82f),
        border = BorderStroke(1.dp, Color.White.copy(alpha = 0.36f))
    ) {
        Box(contentAlignment = Alignment.Center) {
            if (!booking.logoImageUrl.isNullOrBlank()) {
                AsyncImage(
                    model = booking.logoImageUrl,
                    contentDescription = null,
                    modifier = Modifier.fillMaxSize().padding(10.dp),
                    contentScale = ContentScale.Fit
                )
            } else {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("FIT", color = Color.White, fontSize = 13.sp, lineHeight = 13.sp, fontWeight = FontWeight.ExtraBold)
                    Text("LAB", color = Color.White, fontSize = 13.sp, lineHeight = 13.sp, fontWeight = FontWeight.ExtraBold)
                }
            }
        }
    }
}

@Composable
private fun BlueHeroBadge(text: String) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(BrandBlue)
            .padding(horizontal = 7.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Icon(Icons.Rounded.CalendarMonth, contentDescription = null, tint = Color.White, modifier = Modifier.size(12.dp))
        Text(text, color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun BookingDateTimeStrip(booking: UpcomingBookingCard, isSl: Boolean) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(48.dp)
            .background(Color(0xFFEAF2FF))
            .padding(horizontal = 15.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1.12f)) {
            Icon(Icons.Rounded.CalendarMonth, contentDescription = null, tint = BrandBlue, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(6.dp))
            Text(
                text = formatBookingDateCompact(booking.startsAt, isSl),
                color = BrandText,
                fontSize = 13.sp,
                lineHeight = 16.sp,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        Box(modifier = Modifier.width(1.dp).height(28.dp).background(Color(0xFFCBD7EA)))
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(0.98f).padding(start = 10.dp)) {
            Icon(Icons.Rounded.AccessTime, contentDescription = null, tint = BrandBlue, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(6.dp))
            Text(
                text = formatBookingTimeRange(booking.startsAt, booking.endsAt, isSl),
                color = BrandText,
                fontSize = 13.sp,
                lineHeight = 16.sp,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
private fun BookingInfoLine(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    value: String
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(9.dp)
    ) {
        Icon(icon, contentDescription = null, tint = Color(0xFF6F7D91), modifier = Modifier.size(20.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(label, color = MutedText, fontSize = 11.sp, lineHeight = 13.sp, fontWeight = FontWeight.Bold)
            Text(
                value,
                color = BrandText,
                fontSize = 13.sp,
                lineHeight = 17.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
private fun BookingPrimaryActionButton(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    container: Color,
    content: Color,
    border: Color,
    onClick: () -> Unit
) {
    Button(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().height(44.dp),
        shape = RoundedCornerShape(9.dp),
        colors = ButtonDefaults.buttonColors(containerColor = container, contentColor = content),
        border = BorderStroke(1.dp, border),
        contentPadding = PaddingValues(horizontal = 12.dp)
    ) {
        Spacer(Modifier.weight(1f))
        Icon(icon, contentDescription = null, modifier = Modifier.size(15.dp))
        Spacer(Modifier.width(5.dp))
        Text(label, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.width(6.dp))
        Icon(Icons.Rounded.KeyboardArrowDown, contentDescription = null, modifier = Modifier.size(17.dp))
        Spacer(Modifier.weight(1f))
    }
}

@Composable
private fun BookingActionSheet(
    menu: BookingActionMenu,
    isSl: Boolean,
    canContact: Boolean,
    canManage: Boolean,
    onCall: () -> Unit,
    onSms: () -> Unit,
    onReschedule: () -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        color = Color.White,
        shadowElevation = 10.dp,
        border = BorderStroke(1.dp, SoftBorder)
    ) {
        Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)) {
            Box(
                modifier = Modifier
                    .align(Alignment.CenterHorizontally)
                    .width(38.dp)
                    .height(3.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(Color(0xFFD8DEE8))
            )
            Spacer(Modifier.height(6.dp))
            when (menu) {
                BookingActionMenu.Contact -> {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        SheetOptionButton(
                            label = if (isSl) "Kliči" else "Call",
                            icon = Icons.Rounded.Call,
                            color = BrandBlue,
                            enabled = canContact,
                            modifier = Modifier.weight(1f),
                            onClick = onCall
                        )
                        SheetOptionButton(
                            label = "SMS",
                            icon = Icons.Rounded.Message,
                            color = BrandBlue,
                            enabled = canContact,
                            modifier = Modifier.weight(1f),
                            onClick = onSms
                        )
                    }
                }
                BookingActionMenu.Manage -> {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        SheetOptionButton(
                            label = if (isSl) "Prestavi termin" else "Reschedule",
                            icon = Icons.Rounded.Schedule,
                            color = BrandBlue,
                            enabled = canManage,
                            modifier = Modifier.weight(1f),
                            onClick = onReschedule
                        )
                        SheetOptionButton(
                            label = if (isSl) "Odpovej termin" else "Cancel booked session",
                            icon = Icons.Rounded.Delete,
                            color = Color(0xFFE53935),
                            enabled = canManage,
                            modifier = Modifier.weight(1f),
                            onClick = onCancel
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SheetOptionButton(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    color: Color,
    enabled: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.height(38.dp),
        shape = RoundedCornerShape(9.dp),
        border = BorderStroke(1.dp, SoftBorder),
        colors = ButtonDefaults.outlinedButtonColors(
            containerColor = Color.White,
            contentColor = color,
            disabledContentColor = MutedText.copy(alpha = 0.45f),
            disabledContainerColor = Color.White
        ),
        contentPadding = PaddingValues(horizontal = 5.dp)
    ) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(15.dp))
        Spacer(Modifier.width(5.dp))
        Text(label, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun CompactMetaItem(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
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
            Icon(icon, contentDescription = null, modifier = Modifier.size(16.dp))
            Text(label, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
        }
    }
}

@Composable
private fun StatusPill(status: String, isSl: Boolean, modifier: Modifier = Modifier) {
    val pretty = translatedStatus(status, isSl)
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(999.dp))
            .background(Color(0xFFE5F8E9))
            .padding(horizontal = 8.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp)
    ) {
        Icon(Icons.Rounded.CheckCircle, contentDescription = null, tint = Color(0xFF219653), modifier = Modifier.size(12.dp))
        Text(pretty, color = Color(0xFF219653), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
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

private fun BookingTab.label(isSl: Boolean): String = when (this) {
    BookingTab.Future -> if (isSl) "Prihodnji" else "Future"
    BookingTab.Past -> if (isSl) "Pretekli" else "Past"
    BookingTab.Cancelled -> if (isSl) "Preklicani" else "Cancelled"
}

private fun formatBookingDateCompact(raw: String, isSl: Boolean): String {
    val locale = if (isSl) Locale("sl", "SI") else Locale.ENGLISH
    val pattern = if (isSl) "EEE, d. MMM" else "EEE, MMM d"
    val formatted = parseZonedDateTime(raw)?.format(DateTimeFormatter.ofPattern(pattern, locale)) ?: raw
    return formatted
        .replace(".,", ",")
        .replaceFirstChar { if (it.isLowerCase()) it.titlecase(locale) else it.toString() }
}

private fun formatBookingTimeRange(startsAt: String, endsAt: String?, isSl: Boolean): String {
    val locale = if (isSl) Locale("sl", "SI") else Locale.ENGLISH
    val pattern = if (isSl) "HH:mm" else "h:mm a"
    val start = parseZonedDateTime(startsAt)
    val end = endsAt?.let { parseZonedDateTime(it) }
    return when {
        start != null && end != null -> "${start.format(DateTimeFormatter.ofPattern(pattern, locale))}–${end.format(DateTimeFormatter.ofPattern(pattern, locale))}"
        start != null -> start.format(DateTimeFormatter.ofPattern(pattern, locale))
        else -> if (isSl) "Ura še ni potrjena" else "Time to be confirmed"
    }
}

private fun formatBookingDate(raw: String, isSl: Boolean): String {
    val locale = if (isSl) Locale("sl", "SI") else Locale.ENGLISH
    val pattern = if (isSl) "d. MMM yyyy" else "MMM d, yyyy"
    return parseZonedDateTime(raw)?.format(DateTimeFormatter.ofPattern(pattern, locale)) ?: raw
}

private fun formatBookingTime(raw: String, isSl: Boolean): String {
    val locale = if (isSl) Locale("sl", "SI") else Locale.ENGLISH
    val pattern = if (isSl) "HH:mm" else "h:mm a"
    return parseZonedDateTime(raw)?.format(DateTimeFormatter.ofPattern(pattern, locale))
        ?: if (isSl) "Ura še ni potrjena" else "Time to be confirmed"
}

private fun formatTenantAddressLine(address: String?, city: String?, isSl: Boolean): String {
    val parts = listOfNotNull(address?.trim()?.takeIf { it.isNotEmpty() }, city?.trim()?.takeIf { it.isNotEmpty() })
    return parts.joinToString(", ").ifBlank { if (isSl) "Lokacija še ni potrjena" else "Location to be confirmed" }
}

private fun translatedStatus(raw: String, isSl: Boolean): String {
    val normalized = raw.trim().replace('_', ' ').lowercase(Locale.ENGLISH)
    if (!isSl) return normalized.replaceFirstChar { it.titlecase(Locale.ENGLISH) }
    return when {
        normalized.contains("cancel") -> "Preklicano"
        normalized == "no show" -> "Ni prišel"
        normalized.contains("reserve") -> "Rezervirano"
        normalized.contains("confirm") || normalized.contains("book") || normalized.contains("scheduled") -> "Potrjeno"
        normalized.contains("pending") -> "V čakanju"
        normalized.contains("complete") || normalized.contains("finished") -> "Zaključeno"
        else -> normalized.replaceFirstChar { it.titlecase(Locale("sl", "SI")) }
    }
}

private fun parseZonedDateTime(raw: String): ZonedDateTime? = runCatching {
    OffsetDateTime.parse(raw).atZoneSameInstant(ZoneId.systemDefault())
}.getOrElse {
    runCatching { LocalDateTime.parse(raw).atZone(ZoneId.systemDefault()) }.getOrNull()
}
