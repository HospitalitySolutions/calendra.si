package si.calendra.guest.android

import android.app.Application
import si.calendra.guest.android.push.GuestPushManager

class GuestMobileApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // Create FCM notification channels as early as possible. Background FCM
        // notifications sent with a channel_id must reference an existing channel on
        // Android 8+, otherwise they may not be shown by the system notification tray.
        GuestPushManager.initialize(applicationContext)
    }
}
