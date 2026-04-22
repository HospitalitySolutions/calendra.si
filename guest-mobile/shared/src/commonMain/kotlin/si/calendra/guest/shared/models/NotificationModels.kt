package si.calendra.guest.shared.models

import kotlinx.serialization.Serializable

@Serializable
data class GuestNotification(
    val notificationId: String,
    val notificationType: String,
    val title: String,
    val body: String,
    val readAt: String? = null,
    val createdAt: String,
    val payloadJson: String? = null
)

@Serializable
data class MarkAllReadResponse(
    val updatedCount: Int = 0
)

@Serializable
data class NotificationsPayload(
    val items: List<GuestNotification>
)
