package si.calendra.guest.android.ui.screens

import android.content.Context
import android.util.Base64
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Logout
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.CreditCard
import androidx.compose.material.icons.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.PersonOutline
import androidx.compose.material.icons.rounded.Phone
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import si.calendra.guest.android.ui.PaymentCardBrand
import si.calendra.guest.android.ui.PaymentCardBrandMark
import si.calendra.guest.android.ui.PaymentCardUtils
import si.calendra.guest.shared.models.GuestSession
import java.time.LocalDate

data class LocalGuestProfile(
    val firstName: String,
    val lastName: String,
    val email: String,
    val phone: String,
    val language: String,
    val cards: List<String>
)

@Composable
fun ProfileScreen(
    session: GuestSession?,
    onLogout: () -> Unit
) {
    val context = LocalContext.current
    val store = remember { LocalProfileStore(context) }
    var profile by remember(session) { mutableStateOf(store.load(session)) }
    var editing by remember { mutableStateOf(false) }
    var addingCard by remember { mutableStateOf(false) }
    var showLanguagePicker by remember { mutableStateOf(false) }
    var showStoredCardsDialog by remember { mutableStateOf(false) }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 124.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp)
    ) {
        item {
            ElevatedCard(shape = RoundedCornerShape(30.dp), colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Surface(shape = RoundedCornerShape(22.dp), color = MaterialTheme.colorScheme.primaryContainer) {
                            Box(modifier = Modifier.size(56.dp), contentAlignment = Alignment.Center) {
                                Icon(Icons.Rounded.PersonOutline, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimaryContainer)
                            }
                        }
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text("${profile.firstName} ${profile.lastName}".trim(), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                            Text(profile.email, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }

                    Button(onClick = { editing = true }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp)) {
                        Text("Edit personal data")
                    }
                }
            }
        }

        item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    "PREFERENCES",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = 1.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = 4.dp, top = 4.dp)
                )
                ElevatedCard(shape = RoundedCornerShape(16.dp), colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                    Column(Modifier.fillMaxWidth()) {
                        PreferenceNavigationRow(
                            title = "Language",
                            value = languageDisplayName(profile.language),
                            leadingIcon = Icons.Rounded.Language,
                            onClick = { showLanguagePicker = true }
                        )
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f))
                        PreferenceNavigationRow(
                            title = "Stored cards",
                            value = storedCardsSummary(profile.cards),
                            leadingIcon = Icons.Rounded.CreditCard,
                            onClick = { showStoredCardsDialog = true }
                        )
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f))
                        PreferenceLogoutRow(
                            leadingIcon = Icons.AutoMirrored.Rounded.Logout,
                            onClick = onLogout
                        )
                    }
                }
            }
        }
    }

    if (showLanguagePicker) {
        AlertDialog(
            onDismissRequest = { showLanguagePicker = false },
            title = { Text("Language") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    TextButton(
                        onClick = {
                            profile = profile.copy(language = "en")
                            store.save(profile)
                            showLanguagePicker = false
                        }
                    ) {
                        Text("English")
                    }
                    TextButton(
                        onClick = {
                            profile = profile.copy(language = "sl")
                            store.save(profile)
                            showLanguagePicker = false
                        }
                    ) {
                        Text("Slovenščina")
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showLanguagePicker = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    if (showStoredCardsDialog) {
        AlertDialog(
            onDismissRequest = { showStoredCardsDialog = false },
            title = { Text("Stored cards") },
            text = {
                Column(
                    modifier = Modifier.heightIn(max = 280.dp).verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    if (profile.cards.isEmpty()) {
                        Text("No saved cards yet.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    } else {
                        profile.cards.forEach { card ->
                            StoredCardListRow(
                                line = card,
                                onRemove = {
                                    profile = profile.copy(cards = profile.cards.filterNot { it == card })
                                    store.save(profile)
                                }
                            )
                            Spacer(Modifier.height(4.dp))
                        }
                    }
                    TextButton(
                        onClick = {
                            showStoredCardsDialog = false
                            addingCard = true
                        }
                    ) {
                        Icon(Icons.Rounded.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Add card")
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showStoredCardsDialog = false }) {
                    Text("Close")
                }
            }
        )
    }

    if (editing) {
        EditProfileDialog(
            initial = profile,
            onDismiss = { editing = false },
            onSave = {
                profile = it
                store.save(it)
                editing = false
            }
        )
    }

    if (addingCard) {
        AddCardDialog(
            onDismiss = { addingCard = false },
            onSave = { newCard ->
                profile = profile.copy(cards = profile.cards + newCard)
                store.save(profile)
                addingCard = false
            }
        )
    }
}

private fun languageDisplayName(code: String): String = when (code.lowercase()) {
    "sl" -> "Slovenščina"
    else -> "English"
}

private fun storedCardsSummary(cards: List<String>): String =
    if (cards.isEmpty()) "No saved cards" else "${cards.size} saved"

@Composable
private fun PreferenceNavigationRow(title: String, value: String, leadingIcon: ImageVector, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(
            modifier = Modifier.weight(1f),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Icon(
                leadingIcon,
                contentDescription = null,
                modifier = Modifier.size(22.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(value, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Icon(
                Icons.Rounded.KeyboardArrowRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.55f)
            )
        }
    }
}

@Composable
private fun PreferenceLogoutRow(leadingIcon: ImageVector, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(
            modifier = Modifier.weight(1f),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Icon(
                leadingIcon,
                contentDescription = null,
                modifier = Modifier.size(22.dp),
                tint = MaterialTheme.colorScheme.error
            )
            Text("Log out", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.error)
        }
        Icon(
            Icons.Rounded.KeyboardArrowRight,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.error.copy(alpha = 0.55f)
        )
    }
}

private data class ParsedStoredCard(val brand: PaymentCardBrand, val last4: String, val expiry: String)

private fun parseStoredCardLine(line: String): ParsedStoredCard? {
    val headAndTail = line.split(" •••• ", limit = 2)
    if (headAndTail.size != 2) return null
    val brand = PaymentCardBrand.fromDisplayName(headAndTail[0])
    val tailParts = headAndTail[1].split(" · ", limit = 2)
    if (tailParts.size != 2) return null
    val last4 = tailParts[0].trim()
    if (last4.length != 4 || !last4.all { it.isDigit() }) return null
    return ParsedStoredCard(brand, last4, tailParts[1].trim())
}

@Composable
private fun StoredCardListRow(line: String, onRemove: () -> Unit) {
    val parsed = remember(line) { parseStoredCardLine(line) }
    if (parsed == null) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(line, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
            IconButton(onClick = onRemove) {
                Icon(Icons.Rounded.DeleteOutline, contentDescription = "Remove card", tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        return
    }
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        PaymentCardBrandMark(brand = parsed.brand)
        Text(
            "${parsed.brand.displayName} · •••• ${parsed.last4} · ${parsed.expiry}",
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.weight(1f),
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            color = MaterialTheme.colorScheme.onSurface
        )
        IconButton(onClick = onRemove) {
            Icon(Icons.Rounded.DeleteOutline, contentDescription = "Remove card", tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun EditProfileDialog(initial: LocalGuestProfile, onDismiss: () -> Unit, onSave: (LocalGuestProfile) -> Unit) {
    var firstName by remember { mutableStateOf(initial.firstName) }
    var lastName by remember { mutableStateOf(initial.lastName) }
    var email by remember { mutableStateOf(initial.email) }
    var phone by remember { mutableStateOf(initial.phone) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit personal data") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(value = firstName, onValueChange = { firstName = it }, label = { Text("First name") }, singleLine = true)
                OutlinedTextField(value = lastName, onValueChange = { lastName = it }, label = { Text("Last name") }, singleLine = true)
                OutlinedTextField(value = email, onValueChange = { email = it }, label = { Text("Email") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
                OutlinedTextField(value = phone, onValueChange = { phone = it }, label = { Text("Phone") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone), leadingIcon = { Icon(Icons.Rounded.Phone, contentDescription = null) })
            }
        },
        confirmButton = {
            TextButton(onClick = { onSave(initial.copy(firstName = firstName, lastName = lastName, email = email, phone = phone)) }) {
                Text("Save")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
private fun AddCardDialog(onDismiss: () -> Unit, onSave: (String) -> Unit) {
    var cardNumber by remember { mutableStateOf("") }
    var holderName by remember { mutableStateOf("") }
    var expiry by remember { mutableStateOf("") }
    val panDigits = remember(cardNumber) { PaymentCardUtils.digitsOnlyPan(cardNumber) }
    val brand = remember(panDigits) { PaymentCardBrand.fromPanDigits(panDigits) }
    val panValid = remember(panDigits) { PaymentCardUtils.isCompleteValidPan(panDigits) }
    val now = LocalDate.now()
    val expiryValid = remember(expiry, now.year, now.monthValue) {
        PaymentCardUtils.expiryIsValid(expiry, now.year, now.monthValue)
    }
    val canSave = holderName.isNotBlank() && panValid && expiryValid

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add card") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(value = holderName, onValueChange = { holderName = it }, label = { Text("Cardholder") }, singleLine = true)
                OutlinedTextField(
                    value = cardNumber,
                    onValueChange = { raw ->
                        val d = PaymentCardUtils.digitsOnlyPan(raw)
                        cardNumber = PaymentCardUtils.formatGroupedPan(d)
                    },
                    label = { Text("Card number") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Text,
                        capitalization = KeyboardCapitalization.None,
                        autoCorrectEnabled = false
                    ),
                    supportingText = {
                        when {
                            panDigits.isEmpty() -> Text("Enter digits; type is detected automatically.")
                            panValid -> Text("${brand.displayName} · valid number", color = MaterialTheme.colorScheme.primary)
                            panDigits.length >= 13 && !PaymentCardUtils.luhnValid(panDigits) -> Text("Card number is not valid", color = MaterialTheme.colorScheme.error)
                            else -> Text("${brand.displayName} · ${panDigits.length} digits", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                )
                OutlinedTextField(
                    value = expiry,
                    onValueChange = { raw -> expiry = PaymentCardUtils.formatExpiryInput(raw) },
                    label = { Text("Expiry (MM/YY)") },
                    placeholder = { Text("MM/YY") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Text,
                        capitalization = KeyboardCapitalization.None,
                        autoCorrectEnabled = false
                    ),
                    supportingText = {
                        val digitsOnly = expiry.filter { it.isDigit() }
                        when {
                            expiry.isBlank() -> Text("Use month and two-digit year.")
                            digitsOnly.length < 4 -> Text("Slash is added after the month.")
                            !expiry.matches(Regex("""^(0[1-9]|1[0-2])/(\d{2})$""")) -> Text("Use format MM/YY", color = MaterialTheme.colorScheme.error)
                            !expiryValid -> Text("Expiry date is in the past", color = MaterialTheme.colorScheme.error)
                            else -> Text("Looks good", color = MaterialTheme.colorScheme.primary)
                        }
                    }
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val digits = PaymentCardUtils.digitsOnlyPan(cardNumber)
                    val last4 = digits.takeLast(4)
                    onSave("${brand.displayName} •••• $last4 · $expiry")
                },
                enabled = canSave
            ) {
                Text("Save")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

private class LocalProfileStore(context: Context) {
    private val prefs = context.getSharedPreferences("guest_profile_store", Context.MODE_PRIVATE)

    fun load(session: GuestSession?): LocalGuestProfile {
        val fallback = LocalGuestProfile(
            firstName = session?.guestUser?.firstName.orEmpty(),
            lastName = session?.guestUser?.lastName.orEmpty(),
            email = session?.guestUser?.email.orEmpty(),
            phone = session?.guestUser?.phone.orEmpty(),
            language = session?.guestUser?.language ?: "en",
            cards = emptyList()
        )
        return LocalGuestProfile(
            firstName = decode("first_name") ?: fallback.firstName,
            lastName = decode("last_name") ?: fallback.lastName,
            email = decode("email") ?: fallback.email,
            phone = decode("phone") ?: fallback.phone,
            language = decode("language") ?: fallback.language,
            cards = decode("cards")?.split("||")?.filter { it.isNotBlank() } ?: fallback.cards
        )
    }

    fun save(profile: LocalGuestProfile) {
        prefs.edit()
            .putString("first_name", encode(profile.firstName))
            .putString("last_name", encode(profile.lastName))
            .putString("email", encode(profile.email))
            .putString("phone", encode(profile.phone))
            .putString("language", encode(profile.language))
            .putString("cards", encode(profile.cards.joinToString("||")))
            .apply()
    }

    private fun encode(value: String): String = Base64.encodeToString(value.toByteArray(Charsets.UTF_8), Base64.NO_WRAP)
    private fun decode(key: String): String? = prefs.getString(key, null)?.let {
        runCatching { String(Base64.decode(it, Base64.NO_WRAP), Charsets.UTF_8) }.getOrNull()
    }
}
