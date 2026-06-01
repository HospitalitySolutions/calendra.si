package si.calendra.guest.android.ui

import android.content.Context
import android.content.SharedPreferences
import android.util.Base64
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONObject
import si.calendra.guest.shared.models.GuestUser


data class StoredPendingExternalCheckoutUi(
    val orderId: String,
    val companyId: String,
    val paymentMethodType: String,
    val startedAtMs: Long,
    val appWasBackgrounded: Boolean
)

data class SavedCardUi(
    val id: String,
    val holderName: String,
    val brand: String,
    val last4: String,
    val expiryMonth: String,
    val expiryYear: String,
    /** Provider/tokenized payment method id only. Never store a full card number in the app. */
    val providerPaymentMethodId: String? = null
) {
    val label: String get() = "$brand •••• $last4"
}

class GuestPreferencesStore(context: Context) {
    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val securePrefs: SharedPreferences = createEncryptedPrefs(appContext)

    init {
        migrateLegacyAuthTokenToEncryptedPrefs()
        purgeLegacySavedCards()
    }

    fun loadProfileOverride(): GuestUser? {
        val encoded = prefs.getString(KEY_PROFILE, null) ?: return null
        return runCatching {
            val json = JSONObject(decode(encoded))
            GuestUser(
                id = json.optString("id"),
                email = json.optString("email"),
                firstName = json.optString("firstName"),
                lastName = json.optString("lastName"),
                phone = json.optString("phone").takeIf { it.isNotBlank() },
                language = json.optString("language").ifBlank { "sl" },
                profilePicturePath = json.optString("profilePicturePath").takeIf { it.isNotBlank() }
            )
        }.getOrNull()
    }

    fun saveProfileOverride(user: GuestUser) {
        val json = JSONObject()
            .put("id", user.id)
            .put("email", user.email)
            .put("firstName", user.firstName)
            .put("lastName", user.lastName)
            .put("phone", user.phone.orEmpty())
            .put("language", user.language)
            .put("profilePicturePath", user.profilePicturePath.orEmpty())
        prefs.edit().putString(KEY_PROFILE, encode(json.toString())).apply()
    }

    /**
     * Local saved-card storage is intentionally disabled until card saving is backed by a
     * tokenized provider payment method (Stripe/PayPal). Existing legacy card data is
     * purged so full PAN values that were previously Base64-obfuscated are removed.
     */
    fun loadSavedCards(): List<SavedCardUi> {
        purgeLegacySavedCards()
        return emptyList()
    }

    fun saveSavedCards(cards: List<SavedCardUi>) {
        // Never persist raw card details locally. Safe tokenized card metadata can be
        // reintroduced here only after providerPaymentMethodId is populated by backend/Stripe.
        purgeLegacySavedCards()
    }

    fun saveAuthToken(token: String) {
        securePrefs.edit().putString(KEY_AUTH_TOKEN, token.trim()).apply()
        prefs.edit().remove(KEY_AUTH_TOKEN).apply()
    }

    fun loadAuthToken(): String? =
        securePrefs.getString(KEY_AUTH_TOKEN, null)?.trim()?.takeIf { it.isNotBlank() }

    fun clearAuthToken() {
        securePrefs.edit().remove(KEY_AUTH_TOKEN).apply()
        prefs.edit().remove(KEY_AUTH_TOKEN).apply()
    }

    /** UI language for screens before/during auth (`sl`, `en`). */
    fun loadAppUiLocale(): String {
        val raw = prefs.getString(KEY_APP_UI_LOCALE, null)?.trim()?.lowercase().orEmpty()
        return when (raw) {
            "en", "sl" -> raw
            else -> "sl"
        }
    }

    fun saveAppUiLocale(code: String) {
        val v = if (code.equals("en", ignoreCase = true)) "en" else "sl"
        prefs.edit().putString(KEY_APP_UI_LOCALE, v).apply()
    }

    fun loadPendingExternalCheckout(): StoredPendingExternalCheckoutUi? {
        val encoded = prefs.getString(KEY_PENDING_EXTERNAL_CHECKOUT, null) ?: return null
        return runCatching {
            val json = JSONObject(decode(encoded))
            StoredPendingExternalCheckoutUi(
                orderId = json.optString("orderId").takeIf { it.isNotBlank() } ?: return null,
                companyId = json.optString("companyId").takeIf { it.isNotBlank() } ?: return null,
                paymentMethodType = json.optString("paymentMethodType").ifBlank { "CARD" },
                startedAtMs = json.optLong("startedAtMs", System.currentTimeMillis()),
                appWasBackgrounded = json.optBoolean("appWasBackgrounded", false)
            )
        }.getOrNull()
    }

    fun savePendingExternalCheckout(checkout: StoredPendingExternalCheckoutUi) {
        val json = JSONObject()
            .put("orderId", checkout.orderId)
            .put("companyId", checkout.companyId)
            .put("paymentMethodType", checkout.paymentMethodType)
            .put("startedAtMs", checkout.startedAtMs)
            .put("appWasBackgrounded", checkout.appWasBackgrounded)
        prefs.edit().putString(KEY_PENDING_EXTERNAL_CHECKOUT, encode(json.toString())).apply()
    }

    fun clearPendingExternalCheckout() {
        prefs.edit().remove(KEY_PENDING_EXTERNAL_CHECKOUT).apply()
    }

    private fun migrateLegacyAuthTokenToEncryptedPrefs() {
        val legacyToken = prefs.getString(KEY_AUTH_TOKEN, null)?.trim()?.takeIf { it.isNotBlank() }
        if (legacyToken != null && securePrefs.getString(KEY_AUTH_TOKEN, null).isNullOrBlank()) {
            securePrefs.edit().putString(KEY_AUTH_TOKEN, legacyToken).apply()
        }
        prefs.edit().remove(KEY_AUTH_TOKEN).apply()
    }

    private fun purgeLegacySavedCards() {
        prefs.edit().remove(KEY_SAVED_CARDS).apply()
        securePrefs.edit().remove(KEY_SAVED_CARDS).apply()
    }

    private fun encode(raw: String): String = Base64.encodeToString(raw.toByteArray(Charsets.UTF_8), Base64.NO_WRAP)
    private fun decode(raw: String): String = String(Base64.decode(raw, Base64.DEFAULT), Charsets.UTF_8)

    private companion object {
        const val PREFS_NAME = "guest_mobile_settings"
        const val SECURE_PREFS_NAME = "guest_mobile_secure_settings"
        const val KEY_PROFILE = "profile_override"
        const val KEY_SAVED_CARDS = "saved_cards"
        const val KEY_AUTH_TOKEN = "auth_token"
        const val KEY_APP_UI_LOCALE = "app_ui_locale"
        const val KEY_PENDING_EXTERNAL_CHECKOUT = "pending_external_checkout"

        fun createEncryptedPrefs(context: Context): SharedPreferences {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()

            return EncryptedSharedPreferences.create(
                context,
                SECURE_PREFS_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        }
    }
}
