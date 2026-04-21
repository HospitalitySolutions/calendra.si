package si.calendra.guest.android.push

import android.content.Intent
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow

object GuestInboxDeepLinkBus {
    const val EXTRA_TARGET_SCREEN = "guest_target_screen"
    const val EXTRA_COMPANY_ID = "guest_company_id"
    const val EXTRA_CLIENT_ID = "guest_client_id"
    private const val SCREEN_INBOX = "inbox"

    private val _events = MutableSharedFlow<String>(extraBufferCapacity = 1)
    private var pendingCompanyId: String? = null

    val events = _events.asSharedFlow()

    fun publish(companyId: String?) {
        val normalized = companyId?.trim().orEmpty()
        if (normalized.isBlank()) return
        pendingCompanyId = normalized
        _events.tryEmit(normalized)
    }

    fun publishFromIntent(intent: Intent?) {
        if (intent == null) return
        val screen = intent.getStringExtra(EXTRA_TARGET_SCREEN)?.trim()
            ?: intent.data?.getQueryParameter("screen")?.trim()
        if (screen != null && !screen.equals(SCREEN_INBOX, ignoreCase = true)) return
        val companyId = intent.getStringExtra(EXTRA_COMPANY_ID)?.trim()
            ?: intent.data?.getQueryParameter("companyId")?.trim()
        publish(companyId)
    }

    fun consumePending(): String? = pendingCompanyId?.also { pendingCompanyId = null }
}
