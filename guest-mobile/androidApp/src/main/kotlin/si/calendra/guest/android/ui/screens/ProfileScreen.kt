package si.calendra.guest.android.ui.screens

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Logout
import androidx.compose.material.icons.automirrored.rounded.ReceiptLong
import androidx.compose.material.icons.rounded.Business
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.PersonOutline
import androidx.compose.material.icons.rounded.Phone
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import si.calendra.guest.shared.models.GuestProfileSettings
import si.calendra.guest.shared.models.GuestSession
import si.calendra.guest.shared.models.UpdateGuestProfileSettingsRequest

data class LocalGuestProfile(
    val firstName: String,
    val lastName: String,
    val email: String,
    val phone: String,
    val language: String
)

data class LocalInvoiceSettings(
    val recipientType: String = "PERSON",
    val personAddressLine: String = "",
    val personPostalCode: String = "",
    val personCity: String = "",
    val companyName: String = "",
    val companyAddressLine: String = "",
    val companyPostalCode: String = "",
    val companyCity: String = "",
    val companyVatId: String = ""
)

private enum class TenantLifecycleActionType { Unsubscribe, Anonymize }

private data class TenantLifecycleAction(
    val companyId: String,
    val companyName: String,
    val type: TenantLifecycleActionType
)

@Composable
fun ProfileScreen(
    session: GuestSession?,
    activeTenantId: String?,
    languageCode: String,
    onLanguageChanged: (String) -> Unit,
    onLoadProfileSettings: suspend (String?) -> GuestProfileSettings,
    onSaveProfileSettings: suspend (UpdateGuestProfileSettingsRequest) -> GuestProfileSettings,
    onUploadProfilePicture: suspend (String, String?, ByteArray) -> GuestProfileSettings,
    onDownloadProfilePicture: suspend () -> ByteArray,
    onUnsubscribeTenant: suspend (String) -> Unit,
    onAnonymizeTenant: suspend (String) -> Unit,
    onDeleteGuestAccount: suspend () -> Unit,
    onLogout: () -> Unit
) {
    val context = LocalContext.current
    val store = remember { LocalProfileStore(context) }
    val scope = rememberCoroutineScope()
    var profile by remember(session) { mutableStateOf(store.load(session)) }
    var editing by remember { mutableStateOf(false) }
    var showLanguagePicker by remember { mutableStateOf(false) }
    var showNotificationsDialog by remember { mutableStateOf(false) }
    var showInvoicingDialog by remember { mutableStateOf(false) }
    var showSubscribedTenantsDialog by remember { mutableStateOf(false) }
    var showDeleteAccountDialog by remember { mutableStateOf(false) }
    var avatarBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var uploadingAvatar by remember { mutableStateOf(false) }
    var loadingRemote by remember(activeTenantId) { mutableStateOf(false) }
    var savingPreference by remember { mutableStateOf(false) }
    var savingProfile by remember { mutableStateOf(false) }
    var remoteError by remember(activeTenantId) { mutableStateOf<String?>(null) }
    var notifyMessagesEnabled by remember(activeTenantId) { mutableStateOf(true) }
    var notifyRemindersEnabled by remember(activeTenantId) { mutableStateOf(true) }
    var notifyReminderMinutes by remember(activeTenantId) { mutableStateOf(60) }
    var invoiceSettings by remember(activeTenantId) { mutableStateOf(LocalInvoiceSettings()) }
    var tenantAction by remember { mutableStateOf<TenantLifecycleAction?>(null) }
    var tenantActionInProgress by remember { mutableStateOf(false) }
    var tenantActionError by remember { mutableStateOf<String?>(null) }
    var deletingAccount by remember { mutableStateOf(false) }
    val subscribedTenants = session?.linkedTenants.orEmpty()
    val isSl = profile.language.ifBlank { languageCode }.lowercase().startsWith("sl")
    fun legalUrl(slPath: String, enPath: String): String = "https://calendra.si" + if (isSl) slPath else enPath
    val privacyPolicyUrl = legalUrl("/zasebnost", "/en/privacy-policy")
    val termsOfServiceUrl = legalUrl("/pogoji-uporabe", "/en/terms-of-service")
    val accountDeletionUrl = legalUrl("/izbris-racuna", "/en/account-deletion")
    fun tr(en: String, sl: String): String = if (isSl) sl else en

    fun openLegalPage(url: String) {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
        runCatching { context.startActivity(intent) }
            .onFailure { remoteError = tr("Could not open legal page.", "Pravne strani ni bilo mogoče odpreti.") }
    }

    fun openAccountDeletionPage() {
        openLegalPage(accountDeletionUrl)
    }

    fun mergeRemoteSettings(remote: GuestProfileSettings) {
        profile = profile.copy(
            firstName = remote.guestUser.firstName,
            lastName = remote.guestUser.lastName,
            email = remote.guestUser.email,
            phone = remote.guestUser.phone.orEmpty(),
            language = remote.guestUser.language
        )
        notifyMessagesEnabled = remote.notifyMessagesEnabled
        notifyRemindersEnabled = remote.notifyRemindersEnabled
        notifyReminderMinutes = normalizeReminderMinutes(remote.notifyReminderMinutes)
        invoiceSettings = LocalInvoiceSettings(
            recipientType = remote.invoiceSettings.recipientType,
            personAddressLine = remote.invoiceSettings.personAddressLine.orEmpty(),
            personPostalCode = remote.invoiceSettings.personPostalCode.orEmpty(),
            personCity = remote.invoiceSettings.personCity.orEmpty(),
            companyName = remote.invoiceSettings.companyName.orEmpty(),
            companyAddressLine = remote.invoiceSettings.companyAddressLine.orEmpty(),
            companyPostalCode = remote.invoiceSettings.companyPostalCode.orEmpty(),
            companyCity = remote.invoiceSettings.companyCity.orEmpty(),
            companyVatId = remote.invoiceSettings.companyVatId.orEmpty()
        )
        store.save(profile)
        val nextLanguage = remote.guestUser.language.ifBlank { languageCode }
        if (nextLanguage.equals("en", ignoreCase = true) || nextLanguage.equals("sl", ignoreCase = true)) {
            onLanguageChanged(nextLanguage.lowercase())
        }
    }

    suspend fun persistRemote(
        updated: LocalGuestProfile,
        invoice: LocalInvoiceSettings = invoiceSettings,
        includeInvoiceSettings: Boolean = false,
        notifyMessages: Boolean? = null,
        notifyReminders: Boolean? = null,
        notifyReminderMinutesValue: Int? = null
    ): Boolean {
        return runCatching {
            onSaveProfileSettings(
                UpdateGuestProfileSettingsRequest(
                    firstName = updated.firstName.trim(),
                    lastName = updated.lastName.trim(),
                    email = updated.email.trim(),
                    phone = updated.phone.trim().ifBlank { null },
                    language = updated.language,
                    companyId = activeTenantId,
                    linkedCompanyId = null,
                    batchPaymentEnabled = null,
                    notifyMessagesEnabled = notifyMessages,
                    notifyRemindersEnabled = notifyReminders,
                    notifyReminderMinutes = notifyReminderMinutesValue?.let(::normalizeReminderMinutes),
                    invoiceRecipientType = if (includeInvoiceSettings) invoice.recipientType else null,
                    invoicePersonAddressLine = if (includeInvoiceSettings) invoice.personAddressLine.trim().ifBlank { null } else null,
                    invoicePersonPostalCode = if (includeInvoiceSettings) invoice.personPostalCode.trim().ifBlank { null } else null,
                    invoicePersonCity = if (includeInvoiceSettings) invoice.personCity.trim().ifBlank { null } else null,
                    invoiceCompanyName = if (includeInvoiceSettings) invoice.companyName.trim().ifBlank { null } else null,
                    invoiceCompanyAddressLine = if (includeInvoiceSettings) invoice.companyAddressLine.trim().ifBlank { null } else null,
                    invoiceCompanyPostalCode = if (includeInvoiceSettings) invoice.companyPostalCode.trim().ifBlank { null } else null,
                    invoiceCompanyCity = if (includeInvoiceSettings) invoice.companyCity.trim().ifBlank { null } else null,
                    invoiceCompanyVatId = if (includeInvoiceSettings) invoice.companyVatId.trim().ifBlank { null } else null
                )
            )
        }.onSuccess { response ->
            remoteError = null
            mergeRemoteSettings(response)
        }.onFailure {
            remoteError = it.message ?: tr("Unable to save profile settings", "Nastavitev profila ni bilo mogoče shraniti")
        }.isSuccess
    }

    LaunchedEffect(session?.guestUser?.id, activeTenantId) {
        if (session == null) return@LaunchedEffect
        loadingRemote = true
        remoteError = null
        runCatching { onLoadProfileSettings(activeTenantId) }
            .onSuccess { mergeRemoteSettings(it) }
            .onFailure { remoteError = it.message ?: tr("Unable to load profile settings", "Nastavitev profila ni bilo mogoče naložiti") }
        loadingRemote = false
    }

    LaunchedEffect(session?.guestUser?.id, session?.guestUser?.profilePicturePath) {
        val path = session?.guestUser?.profilePicturePath
        avatarBitmap = if (!path.isNullOrBlank()) {
            withContext(Dispatchers.IO) {
                runCatching { onDownloadProfilePicture() }.getOrNull()?.let { bytes ->
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                }
            }
        } else {
            null
        }
    }

    val pickAvatar = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia()
    ) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            uploadingAvatar = true
            remoteError = null
            runCatching {
                val (name, mime, bytes) = readProfileImagePayload(context, uri)
                if (bytes.isEmpty()) error(tr("Could not read image", "Slike ni bilo mogoče prebrati"))
                val settings = onUploadProfilePicture(name, mime, bytes)
                mergeRemoteSettings(settings)
            }.onFailure { remoteError = it.message ?: tr("Could not upload profile picture", "Profilne slike ni bilo mogoče naložiti") }
            uploadingAvatar = false
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        ProfileAmbientBackground()
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 18.dp, bottom = 96.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                ElevatedCard(
                    shape = RoundedCornerShape(28.dp),
                    colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface),
                    elevation = CardDefaults.elevatedCardElevation(defaultElevation = 5.dp)
                ) {
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 18.dp, vertical = 14.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            ProfileAvatar(
                                uploading = uploadingAvatar,
                                avatarBitmap = avatarBitmap,
                                enabled = !uploadingAvatar && !loadingRemote,
                                onClick = {
                                    pickAvatar.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                                }
                            )
                            Column(
                                verticalArrangement = Arrangement.spacedBy(5.dp),
                                modifier = Modifier.weight(1f)
                            ) {
                                Text(
                                    "${profile.firstName} ${profile.lastName}".trim(),
                                    style = MaterialTheme.typography.headlineLarge.copy(fontSize = 23.sp),
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF061B3A),
                                    maxLines = 1
                                )
                                Text(
                                    profile.email,
                                    style = MaterialTheme.typography.titleMedium.copy(fontSize = 13.sp),
                                    color = Color(0xFF62728A),
                                    maxLines = 1
                                )
                            }
                        }

                        Button(
                            onClick = { editing = true },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(46.dp),
                            shape = RoundedCornerShape(16.dp),
                            enabled = !loadingRemote && !savingProfile,
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0968F5))
                        ) {
                            Icon(
                                Icons.Rounded.Edit,
                                contentDescription = null,
                                modifier = Modifier.size(22.dp),
                                tint = Color.White
                            )
                            Text(
                                tr("Edit personal data", "Uredi osebne podatke"),
                                style = MaterialTheme.typography.titleMedium.copy(fontSize = 13.sp),
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(start = 8.dp)
                            )
                        }
                        if (loadingRemote) {
                            LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                        }
                        remoteError?.let {
                            Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }

            item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        tr("PREFERENCES", "NASTAVITVE"),
                        style = MaterialTheme.typography.titleSmall.copy(fontSize = 11.sp),
                        fontWeight = FontWeight.SemiBold,
                        letterSpacing = 2.2.sp,
                        color = Color(0xFF5E738D),
                        modifier = Modifier.padding(start = 4.dp, top = 1.dp)
                    )
                    ElevatedCard(
                        shape = RoundedCornerShape(28.dp),
                        colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface),
                        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 4.dp)
                    ) {
                        Column(Modifier.fillMaxWidth()) {
                            PreferenceNavigationRow(
                                title = tr("Language", "Jezik"),
                                value = languageDisplayName(profile.language),
                                leadingIcon = Icons.Rounded.Language,
                                iconTint = Color(0xFF0968F5),
                                onClick = { showLanguagePicker = true }
                            )
                            HorizontalDivider(color = Color(0xFFE5EAF2))
                            PreferenceNavigationRow(
                                title = tr("Notifications", "Obvestila"),
                                value = notificationsSummary(notifyMessagesEnabled, notifyRemindersEnabled, isSl),
                                leadingIcon = Icons.Rounded.Notifications,
                                iconTint = Color(0xFFFF8A00),
                                onClick = { showNotificationsDialog = true }
                            )
                            HorizontalDivider(color = Color(0xFFE5EAF2))
                            PreferenceNavigationRow(
                                title = tr("Invoicing", "Računi"),
                                value = invoiceSummary(invoiceSettings, isSl),
                                leadingIcon = Icons.AutoMirrored.Rounded.ReceiptLong,
                                iconTint = Color(0xFF0968F5),
                                onClick = { showInvoicingDialog = true }
                            )
                            HorizontalDivider(color = Color(0xFFE5EAF2))
                            PreferenceNavigationRow(
                                title = tr("Subscribed tenants", "Naročeni ponudniki"),
                                value = "${subscribedTenants.size}",
                                leadingIcon = Icons.Rounded.Business,
                                iconTint = Color(0xFFFF8A00),
                                onClick = { showSubscribedTenantsDialog = true }
                            )
                            HorizontalDivider(color = Color(0xFFE5EAF2))
                            PreferenceNavigationRow(
                                title = tr("Privacy Policy", "Politika zasebnosti"),
                                value = tr("Open", "Odpri"),
                                leadingIcon = Icons.Rounded.PersonOutline,
                                iconTint = Color(0xFF0968F5),
                                onClick = { openLegalPage(privacyPolicyUrl) }
                            )
                            HorizontalDivider(color = Color(0xFFE5EAF2))
                            PreferenceNavigationRow(
                                title = tr("Terms of Service", "Pogoji uporabe"),
                                value = tr("Open", "Odpri"),
                                leadingIcon = Icons.AutoMirrored.Rounded.ReceiptLong,
                                iconTint = Color(0xFF0968F5),
                                onClick = { openLegalPage(termsOfServiceUrl) }
                            )
                            HorizontalDivider(color = Color(0xFFE5EAF2))
                            PreferenceNavigationRow(
                                title = tr("Account deletion information", "Informacije o izbrisu računa"),
                                value = tr("Open", "Odpri"),
                                leadingIcon = Icons.Rounded.DeleteOutline,
                                iconTint = Color(0xFF0968F5),
                                onClick = { openAccountDeletionPage() }
                            )
                            HorizontalDivider(color = Color(0xFFE5EAF2))
                            PreferenceDangerRow(
                                title = tr("Delete account", "Izbriši račun"),
                                leadingIcon = Icons.Rounded.DeleteOutline,
                                onClick = { showDeleteAccountDialog = true }
                            )
                            HorizontalDivider(color = Color(0xFFE5EAF2))
                            PreferenceDangerRow(
                                title = tr("Log out", "Odjava"),
                                leadingIcon = Icons.AutoMirrored.Rounded.Logout,
                                onClick = onLogout
                            )
                        }
                    }
                }
            }
        }
    }

    if (showLanguagePicker) {
        AlertDialog(
            onDismissRequest = { if (!savingPreference) showLanguagePicker = false },
            title = { Text(tr("Language", "Jezik")) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    TextButton(
                        enabled = !savingPreference,
                        onClick = {
                            scope.launch {
                                savingPreference = true
                                val success = persistRemote(profile.copy(language = "en"))
                                savingPreference = false
                                if (success) showLanguagePicker = false
                            }
                        }
                    ) {
                        Text("English")
                    }
                    TextButton(
                        enabled = !savingPreference,
                        onClick = {
                            scope.launch {
                                savingPreference = true
                                val success = persistRemote(profile.copy(language = "sl"))
                                savingPreference = false
                                if (success) showLanguagePicker = false
                            }
                        }
                    ) {
                        Text("Slovenščina")
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showLanguagePicker = false }, enabled = !savingPreference) {
                    Text(if (savingPreference) tr("Saving…", "Shranjevanje…") else tr("Cancel", "Prekliči"))
                }
            }
        )
    }

    if (showNotificationsDialog) {
        AlertDialog(
            onDismissRequest = { if (!savingPreference) showNotificationsDialog = false },
            title = { Text(tr("Notifications", "Obvestila")) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        tr("Choose which push notifications you want to receive on this device when the app is in the background.", "Izberite, katera potisna obvestila želite prejemati na tej napravi, ko je aplikacija v ozadju."),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    NotificationToggleRow(
                        title = tr("Messages", "Sporočila"),
                        description = tr("New inbox messages from your provider", "Nova sporočila ponudnika"),
                        checked = notifyMessagesEnabled,
                        enabled = !savingPreference,
                        onCheckedChange = { nextValue ->
                            val previous = notifyMessagesEnabled
                            notifyMessagesEnabled = nextValue
                            scope.launch {
                                savingPreference = true
                                val success = persistRemote(profile, notifyMessages = nextValue)
                                savingPreference = false
                                if (!success) notifyMessagesEnabled = previous
                            }
                        }
                    )
                    NotificationToggleRow(
                        title = tr("Reminders", "Opomniki"),
                        description = tr("Appointment reminders and updates", "Opomniki in posodobitve terminov"),
                        checked = notifyRemindersEnabled,
                        enabled = !savingPreference,
                        onCheckedChange = { nextValue ->
                            val previous = notifyRemindersEnabled
                            notifyRemindersEnabled = nextValue
                            scope.launch {
                                savingPreference = true
                                val success = persistRemote(profile, notifyReminders = nextValue)
                                savingPreference = false
                                if (!success) notifyRemindersEnabled = previous
                            }
                        }
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = { showNotificationsDialog = false },
                    enabled = !savingPreference
                ) {
                    Text(if (savingPreference) tr("Saving…", "Shranjevanje…") else tr("Done", "Končano"))
                }
            }
        )
    }

    if (showInvoicingDialog) {
        InvoiceSettingsDialog(
            initial = invoiceSettings,
            saving = savingPreference,
            isSl = isSl,
            onDismiss = { if (!savingPreference) showInvoicingDialog = false },
            onSave = { updated ->
                scope.launch {
                    val validationError = invoiceValidationError(updated, isSl)
                    if (validationError != null) {
                        remoteError = validationError
                        return@launch
                    }
                    savingPreference = true
                    val success = persistRemote(profile, invoice = updated, includeInvoiceSettings = true)
                    savingPreference = false
                    if (success) showInvoicingDialog = false
                }
            }
        )
    }

    if (showSubscribedTenantsDialog) {
        AlertDialog(
            onDismissRequest = { if (!tenantActionInProgress) showSubscribedTenantsDialog = false },
            title = { Text(tr("Subscribed tenants", "Naročeni ponudniki")) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (subscribedTenants.isEmpty()) {
                        Text(
                            tr("No subscribed tenants yet.", "Ni še naročenih ponudnikov."),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    } else {
                        subscribedTenants.forEach { tenant ->
                            var tenantMenuExpanded by remember(tenant.companyId) { mutableStateOf(false) }
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(horizontal = 12.dp, vertical = 10.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        tenant.companyName,
                                        style = MaterialTheme.typography.bodyLarge,
                                        color = MaterialTheme.colorScheme.onSurface,
                                        fontWeight = FontWeight.SemiBold,
                                        modifier = Modifier.weight(1f)
                                    )
                                    Box {
                                        IconButton(
                                            enabled = !tenantActionInProgress,
                                            onClick = { tenantMenuExpanded = true }
                                        ) {
                                            Icon(Icons.Rounded.MoreVert, contentDescription = tr("Tenant actions", "Dejanja ponudnika"))
                                        }
                                        DropdownMenu(
                                            expanded = tenantMenuExpanded,
                                            onDismissRequest = { tenantMenuExpanded = false }
                                        ) {
                                            DropdownMenuItem(
                                                text = { Text(tr("Unsubscribe", "Odjavi se")) },
                                                onClick = {
                                                    tenantMenuExpanded = false
                                                    tenantAction = TenantLifecycleAction(
                                                        companyId = tenant.companyId,
                                                        companyName = tenant.companyName,
                                                        type = TenantLifecycleActionType.Unsubscribe
                                                    )
                                                }
                                            )
                                            DropdownMenuItem(
                                                text = {
                                                    Text(
                                                        tr("Anonymize", "Anonimiziraj"),
                                                        color = MaterialTheme.colorScheme.error
                                                    )
                                                },
                                                onClick = {
                                                    tenantMenuExpanded = false
                                                    tenantAction = TenantLifecycleAction(
                                                        companyId = tenant.companyId,
                                                        companyName = tenant.companyName,
                                                        type = TenantLifecycleActionType.Anonymize
                                                    )
                                                }
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                    tenantActionError?.let {
                        Text(
                            it,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error
                        )
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    showSubscribedTenantsDialog = false
                    if (subscribedTenants.isEmpty()) onLogout()
                }, enabled = !tenantActionInProgress) {
                    Text(if (tenantActionInProgress) tr("Working…", "Obdelava…") else tr("Close", "Zapri"))
                }
            }
        )
    }

    tenantAction?.let { pendingAction ->
        val isUnsubscribe = pendingAction.type == TenantLifecycleActionType.Unsubscribe
        val actionLabel = if (isUnsubscribe) tr("Unsubscribe", "Odjavi se") else tr("Anonymize", "Anonimiziraj")
        val actionDetails = if (isUnsubscribe) {
            tr("You can only unsubscribe when there are no active sessions or entitlements for this tenancy.", "Odjavite se lahko samo, če pri tem ponudniku nimate aktivnih terminov ali ugodnosti.")
        } else {
            tr("This anonymizes your tenant data and marks the tenancy inactive. You can only do this when there are no active sessions or entitlements.", "To anonimizira vaše podatke pri ponudniku in označi povezavo kot neaktivno. To lahko naredite samo, če nimate aktivnih terminov ali ugodnosti.")
        }
        AlertDialog(
            onDismissRequest = {
                if (!tenantActionInProgress) tenantAction = null
            },
            title = { Text(if (isSl) "$actionLabel: ${pendingAction.companyName}?" else "$actionLabel from ${pendingAction.companyName}?") },
            text = { Text(actionDetails) },
            confirmButton = {
                TextButton(
                    enabled = !tenantActionInProgress,
                    onClick = {
                        scope.launch {
                            tenantActionInProgress = true
                            tenantActionError = null
                            runCatching {
                                if (pendingAction.type == TenantLifecycleActionType.Unsubscribe) {
                                    onUnsubscribeTenant(pendingAction.companyId)
                                } else {
                                    onAnonymizeTenant(pendingAction.companyId)
                                }
                            }.onSuccess {
                                tenantAction = null
                                remoteError = null
                            }.onFailure {
                                tenantActionError = it.message ?: tr("Unable to complete tenancy action", "Dejanja ni bilo mogoče dokončati")
                            }
                            tenantActionInProgress = false
                        }
                    },
                    colors = if (isUnsubscribe) {
                        ButtonDefaults.textButtonColors()
                    } else {
                        ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)
                    }
                ) {
                    Text(if (tenantActionInProgress) tr("Working…", "Obdelava…") else actionLabel)
                }
            },
            dismissButton = {
                TextButton(
                    enabled = !tenantActionInProgress,
                    onClick = { tenantAction = null }
                ) { Text(tr("Cancel", "Prekliči")) }
            }
        )
    }

    if (showDeleteAccountDialog) {
        AlertDialog(
            onDismissRequest = { if (!deletingAccount) showDeleteAccountDialog = false },
            title = { Text(tr("Delete account?", "Izbrišem račun?")) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        tr(
                            "This will delete and anonymize your Calendra Guest App account, remove this device from push notifications, unlink your subscribed tenants, and sign you out.",
                            "S tem boste izbrisali oziroma anonimizirali račun Calendra Guest App, odstranili to napravo iz potisnih obvestil, prekinili povezave z naročenimi ponudniki in se odjavili."
                        )
                    )
                    Text(
                        tr(
                            "Issued invoices, payments, bookings and records that Calendra or a tenant must keep for accounting, tax, legal or security reasons may be retained.",
                            "Izdani računi, plačila, termini in zapisi, ki jih mora Calendra ali ponudnik hraniti zaradi računovodskih, davčnih, pravnih ali varnostnih razlogov, se lahko hranijo še naprej."
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    TextButton(
                        enabled = !deletingAccount,
                        onClick = { openAccountDeletionPage() }
                    ) {
                        Text(tr("Open public deletion information page", "Odpri javno stran z informacijami o izbrisu"))
                    }
                }
            },
            confirmButton = {
                TextButton(
                    enabled = !deletingAccount,
                    onClick = {
                        scope.launch {
                            deletingAccount = true
                            remoteError = null
                            runCatching { onDeleteGuestAccount() }
                                .onSuccess { showDeleteAccountDialog = false }
                                .onFailure {
                                    remoteError = it.message ?: tr("Could not delete account", "Računa ni bilo mogoče izbrisati")
                                }
                            deletingAccount = false
                        }
                    },
                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)
                ) {
                    Text(if (deletingAccount) tr("Deleting…", "Brisanje…") else tr("Delete account", "Izbriši račun"))
                }
            },
            dismissButton = {
                TextButton(
                    enabled = !deletingAccount,
                    onClick = { showDeleteAccountDialog = false }
                ) {
                    Text(tr("Cancel", "Prekliči"))
                }
            }
        )
    }

    if (editing) {
        EditProfileDialog(
            initial = profile,
            saving = savingProfile,
            isSl = isSl,
            onDismiss = { if (!savingProfile) editing = false },
            onSave = { updated ->
                scope.launch {
                    savingProfile = true
                    val success = persistRemote(updated)
                    savingProfile = false
                    if (success) editing = false
                }
            }
        )
    }

}

@Composable
private fun BoxScope.ProfileAmbientBackground() {
    Box(
        Modifier
            .size(260.dp)
            .offset(x = (-120).dp, y = (-145).dp)
            .align(Alignment.TopStart)
            .background(Color(0xFFDCEBFF).copy(alpha = 0.55f), CircleShape)
    )
    Box(
        Modifier
            .size(190.dp)
            .offset(x = 246.dp, y = 560.dp)
            .align(Alignment.TopStart)
            .background(Color(0xFFFFE2B8).copy(alpha = 0.24f), CircleShape)
    )
    Box(
        Modifier
            .width(2.dp)
            .height(260.dp)
            .offset(x = 350.dp, y = 620.dp)
            .align(Alignment.TopStart)
            .clip(RoundedCornerShape(50))
            .background(Color(0xFFFF8A00).copy(alpha = 0.32f))
    )
    Box(
        Modifier
            .size(132.dp)
            .offset(x = 280.dp, y = 52.dp)
            .align(Alignment.TopStart)
            .background(Color(0xFFEAF3FF).copy(alpha = 0.58f), CircleShape)
    )
}

@Composable
private fun ProfileAvatar(
    uploading: Boolean,
    avatarBitmap: Bitmap?,
    enabled: Boolean,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .size(80.dp)
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Surface(
            shape = CircleShape,
            color = Color(0xFFE8F2FF),
            modifier = Modifier.size(80.dp)
        ) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                when {
                    uploading -> CircularProgressIndicator(
                        modifier = Modifier.size(28.dp),
                        strokeWidth = 2.dp,
                        color = Color(0xFF0968F5)
                    )
                    avatarBitmap != null -> Image(
                        bitmap = avatarBitmap.asImageBitmap(),
                        contentDescription = "Profile picture",
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize()
                    )
                    else -> Icon(
                        Icons.Rounded.PersonOutline,
                        contentDescription = "Change profile picture",
                        tint = Color(0xFF0968F5),
                        modifier = Modifier.size(38.dp)
                    )
                }
            }
        }
        Box(
            Modifier
                .align(Alignment.BottomCenter)
                .offset(y = 4.dp)
                .width(58.dp)
                .height(3.dp)
                .clip(RoundedCornerShape(50))
                .background(Color(0xFFFF8A00))
        )
    }
}

