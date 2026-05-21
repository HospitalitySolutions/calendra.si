package si.calendra.guest.android.files

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import si.calendra.guest.shared.models.GuestInboxAttachment
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.UUID

object GuestAttachmentManager {
    suspend fun downloadAndOpen(
        context: Context,
        baseUrl: String,
        companyId: String,
        authToken: String,
        attachment: GuestInboxAttachment
    ) = withContext(Dispatchers.IO) {
        val target = downloadToCache(
            context = context,
            baseUrl = baseUrl,
            companyId = companyId,
            authToken = authToken,
            attachment = attachment
        )
        val contentType = attachment.contentType?.takeIf { it.isNotBlank() }
            ?: context.contentResolver.getType(Uri.fromFile(target))
            ?: "*/*"
        val contentUri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", target)
        withContext(Dispatchers.Main) {
            val viewIntent = Intent(Intent.ACTION_VIEW)
                .setDataAndType(contentUri, contentType)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            try {
                context.startActivity(Intent.createChooser(viewIntent, "Open attachment").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            } catch (_: ActivityNotFoundException) {
                val sendIntent = Intent(Intent.ACTION_SEND)
                    .setType(contentType)
                    .putExtra(Intent.EXTRA_STREAM, contentUri)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(Intent.createChooser(sendIntent, "Share attachment").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
        }
    }

    suspend fun loadImagePreview(
        context: Context,
        baseUrl: String,
        companyId: String,
        authToken: String,
        attachment: GuestInboxAttachment,
        maxDimensionPx: Int = 640
    ): Bitmap? = withContext(Dispatchers.IO) {
        if (!attachment.isImage()) return@withContext null
        val file = downloadToCache(context, baseUrl, companyId, authToken, attachment)
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return@withContext null
        val sampleSize = computeSampleSize(bounds.outWidth, bounds.outHeight, maxDimensionPx)
        val decodeOptions = BitmapFactory.Options().apply {
            inPreferredConfig = Bitmap.Config.ARGB_8888
            inSampleSize = sampleSize
        }
        BitmapFactory.decodeFile(file.absolutePath, decodeOptions)
    }

    private suspend fun downloadToCache(
        context: Context,
        baseUrl: String,
        companyId: String,
        authToken: String,
        attachment: GuestInboxAttachment
    ): File = withContext(Dispatchers.IO) {
        val downloadsDir = File(context.cacheDir, "guest-attachments").apply { mkdirs() }
        val extension = attachment.extensionHint()
        val cachedFile = File(downloadsDir, buildCacheFileName(attachment, extension))
        if (cachedFile.exists() && cachedFile.length() > 0L) return@withContext cachedFile

        val safeBaseUrl = baseUrl.trimEnd('/')
        val encodedCompanyId = URLEncoder.encode(companyId, Charsets.UTF_8.name())
        val url = URL("$safeBaseUrl/api/guest/inbox/attachments/${attachment.id}?companyId=$encodedCompanyId")
        val connection = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 15000
            readTimeout = 30000
            setRequestProperty("Authorization", "Bearer $authToken")
            setRequestProperty("Accept", "*/*")
            setRequestProperty("X-App-Platform", "native")
        }
        try {
            val status = connection.responseCode
            if (status !in 200..299) {
                val error = runCatching { connection.errorStream?.bufferedReader()?.use { it.readText() } }.getOrNull()
                throw IllegalStateException(error?.takeIf { it.isNotBlank() } ?: "Attachment download failed ($status)")
            }
            val tempTarget = File(downloadsDir, cachedFile.name + ".download-" + UUID.randomUUID().toString().take(8))
            connection.inputStream.use { input -> FileOutputStream(tempTarget).use { output -> input.copyTo(output) } }
            if (!tempTarget.renameTo(cachedFile)) {
                tempTarget.copyTo(cachedFile, overwrite = true)
                tempTarget.delete()
            }
            cachedFile
        } finally {
            connection.disconnect()
        }
    }

    private fun computeSampleSize(width: Int, height: Int, maxDimension: Int): Int {
        var sampleSize = 1
        var currentWidth = width
        var currentHeight = height
        while (currentWidth > maxDimension || currentHeight > maxDimension) {
            currentWidth /= 2
            currentHeight /= 2
            sampleSize *= 2
        }
        return sampleSize.coerceAtLeast(1)
    }

    private fun buildCacheFileName(attachment: GuestInboxAttachment, extension: String): String {
        return "attachment-${attachment.id}-$extension"
    }

    private fun GuestInboxAttachment.extensionHint(): String {
        val name = fileName.substringAfterLast('/').substringAfterLast('\\').trim()
        val fromName = name.substringAfterLast('.', "").lowercase().takeIf { it.isNotBlank() }
        return fromName ?: when {
            contentType.orEmpty().contains("pdf", ignoreCase = true) -> "pdf"
            contentType.orEmpty().startsWith("image/", ignoreCase = true) -> contentType.orEmpty().substringAfter('/', "img")
            else -> "bin"
        }
    }

    private fun GuestInboxAttachment.isImage(): Boolean {
        return contentType.orEmpty().startsWith("image/", ignoreCase = true) ||
            fileName.lowercase().matches(Regex(".*\\.(png|jpe?g|gif|webp|bmp|heic|heif)$"))
    }
}
