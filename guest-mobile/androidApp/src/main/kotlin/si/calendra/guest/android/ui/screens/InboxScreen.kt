package si.calendra.guest.android.ui.screens

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.InsertDriveFile
import androidx.compose.material.icons.outlined.PictureAsPdf
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import si.calendra.guest.shared.models.GuestInboxAttachment
import si.calendra.guest.shared.models.GuestInboxMessage
import java.util.Locale

@Composable
fun InboxScreen(
    tenantName: String?,
    messages: List<GuestInboxMessage>,
    onSend: (String) -> Unit,
    onOpenAttachment: (GuestInboxAttachment) -> Unit = {},
    loadAttachmentPreview: suspend (GuestInboxAttachment) -> Bitmap? = { null }
) {
    var draft by remember { mutableStateOf("") }
    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 20.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Inbox", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text(
                tenantName?.let { "Chat with $it" } ?: "Select a tenancy to open the chat.",
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        LazyColumn(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            contentPadding = PaddingValues(bottom = 8.dp)
        ) {
            if (messages.isEmpty()) {
                item {
                    ElevatedCard(
                        shape = RoundedCornerShape(24.dp),
                        colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface)
                    ) {
                        Text(
                            "No messages yet. Start the conversation from the web app or send the first reply here.",
                            modifier = Modifier.padding(18.dp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            } else {
                items(messages) { message ->
                    ElevatedCard(
                        shape = RoundedCornerShape(24.dp),
                        colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface)
                    ) {
                        Column(
                            Modifier.fillMaxWidth().padding(18.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Text(
                                if (message.direction == "OUTBOUND") "Staff" else "You",
                                style = MaterialTheme.typography.labelLarge,
                                color = MaterialTheme.colorScheme.primary
                            )
                            if (message.body.isNotBlank()) {
                                Text(message.body, color = MaterialTheme.colorScheme.onSurface)
                            }
                            if (message.attachments.isNotEmpty()) {
                                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    message.attachments.forEach { attachment ->
                                        InboxAttachmentCard(
                                            attachment = attachment,
                                            onOpen = { onOpenAttachment(attachment) },
                                            loadAttachmentPreview = loadAttachmentPreview
                                        )
                                    }
                                }
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(
                                    message.sentAt ?: message.createdAt,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                if (message.direction == "OUTBOUND") {
                                    Text(
                                        message.status.replace('_', ' '),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        OutlinedTextField(
            value = draft,
            onValueChange = { draft = it },
            modifier = Modifier.fillMaxWidth(),
            minLines = 3,
            maxLines = 5,
            label = { Text("Message") },
            placeholder = { Text("Write your message...") }
        )

        Button(
            onClick = {
                val body = draft.trim()
                if (body.isNotEmpty()) {
                    onSend(body)
                    draft = ""
                }
            },
            modifier = Modifier.fillMaxWidth(),
            enabled = tenantName != null && draft.trim().isNotEmpty()
        ) {
            Text("Send")
        }
    }
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
