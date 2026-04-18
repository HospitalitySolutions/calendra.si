package si.calendra.guest.shared.models

import kotlinx.serialization.Serializable

@Serializable
data class GuestNotification(
    val notificationId: String,
    val notificationType: String,
    val title: String,
    val body: String,
    val readAt: String? = null,
    val createdAt: String
)

@Serializable
data class NotificationsPayload(
    val items: List<GuestNotification>
)