private fun languageDisplayName(code: String): String = when (code.lowercase()) {
    "sl" -> "Slovenščina"
    else -> "English"
}

private fun notificationsSummary(messages: Boolean, reminders: Boolean, isSl: Boolean): String = when {
    messages && reminders -> if (isSl) "Vklopljeno" else "On"
    !messages && !reminders -> if (isSl) "Izklopljeno" else "Off"
    messages -> if (isSl) "Samo sporočila" else "Messages only"
    else -> if (isSl) "Samo opomniki" else "Reminders only"
}

private fun reminderMinuteOptions(): List<Int> = listOf(5, 15, 30, 60, 180, 1440)

private fun normalizeReminderMinutes(value: Int): Int = if (value in reminderMinuteOptions()) value else 60

private fun invoiceSummary(invoice: LocalInvoiceSettings, isSl: Boolean): String =
    if (invoice.recipientType.equals("COMPANY", ignoreCase = true)) {
        if (isSl) "Podjetje" else "Company"
    } else {
        if (isSl) "Fizična oseba" else "Individual"
    }

private fun invoiceValidationError(invoice: LocalInvoiceSettings, isSl: Boolean): String? {
    val isCompany = invoice.recipientType.equals("COMPANY", ignoreCase = true)
    if (isCompany) {
        if (invoice.companyName.isBlank()) return if (isSl) "Naziv podjetja je obvezen." else "Company name is required."
        if (invoice.companyAddressLine.isBlank()) return if (isSl) "Naslov podjetja je obvezen." else "Company address is required."
        if (invoice.companyPostalCode.isBlank()) return if (isSl) "Poštna številka podjetja je obvezna." else "Company postal code is required."
        if (invoice.companyCity.isBlank()) return if (isSl) "Kraj podjetja je obvezen." else "Company city is required."
        if (invoice.companyVatId.isBlank()) return if (isSl) "Davčna številka podjetja je obvezna." else "Company VAT ID is required."
        return null
    }
    if (invoice.personAddressLine.isBlank()) return if (isSl) "Naslov je obvezen." else "Address is required."
    if (invoice.personPostalCode.isBlank()) return if (isSl) "Poštna številka je obvezna." else "Postal code is required."
    if (invoice.personCity.isBlank()) return if (isSl) "Kraj je obvezen." else "City is required."
    return null
}

