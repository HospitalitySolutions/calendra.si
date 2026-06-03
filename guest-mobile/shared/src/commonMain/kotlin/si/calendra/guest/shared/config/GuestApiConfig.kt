package si.calendra.guest.shared.config

data class GuestApiConfig(
    /**
     * Safe default for non-platform callers. Android and iOS release apps should still inject
     * their build-time environment value explicitly so accidental local/private URLs never ship.
     */
    val baseUrl: String = "https://app.calendra.si",
    val usePreviewData: Boolean = false
)
