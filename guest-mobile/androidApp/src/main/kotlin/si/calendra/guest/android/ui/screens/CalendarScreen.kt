package si.calendra.guest.android.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AccessTime
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.FilterList
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.KeyboardArrowLeft
import androidx.compose.material.icons.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.NotificationsNone
import androidx.compose.material.icons.rounded.PersonOutline
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import si.calendra.guest.android.R
import si.calendra.guest.shared.models.TenantSummary
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.absoluteValue

private val CalendarBg = Color(0xFFF4F6FA)
private val BrandBlue = Color(0xFF176EF5)
private val BrandBlueDark = Color(0xFF0D2454)
private val TextMuted = Color(0xFF66758E)
private val SoftBorder = Color(0xFFE5EBF3)
private val SoftChip = Color(0xFFF7FAFF)

private val TenantPalette = listOf(
    Color(0xFF1D73F6),
    Color(0xFFFF7A00),
    Color(0xFF54B948),
    Color(0xFF8B50E8),
    Color(0xFF28A7B8),
    Color(0xFFE95A92)
)

private enum class CalendarTab { Month, Week, List }

private data class CalendarBooking(
    val id: String,
    val companyId: String,
    val title: String,
    val tenantName: String,
    val tenantAddress: String?,
    val consultantName: String?,
    val start: OffsetDateTime,
    val end: OffsetDateTime?,
    val color: Color
)

