package si.calendra.guest.android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Call
import androidx.compose.material.icons.rounded.Message
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

data class UpcomingBookingCard(
    val id: String,
    val title: String,
    val startsAt: String,
    val status: String,
    val tenantName: String,
    val tenantCity: String?,
    val tenantPhone: String?
)

data class AccessCard(
    val id: String,
    val name: String,
    val type: String,
    val tenantName: String,
    val validUntil: String?,
    val remainingUses: Int?
)

@Composable
fun HomeScreen(
    modifier: Modifier = Modifier,
    bookings: List<UpcomingBookingCard>,
    accesses: List<AccessCard>,
    onCall: (String) -> Unit,
    onSms: (String) -> Unit
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 124.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp)
    ) {
        item {
            Text("Upcoming bookings", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        }

        if (bookings.isEmpty()) {
            item {
                ElevatedCard(
                    shape = RoundedCornerShape(28.dp),
                    colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface)
                ) {
                    Column(Modifier.fillMaxWidth().padding(22.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Nothing booked yet", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        Text(
                            "Open Book to choose a service, date and payment method.",
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        } else {
            items(bookings) { booking ->
                ElevatedCard(
                    shape = RoundedCornerShape(30.dp),
                    colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface)
                ) {
                    Column(Modifier.fillMaxWidth()) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(
                                    Brush.horizontalGradient(
                                        listOf(
                                            Color(0xFF0F3D7A),
                                            Color(0xFF124C9D),
                                            Color(0xFF1A5CBC)
                                        )
                                    )
                                )
                                .padding(20.dp)
                        ) {
                            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.Top
                                ) {
                                    ScopePill(booking.tenantName, dark = true, companyAccent = true)
                                    SessionScheduleBlock(startsAt = booking.startsAt)
                                }
                                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Text(
                                        booking.title,
                                        style = MaterialTheme.typography.titleLarge,
                                        color = Color.White,
                                        fontWeight = FontWeight.SemiBold
                                    )
                                    Text(
                                        booking.status.replace('_', ' '),
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = Color.White.copy(alpha = 0.78f)
                                    )
                                }
                            }
                        }

                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(18.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.weight(1f)) {
                                Text(booking.tenantName, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                                booking.tenantCity?.takeIf { it.isNotBlank() }?.let {
                                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                Text(
                                    booking.tenantPhone ?: "No company phone available",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                FilledTonalIconButton(
                                    onClick = { booking.tenantPhone?.let(onCall) },
                                    enabled = !booking.tenantPhone.isNullOrBlank(),
                                    colors = IconButtonDefaults.filledTonalIconButtonColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                                ) {
                                    Icon(Icons.Rounded.Call, contentDescription = "Call")
                                }
                                FilledTonalIconButton(
                                    onClick = { booking.tenantPhone?.let(onSms) },
                                    enabled = !booking.tenantPhone.isNullOrBlank(),
                                    colors = IconButtonDefaults.filledTonalIconButtonColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                                ) {
                                    Icon(Icons.Rounded.Message, contentDescription = "Send SMS")
                                }
                            }
                        }
                    }
                }
            }
        }

        if (accesses.isNotEmpty()) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Active access", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                    Text("Credits and memberships for the current tenancy scope.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            items(accesses) { access ->
                ElevatedCard(
                    shape = RoundedCornerShape(26.dp),
                    colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface)
                ) {
                    Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(access.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            ScopePill(access.type)
                            ScopePill(access.tenantName)
                        }
                        access.remainingUses?.let {
                            Text("Remaining uses: $it", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        access.validUntil?.let {
                            Text("Valid until ${formatDateTime(it)}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
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

@Composable
private fun SessionScheduleBlock(startsAt: String) {
    val lines = remember(startsAt) { parseBookingScheduleLines(startsAt) }
    if (lines != null) {
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                lines.line1,
                style = MaterialTheme.typography.titleMedium,
                color = Color.White,
                fontWeight = FontWeight.SemiBold
            )
            Text(
                lines.line2,
                style = MaterialTheme.typography.bodyMedium,
                color = Color.White.copy(alpha = 0.88f)
            )
        }
    } else {
        Text(
            startsAt,
            style = MaterialTheme.typography.labelLarge,
            color = Color.White.copy(alpha = 0.82f)
        )
    }
}

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
