package si.calendra.guest.android.push

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import si.calendra.guest.android.BuildConfig
import si.calendra.guest.shared.GuestAppContainer
import si.calendra.guest.shared.config.GuestApiConfig
import si.calendra.guest.shared.network.GuestSessionStore

class GuestFirebaseMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        GuestPushManager.cacheToken(applicationContext, token)
        if (GuestSessionStore.authToken.isNullOrBlank()) return
        CoroutineScope(Dispatchers.IO).launch {
            runCatching {
                val repository = GuestAppContainer(GuestApiConfig(baseUrl = BuildConfig.API_BASE_URL)).repository
                GuestPushManager.syncCurrentToken(applicationContext, repository)
            }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val type = message.data["type"]?.trim()?.lowercase()
        val title = message.notification?.title ?: message.data["title"] ?: "Booking update"
        val body = message.notification?.body ?: message.data["body"] ?: "Your bookings were updated."
        val companyId = message.data["companyId"]
        val clientId = message.data["clientId"]
        if (type == "booking_changed" || type == "guest_reminder") {
            GuestBookingChangeBus.publish(companyId)
            GuestPushManager.showForegroundNotification(
                applicationContext,
                title,
                body,
                companyId = companyId,
                clientId = clientId,
                openInboxOnTap = false,
                channelId = GuestPushManager.CHANNEL_REMINDERS
            )
            return
        }
        if (!companyId.isNullOrBlank()) GuestInboxDeepLinkBus.publish(companyId)
        GuestPushManager.showForegroundNotification(
            applicationContext,
            title,
            body,
            companyId = companyId,
            clientId = clientId,
            openInboxOnTap = true,
            channelId = GuestPushManager.CHANNEL_MESSAGES
        )
    }
}