@Composable
fun CalendarScreen(
    modifier: Modifier = Modifier,
    bookings: List<UpcomingBookingCard>,
    tenants: List<TenantSummary>,
    languageCode: String,
    selectedTenantId: String? = null,
    onOpenBooking: (UpcomingBookingCard) -> Unit = {}
) {
    val isSl = languageCode.lowercase().startsWith("sl")
    var selectedTab by remember { mutableStateOf(CalendarTab.Month) }
    var selectedMonth by remember { mutableStateOf(YearMonth.now()) }
    var selectedDate by remember { mutableStateOf(LocalDate.now()) }
    val tenantColorById = remember(tenants) {
        tenants.mapIndexed { index, tenant -> tenant.companyId to TenantPalette[index % TenantPalette.size] }.toMap()
    }
    val calendarBookings = remember(bookings, selectedTenantId, tenants, tenantColorById) {
        bookings
            .mapNotNull { booking ->
                runCatching {
                    val start = parseBookingDateTime(booking.startsAt)
                    val end = booking.endsAt?.let(::parseBookingDateTime)
                    CalendarBooking(
                        id = booking.id,
                        companyId = booking.companyId,
                        title = booking.title,
                        tenantName = booking.tenantName,
                        tenantAddress = booking.tenantAddress ?: booking.tenantCity,
                        consultantName = booking.consultantName,
                        start = start,
                        end = end,
                        color = tenantColorById[booking.companyId] ?: TenantPalette[(booking.companyId.hashCode().absoluteValue) % TenantPalette.size]
                    )
                }.getOrNull()
            }
            .filter { selectedTenantId == null || it.companyId == selectedTenantId }
            .filter { !it.title.equals("cancelled", ignoreCase = true) }
            .sortedBy { it.start.toInstant().toEpochMilli() }
    }
    val originalById = remember(bookings) { bookings.associateBy { it.id } }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(CalendarBg)
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 6.dp, bottom = 12.dp),
            verticalArrangement = Arrangement.spacedBy(7.dp)
        ) {
            item {
                CalendarTabSelector(
                    selectedTab = selectedTab,
                    isSl = isSl,
                    onSelected = { selectedTab = it }
                )
            }
            when (selectedTab) {
                CalendarTab.Month -> {
                    item {
                        MonthCalendarCard(
                            month = selectedMonth,
                            selectedDate = selectedDate,
                            bookings = calendarBookings,
                            isSl = isSl,
                            onPrevious = { selectedMonth = selectedMonth.minusMonths(1) },
                            onNext = { selectedMonth = selectedMonth.plusMonths(1) },
                            onDateSelected = { selectedDate = it }
                        )
                    }
                    item {
                        UpcomingMonthList(
                            selectedDate = selectedDate,
                            bookings = calendarBookings,
                            originalById = originalById,
                            isSl = isSl,
                            onOpenBooking = onOpenBooking
                        )
                    }
                }
                CalendarTab.Week -> {
                    item {
                        WeekCalendarView(
                            selectedDate = selectedDate,
                            bookings = calendarBookings,
                            tenants = tenants,
                            selectedTenantId = selectedTenantId,
                            isSl = isSl,
                            onDateSelected = { selectedDate = it },
                            onPreviousWeek = { selectedDate = selectedDate.minusWeeks(1) },
                            onNextWeek = { selectedDate = selectedDate.plusWeeks(1) }
                        )
                    }
                }
                CalendarTab.List -> {
                    item {
                        ListCalendarView(
                            selectedDate = selectedDate,
                            bookings = calendarBookings,
                            originalById = originalById,
                            isSl = isSl,
                            onDateSelected = { selectedDate = it },
                            onPreviousWeek = { selectedDate = selectedDate.minusWeeks(1) },
                            onNextWeek = { selectedDate = selectedDate.plusWeeks(1) },
                            onOpenBooking = onOpenBooking
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun CalendarHeader(
    tenants: List<TenantSummary>,
    selectedTenantId: String?,
    isSl: Boolean,
    unreadNotificationCount: Int,
    onTenantSelected: (String?) -> Unit,
    onOpenNotifications: () -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    val title = selectedTenantId
        ?.let { id -> tenants.firstOrNull { it.companyId == id }?.companyName }
        ?: if (isSl) "Vsi ponudniki" else "All providers"

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(46.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Image(
            painter = painterResource(id = R.drawable.calendra_book_logo),
            contentDescription = "Calendra Book",
            modifier = Modifier
                .height(30.dp)
                .width(104.dp),
            contentScale = ContentScale.Fit
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box {
                OutlinedButton(
                    onClick = { expanded = true },
                    shape = RoundedCornerShape(18.dp),
                    border = BorderStroke(1.2.dp, BrandBlue),
                    colors = androidx.compose.material3.ButtonDefaults.outlinedButtonColors(
                        containerColor = Color.White,
                        contentColor = BrandBlue
                    ),
                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 0.dp),
                    modifier = Modifier
                        .height(34.dp)
                        .widthIn(min = 118.dp, max = 148.dp)
                ) {
                    Icon(Icons.Rounded.PersonOutline, contentDescription = null, modifier = Modifier.size(14.dp))
                    Spacer(Modifier.width(5.dp))
                    Text(
                        title,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Spacer(Modifier.width(2.dp))
                    Icon(Icons.Rounded.KeyboardArrowDown, contentDescription = null, modifier = Modifier.size(16.dp))
                }
                DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                    DropdownMenuItem(
                        text = { Text(if (isSl) "Vsi ponudniki" else "All providers") },
                        onClick = {
                            expanded = false
                            onTenantSelected(null)
                        }
                    )
                    tenants.forEach { tenant ->
                        DropdownMenuItem(
                            text = { Text(tenant.companyName) },
                            onClick = {
                                expanded = false
                                onTenantSelected(tenant.companyId)
                            }
                        )
                    }
                }
            }
            BadgedBox(
                badge = {
                    if (unreadNotificationCount > 0) {
                        Badge { Text(unreadNotificationCount.coerceAtMost(99).toString()) }
                    }
                }
            ) {
                IconButton(onClick = onOpenNotifications, modifier = Modifier.size(34.dp)) {
                    Icon(
                        Icons.Rounded.NotificationsNone,
                        contentDescription = if (isSl) "Obvestila" else "Notifications",
                        tint = BrandBlueDark,
                        modifier = Modifier.size(19.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun CalendarTabSelector(
    selectedTab: CalendarTab,
    isSl: Boolean,
    onSelected: (CalendarTab) -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth().height(50.dp),
        shape = RoundedCornerShape(18.dp),
        color = Color.White,
        shadowElevation = 4.dp
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            CalendarSegment(
                label = if (isSl) "Mesec" else "Month",
                selected = selectedTab == CalendarTab.Month,
                onClick = { onSelected(CalendarTab.Month) },
                modifier = Modifier.weight(1f)
            )
            CalendarSegment(
                label = if (isSl) "Teden" else "Week",
                selected = selectedTab == CalendarTab.Week,
                onClick = { onSelected(CalendarTab.Week) },
                modifier = Modifier.weight(1f)
            )
            CalendarSegment(
                label = if (isSl) "Seznam" else "List",
                selected = selectedTab == CalendarTab.List,
                onClick = { onSelected(CalendarTab.List) },
                modifier = Modifier.weight(1f)
            )
        }
    }
}

@Composable
private fun CalendarSegment(label: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.clickable(onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            label,
            fontSize = 12.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
            color = if (selected) BrandBlue else TextMuted,
            modifier = Modifier.padding(top = 5.dp, bottom = 5.dp)
        )
        Box(
            modifier = Modifier
                .width(72.dp)
                .height(3.dp)
                .clip(RoundedCornerShape(topStart = 4.dp, topEnd = 4.dp))
                .background(if (selected) BrandBlue else Color.Transparent)
        )
    }
}

@Composable
private fun MonthCalendarCard(
    month: YearMonth,
    selectedDate: LocalDate,
    bookings: List<CalendarBooking>,
    isSl: Boolean,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onDateSelected: (LocalDate) -> Unit
) {
    val byDate = remember(bookings) { bookings.groupBy { it.start.toLocalDate() } }
    ElevatedCard(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.elevatedCardColors(containerColor = Color.White),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 4.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(start = 10.dp, end = 10.dp, top = 11.dp, bottom = 10.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                CircularArrow(onClick = onPrevious, left = true)
                Text(
                    monthTitle(month, isSl),
                    fontSize = 16.sp,
                    lineHeight = 18.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = BrandBlueDark
                )
                CircularArrow(onClick = onNext, left = false)
            }
            WeekdayHeader(isSl = isSl)
            val cells = remember(month) { monthCells(month) }
            Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
                cells.chunked(7).forEach { week ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        week.forEach { day ->
                            MonthDayCell(
                                date = day,
                                inMonth = day.month == month.month,
                                selected = day == selectedDate,
                                bookings = byDate[day].orEmpty(),
                                onClick = { onDateSelected(day) },
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }
                }
            }
            HorizontalDivider(color = SoftBorder)
            TenantLegend(bookings = bookings, isSl = isSl)
        }
    }
}

@Composable
private fun CircularArrow(onClick: () -> Unit, left: Boolean) {
    Surface(
        onClick = onClick,
        shape = CircleShape,
        color = Color.White,
        border = BorderStroke(1.dp, SoftBorder),
        shadowElevation = 0.dp,
        modifier = Modifier.size(30.dp)
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(
                if (left) Icons.Rounded.KeyboardArrowLeft else Icons.Rounded.KeyboardArrowRight,
                contentDescription = null,
                tint = BrandBlue,
                modifier = Modifier.size(19.dp)
            )
        }
    }
}

@Composable
private fun WeekdayHeader(isSl: Boolean) {
    val days = if (isSl) listOf("Pon", "Tor", "Sre", "Čet", "Pet", "Sob", "Ned") else listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
    Row(Modifier.fillMaxWidth()) {
        days.forEach { label ->
            Text(
                label,
                modifier = Modifier.weight(1f),
                textAlign = TextAlign.Center,
                fontSize = 9.sp,
                fontWeight = FontWeight.Bold,
                color = TextMuted
            )
        }
    }
}

@Composable
private fun MonthDayCell(
    date: LocalDate,
    inMonth: Boolean,
    selected: Boolean,
    bookings: List<CalendarBooking>,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .height(34.dp)
            .clickable(onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Box(
            modifier = Modifier
                .size(28.dp)
                .clip(CircleShape)
                .background(if (selected) BrandBlue else Color.Transparent),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Text(
                    date.dayOfMonth.toString(),
                    fontSize = if (selected) 12.sp else 11.sp,
                    fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                    color = when {
                        selected -> Color.White
                        inMonth -> Color(0xFF172033)
                        else -> Color(0xFFAAB3C1)
                    }
                )
                if (bookings.isNotEmpty()) {
                    Row(horizontalArrangement = Arrangement.spacedBy(2.dp), modifier = Modifier.padding(top = 1.dp)) {
                        bookings.take(3).forEach { booking ->
                            Box(
                                modifier = Modifier
                                    .size(if (selected) 3.dp else 4.dp)
                                    .clip(CircleShape)
                                    .background(if (selected) Color.White else booking.color)
                            )
                        }
                    }
                } else {
                    Spacer(Modifier.height(4.dp))
                }
            }
        }
    }
}

@Composable
private fun TenantLegend(bookings: List<CalendarBooking>, isSl: Boolean) {
    val tenants = bookings.distinctBy { it.companyId }.take(4)
    if (tenants.isEmpty()) return
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        tenants.forEach { booking ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(6.dp)
                        .clip(CircleShape)
                        .background(booking.color)
                )
                Spacer(Modifier.width(5.dp))
                Text(booking.tenantName, fontSize = 9.sp, color = TextMuted, maxLines = 1)
            }
        }
        Text(if (isSl) "Uredi" else "Edit", color = BrandBlue, fontSize = 10.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun UpcomingMonthList(
    selectedDate: LocalDate,
    bookings: List<CalendarBooking>,
    originalById: Map<String, UpcomingBookingCard>,
    isSl: Boolean,
    onOpenBooking: (UpcomingBookingCard) -> Unit
) {
    val selectedBookings = bookings.filter { it.start.toLocalDate() == selectedDate }
    val nextBookings = if (selectedBookings.isNotEmpty()) selectedBookings else bookings.filter { !it.start.toLocalDate().isBefore(selectedDate) }.take(3)
    Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
        Text(
            if (selectedBookings.isNotEmpty()) dateTitle(selectedDate, isSl) else if (isSl) "Prihajajoči termini" else "Upcoming sessions",
            fontSize = 15.sp,
            fontWeight = FontWeight.ExtraBold,
            color = BrandBlueDark,
            modifier = Modifier.padding(start = 1.dp)
        )
        if (nextBookings.isEmpty()) {
            EmptyCalendarCard(isSl)
        } else {
            nextBookings.forEach { booking ->
                SessionListCard(
                    booking = booking,
                    compact = false,
                    onClick = { originalById[booking.id]?.let(onOpenBooking) }
                )
            }
            TextButton(
                onClick = {},
                modifier = Modifier.align(Alignment.CenterHorizontally)
            ) {
                Text(if (isSl) "Poglej vse termine" else "View all sessions", color = BrandBlue, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                Icon(Icons.Rounded.KeyboardArrowRight, contentDescription = null, tint = BrandBlue, modifier = Modifier.size(16.dp))
            }
        }
    }
}

@Composable
private fun WeekCalendarView(
    selectedDate: LocalDate,
    bookings: List<CalendarBooking>,
    tenants: List<TenantSummary>,
    selectedTenantId: String?,
    isSl: Boolean,
    onDateSelected: (LocalDate) -> Unit,
    onPreviousWeek: () -> Unit,
    onNextWeek: () -> Unit
) {
    val week = remember(selectedDate) { weekDates(selectedDate) }
    val dayBookings = bookings.filter { it.start.toLocalDate() == selectedDate }
    Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
        WeekStripCard(
            selectedDate = selectedDate,
            week = week,
            bookings = bookings,
            isSl = isSl,
            onDateSelected = onDateSelected,
            onPreviousWeek = onPreviousWeek,
            onNextWeek = onNextWeek,
            largeSelected = true
        )
        WeekFilterChips(
            tenants = tenants,
            selectedTenantId = selectedTenantId,
            bookings = bookings,
            isSl = isSl
        )
        TimelineCard(bookings = dayBookings, isSl = isSl)
        ElevatedCard(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.elevatedCardColors(containerColor = Color.White),
            elevation = CardDefaults.elevatedCardElevation(defaultElevation = 3.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Surface(shape = CircleShape, color = Color(0xFFE8F1FF), modifier = Modifier.size(34.dp)) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(Icons.Rounded.CalendarMonth, contentDescription = null, tint = BrandBlue, modifier = Modifier.size(16.dp))
                    }
                }
                Spacer(Modifier.width(6.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        if (isSl) "${dayBookings.size} termini ta dan" else "${dayBookings.size} sessions today",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = BrandBlueDark
                    )
                    Text(
                        nextSessionLine(dayBookings, isSl),
                        fontSize = 10.sp,
                        color = TextMuted
                    )
                }
                Text(if (isSl) "Poglej vse" else "View all", color = BrandBlue, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                Icon(Icons.Rounded.KeyboardArrowRight, contentDescription = null, tint = BrandBlue, modifier = Modifier.size(16.dp))
            }
        }
    }
}

@Composable
private fun WeekStripCard(
    selectedDate: LocalDate,
    week: List<LocalDate>,
    bookings: List<CalendarBooking>,
    isSl: Boolean,
    onDateSelected: (LocalDate) -> Unit,
    onPreviousWeek: () -> Unit,
    onNextWeek: () -> Unit,
    largeSelected: Boolean
) {
    val byDate = remember(bookings) { bookings.groupBy { it.start.toLocalDate() } }
    ElevatedCard(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.elevatedCardColors(containerColor = Color.White),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 3.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 3.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onPreviousWeek, modifier = Modifier.size(26.dp)) {
                Icon(Icons.Rounded.KeyboardArrowLeft, contentDescription = null, tint = BrandBlue)
            }
            week.forEach { date ->
                WeekDayPill(
                    date = date,
                    selected = date == selectedDate,
                    bookings = byDate[date].orEmpty(),
                    isSl = isSl,
                    largeSelected = largeSelected,
                    onClick = { onDateSelected(date) },
                    modifier = Modifier.weight(1f)
                )
            }
            IconButton(onClick = onNextWeek, modifier = Modifier.size(26.dp)) {
                Icon(Icons.Rounded.KeyboardArrowRight, contentDescription = null, tint = BrandBlue)
            }
        }
    }
}

@Composable
private fun WeekDayPill(
    date: LocalDate,
    selected: Boolean,
    bookings: List<CalendarBooking>,
    isSl: Boolean,
    largeSelected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val shape = RoundedCornerShape(14.dp)
    Column(
        modifier = modifier
            .height(if (largeSelected && selected) 52.dp else 44.dp)
            .clip(shape)
            .background(if (selected) BrandBlue else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(vertical = 3.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            shortWeekday(date, isSl).uppercase(Locale.getDefault()),
            fontSize = 8.sp,
            fontWeight = FontWeight.Bold,
            color = if (selected) Color.White else TextMuted
        )
        Text(
            date.dayOfMonth.toString(),
            fontSize = if (selected) 15.sp else 13.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
            color = if (selected) Color.White else BrandBlueDark
        )
        Row(horizontalArrangement = Arrangement.spacedBy(2.dp), modifier = Modifier.padding(top = 1.dp)) {
            if (selected) {
                Box(Modifier.size(4.dp).clip(CircleShape).background(Color.White))
            } else {
                bookings.take(2).forEach { booking ->
                    Box(Modifier.size(3.dp).clip(CircleShape).background(booking.color))
                }
            }
        }
    }
}

@Composable
private fun WeekFilterChips(
    tenants: List<TenantSummary>,
    selectedTenantId: String?,
    bookings: List<CalendarBooking>,
    isSl: Boolean
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        FilterChipLike(label = if (isSl) "Vsi" else "All", selected = selectedTenantId == null, leading = {
            Icon(Icons.Rounded.FilterList, contentDescription = null, modifier = Modifier.size(12.dp))
        })
        FilterChipLike(label = if (isSl) "Danes" else "Today", selected = false)
        FilterChipLike(label = if (isSl) "Ta teden" else "This week", selected = false)
        tenants.take(4).forEach { tenant ->
            val color = bookings.firstOrNull { it.companyId == tenant.companyId }?.color ?: BrandBlue
            FilterChipLike(label = tenant.companyName, selected = false, dot = color)
        }
    }
}

@Composable
private fun FilterChipLike(
    label: String,
    selected: Boolean,
    dot: Color? = null,
    leading: (@Composable () -> Unit)? = null
) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = if (selected) Color(0xFFEAF2FF) else Color.White,
        border = BorderStroke(1.dp, if (selected) BrandBlue else SoftBorder),
        shadowElevation = 0.dp
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 9.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            leading?.invoke()
            dot?.let { Box(Modifier.size(6.dp).clip(CircleShape).background(it)) }
            Text(label, color = if (selected) BrandBlue else BrandBlueDark, fontWeight = FontWeight.SemiBold, fontSize = 10.sp)
        }
    }
}

