package si.calendra.guest.android.ui.screens

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Logout
import androidx.compose.material.icons.automirrored.rounded.ReceiptLong
import androidx.compose.material.icons.rounded.Business
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
    onLoadProfileSettings: suspend (String?) -> GuestProfileSettings,
    onSaveProfileSettings: suspend (UpdateGuestProfileSettingsRequest) -> GuestProfileSettings,
    onUploadProfilePicture: suspend (String, String?, ByteArray) -> GuestProfileSettings,
    onDownloadProfilePicture: suspend () -> ByteArray,
    onUnsubscribeTenant: suspend (String) -> Unit,
    onAnonymizeTenant: suspend (String) -> Unit,
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
    var avatarBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var uploadingAvatar by remember { mutableStateOf(false) }
    var loadingRemote by remember(activeTenantId) { mutableStateOf(false) }
    var savingPreference by remember { mutableStateOf(false) }
    var savingProfile by remember { mutableStateOf(false) }
    var remoteError by remember(activeTenantId) { mutableStateOf<String?>(null) }
    var notifyMessagesEnabled by remember(activeTenantId) { mutableStateOf(true) }
    var notifyRemindersEnabled by remember(activeTenantId) { mutableStateOf(true) }
    var invoiceSettings by remember(activeTenantId) { mutableStateOf(LocalInvoiceSettings()) }
    var tenantAction by remember { mutableStateOf<TenantLifecycleAction?>(null) }
    var tenantActionInProgress by remember { mutableStateOf(false) }
    var tenantActionError by remember { mutableStateOf<String?>(null) }
    val subscribedTenants = session?.linkedTenants.orEmpty()

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
    }

    suspend fun persistRemote(
        updated: LocalGuestProfile,
        invoice: LocalInvoiceSettings = invoiceSettings,
        includeInvoiceSettings: Boolean = false,
        notifyMessages: Boolean? = null,
        notifyReminders: Boolean? = null
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
            remoteError = it.message ?: "Unable to save profile settings"
        }.isSuccess
    }

    LaunchedEffect(session?.guestUser?.id, activeTenantId) {
        if (session == null) return@LaunchedEffect
        loadingRemote = true
        remoteError = null
        runCatching { onLoadProfileSettings(activeTenantId) }
            .onSuccess { mergeRemoteSettings(it) }
            .onFailure { remoteError = it.message ?: "Unable to load profile settings" }
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
                if (bytes.isEmpty()) error("Could not read image")
                val settings = onUploadProfilePicture(name, mime, bytes)
                mergeRemoteSettings(settings)
            }.onFailure { remoteError = it.message ?: "Could not upload profile picture" }
            uploadingAvatar = false
        }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 124.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp)
    ) {
        item {
            ElevatedCard(shape = RoundedCornerShape(30.dp), colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Surface(
                            shape = RoundedCornerShape(22.dp),
                            color = MaterialTheme.colorScheme.primaryContainer,
                            modifier = Modifier
                                .size(56.dp)
                                .clip(RoundedCornerShape(22.dp))
                                .clickable(enabled = !uploadingAvatar && !loadingRemote) {
                                    pickAvatar.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                                }
                        ) {
                            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                when {
                                    uploadingAvatar ->
                                        CircularProgressIndicator(
                                            modifier = Modifier.size(28.dp),
                                            strokeWidth = 2.dp,
                                            color = MaterialTheme.colorScheme.onPrimaryContainer
                                        )
                                    avatarBitmap != null ->
                                        Image(
                                            bitmap = avatarBitmap!!.asImageBitmap(),
                                            contentDescription = "Profile picture",
                                            contentScale = ContentScale.Crop,
                                            modifier = Modifier.fillMaxSize()
                                        )
                                    else ->
                                        Icon(
                                            Icons.Rounded.PersonOutline,
                                            contentDescription = "Change profile picture",
                                            tint = MaterialTheme.colorScheme.onPrimaryContainer
                                        )
                                }
                            }
                        }
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text("${profile.firstName} ${profile.lastName}".trim(), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                            Text(profile.email, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }

                    Button(
                        onClick = { editing = true },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(18.dp),
                        enabled = !loadingRemote && !savingProfile
                    ) {
                        Text("Edit personal data")
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
                            title = "Notifications",
                            value = notificationsSummary(notifyMessagesEnabled, notifyRemindersEnabled),
                            leadingIcon = Icons.Rounded.Notifications,
                            onClick = { showNotificationsDialog = true }
                        )
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f))
                        PreferenceNavigationRow(
                            title = "Invoicing",
                            value = invoiceSummary(invoiceSettings),
                            leadingIcon = Icons.AutoMirrored.Rounded.ReceiptLong,
                            onClick = { showInvoicingDialog = true }
                        )
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f))
                        PreferenceNavigationRow(
                            title = "Subscribed tenants",
                            value = "${subscribedTenants.size}",
                            leadingIcon = Icons.Rounded.Business,
                            onClick = { showSubscribedTenantsDialog = true }
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
            onDismissRequest = { if (!savingPreference) showLanguagePicker = false },
            title = { Text("Language") },
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
                    Text(if (savingPreference) "Saving…" else "Cancel")
                }
            }
        )
    }

    if (showNotificationsDialog) {
        AlertDialog(
            onDismissRequest = { if (!savingPreference) showNotificationsDialog = false },
            title = { Text("Notifications") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(
                        "Choose which push notifications you want to receive on this device when the app is in the background.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    NotificationToggleRow(
                        title = "Messages",
                        description = "New inbox messages from your provider",
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
                        title = "Reminders",
                        description = "Appointment reminders and updates",
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
                    Text(if (savingPreference) "Saving…" else "Done")
                }
            }
        )
    }

    if (showInvoicingDialog) {
        InvoiceSettingsDialog(
            initial = invoiceSettings,
            saving = savingPreference,
            onDismiss = { if (!savingPreference) showInvoicingDialog = false },
            onSave = { updated ->
                scope.launch {
                    val validationError = invoiceValidationError(updated)
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
            title = { Text("Subscribed tenants") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (subscribedTenants.isEmpty()) {
                        Text(
                            "No subscribed tenants yet.",
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
                                            Icon(Icons.Rounded.MoreVert, contentDescription = "Tenant actions")
                                        }
                                        DropdownMenu(
                                            expanded = tenantMenuExpanded,
                                            onDismissRequest = { tenantMenuExpanded = false }
                                        ) {
                                            DropdownMenuItem(
                                                text = { Text("Unsubscribe") },
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
                                                        "Anonymize",
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
                    Text(if (tenantActionInProgress) "Working…" else "Close")
                }
            }
        )
    }

    tenantAction?.let { pendingAction ->
        val isUnsubscribe = pendingAction.type == TenantLifecycleActionType.Unsubscribe
        val actionLabel = if (isUnsubscribe) "Unsubscribe" else "Anonymize"
        val actionDetails = if (isUnsubscribe) {
            "You can only unsubscribe when there are no active sessions or entitlements for this tenancy."
        } else {
            "This anonymizes your tenant data and marks the tenancy inactive. You can only do this when there are no active sessions or entitlements."
        }
        AlertDialog(
            onDismissRequest = {
                if (!tenantActionInProgress) tenantAction = null
            },
            title = { Text("$actionLabel from ${pendingAction.companyName}?") },
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
                                tenantActionError = it.message ?: "Unable to complete tenancy action"
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
                    Text(if (tenantActionInProgress) "Working…" else actionLabel)
                }
            },
            dismissButton = {
                TextButton(
                    enabled = !tenantActionInProgress,
                    onClick = { tenantAction = null }
                ) { Text("Cancel") }
            }
        )
    }

    if (editing) {
        EditProfileDialog(
            initial = profile,
            saving = savingProfile,
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

private fun languageDisplayName(code: String): String = when (code.lowercase()) {
    "sl" -> "Slovenščina"
    else -> "English"
}

private fun notificationsSummary(messages: Boolean, reminders: Boolean): String = when {
    messages && reminders -> "On"
    !messages && !reminders -> "Off"
    messages -> "Messages only"
    else -> "Reminders only"
}

private fun invoiceSummary(invoice: LocalInvoiceSettings): String =
    if (invoice.recipientType.equals("COMPANY", ignoreCase = true)) "Company" else "Individual"

private fun invoiceValidationError(invoice: LocalInvoiceSettings): String? {
    val isCompany = invoice.recipientType.equals("COMPANY", ignoreCase = true)
    if (isCompany) {
        if (invoice.companyName.isBlank()) return "Company name is required."
        if (invoice.companyAddressLine.isBlank()) return "Company address is required."
        if (invoice.companyPostalCode.isBlank()) return "Company postal code is required."
        if (invoice.companyCity.isBlank()) return "Company city is required."
        if (invoice.companyVatId.isBlank()) return "Company VAT ID is required."
        return null
    }
    if (invoice.personAddressLine.isBlank()) return "Address is required."
    if (invoice.personPostalCode.isBlank()) return "Postal code is required."
    if (invoice.personCity.isBlank()) return "City is required."
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
            Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Text(description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Switch(checked = checked, onCheckedChange = onCheckedChange, enabled = enabled)
    }
}

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

@Composable
private fun InvoiceSettingsDialog(
    initial: LocalInvoiceSettings,
    saving: Boolean,
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

    AlertDialog(
        onDismissRequest = { if (!saving) onDismiss() },
        title = { Text("Invoice address") },
        text = {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (isCompany) {
                            OutlinedButton(onClick = { recipientType = "PERSON" }, enabled = !saving, shape = RoundedCornerShape(12.dp)) {
                                Text("Individual")
                            }
                            Button(onClick = { recipientType = "COMPANY" }, enabled = !saving, shape = RoundedCornerShape(12.dp)) {
                                Text("Company")
                            }
                        } else {
                            Button(onClick = { recipientType = "PERSON" }, enabled = !saving, shape = RoundedCornerShape(12.dp)) {
                                Text("Individual")
                            }
                            OutlinedButton(onClick = { recipientType = "COMPANY" }, enabled = !saving, shape = RoundedCornerShape(12.dp)) {
                                Text("Company")
                            }
                        }
                    }
                }
                if (isCompany) {
                    item {
                        OutlinedTextField(value = companyName, onValueChange = { companyName = it }, label = { Text("Company name") }, singleLine = true, enabled = !saving)
                    }
                    item {
                        OutlinedTextField(value = companyAddressLine, onValueChange = { companyAddressLine = it }, label = { Text("Address") }, singleLine = true, enabled = !saving)
                    }
                    item {
                        OutlinedTextField(value = companyPostalCode, onValueChange = { companyPostalCode = it }, label = { Text("Postal code") }, singleLine = true, enabled = !saving)
                    }
                    item {
                        OutlinedTextField(value = companyCity, onValueChange = { companyCity = it }, label = { Text("City") }, singleLine = true, enabled = !saving)
                    }
                    item {
                        OutlinedTextField(value = companyVatId, onValueChange = { companyVatId = it }, label = { Text("VAT ID") }, singleLine = true, enabled = !saving)
                    }
                } else {
                    item {
                        OutlinedTextField(value = personAddressLine, onValueChange = { personAddressLine = it }, label = { Text("Address") }, singleLine = true, enabled = !saving)
                    }
                    item {
                        OutlinedTextField(value = personPostalCode, onValueChange = { personPostalCode = it }, label = { Text("Postal code") }, singleLine = true, enabled = !saving)
                    }
                    item {
                        OutlinedTextField(value = personCity, onValueChange = { personCity = it }, label = { Text("City") }, singleLine = true, enabled = !saving)
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
                Text(if (saving) "Saving…" else "Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !saving) {
                Text("Cancel")
            }
        }
    )
}

@Composable
private fun EditProfileDialog(
    initial: LocalGuestProfile,
    saving: Boolean,
    onDismiss: () -> Unit,
    onSave: (LocalGuestProfile) -> Unit
) {
    var firstName by remember(initial) { mutableStateOf(initial.firstName) }
    var lastName by remember(initial) { mutableStateOf(initial.lastName) }
    var email by remember(initial) { mutableStateOf(initial.email) }
    var phone by remember(initial) { mutableStateOf(initial.phone) }

    AlertDialog(
        onDismissRequest = { if (!saving) onDismiss() },
        title = { Text("Edit personal data") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(value = firstName, onValueChange = { firstName = it }, label = { Text("First name") }, singleLine = true, enabled = !saving)
                OutlinedTextField(value = lastName, onValueChange = { lastName = it }, label = { Text("Last name") }, singleLine = true, enabled = !saving)
                OutlinedTextField(value = email, onValueChange = { email = it }, label = { Text("Email") }, singleLine = true, enabled = !saving, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
                OutlinedTextField(value = phone, onValueChange = { phone = it }, label = { Text("Phone") }, singleLine = true, enabled = !saving, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone), leadingIcon = { Icon(Icons.Rounded.Phone, contentDescription = null) })
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
                Text(if (saving) "Saving…" else "Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !saving) {
                Text("Cancel")
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
