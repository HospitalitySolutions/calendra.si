package si.calendra.guest.shared.models

import kotlinx.serialization.Serializable

@Serializable
data class GuestInboxThread(
    val clientId: Long,
    val clientFirstName: String,
    val clientLastName: String,
    val lastPreview: String? = null,
    val lastSenderName: String? = null,
    val lastSentAt: String? = null,
    val messageCount: Long = 0,
    val unreadCount: Long = 0
)

@Serializable
data class GuestInboxAttachment(
    val id: Long,
    val clientFileId: Long,
    val fileName: String,
    val contentType: String? = null,
    val sizeBytes: Long = 0,
    val uploadedAt: String? = null
)

@Serializable
data class GuestInboxMessage(
    val id: Long,
    val clientId: Long,
    val clientFirstName: String,
    val clientLastName: String,
    val recipient: String,
    val channel: String,
    val direction: String,
    val status: String,
    val subject: String? = null,
    val body: String,
    val externalMessageId: String? = null,
    val errorMessage: String? = null,
    val senderName: String? = null,
    val senderPhone: String? = null,
    val sentAt: String? = null,
    val createdAt: String,
    val attachments: List<GuestInboxAttachment> = emptyList()
)

@Serializable
data class SendGuestInboxMessageRequest(
    val companyId: String,
    val body: String,
    val attachmentFileIds: List<Long> = emptyList()
)

@Serializable
data class GuestInboxUploadedAttachment(
    val id: Long,
    val fileName: String,
    val contentType: String? = null,
    val sizeBytes: Long = 0,
    val uploadedAt: String? = null
)

@Serializable
data class RegisterDeviceTokenRequest(
    val platform: String,
    val pushToken: String,
    val locale: String? = null
)

@Serializable
data class RegisterDeviceTokenResponse(
    val registered: Boolean
)
