package si.calendra.guest.android

import android.app.Application
import si.calendra.guest.android.push.GuestPushManager

class GuestMobileApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        GuestPushManager.initialize(this)
    }
}
