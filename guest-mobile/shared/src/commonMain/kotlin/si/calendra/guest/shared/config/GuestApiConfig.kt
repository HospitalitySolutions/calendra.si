package si.calendra.guest.shared.config

data class GuestApiConfig(
    /** Default matches local backend port 4000; Android app overrides via `BuildConfig.API_BASE_URL`. */
    val baseUrl: String = "http://192.168.1.83:4000",
    val usePreviewData: Boolean = false
)
