package si.calendra.guest.android.ui

import android.content.Context
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import si.calendra.guest.shared.models.GuestUser
import java.util.UUID

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

    private fun encode(raw: String): String = Base64.encodeToString(raw.toByteArray(Charsets.UTF_8), Base64.NO_WRAP)
    private fun decode(raw: String): String = String(Base64.decode(raw, Base64.DEFAULT), Charsets.UTF_8)

    private companion object {
        const val PREFS_NAME = "guest_mobile_settings"
        const val KEY_PROFILE = "profile_override"
        const val KEY_SAVED_CARDS = "saved_cards"
    }
}