@Composable
private fun TimelineCard(bookings: List<CalendarBooking>, isSl: Boolean) {
    ElevatedCard(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.elevatedCardColors(containerColor = Color.White),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 3.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(0.dp)
        ) {
            val hours = (8..18).toList()
            hours.forEach { hour ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(38.dp),
                    verticalAlignment = Alignment.Top
                ) {
                    Text(
                        String.format(Locale.getDefault(), "%02d:00", hour),
                        modifier = Modifier.width(42.dp).padding(top = 1.dp),
                        color = TextMuted,
                        fontSize = 10.sp
                    )
                    Box(Modifier.weight(1f)) {
                        HorizontalDivider(color = Color(0xFFE3E9F2), modifier = Modifier.padding(top = 9.dp))
                        bookings.filter { it.start.hour == hour }.forEach { booking ->
                            TimelineBookingCard(booking = booking, isSl = isSl)
                        }
                        if (hour == 9) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(top = 16.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Surface(shape = RoundedCornerShape(99.dp), color = BrandBlue) {
                                    Text("09:32", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp))
                                }
                                Box(Modifier.height(1.5.dp).weight(1f).background(BrandBlue.copy(alpha = 0.65f)))
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TimelineBookingCard(booking: CalendarBooking, isSl: Boolean) {
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = booking.color.copy(alpha = 0.13f),
        border = BorderStroke(1.dp, booking.color.copy(alpha = 0.45f)),
        modifier = Modifier
            .fillMaxWidth()
            .height(34.dp)
            .padding(start = 3.dp, end = 3.dp)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Icon(Icons.Rounded.CalendarMonth, contentDescription = null, tint = booking.color, modifier = Modifier.size(16.dp))
            Column(Modifier.weight(1f)) {
                Text(booking.title, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, color = BrandBlueDark, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(booking.tenantName, fontSize = 9.sp, color = TextMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Text(timeRange(booking, isSl), fontSize = 9.sp, color = BrandBlueDark, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun ListCalendarView(
    selectedDate: LocalDate,
    bookings: List<CalendarBooking>,
    originalById: Map<String, UpcomingBookingCard>,
    isSl: Boolean,
    onDateSelected: (LocalDate) -> Unit,
    onPreviousWeek: () -> Unit,
    onNextWeek: () -> Unit,
    onOpenBooking: (UpcomingBookingCard) -> Unit
) {
    val week = remember(selectedDate) { weekDates(selectedDate) }
    val grouped = bookings
        .filter { !it.start.toLocalDate().isBefore(selectedDate.minusDays(1)) }
        .take(10)
        .groupBy { it.start.toLocalDate() }
    Box {
        Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
            WeekStripCard(
                selectedDate = selectedDate,
                week = week,
                bookings = bookings,
                isSl = isSl,
                onDateSelected = onDateSelected,
                onPreviousWeek = onPreviousWeek,
                onNextWeek = onNextWeek,
                largeSelected = false
            )
            if (grouped.isEmpty()) {
                EmptyCalendarCard(isSl)
            } else {
                grouped.forEach { (date, dateBookings) ->
                    ListDayGroup(
                        date = date,
                        bookings = dateBookings,
                        originalById = originalById,
                        isSl = isSl,
                        onOpenBooking = onOpenBooking
                    )
                }
            }
            Spacer(Modifier.height(34.dp))
        }
        Surface(
            shape = RoundedCornerShape(16.dp),
            color = BrandBlue,
            shadowElevation = 12.dp,
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(bottom = 6.dp)
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 11.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Icon(Icons.Rounded.FilterList, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
                Text(if (isSl) "Filtri" else "Filters", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 11.sp)
            }
        }
    }
}

@Composable
private fun ListDayGroup(
    date: LocalDate,
    bookings: List<CalendarBooking>,
    originalById: Map<String, UpcomingBookingCard>,
    isSl: Boolean,
    onOpenBooking: (UpcomingBookingCard) -> Unit
) {
    ElevatedCard(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.elevatedCardColors(containerColor = Color.White),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 2.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(10.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Rounded.CalendarMonth, contentDescription = null, tint = BrandBlue, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text(
                    listGroupTitle(date, isSl),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = BrandBlueDark,
                    modifier = Modifier.weight(1f)
                )
                Surface(shape = CircleShape, color = Color(0xFFF0F2F5)) {
                    Text(bookings.size.toString(), modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp), fontWeight = FontWeight.Bold, color = TextMuted)
                }
            }
            bookings.forEach { booking ->
                SessionListCard(
                    booking = booking,
                    compact = true,
                    onClick = { originalById[booking.id]?.let(onOpenBooking) }
                )
            }
        }
    }
}

@Composable
private fun SessionListCard(booking: CalendarBooking, compact: Boolean, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(if (compact) 11.dp else 13.dp),
        color = Color.White,
        border = BorderStroke(1.dp, SoftBorder),
        shadowElevation = if (compact) 0.dp else 2.dp,
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = if (compact) 8.dp else 9.dp, vertical = if (compact) 7.dp else 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .width(4.dp)
                    .height(if (compact) 36.dp else 44.dp)
                    .clip(RoundedCornerShape(99.dp))
                    .background(booking.color)
            )
            Spacer(Modifier.width(7.dp))
            Column(
                modifier = Modifier.width(if (compact) 50.dp else 60.dp),
                horizontalAlignment = Alignment.Start
            ) {
                Text(
                    booking.start.format(DateTimeFormatter.ofPattern("HH:mm")),
                    fontSize = if (compact) 12.sp else 15.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = booking.color
                )
                Text(
                    durationLabel(booking),
                    fontSize = 9.sp,
                    color = TextMuted,
                    fontWeight = FontWeight.Medium
                )
            }
            Box(
                modifier = Modifier
                    .height(if (compact) 34.dp else 40.dp)
                    .width(1.dp)
                    .background(SoftBorder)
            )
            Spacer(Modifier.width(7.dp))
            Surface(shape = CircleShape, color = booking.color.copy(alpha = 0.10f), modifier = Modifier.size(if (compact) 28.dp else 32.dp)) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(Icons.Rounded.CalendarMonth, contentDescription = null, tint = booking.color, modifier = Modifier.size(16.dp))
                }
            }
            Spacer(Modifier.width(7.dp))
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                Text(booking.title, fontSize = if (compact) 11.sp else 13.sp, fontWeight = FontWeight.ExtraBold, color = BrandBlueDark, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(booking.consultantName ?: booking.tenantName, fontSize = 10.sp, color = BrandBlue, maxLines = 1, overflow = TextOverflow.Ellipsis)
                booking.tenantAddress?.let {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Rounded.LocationOn, contentDescription = null, tint = TextMuted, modifier = Modifier.size(11.dp))
                        Spacer(Modifier.width(2.dp))
                        Text(it, fontSize = 9.sp, color = TextMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
            Icon(Icons.Rounded.KeyboardArrowRight, contentDescription = null, tint = TextMuted, modifier = Modifier.size(17.dp))
        }
    }
}

@Composable
private fun EmptyCalendarCard(isSl: Boolean) {
    ElevatedCard(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.elevatedCardColors(containerColor = Color.White),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 4.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Surface(shape = CircleShape, color = Color(0xFFEAF2FF), modifier = Modifier.size(36.dp)) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(Icons.Rounded.CalendarMonth, contentDescription = null, tint = BrandBlue, modifier = Modifier.size(16.dp))
                }
            }
            Text(if (isSl) "Ni terminov" else "No sessions", fontSize = 13.sp, fontWeight = FontWeight.ExtraBold, color = BrandBlueDark)
            Text(
                if (isSl) "Za izbrani dan trenutno ni rezervacij." else "There are no bookings for the selected day.",
                fontSize = 10.sp,
                color = TextMuted,
                textAlign = TextAlign.Center
            )
        }
    }
}