@Composable
private fun NotificationToggleRow(
    title: String,
    description: String,
    checked: Boolean,
    enabled: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall.copy(fontSize = 15.sp), fontWeight = FontWeight.SemiBold)
            Text(description, style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Switch(checked = checked, onCheckedChange = onCheckedChange, enabled = enabled)
    }
}

@Composable
private fun PreferenceNavigationRow(
    title: String,
    value: String,
    leadingIcon: ImageVector,
    iconTint: Color,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 50.dp)
            .clickable(onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 6.dp),
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
                tint = iconTint
            )
            Text(
                title,
                style = MaterialTheme.typography.titleLarge.copy(fontSize = 15.sp),
                fontWeight = FontWeight.Bold,
                color = Color(0xFF061B3A)
            )
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(value, style = MaterialTheme.typography.titleLarge.copy(fontSize = 15.sp), color = Color(0xFF62728A))
            Icon(
                Icons.Rounded.KeyboardArrowRight,
                contentDescription = null,
                modifier = Modifier.size(22.dp),
                tint = Color(0xFF9BA7B7)
            )
        }
    }
}

@Composable
private fun PreferenceDangerRow(
    title: String,
    leadingIcon: ImageVector,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 50.dp)
            .clickable(onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 6.dp),
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
                tint = Color(0xFFD6291D)
            )
            Text(
                title,
                style = MaterialTheme.typography.titleLarge.copy(fontSize = 15.sp),
                fontWeight = FontWeight.Bold,
                color = Color(0xFFD6291D)
            )
        }
        Icon(
            Icons.Rounded.KeyboardArrowRight,
            contentDescription = null,
            modifier = Modifier.size(22.dp),
            tint = Color(0xFFD6291D)
        )
    }
}

