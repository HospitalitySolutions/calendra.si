package si.calendra.guest.android.push

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.ComponentActivity
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.tasks.await
import si.calendra.guest.android.BuildConfig
import si.calendra.guest.android.MainActivity
import si.calendra.guest.shared.network.GuestSessionStore
import si.calendra.guest.shared.repository.GuestRepository
import java.util.Locale

object GuestPushManager {
    private const val PREFS_NAME = "guest_push"
    private const val KEY_CACHED_TOKEN = "cached_token"
    private const val KEY_REGISTERED_TOKEN = "registered_token"
    const val CHANNEL_ID = "guest_messages"
    private const val PERMISSION_REQUEST_CODE = 7001

    fun initialize(context: Context): Boolean {
        if (BuildConfig.FCM_PROJECT_ID.isBlank() || BuildConfig.FCM_APPLICATION_ID.isBlank() || BuildConfig.FCM_API_KEY.isBlank() || BuildConfig.FCM_GCM_SENDER_ID.isBlank()) {
            return false
        }
        if (FirebaseApp.getApps(context).isEmpty()) {
            val options = FirebaseOptions.Builder()
                .setProjectId(BuildConfig.FCM_PROJECT_ID)
                .setApplicationId(BuildConfig.FCM_APPLICATION_ID)
                .setApiKey(BuildConfig.FCM_API_KEY)
                .setGcmSenderId(BuildConfig.FCM_GCM_SENDER_ID)
                .build()
            FirebaseApp.initializeApp(context, options)
        }
        ensureNotificationChannel(context)
        return true
    }

    fun requestNotificationPermission(activity: ComponentActivity) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        if (ActivityCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return
        ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.POST_NOTIFICATIONS), PERMISSION_REQUEST_CODE)
    }

    suspend fun syncCurrentToken(context: Context, repository: GuestRepository) {
        if (!initialize(context)) return
        if (GuestSessionStore.authToken.isNullOrBlank()) return
        val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val fetchedToken = prefs.getString(KEY_CACHED_TOKEN, null)?.takeIf { it.isNotBlank() }
            ?: FirebaseMessaging.getInstance().token.await()
        if (fetchedToken.isBlank()) return
        val alreadyRegistered = prefs.getString(KEY_REGISTERED_TOKEN, null)
        if (alreadyRegistered == fetchedToken) return
        repository.registerDeviceToken(
            platform = "ANDROID",
            pushToken = fetchedToken,
            locale = Locale.getDefault().toLanguageTag()
        )
        prefs.edit()
            .putString(KEY_CACHED_TOKEN, fetchedToken)
            .putString(KEY_REGISTERED_TOKEN, fetchedToken)
            .apply()
    }

    fun cacheToken(context: Context, token: String) {
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_CACHED_TOKEN, token)
            .apply()
    }

    fun showForegroundNotification(context: Context, title: String, body: String, companyId: String? = null, clientId: String? = null) {
        ensureNotificationChannel(context)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ActivityCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(GuestInboxDeepLinkBus.EXTRA_TARGET_SCREEN, "inbox")
            if (!companyId.isNullOrBlank()) putExtra(GuestInboxDeepLinkBus.EXTRA_COMPANY_ID, companyId)
            if (!clientId.isNullOrBlank()) putExtra(GuestInboxDeepLinkBus.EXTRA_CLIENT_ID, clientId)
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            2001,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()
        NotificationManagerCompat.from(context).notify((System.currentTimeMillis() % Int.MAX_VALUE).toInt(), notification)
    }

    private fun ensureNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Guest messages", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Chat messages sent from the Calendra web inbox"
            }
        )
    }
}