private fun parseBookingDateTime(value: String): OffsetDateTime = runCatching { OffsetDateTime.parse(value) }
    .getOrElse {
        LocalDateTime.parse(value).atOffset(OffsetDateTime.now().offset)
    }

private fun monthCells(month: YearMonth): List<LocalDate> {
    val first = month.atDay(1)
    val leading = first.dayOfWeek.value - DayOfWeek.MONDAY.value
    val gridStart = first.minusDays(leading.toLong())
    return (0 until 42).map { gridStart.plusDays(it.toLong()) }
}

private fun weekDates(selectedDate: LocalDate): List<LocalDate> {
    val start = selectedDate.minusDays((selectedDate.dayOfWeek.value - 1).toLong())
    return (0 until 7).map { start.plusDays(it.toLong()) }
}

private fun monthTitle(month: YearMonth, isSl: Boolean): String {
    val locale = if (isSl) Locale("sl", "SI") else Locale.ENGLISH
    val base = month.atDay(1).format(DateTimeFormatter.ofPattern("MMMM yyyy", locale))
    return base.replaceFirstChar { if (it.isLowerCase()) it.titlecase(locale) else it.toString() }
}

private fun dateTitle(date: LocalDate, isSl: Boolean): String {
    val locale = if (isSl) Locale("sl", "SI") else Locale.ENGLISH
    val pattern = if (isSl) "EEEE, d. MMMM" else "EEEE, MMM d"
    val value = date.format(DateTimeFormatter.ofPattern(pattern, locale))
    return value.replaceFirstChar { if (it.isLowerCase()) it.titlecase(locale) else it.toString() }
}

