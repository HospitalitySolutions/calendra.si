package si.calendra.guest.android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.NotificationsNone
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import si.calendra.guest.shared.models.GuestNotification
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
fun NotificationsScreen(
    notifications: List<GuestNotification>,
    onNotificationClick: (GuestNotification) -> Unit,
    onMarkAllRead: () -> Unit,
    onBack: () -> Unit
) {
    val sorted = remember(notifications) {
        notifications.sortedByDescending { it.createdAt }
    }
    val hasUnread = sorted.any { it.readAt == null }

    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 20.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            TextButton(onClick = onBack) { Text("Back") }
            Spacer(Modifier.weight(1f))
            if (hasUnread) {
                TextButton(onClick = onMarkAllRead) { Text("Mark all read") }
            }
        }

        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Notifications", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text(
                "Booking updates, reminders and announcements.",
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        if (sorted.isEmpty()) {
            ElevatedCard(
                shape = RoundedCornerShape(24.dp),
                colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface)
            ) {
                Column(
                    modifier = Modifier.fillMaxWidth().padding(24.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Icon(
                        Icons.Outlined.NotificationsNone,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text("No notifications yet", fontWeight = FontWeight.SemiBold)
                    Text(
                        "We'll show booking updates, reminders and announcements here.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(10.dp),
                contentPadding = PaddingValues(bottom = 24.dp)
            ) {
                items(sorted, key = { it.notificationId }) { notification ->
                    NotificationCard(
                        notification = notification,
                        onClick = { onNotificationClick(notification) }
                    )
                }
            }
        }
    }
}

@Composable
private fun NotificationCard(
    notification: GuestNotification,
    onClick: () -> Unit
) {
    val isUnread = notification.readAt == null
    ElevatedCard(
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.elevatedCardColors(
            containerColor = if (isUnread) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surface
        ),
        onClick = onClick
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Box(
                modifier = Modifier
                    .padding(top = 6.dp)
                    .size(10.dp)
                    .clip(CircleShape)
                    .background(
                        if (isUnread) MaterialTheme.colorScheme.primary else androidx.compose.ui.graphics.Color.Transparent
                    )
            )
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Text(
                    notification.title,
                    fontWeight = FontWeight.SemiBold,
                    style = MaterialTheme.typography.titleMedium
                )
                if (notification.body.isNotBlank()) {
                    Text(
                        notification.body,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
                formatTimestamp(notification.createdAt)?.let {
                    Text(
                        it,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.labelSmall
                    )
                }
            }
        }
    }
}

private fun formatTimestamp(raw: String?): String? {
    if (raw.isNullOrBlank()) return null
    val formatter = DateTimeFormatter.ofPattern("d MMM yyyy 'at' HH:mm", Locale.getDefault())
    return runCatching {
        OffsetDateTime.parse(raw).format(formatter)
    }.getOrNull()
}

@Suppress("unused")
private fun Modifier.rowClickable(enabled: Boolean, onClick: () -> Unit): Modifier =
    if (enabled) this.clickable(onClick = onClick) else this