@Composable
private fun InvoiceSettingsDialog(
    initial: LocalInvoiceSettings,
    saving: Boolean,
    isSl: Boolean,
    onDismiss: () -> Unit,
    onSave: (LocalInvoiceSettings) -> Unit
) {
    var recipientType by remember(initial) { mutableStateOf(initial.recipientType) }
    var personAddressLine by remember(initial) { mutableStateOf(initial.personAddressLine) }
    var personPostalCode by remember(initial) { mutableStateOf(initial.personPostalCode) }
    var personCity by remember(initial) { mutableStateOf(initial.personCity) }
    var companyName by remember(initial) { mutableStateOf(initial.companyName) }
    var companyAddressLine by remember(initial) { mutableStateOf(initial.companyAddressLine) }
    var companyPostalCode by remember(initial) { mutableStateOf(initial.companyPostalCode) }
    var companyCity by remember(initial) { mutableStateOf(initial.companyCity) }
    var companyVatId by remember(initial) { mutableStateOf(initial.companyVatId) }
    val isCompany = recipientType.equals("COMPANY", ignoreCase = true)
    fun tr(en: String, sl: String): String = if (isSl) sl else en

    AlertDialog(
        onDismissRequest = { if (!saving) onDismiss() },
        title = { Text(tr("Invoice address", "Naslov za račun")) },
        text = {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (isCompany) {
                            OutlinedButton(onClick = { recipientType = "PERSON" }, enabled = !saving, shape = RoundedCornerShape(12.dp)) {
                                Text(tr("Individual", "Fizična oseba"))
                            }
                            Button(onClick = { recipientType = "COMPANY" }, enabled = !saving, shape = RoundedCornerShape(12.dp)) {
                                Text(tr("Company", "Podjetje"))
                            }
                        } else {
                            Button(onClick = { recipientType = "PERSON" }, enabled = !saving, shape = RoundedCornerShape(12.dp)) {
                                Text(tr("Individual", "Fizična oseba"))
                            }
                            OutlinedButton(onClick = { recipientType = "COMPANY" }, enabled = !saving, shape = RoundedCornerShape(12.dp)) {
                                Text(tr("Company", "Podjetje"))
                            }
                        }
                    }
                }
                if (isCompany) {
                    item {
                        OutlinedTextField(value = companyName, onValueChange = { companyName = it }, label = { Text(tr("Company name", "Naziv podjetja")) }, singleLine = true, enabled = !saving)
                    }
                    item {
                        OutlinedTextField(value = companyAddressLine, onValueChange = { companyAddressLine = it }, label = { Text(tr("Address", "Naslov")) }, singleLine = true, enabled = !saving)
                    }
                    item {
                        OutlinedTextField(value = companyPostalCode, onValueChange = { companyPostalCode = it }, label = { Text(tr("Postal code", "Poštna številka")) }, singleLine = true, enabled = !saving)
                    }
                    item {
                        OutlinedTextField(value = companyCity, onValueChange = { companyCity = it }, label = { Text(tr("City", "Kraj")) }, singleLine = true, enabled = !saving)
                    }
                    item {
                        OutlinedTextField(value = companyVatId, onValueChange = { companyVatId = it }, label = { Text(tr("VAT ID", "Davčna številka")) }, singleLine = true, enabled = !saving)
                    }
                } else {
                    item {
                        OutlinedTextField(value = personAddressLine, onValueChange = { personAddressLine = it }, label = { Text(tr("Address", "Naslov")) }, singleLine = true, enabled = !saving)
                    }
                    item {
                        OutlinedTextField(value = personPostalCode, onValueChange = { personPostalCode = it }, label = { Text(tr("Postal code", "Poštna številka")) }, singleLine = true, enabled = !saving)
                    }
                    item {
                        OutlinedTextField(value = personCity, onValueChange = { personCity = it }, label = { Text(tr("City", "Kraj")) }, singleLine = true, enabled = !saving)
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    onSave(
                        LocalInvoiceSettings(
                            recipientType = recipientType,
                            personAddressLine = personAddressLine,
                            personPostalCode = personPostalCode,
                            personCity = personCity,
                            companyName = companyName,
                            companyAddressLine = companyAddressLine,
                            companyPostalCode = companyPostalCode,
                            companyCity = companyCity,
                            companyVatId = companyVatId
                        )
                    )
                },
                enabled = !saving
            ) {
                Text(if (saving) tr("Saving…", "Shranjevanje…") else tr("Save", "Shrani"))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !saving) {
                Text(tr("Cancel", "Prekliči"))
            }
        }
    )
}