private fun listGroupTitle(date: LocalDate, isSl: Boolean): String {
    val today = LocalDate.now()
    val prefix = when (date) {
        today -> if (isSl) "Danes" else "Today"
        today.plusDays(1) -> if (isSl) "Jutri" else "Tomorrow"
        else -> date.dayOfWeek.getDisplayName(java.time.format.TextStyle.FULL, if (isSl) Locale("sl", "SI") else Locale.ENGLISH)
            .replaceFirstChar { if (it.isLowerCase()) it.titlecase(if (isSl) Locale("sl", "SI") else Locale.ENGLISH) else it.toString() }
    }
    val datePart = if (isSl) date.format(DateTimeFormatter.ofPattern("d. MMM", Locale("sl", "SI"))) else date.format(DateTimeFormatter.ofPattern("MMM d", Locale.ENGLISH))
    return "$prefix, $datePart"
}

private fun shortWeekday(date: LocalDate, isSl: Boolean): String = when (date.dayOfWeek) {
    DayOfWeek.MONDAY -> if (isSl) "Pon" else "Mon"
    DayOfWeek.TUESDAY -> if (isSl) "Tor" else "Tue"
    DayOfWeek.WEDNESDAY -> if (isSl) "Sre" else "Wed"
    DayOfWeek.THURSDAY -> if (isSl) "Čet" else "Thu"
    DayOfWeek.FRIDAY -> if (isSl) "Pet" else "Fri"
    DayOfWeek.SATURDAY -> if (isSl) "Sob" else "Sat"
    DayOfWeek.SUNDAY -> if (isSl) "Ned" else "Sun"
}

private fun durationLabel(booking: CalendarBooking): String {
    val minutes = booking.end?.let { java.time.Duration.between(booking.start, it).toMinutes() }?.takeIf { it > 0 } ?: 60
    return "${minutes} min"
}

private fun timeRange(booking: CalendarBooking, isSl: Boolean): String {
    val start = booking.start.format(DateTimeFormatter.ofPattern("HH:mm"))
    val end = booking.end?.format(DateTimeFormatter.ofPattern("HH:mm"))
    return if (end != null) "$start – $end" else start
}

private fun nextSessionLine(bookings: List<CalendarBooking>, isSl: Boolean): String {
    val next = bookings.firstOrNull() ?: return if (isSl) "Ni terminov za izbrani dan" else "No sessions for the selected day"
    val time = next.start.format(DateTimeFormatter.ofPattern("HH:mm"))
    return if (isSl) "Naslednji termin ob $time" else "Next session at $time"
}
