package si.calendra.guest.android.ui

import android.content.Context
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import si.calendra.guest.shared.models.GuestUser
import java.util.UUID


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
    val encodedNumber: String
) {
    val label: String get() = "$brand •••• $last4"
}

class GuestPreferencesStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

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

    fun loadSavedCards(): List<SavedCardUi> {
        val encoded = prefs.getString(KEY_SAVED_CARDS, null) ?: return emptyList()
        return runCatching {
            val raw = JSONArray(decode(encoded))
            buildList {
                for (index in 0 until raw.length()) {
                    val item = raw.getJSONObject(index)
                    add(
                        SavedCardUi(
                            id = item.optString("id").ifBlank { UUID.randomUUID().toString() },
                            holderName = item.optString("holderName"),
                            brand = item.optString("brand").ifBlank { "Card" },
                            last4 = item.optString("last4"),
                            expiryMonth = item.optString("expiryMonth"),
                            expiryYear = item.optString("expiryYear"),
                            encodedNumber = item.optString("encodedNumber")
                        )
                    )
                }
            }
        }.getOrDefault(emptyList())
    }

    fun saveSavedCards(cards: List<SavedCardUi>) {
        val raw = JSONArray()
        cards.forEach { card ->
            raw.put(
                JSONObject()
                    .put("id", card.id)
                    .put("holderName", card.holderName)
                    .put("brand", card.brand)
                    .put("last4", card.last4)
                    .put("expiryMonth", card.expiryMonth)
                    .put("expiryYear", card.expiryYear)
                    .put("encodedNumber", card.encodedNumber)
            )
        }
        prefs.edit().putString(KEY_SAVED_CARDS, encode(raw.toString())).apply()
    }

    fun saveAuthToken(token: String) {
        prefs.edit().putString(KEY_AUTH_TOKEN, token.trim()).apply()
    }

    fun loadAuthToken(): String? =
        prefs.getString(KEY_AUTH_TOKEN, null)?.trim()?.takeIf { it.isNotBlank() }

    fun clearAuthToken() {
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

    private fun encode(raw: String): String = Base64.encodeToString(raw.toByteArray(Charsets.UTF_8), Base64.NO_WRAP)
    private fun decode(raw: String): String = String(Base64.decode(raw, Base64.DEFAULT), Charsets.UTF_8)

    private companion object {
        const val PREFS_NAME = "guest_mobile_settings"
        const val KEY_PROFILE = "profile_override"
        const val KEY_SAVED_CARDS = "saved_cards"
        const val KEY_AUTH_TOKEN = "auth_token"
        const val KEY_APP_UI_LOCALE = "app_ui_locale"
        const val KEY_PENDING_EXTERNAL_CHECKOUT = "pending_external_checkout"
    }
}
