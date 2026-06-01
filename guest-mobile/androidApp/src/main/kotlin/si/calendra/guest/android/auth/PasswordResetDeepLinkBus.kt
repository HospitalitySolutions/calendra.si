package si.calendra.guest.android.auth

import android.net.Uri
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

object PasswordResetDeepLinkBus {
    private val _latest = MutableStateFlow<Uri?>(null)
    val latest: StateFlow<Uri?> = _latest

    fun publish(uri: Uri?) {
        if (uri?.scheme == "calendra-guest" && uri.host?.lowercase() == "reset-password") {
            _latest.value = uri
        }
    }

    fun consume() {
        _latest.value = null
    }
}
