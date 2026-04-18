package si.calendra.guest.shared.config

data class GuestApiConfig(
    val baseUrl: String = "http://192.168.1.88:4000",
    val usePreviewData: Boolean = false
)
