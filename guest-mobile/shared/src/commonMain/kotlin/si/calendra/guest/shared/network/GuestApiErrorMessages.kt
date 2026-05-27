package si.calendra.guest.shared.network

internal object GuestApiErrorMessages {
    private const val BACKEND_UNAVAILABLE_MESSAGE =
        "Calendra service is temporarily unavailable. Please check your internet connection and try again in a moment."

    fun backendUnavailable(statusCode: Int? = null): String =
        statusCode?.let { "$BACKEND_UNAVAILABLE_MESSAGE (HTTP $it)" } ?: BACKEND_UNAVAILABLE_MESSAGE

    fun isBackendUnavailableStatus(statusCode: Int): Boolean =
        statusCode == 502 ||
            statusCode == 503 ||
            statusCode == 504 ||
            statusCode == 522 ||
            statusCode == 523 ||
            statusCode == 524
}