@Composable
private fun EditProfileDialog(
    initial: LocalGuestProfile,
    saving: Boolean,
    isSl: Boolean,
    onDismiss: () -> Unit,
    onSave: (LocalGuestProfile) -> Unit
) {
    var firstName by remember(initial) { mutableStateOf(initial.firstName) }
    var lastName by remember(initial) { mutableStateOf(initial.lastName) }
    var email by remember(initial) { mutableStateOf(initial.email) }
    var phone by remember(initial) { mutableStateOf(initial.phone) }
    fun tr(en: String, sl: String): String = if (isSl) sl else en

    AlertDialog(
        onDismissRequest = { if (!saving) onDismiss() },
        title = { Text(tr("Edit personal data", "Uredi osebne podatke")) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(value = firstName, onValueChange = { firstName = it }, label = { Text(tr("First name", "Ime")) }, singleLine = true, enabled = !saving)
                OutlinedTextField(value = lastName, onValueChange = { lastName = it }, label = { Text(tr("Last name", "Priimek")) }, singleLine = true, enabled = !saving)
                OutlinedTextField(value = email, onValueChange = { email = it }, label = { Text(tr("Email", "E-pošta")) }, singleLine = true, enabled = !saving, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
                OutlinedTextField(value = phone, onValueChange = { phone = it }, label = { Text(tr("Phone", "Telefon")) }, singleLine = true, enabled = !saving, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone), leadingIcon = { Icon(Icons.Rounded.Phone, contentDescription = null) })
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    onSave(
                        initial.copy(
                            firstName = firstName,
                            lastName = lastName,
                            email = email,
                            phone = phone
                        )
                    )
                },
                enabled = !saving
            ) {
                Text(if (saving) tr("Saving…", "Shranjevanje…") else tr("Save", "Shrani"))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !saving) {
                Text(tr("Cancel", "Prekliči"))
            }
        }
    )
}

