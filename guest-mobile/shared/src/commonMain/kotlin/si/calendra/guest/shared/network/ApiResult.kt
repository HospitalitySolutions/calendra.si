package si.calendra.guest.shared.network

sealed interface ApiResult<out T> {
    data class Success<T>(val value: T) : ApiResult<T>
    data class Failure(val message: String, val cause: Throwable? = null) : ApiResult<Nothing>
}
