package si.calendra.guest.shared.models

import kotlinx.serialization.Serializable

@Serializable
data class GuestProfile(
    val guestUser: GuestUser,
    val linkedTenants: List<TenantSummary>
)

@Serializable
data class LinkedCompanyOption(
    val id: String,
    val name: String
)

@Serializable
data class GuestInvoiceSettings(
    val recipientType: String = "PERSON",
    val personAddressLine: String? = null,
    val personPostalCode: String? = null,
    val personCity: String? = null,
    val companyName: String? = null,
    val companyAddressLine: String? = null,
    val companyPostalCode: String? = null,
    val companyCity: String? = null,
    val companyVatId: String? = null
)

@Serializable
data class GuestProfileSettings(
    val guestUser: GuestUser,
    val companyId: String? = null,
    val companyName: String? = null,
    val linkedCompanyId: String? = null,
    val linkedCompanyName: String? = null,
    val batchPaymentEnabled: Boolean = false,
    val notifyMessagesEnabled: Boolean = true,
    val notifyRemindersEnabled: Boolean = true,
    val notifyReminderMinutes: Int = 60,
    val linkedCompanyOptions: List<LinkedCompanyOption> = emptyList(),
    val invoiceSettings: GuestInvoiceSettings = GuestInvoiceSettings()
)

@Serializable
data class UpdateGuestProfileSettingsRequest(
    val firstName: String,
    val lastName: String,
    val email: String,
    val phone: String? = null,
    val language: String = "sl",
    val companyId: String? = null,
    val linkedCompanyId: String? = null,
    val batchPaymentEnabled: Boolean? = null,
    val notifyMessagesEnabled: Boolean? = null,
    val notifyRemindersEnabled: Boolean? = null,
    val notifyReminderMinutes: Int? = null,
    val invoiceRecipientType: String? = null,
    val invoicePersonAddressLine: String? = null,
    val invoicePersonPostalCode: String? = null,
    val invoicePersonCity: String? = null,
    val invoiceCompanyName: String? = null,
    val invoiceCompanyAddressLine: String? = null,
    val invoiceCompanyPostalCode: String? = null,
    val invoiceCompanyCity: String? = null,
    val invoiceCompanyVatId: String? = null
)
