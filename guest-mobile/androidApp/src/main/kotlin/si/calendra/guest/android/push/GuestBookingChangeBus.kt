package si.calendra.guest.android.push

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow

object GuestBookingChangeBus {
    const val EXTRA_TARGET_SCREEN = "guest_target_screen"
    const val EXTRA_COMPANY_ID = "guest_company_id"
    private const val SCREEN_HOME = "home"

    private val _events = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val events = _events.asSharedFlow()

    fun publish(companyId: String?) {
        val normalized = companyId?.trim().orEmpty()
        if (normalized.isBlank()) return
        _events.tryEmit(normalized)
    }

    fun publishFromIntent(intent: android.content.Intent?) {
        if (intent == null) return
        val screen = intent.getStringExtra(EXTRA_TARGET_SCREEN)?.trim()
            ?: intent.data?.getQueryParameter("screen")?.trim()
        if (screen == null || !screen.equals(SCREEN_HOME, ignoreCase = true)) return
        val companyId = intent.getStringExtra(EXTRA_COMPANY_ID)?.trim()
            ?: intent.data?.getQueryParameter("companyId")?.trim()
        publish(companyId)
    }
}

