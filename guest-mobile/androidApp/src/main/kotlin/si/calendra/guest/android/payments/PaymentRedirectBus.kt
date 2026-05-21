package si.calendra.guest.android.payments

import android.net.Uri
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

object PaymentRedirectBus {
    private val _latest = MutableStateFlow<Uri?>(null)
    val latest: StateFlow<Uri?> = _latest

    fun publish(uri: Uri?) {
        _latest.value = uri
    }

    fun consume() {
        _latest.value = null
    }
}
