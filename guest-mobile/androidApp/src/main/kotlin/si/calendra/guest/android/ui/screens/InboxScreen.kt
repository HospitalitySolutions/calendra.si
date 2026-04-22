package si.calendra.guest.android.ui.screens

import android.graphics.Bitmap
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.outlined.AttachFile
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.InsertDriveFile
import androidx.compose.material.icons.outlined.PhotoLibrary
import androidx.compose.material.icons.outlined.PictureAsPdf
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import si.calendra.guest.shared.models.GuestInboxAttachment
import si.calendra.guest.shared.models.GuestInboxMessage
import si.calendra.guest.shared.models.GuestInboxUploadedAttachment
import java.util.Locale
import java.util.concurrent.atomic.AtomicLong

data class PendingInboxAttachment(
    val localId: Long,
    val fileName: String,
    val contentType: String?,
    val sizeBytes: Long,
    val uploadedId: Long? = null,
    val isUploading: Boolean = true,
    val errorMessage: String? = null
)

private val localAttachmentSeq = AtomicLong(1L)

data class AttachmentSource(
    val uri: Uri,
    val fileName: String,
    val contentType: String?,
    val sizeBytes: Long
)

@Composable
fun InboxScreen(
    tenantName: String?,
    messages: List<GuestInboxMessage>,
    onSend: (String, List<Long>) -> Unit,
    onOpenAttachment: (GuestInboxAttachment) -> Unit = {},
    loadAttachmentPreview: suspend (GuestInboxAttachment) -> Bitmap? = { null },
    uploadAttachment: suspend (AttachmentSource) -> GuestInboxUploadedAttachment = { error("Upload is not wired") },
    discardAttachment: suspend (Long) -> Unit = {}
) {
    var draft by remember { mutableStateOf("") }
    val pendingAttachments = remember { mutableStateListOf<PendingInboxAttachment>() }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    fun enqueueUri(uri: Uri) {
        val resolved = resolveAttachmentSource(context, uri) ?: return
        val localId = localAttachmentSeq.getAndIncrement()
        pendingAttachments += PendingInboxAttachment(
            localId = localId,
            fileName = resolved.fileName,
            contentType = resolved.contentType,
            sizeBytes = resolved.sizeBytes
        )
        scope.launch {
            val result = runCatching {
                withContext(Dispatchers.IO) { uploadAttachment(resolved) }
            }
            val index = pendingAttachments.indexOfFirst { it.localId == localId }
            if (index < 0) return@launch
            val current = pendingAttachments[index]
            pendingAttachments[index] = result.fold(
                onSuccess = { uploaded ->
                    current.copy(
                        uploadedId = uploaded.id,
                        fileName = uploaded.fileName.ifBlank { current.fileName },
                        contentType = uploaded.contentType ?: current.contentType,
                        sizeBytes = if (uploaded.sizeBytes > 0) uploaded.sizeBytes else current.sizeBytes,
                        isUploading = false,
                        errorMessage = null
                    )
                },
                onFailure = { throwable ->
                    current.copy(isUploading = false, errorMessage = throwable.message ?: "Upload failed")
                }
            )
        }
    }

    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        uris?.forEach { enqueueUri(it) }
    }
    val photoPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia()) { uris ->
        uris?.forEach { enqueueUri(it) }
    }

    val hasUploadedAttachment = pendingAttachments.any { it.uploadedId != null }
    val isUploading = pendingAttachments.any { it.isUploading }
    val canSend = tenantName != null &&
        !isUploading &&
        (draft.trim().isNotEmpty() || hasUploadedAttachment)

    Column(
        modifier = Modifier.fillMaxSize().padding(start = 20.dp, end = 20.dp, top = 0.dp, bottom = 12.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            if (messages.isEmpty()) {
                ElevatedCard(
                    shape = RoundedCornerShape(24.dp),
                    colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface),
                    modifier = Modifier.align(Alignment.TopCenter)
                ) {
                    Text(
                        "No messages yet. Start the conversation from the web app or send the first reply here.",
                        modifier = Modifier.padding(18.dp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } else {
                val entries = remember(messages) { buildChatEntries(messages) }
                val reversedEntries = remember(entries) { entries.asReversed() }
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    reverseLayout = true,
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                    contentPadding = PaddingValues(vertical = 8.dp)
                ) {
                    items(reversedEntries, key = { it.key }) { entry ->
                        when (entry) {
                            is ChatEntry.DateHeader -> DateSeparator(entry.label)
                            is ChatEntry.Msg -> MessageBubble(
                                message = entry.message,
                                onOpenAttachment = onOpenAttachment,
                                loadAttachmentPreview = loadAttachmentPreview
                            )
                        }
                    }
                }
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Surface(
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(24.dp),
                color = MaterialTheme.colorScheme.surface,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                tonalElevation = 0.dp,
                shadowElevation = 0.dp
            ) {
                Column(modifier = Modifier.fillMaxWidth()) {
                    if (pendingAttachments.isNotEmpty()) {
                        LazyRow(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 12.dp, vertical = 8.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            items(pendingAttachments, key = { it.localId }) { pending ->
                                PendingAttachmentChip(
                                    pending = pending,
                                    onRemove = {
                                        val uploadedId = pending.uploadedId
                                        pendingAttachments.removeAll { it.localId == pending.localId }
                                        if (uploadedId != null) {
                                            scope.launch {
                                                runCatching { discardAttachment(uploadedId) }
                                            }
                                        }
                                    }
                                )
                            }
                        }
                    }
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 44.dp)
                            .padding(start = 8.dp, end = 4.dp, top = 2.dp, bottom = 2.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .padding(horizontal = 8.dp, vertical = 4.dp)
                        ) {
                            BasicTextField(
                                value = draft,
                                onValueChange = { draft = it },
                                modifier = Modifier.fillMaxWidth(),
                                textStyle = MaterialTheme.typography.bodyLarge.copy(color = MaterialTheme.colorScheme.onSurface),
                                cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                                singleLine = true,
                                maxLines = 1,
                                decorationBox = { innerTextField ->
                                    if (draft.isEmpty()) {
                                        Text(
                                            "Message",
                                            style = MaterialTheme.typography.bodyLarge,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                    innerTextField()
                                }
                            )
                        }
                        IconButton(
                            onClick = { filePicker.launch(arrayOf("*/*")) },
                            enabled = tenantName != null,
                            modifier = Modifier.size(40.dp)
                        ) {
                            Icon(
                                Icons.Outlined.AttachFile,
                                contentDescription = "Attach file",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        IconButton(
                            onClick = {
                                photoPicker.launch(
                                    PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo)
                                )
                            },
                            enabled = tenantName != null,
                            modifier = Modifier.size(40.dp)
                        ) {
                            Icon(
                                Icons.Outlined.PhotoLibrary,
                                contentDescription = "Attach photo",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
            FilledIconButton(
                onClick = {
                    val body = draft.trim()
                    val ids = pendingAttachments.mapNotNull { it.uploadedId }
                    if (body.isNotEmpty() || ids.isNotEmpty()) {
                        onSend(body, ids)
                        draft = ""
                        pendingAttachments.clear()
                    }
                },
                enabled = canSend,
                shape = CircleShape,
                colors = IconButtonDefaults.filledIconButtonColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary
                ),
                modifier = Modifier.size(48.dp)
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.Send,
                    contentDescription = "Send",
                    modifier = Modifier.size(20.dp)
                )
            }
        }
    }
}

@Composable
private fun PendingAttachmentChip(
    pending: PendingInboxAttachment,
    onRemove: () -> Unit
) {
    val background = when {
        pending.errorMessage != null -> MaterialTheme.colorScheme.errorContainer
        pending.isUploading -> MaterialTheme.colorScheme.secondaryContainer
        else -> MaterialTheme.colorScheme.primaryContainer
    }
    val foreground = when {
        pending.errorMessage != null -> MaterialTheme.colorScheme.onErrorContainer
        pending.isUploading -> MaterialTheme.colorScheme.onSecondaryContainer
        else -> MaterialTheme.colorScheme.onPrimaryContainer
    }
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = background
    ) {
        Row(
            modifier = Modifier.padding(start = 12.dp, end = 4.dp, top = 4.dp, bottom = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            when {
                pending.isUploading -> CircularProgressIndicator(
                    modifier = Modifier.size(14.dp),
                    strokeWidth = 2.dp,
                    color = foreground
                )
                pending.errorMessage != null -> Icon(
                    Icons.Outlined.InsertDriveFile,
                    contentDescription = null,
                    tint = foreground
                )
                else -> Icon(
                    Icons.Outlined.AttachFile,
                    contentDescription = null,
                    tint = foreground
                )
            }
            Column {
                Text(
                    pending.fileName,
                    style = MaterialTheme.typography.labelLarge,
                    color = foreground,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                val subtitle = when {
                    pending.errorMessage != null -> pending.errorMessage
                    pending.isUploading -> "Uploading…"
                    else -> pending.sizeBytes.takeIf { it > 0 }?.let { humanSize(it) }
                }
                if (!subtitle.isNullOrBlank()) {
                    Text(
                        subtitle,
                        style = MaterialTheme.typography.labelSmall,
                        color = foreground,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
            IconButton(onClick = onRemove, modifier = Modifier.size(28.dp)) {
                Icon(Icons.Outlined.Close, contentDescription = "Remove", tint = foreground)
            }
        }
    }
}

private fun humanSize(bytes: Long): String {
    val kb = 1024.0
    val mb = kb * 1024.0
    return when {
        bytes >= mb -> String.format(Locale.US, "%.1f MB", bytes / mb)
        bytes >= kb -> String.format(Locale.US, "%.0f KB", bytes / kb)
        else -> "$bytes B"
    }
}

private fun resolveAttachmentSource(context: android.content.Context, uri: Uri): AttachmentSource? {
    val resolver = context.contentResolver
    var name: String? = null
    var size: Long = 0L
    resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) {
            val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
            if (nameIndex >= 0 && !cursor.isNull(nameIndex)) name = cursor.getString(nameIndex)
            if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) size = cursor.getLong(sizeIndex)
        }
    }
    if (name.isNullOrBlank()) {
        name = uri.lastPathSegment?.substringAfterLast('/')
    }
    if (name.isNullOrBlank()) name = "attachment"
    val contentType = resolver.getType(uri)
    return AttachmentSource(uri = uri, fileName = name!!, contentType = contentType, sizeBytes = size)
}

@Composable
private fun InboxAttachmentCard(
    attachment: GuestInboxAttachment,
    onOpen: () -> Unit,
    loadAttachmentPreview: suspend (GuestInboxAttachment) -> Bitmap?
) {
    val previewState by produceState<Bitmap?>(initialValue = null, key1 = attachment.id, key2 = attachment.updatedPreviewKey()) {
        value = if (attachment.isImageAttachment()) loadAttachmentPreview(attachment) else null
    }
    val isImage = attachment.isImageAttachment()
    val isPdf = attachment.isPdfAttachment()

    Surface(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onOpen),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceVariant
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            if (isImage) {
                if (previewState != null) {
                    Image(
                        bitmap = previewState!!.asImageBitmap(),
                        contentDescription = attachment.fileName,
                        modifier = Modifier.fillMaxWidth().height(148.dp),
                        contentScale = ContentScale.Crop
                    )
                } else {
                    AttachmentPlaceholder(label = "IMAGE", icon = { Icon(Icons.Outlined.Image, contentDescription = null) })
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier.size(42.dp).background(
                        color = when {
                            isPdf -> MaterialTheme.colorScheme.errorContainer
                            isImage -> MaterialTheme.colorScheme.primaryContainer
                            else -> MaterialTheme.colorScheme.secondaryContainer
                        },
                        shape = RoundedCornerShape(12.dp)
                    ),
                    contentAlignment = Alignment.Center
                ) {
                    when {
                        isPdf -> Icon(Icons.Outlined.PictureAsPdf, contentDescription = null, tint = MaterialTheme.colorScheme.onErrorContainer)
                        isImage -> Icon(Icons.Outlined.Image, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimaryContainer)
                        else -> Icon(Icons.Outlined.InsertDriveFile, contentDescription = null, tint = MaterialTheme.colorScheme.onSecondaryContainer)
                    }
                }
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        text = attachment.fileName,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                        fontWeight = FontWeight.Medium,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        FileTypeChip(label = attachment.typeLabel())
                        attachment.sizeLabel()?.let {
                            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                Text(
                    text = if (isImage) "Preview" else "Open",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary
                )
            }
        }
    }
}

@Composable
private fun AttachmentPlaceholder(label: String, icon: @Composable () -> Unit) {
    Box(
        modifier = Modifier.fillMaxWidth().height(148.dp).background(MaterialTheme.colorScheme.secondaryContainer),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            icon()
            Text(label, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSecondaryContainer)
        }
    }
}

@Composable
private fun FileTypeChip(label: String) {
    Surface(shape = RoundedCornerShape(999.dp), color = MaterialTheme.colorScheme.primaryContainer) {
        Text(
            text = label,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onPrimaryContainer
        )
    }
}

private fun GuestInboxAttachment.isImageAttachment(): Boolean {
    return contentType.orEmpty().startsWith("image/", ignoreCase = true) ||
        fileName.lowercase(Locale.ROOT).matches(Regex(".*\\.(png|jpe?g|gif|webp|bmp|heic|heif)$"))
}

private fun GuestInboxAttachment.isPdfAttachment(): Boolean {
    return contentType.orEmpty().contains("pdf", ignoreCase = true) || fileName.lowercase(Locale.ROOT).endsWith(".pdf")
}

private fun GuestInboxAttachment.typeLabel(): String = when {
    isPdfAttachment() -> "PDF"
    isImageAttachment() -> "IMAGE"
    else -> fileName.substringAfterLast('.', "FILE").ifBlank { "FILE" }.uppercase(Locale.ROOT)
}

private fun GuestInboxAttachment.sizeLabel(): String? {
    if (sizeBytes <= 0L) return null
    val kb = 1024.0
    val mb = kb * 1024.0
    return when {
        sizeBytes >= mb -> String.format(Locale.US, "%.1f MB", sizeBytes / mb)
        sizeBytes >= kb -> String.format(Locale.US, "%.0f KB", sizeBytes / kb)
        else -> "$sizeBytes B"
    }
}

private fun GuestInboxAttachment.updatedPreviewKey(): String = listOf(id, contentType.orEmpty(), fileName, sizeBytes).joinToString("|")

private sealed interface ChatEntry {
    val key: String

    data class DateHeader(val date: java.time.LocalDate, val label: String) : ChatEntry {
        override val key: String = "date-$date"
    }

    data class Msg(val message: GuestInboxMessage) : ChatEntry {
        override val key: String = "msg-${message.id}"
    }
}

private fun parseMessageInstant(raw: String?): java.time.Instant? {
    val value = raw?.takeIf { it.isNotBlank() } ?: return null
    return runCatching { java.time.Instant.parse(value) }.getOrNull()
        ?: runCatching { java.time.OffsetDateTime.parse(value).toInstant() }.getOrNull()
}

private fun messageInstant(message: GuestInboxMessage): java.time.Instant? =
    parseMessageInstant(message.sentAt) ?: parseMessageInstant(message.createdAt)

private fun messageLocalDate(message: GuestInboxMessage): java.time.LocalDate? =
    messageInstant(message)?.atZone(java.time.ZoneId.systemDefault())?.toLocalDate()

private fun formatMessageClock(message: GuestInboxMessage): String {
    val instant = messageInstant(message) ?: return (message.sentAt ?: message.createdAt)
    val local = instant.atZone(java.time.ZoneId.systemDefault()).toLocalDateTime()
    return String.format(Locale.US, "%02d:%02d", local.hour, local.minute)
}

private fun formatDateHeader(date: java.time.LocalDate, today: java.time.LocalDate): String = when {
    date == today -> "Today"
    date == today.minusDays(1) -> "Yesterday"
    else -> date.format(java.time.format.DateTimeFormatter.ofPattern("d MMM yyyy", Locale.getDefault()))
}

private fun buildChatEntries(messages: List<GuestInboxMessage>): List<ChatEntry> {
    if (messages.isEmpty()) return emptyList()
    val today = java.time.LocalDate.now()
    val result = mutableListOf<ChatEntry>()
    var lastDate: java.time.LocalDate? = null
    for (m in messages) {
        val date = messageLocalDate(m)
        if (date != null && date != lastDate) {
            result += ChatEntry.DateHeader(date, formatDateHeader(date, today))
            lastDate = date
        }
        result += ChatEntry.Msg(m)
    }
    return result
}

@Composable
private fun DateSeparator(label: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.Center
    ) {
        Surface(
            shape = RoundedCornerShape(50),
            color = MaterialTheme.colorScheme.surface,
            shadowElevation = 1.dp
        ) {
            Text(
                text = label,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun MessageBubble(
    message: GuestInboxMessage,
    onOpenAttachment: (GuestInboxAttachment) -> Unit,
    loadAttachmentPreview: suspend (GuestInboxAttachment) -> Bitmap?
) {
    val isStaff = message.direction == "OUTBOUND"
    val bubbleColor = if (isStaff) MaterialTheme.colorScheme.surface else Color(0xFFF29A3B)
    val textColor = if (isStaff) MaterialTheme.colorScheme.onSurface else Color.White
    val metaColor = if (isStaff) MaterialTheme.colorScheme.onSurfaceVariant else Color.White.copy(alpha = 0.85f)
    val shape = if (isStaff) {
        RoundedCornerShape(topStart = 4.dp, topEnd = 18.dp, bottomStart = 18.dp, bottomEnd = 18.dp)
    } else {
        RoundedCornerShape(topStart = 18.dp, topEnd = 4.dp, bottomStart = 18.dp, bottomEnd = 18.dp)
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(
                start = if (isStaff) 0.dp else 48.dp,
                end = if (isStaff) 48.dp else 0.dp
            ),
        horizontalArrangement = if (isStaff) Arrangement.Start else Arrangement.End
    ) {
        Surface(
            color = bubbleColor,
            shape = shape,
            shadowElevation = if (isStaff) 1.dp else 0.dp
        ) {
            Column(
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                val time = formatMessageClock(message)
                if (message.attachments.isNotEmpty()) {
                    message.attachments.forEach { attachment ->
                        InboxAttachmentCard(
                            attachment = attachment,
                            onOpen = { onOpenAttachment(attachment) },
                            loadAttachmentPreview = loadAttachmentPreview
                        )
                    }
                }
                if (message.body.isNotBlank()) {
                    Row(
                        verticalAlignment = Alignment.Bottom,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            text = message.body,
                            style = MaterialTheme.typography.bodyMedium,
                            color = textColor
                        )
                        Text(
                            text = time,
                            style = MaterialTheme.typography.labelSmall,
                            color = metaColor
                        )
                    }
                } else {
                    Text(
                        text = time,
                        style = MaterialTheme.typography.labelSmall,
                        color = metaColor,
                        modifier = Modifier.align(Alignment.End)
                    )
                }
            }
        }
    }
}
