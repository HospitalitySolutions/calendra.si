package si.calendra.guest.android

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.compose.setContent
import si.calendra.guest.android.payments.PaymentRedirectBus
import si.calendra.guest.android.push.GuestInboxDeepLinkBus
import si.calendra.guest.android.push.GuestPushManager
import si.calendra.guest.android.ui.GuestMobileRoot
import si.calendra.guest.android.ui.theme.GuestMobileTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.auto(Color.argb(235, 248, 250, 252), Color.argb(235, 17, 24, 39))
        )
        super.onCreate(savedInstanceState)
        GuestPushManager.initialize(applicationContext)
        GuestPushManager.requestNotificationPermission(this)
        PaymentRedirectBus.publish(intent?.data)
        GuestInboxDeepLinkBus.publishFromIntent(intent)
        setContent {
            GuestMobileTheme {
                GuestMobileRoot()
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        PaymentRedirectBus.publish(intent.data)
        GuestInboxDeepLinkBus.publishFromIntent(intent)
    }
}