private suspend fun readProfileImagePayload(context: Context, uri: Uri): Triple<String, String?, ByteArray> =
    withContext(Dispatchers.IO) {
        val cr = context.contentResolver
        val mime = cr.getType(uri)
        var displayName: String? = null
        cr.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst()) displayName = c.getString(0)
        }
        val bytes = cr.openInputStream(uri).use { stream -> stream?.readBytes() } ?: ByteArray(0)
        val name = displayName?.takeIf { it.isNotBlank() } ?: "profile.jpg"
        Triple(name, mime, bytes)
    }

private class LocalProfileStore(context: Context) {
    private val prefs = context.getSharedPreferences("guest_profile_store", Context.MODE_PRIVATE)

    fun load(session: GuestSession?): LocalGuestProfile {
        val fallback = LocalGuestProfile(
            firstName = session?.guestUser?.firstName.orEmpty(),
            lastName = session?.guestUser?.lastName.orEmpty(),
            email = session?.guestUser?.email.orEmpty(),
            phone = session?.guestUser?.phone.orEmpty(),
            language = session?.guestUser?.language ?: "en"
        )
        return LocalGuestProfile(
            firstName = decode("first_name") ?: fallback.firstName,
            lastName = decode("last_name") ?: fallback.lastName,
            email = decode("email") ?: fallback.email,
            phone = decode("phone") ?: fallback.phone,
            language = decode("language") ?: fallback.language
        )
    }

    fun save(profile: LocalGuestProfile) {
        prefs.edit()
            .putString("first_name", encode(profile.firstName))
            .putString("last_name", encode(profile.lastName))
            .putString("email", encode(profile.email))
            .putString("phone", encode(profile.phone))
            .putString("language", encode(profile.language))
            .apply()
    }

    private fun encode(value: String): String = Base64.encodeToString(value.toByteArray(Charsets.UTF_8), Base64.NO_WRAP)
    private fun decode(key: String): String? = prefs.getString(key, null)?.let {
        runCatching { String(Base64.decode(it, Base64.NO_WRAP), Charsets.UTF_8) }.getOrNull()
    }
}
